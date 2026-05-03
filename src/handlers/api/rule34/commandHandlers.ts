import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChatInputCommandInteraction,
    EmbedBuilder,
    StringSelectMenuBuilder
} from 'discord.js';
import logger from '../../../core/observability/Logger.js';
import type {
    Rule34CommandSearchOptions,
    Rule34CacheContract,
    Rule34PostHandlerContract,
    Rule34ServiceContract
} from '../../../types/commands/rule34.js';

export interface Rule34CommandHandlerDeps {
    rule34Service: Rule34ServiceContract;
    rule34Cache: Rule34CacheContract;
    postHandler: Rule34PostHandlerContract;
    normalizeMinScore: (value: unknown, fallback?: number) => number;
    errorEmbed: (message: string) => EmbedBuilder;
    infoEmbed: (title: string, description: string) => EmbedBuilder;
}

function createSessionToken(): string {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export async function handleRule34SearchCommand(
    interaction: ChatInputCommandInteraction,
    userId: string,
    deps: Rule34CommandHandlerDeps
): Promise<void> {
    await interaction.deferReply();
    const sessionId = createSessionToken();

    const tags = interaction.options.getString('tags', true);
    const contentType = interaction.options.getString('content_type');

    await deps.rule34Cache?.ensureHydrated?.(userId);
    const prefs = deps.rule34Cache?.getPreferences?.(userId) || {};
    const blacklist = deps.rule34Cache?.getBlacklist?.(userId) || [];
    const useSettings = prefs.settingSearch !== false;
    const normalizedContentType = (contentType || undefined) as Rule34CommandSearchOptions['contentType'];

    const searchOptions: Rule34CommandSearchOptions = {
        limit: 50,
        page: 0,
        sort: useSettings ? (prefs.sortMode || 'score:desc') : 'score:desc',
        rating: useSettings ? (prefs.defaultRating as Rule34CommandSearchOptions['rating'] ?? null) : null,
        excludeAi: useSettings ? prefs.aiFilter : false,
        minScore: useSettings ? deps.normalizeMinScore(prefs.minScore, 1) : 1,
        contentType: normalizedContentType,
        excludeTags: useSettings ? blacklist : [],
        minWidth: 0,
        minHeight: 0,
        highQualityOnly: useSettings ? (prefs.highQualityOnly ?? false) : false,
        excludeLowQuality: useSettings ? (prefs.excludeLowQuality ?? false) : false
    };

    const result = await deps.rule34Service.search(tags, searchOptions);

    if (!result?.posts?.length) {
        const noResultsEmbed = deps.postHandler?.createNoResultsEmbed?.(tags) || deps.errorEmbed(`No results found for **${tags}**`);
        await interaction.editReply({ embeds: [noResultsEmbed] });
        return;
    }

    deps.rule34Cache?.setSession?.(userId, {
        type: 'search',
        query: tags,
        posts: result.posts,
        options: searchOptions,
        currentIndex: 0,
        currentPage: 1,
        hasMore: result.hasMore
    }, sessionId);

    const post = result.posts[0];
    deps.rule34Cache?.addToHistory?.(userId, post.id, { score: post.score });

    if (post.hasVideo && deps.postHandler?.createVideoEmbed) {
        const { rows, embed: videoEmbed } = deps.postHandler.createVideoEmbed(post, {
            resultIndex: 0,
            totalResults: result.posts.length,
            userId,
            sessionId,
            searchPage: 1,
            hasMore: result.hasMore,
            sessionType: 'search',
            maxPage: 200
        });
        await interaction.editReply({ content: '', embeds: [videoEmbed], components: rows });
        return;
    }

    const { embed, rows } = await deps.postHandler.createPostEmbed(post, {
        resultIndex: 0,
        totalResults: result.posts.length,
        query: tags,
        userId,
        sessionId,
        searchPage: 1,
        hasMore: result.hasMore,
        sessionType: 'search',
        maxPage: 200
    });

    await interaction.editReply({ embeds: [embed], components: rows });
}

export async function handleRule34RandomCommand(
    interaction: ChatInputCommandInteraction,
    userId: string,
    deps: Rule34CommandHandlerDeps
): Promise<void> {
    await interaction.deferReply();
    const sessionId = createSessionToken();

    await deps.rule34Cache?.ensureHydrated?.(userId);
    const prefs = deps.rule34Cache?.getPreferences?.(userId) || {};
    const blacklist = deps.rule34Cache?.getBlacklist?.(userId) || [];
    const useSettings = prefs.settingSearch !== false;

    const effectiveExcludeAi = useSettings ? (prefs.aiFilter ?? false) : false;
    const effectiveMinScore = useSettings ? deps.normalizeMinScore(prefs.minScore, 1) : 0;
    const effectiveRating = useSettings ? (prefs.defaultRating ?? null) : null;
    const effectiveHighQualityOnly = useSettings ? (prefs.highQualityOnly ?? false) : false;
    const effectiveExcludeLowQuality = useSettings ? (prefs.excludeLowQuality ?? false) : false;

    logger.info('Rule34', `Random command: useSettings=${useSettings}`);

    const rawPosts = await deps.rule34Service?.getRandom?.({
        tags: '',
        count: 50,
        rating: effectiveRating as any,
        excludeAi: effectiveExcludeAi,
        minScore: effectiveMinScore,
        excludeTags: useSettings ? blacklist : [],
        highQualityOnly: effectiveHighQualityOnly,
        excludeLowQuality: effectiveExcludeLowQuality
    }) || (await deps.rule34Service.search('', { limit: 50, sort: 'random' })).posts || [];

    // Light sanity-check for blacklist (covers the fallback path).
    const filteredPosts = rawPosts.filter(post => {
        if (!useSettings) return true;
        const postTags = (post.tags || '').split(' ');
        return !postTags.some(t => blacklist.includes(t));
    });

    logger.info('Rule34', `Random: fetched=${rawPosts.length} afterFilter=${filteredPosts.length}`);

    if (filteredPosts.length === 0) {
        const noResultsEmbed = deps.postHandler?.createNoResultsEmbed?.('*') || deps.errorEmbed('No random posts found. Try again or adjust your filters/blacklist.');
        await interaction.editReply({ embeds: [noResultsEmbed] });
        return;
    }

    deps.rule34Cache?.setSession?.(userId, {
        type: 'random',
        query: '',
        posts: filteredPosts,
        overflowPosts: [],
        seenPostIds: filteredPosts.map(p => p.id),
        options: {
            limit: 50,
            randomCount: 50,
            followSettings: useSettings,
            hasAiOverride: false,
            excludeAi: effectiveExcludeAi,
            minScore: useSettings ? effectiveMinScore : 0,
            highQualityOnly: effectiveHighQualityOnly,
            excludeLowQuality: effectiveExcludeLowQuality,
            rating: useSettings ? prefs.defaultRating : null
        } as any,
        currentIndex: 0,
        currentPage: 1
    }, sessionId);

    const post = filteredPosts[0];
    deps.rule34Cache?.addToHistory?.(userId, post.id, { score: post.score });

    if (post.hasVideo && deps.postHandler?.createVideoEmbed) {
        const { rows, embed: videoEmbed } = deps.postHandler.createVideoEmbed(post, {
            resultIndex: 0,
            totalResults: filteredPosts.length,
            userId,
            sessionId,
            sessionType: 'random',
            maxPage: 200
        });
        await interaction.editReply({ content: '', embeds: [videoEmbed], components: rows });
        return;
    }

    const { embed, rows } = await deps.postHandler.createPostEmbed(post, {
        resultIndex: 0,
        totalResults: filteredPosts.length,
        userId,
        sessionId,
        sessionType: 'random',
        maxPage: 200
    });

    await interaction.editReply({ embeds: [embed], components: rows });
}

export async function handleRule34GetByIdCommand(
    interaction: ChatInputCommandInteraction,
    userId: string,
    deps: Rule34CommandHandlerDeps
): Promise<void> {
    await interaction.deferReply();
    const sessionId = createSessionToken();

    const postId = interaction.options.getInteger('post_id', true);
    const post = await deps.rule34Service?.getPostById?.(postId);

    if (!post) {
        await interaction.editReply({
            embeds: [deps.errorEmbed(`Post #${postId} not found.`)]
        });
        return;
    }

    deps.rule34Cache?.setSession?.(userId, {
        type: 'single',
        posts: [post],
        currentIndex: 0
    }, sessionId);

    deps.rule34Cache?.addToHistory?.(userId, post.id, { score: post.score });

    if (post.hasVideo && deps.postHandler?.createVideoEmbed) {
        const { rows, embed: videoEmbed } = deps.postHandler.createVideoEmbed(post, {
            resultIndex: 0,
            totalResults: 1,
            userId,
            sessionId,
            sessionType: 'single',
            maxPage: 1
        });
        await interaction.editReply({ content: '', embeds: [videoEmbed], components: rows });
        return;
    }

    const { embed, rows } = await deps.postHandler.createPostEmbed(post, {
        resultIndex: 0,
        totalResults: 1,
        userId,
        sessionId,
        sessionType: 'single',
        maxPage: 1
    });

    await interaction.editReply({ embeds: [embed], components: rows });
}

export async function handleRule34TrendingCommand(
    interaction: ChatInputCommandInteraction,
    userId: string,
    deps: Rule34CommandHandlerDeps
): Promise<void> {
    await interaction.deferReply();
    const sessionId = createSessionToken();

    const timeframe = (interaction.options.getString('timeframe') || 'day') as 'day' | 'week' | 'month';

    await deps.rule34Cache?.ensureHydrated?.(userId);
    const prefs = deps.rule34Cache?.getPreferences?.(userId) || {};
    const blacklist = deps.rule34Cache?.getBlacklist?.(userId) || [];
    const useSettings = prefs.settingSearch !== false;

    const result = await deps.rule34Service?.getTrending?.({
        timeframe,
        limit: 50,
        excludeAi: useSettings ? (prefs.aiFilter ?? false) : false
    }) || await deps.rule34Service.search('', { sort: 'score:desc', limit: 50 });

    const rawPosts = result?.posts || [];

    const filteredPosts = rawPosts.filter(post => {
        const postTags = (post.tags || '').split(' ');
        const isBlacklisted = useSettings && postTags.some(t => blacklist.includes(t));
        if (isBlacklisted) return false;
        if (useSettings && prefs.aiFilter && post.isAiGenerated) return false;
        if (useSettings && prefs.minScore && post.score < (prefs.minScore ?? 0)) return false;
        return true;
    });

    if (filteredPosts.length === 0) {
        await interaction.editReply({
            embeds: [deps.errorEmbed('No trending posts found matching your filters.')]
        });
        return;
    }

    deps.rule34Cache?.setSession?.(userId, {
        type: 'trending',
        posts: filteredPosts,
        currentIndex: 0,
        currentPage: 1,
        hasMore: false,
        timeframe,
        options: {
            timeframe,
            excludeAi: useSettings ? (prefs.aiFilter ?? false) : false,
            minScore: useSettings ? deps.normalizeMinScore(prefs.minScore, 1) : 0,
            highQualityOnly: useSettings ? (prefs.highQualityOnly ?? false) : false,
            excludeLowQuality: useSettings ? (prefs.excludeLowQuality ?? false) : false
        } as any
    }, sessionId);

    const post = filteredPosts[0];
    deps.rule34Cache?.addToHistory?.(userId, post.id, { score: post.score });

    if (post.hasVideo && deps.postHandler?.createVideoEmbed) {
        const { rows, embed: videoEmbed } = deps.postHandler.createVideoEmbed(post, {
            resultIndex: 0,
            totalResults: filteredPosts.length,
            userId,
            sessionId,
            sessionType: 'trending',
            maxPage: 1
        });
        await interaction.editReply({ content: '', embeds: [videoEmbed], components: rows });
        return;
    }

    const { embed, rows } = await deps.postHandler.createPostEmbed(post, {
        resultIndex: 0,
        totalResults: filteredPosts.length,
        query: `🔥 Trending (${timeframe})`,
        userId,
        sessionId,
        sessionType: 'trending',
        maxPage: 1
    });

    await interaction.editReply({ embeds: [embed], components: rows });
}

export async function handleRule34SettingsCommand(
    interaction: ChatInputCommandInteraction,
    userId: string,
    deps: Rule34CommandHandlerDeps
): Promise<void> {
    await deps.rule34Cache?.ensureHydrated?.(userId);
    const prefs = deps.rule34Cache?.getPreferences?.(userId) || {};
    const blacklist = deps.rule34Cache?.getBlacklist?.(userId) || [];

    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('⚙️ Rule34 Settings & Blacklist')
        .setDescription('Configure your search preferences and manage blacklisted tags.');

    const aiStatus = prefs.aiFilter ? '✅ Hidden' : '❌ Shown';
    const qualityStatus = prefs.highQualityOnly ? '🔷 High Only' : (prefs.excludeLowQuality ? '🔶 No Low' : '⚪ All');
    const settingSearchStatus = prefs.settingSearch !== false ? '✅ Enabled' : '❌ Disabled';
    const sortDisplay: Record<string, string> = {
        'score:desc': '⬆️ Score (High)',
        'score:asc': '⬇️ Score (Low)',
        'id:desc': '🆕 Newest',
        'id:asc': '📅 Oldest',
        'random': '🎲 Random'
    };

    const settingsText = [
        `🔍 **Setting Search:** ${settingSearchStatus}`,
        `🤖 **AI Content:** ${aiStatus}`,
        `⭐ **Min Score:** ${deps.normalizeMinScore(prefs.minScore, 1)}`,
        `📊 **Quality:** ${qualityStatus}`,
        `📑 **Sort:** ${sortDisplay[prefs.sortMode || 'score:desc'] || '⬆️ Score (High)'}`
    ].join('\n');

    const blacklistText = blacklist.length > 0
        ? blacklist.slice(0, 20).map(t => `\`${t}\``).join(' ') + (blacklist.length > 20 ? `\n...and ${blacklist.length - 20} more` : '')
        : '*No tags blacklisted*';

    embed.addFields(
        { name: '📋 Current Settings', value: settingsText, inline: true },
        { name: `🚫 Blacklist (${blacklist.length})`, value: blacklistText, inline: true }
    );

    embed.setFooter({ text: '💡 Use the menus below to configure • Settings auto-save' });

    const settingSelect = new StringSelectMenuBuilder()
        .setCustomId(`rule34_settingmenu_${userId}`)
        .setPlaceholder('⚙️ Select a setting to change...')
        .addOptions([
            { label: 'Setting Search', value: 'setting_search', emoji: '🔍', description: 'Apply settings to /random and /search commands' },
            { label: 'AI Content Filter', value: 'ai', emoji: '🤖', description: 'Hide or show AI-generated content' },
            { label: 'Minimum Score', value: 'score', emoji: '⭐', description: 'Set minimum post score' },
            { label: 'Quality Filter', value: 'quality', emoji: '📊', description: 'Filter by image quality' },
            { label: 'Default Sort', value: 'sort', emoji: '📑', description: 'Change default sort order' },
            { label: 'Manage Blacklist', value: 'blacklist', emoji: '🚫', description: 'Add or remove blacklisted tags' }
        ]);

    const quickRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`rule34_settings_reset_${userId}`)
            .setLabel('Reset All')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️')
    );

    await interaction.reply({
        embeds: [embed],
        components: [
            new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(settingSelect),
            quickRow
        ],
        ephemeral: true
    });
}


