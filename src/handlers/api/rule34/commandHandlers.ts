import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChatInputCommandInteraction,
    EmbedBuilder,
    StringSelectMenuBuilder
} from 'discord.js';
import type {
    Rule34CommandSearchOptions,
    Rule34CacheContract,
    Rule34PostHandlerContract,
    Rule34ServiceContract
} from '../../../types/api/commands/rule34-command.js';

export interface Rule34CommandHandlerDeps {
    rule34Service: Rule34ServiceContract;
    rule34Cache: Rule34CacheContract;
    postHandler: Rule34PostHandlerContract;
    normalizeMinScore: (value: unknown, fallback?: number) => number;
    errorEmbed: (message: string) => EmbedBuilder;
    infoEmbed: (title: string, description: string) => EmbedBuilder;
}

export async function handleRule34SearchCommand(
    interaction: ChatInputCommandInteraction,
    userId: string,
    deps: Rule34CommandHandlerDeps
): Promise<void> {
    await interaction.deferReply();

    const tags = interaction.options.getString('tags', true);
    const rating = interaction.options.getString('rating');
    const sort = interaction.options.getString('sort');
    const aiFilter = interaction.options.getBoolean('ai_filter');
    const minScore = interaction.options.getInteger('min_score');
    const contentType = interaction.options.getString('content_type');
    const highQuality = interaction.options.getBoolean('high_quality');
    const minWidth = interaction.options.getInteger('min_width');
    const minHeight = interaction.options.getInteger('min_height');
    const exclude = interaction.options.getString('exclude');
    const page = interaction.options.getInteger('page') || 1;

    const prefs = deps.rule34Cache?.getPreferences?.(userId) || {};
    const blacklist = deps.rule34Cache?.getBlacklist?.(userId) || [];
    const normalizedRating = (rating === 'all' ? null : (rating || prefs.defaultRating)) as Rule34CommandSearchOptions['rating'];
    const normalizedContentType = (contentType || undefined) as Rule34CommandSearchOptions['contentType'];

    const searchOptions: Rule34CommandSearchOptions = {
        limit: 50,
        page: page - 1,
        sort: sort || prefs.sortMode || 'score:desc',
        rating: normalizedRating,
        excludeAi: aiFilter ?? prefs.aiFilter,
        minScore: deps.normalizeMinScore(minScore ?? prefs.minScore, 1),
        contentType: normalizedContentType,
        excludeTags: [...blacklist, ...(exclude ? exclude.split(/\s+/) : [])],
        minWidth: minWidth || 0,
        minHeight: minHeight || 0,
        highQualityOnly: highQuality ?? prefs.highQualityOnly,
        excludeLowQuality: prefs.excludeLowQuality
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
        currentPage: page,
        hasMore: result.hasMore
    });

    const post = result.posts[0];
    deps.rule34Cache?.addToHistory?.(userId, post.id, { score: post.score });

    if (post.hasVideo && deps.postHandler?.createVideoEmbed) {
        const { embed, rows } = deps.postHandler.createVideoEmbed(post, {
            resultIndex: 0,
            totalResults: result.posts.length,
            userId,
            searchPage: page
        });
        await interaction.editReply({ embeds: [embed], components: rows });
        return;
    }

    const { embed, rows } = await deps.postHandler.createPostEmbed(post, {
        resultIndex: 0,
        totalResults: result.posts.length,
        query: tags,
        userId,
        searchPage: page
    });

    await interaction.editReply({ embeds: [embed], components: rows });
}

export async function handleRule34RandomCommand(
    interaction: ChatInputCommandInteraction,
    userId: string,
    deps: Rule34CommandHandlerDeps
): Promise<void> {
    await interaction.deferReply();

    const tags = interaction.options.getString('tags') || '';
    const count = interaction.options.getInteger('count') || 1;
    const aiFilter = interaction.options.getBoolean('ai_filter');
    const followSettings = interaction.options.getBoolean('follow_settings') ?? true;
    const hasAiOverride = aiFilter !== null;

    const prefs = deps.rule34Cache?.getPreferences?.(userId) || {};
    const blacklist = deps.rule34Cache?.getBlacklist?.(userId) || [];
    const effectiveExcludeAi = aiFilter ?? (followSettings ? prefs.aiFilter : false);
    const effectiveMinScore = followSettings ? deps.normalizeMinScore(prefs.minScore, 1) : 0;
    const effectiveRating = followSettings ? (prefs.defaultRating ?? null) : null;

    const rawPosts = await deps.rule34Service?.getRandom?.({
        tags,
        count,
        rating: effectiveRating as any,
        excludeAi: effectiveExcludeAi,
        minScore: effectiveMinScore
    }) || (await deps.rule34Service.search(tags, { limit: count, sort: 'random' })).posts || [];

    const filteredPosts = rawPosts.filter(post => {
        if (!followSettings) return true;
        const postTags = (post.tags || '').split(' ');
        const isBlacklisted = postTags.some(t => blacklist.includes(t));
        if (isBlacklisted) return false;
        return true;
    });

    if (filteredPosts.length === 0) {
        const noResultsEmbed = deps.postHandler?.createNoResultsEmbed?.(tags || 'random posts') || deps.errorEmbed('No random posts found');
        await interaction.editReply({ embeds: [noResultsEmbed] });
        return;
    }

    deps.rule34Cache?.setSession?.(userId, {
        type: 'random',
        query: tags || '',
        posts: filteredPosts,
        options: {
            limit: Math.max(10, Math.min(50, count * 10)),
            followSettings,
            hasAiOverride,
            excludeAi: effectiveExcludeAi,
            minScore: followSettings ? effectiveMinScore : 0,
            highQualityOnly: followSettings ? (prefs.highQualityOnly ?? false) : false,
            excludeLowQuality: followSettings ? (prefs.excludeLowQuality ?? false) : false,
            rating: followSettings ? prefs.defaultRating : null
        } as any,
        currentIndex: 0,
        currentPage: 1
    });

    const post = filteredPosts[0];
    deps.rule34Cache?.addToHistory?.(userId, post.id, { score: post.score });

    if (post.hasVideo && deps.postHandler?.createVideoEmbed) {
        const { embed, rows } = deps.postHandler.createVideoEmbed(post, {
            resultIndex: 0,
            totalResults: filteredPosts.length,
            userId
        });
        await interaction.editReply({ embeds: [embed], components: rows });
        return;
    }

    const { embed, rows } = await deps.postHandler.createPostEmbed(post, {
        resultIndex: 0,
        totalResults: filteredPosts.length,
        userId
    });

    await interaction.editReply({ embeds: [embed], components: rows });
}

export async function handleRule34GetByIdCommand(
    interaction: ChatInputCommandInteraction,
    userId: string,
    deps: Rule34CommandHandlerDeps
): Promise<void> {
    await interaction.deferReply();

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
    });

    deps.rule34Cache?.addToHistory?.(userId, post.id, { score: post.score });

    if (post.hasVideo && deps.postHandler?.createVideoEmbed) {
        const { embed, rows } = deps.postHandler.createVideoEmbed(post, {
            resultIndex: 0,
            totalResults: 1,
            userId
        });
        await interaction.editReply({ embeds: [embed], components: rows });
        return;
    }

    const { embed, rows } = await deps.postHandler.createPostEmbed(post, {
        resultIndex: 0,
        totalResults: 1,
        userId
    });

    await interaction.editReply({ embeds: [embed], components: rows });
}

export async function handleRule34TrendingCommand(
    interaction: ChatInputCommandInteraction,
    userId: string,
    deps: Rule34CommandHandlerDeps
): Promise<void> {
    await interaction.deferReply();

    const timeframe = (interaction.options.getString('timeframe') || 'day') as 'day' | 'week' | 'month';
    const aiFilter = interaction.options.getBoolean('ai_filter');

    const prefs = deps.rule34Cache?.getPreferences?.(userId) || {};
    const blacklist = deps.rule34Cache?.getBlacklist?.(userId) || [];

    const result = await deps.rule34Service?.getTrending?.({
        timeframe,
        excludeAi: aiFilter ?? prefs.aiFilter
    }) || await deps.rule34Service.search('', { sort: 'score:desc', limit: 50 });

    const rawPosts = result?.posts || [];

    const filteredPosts = rawPosts.filter(post => {
        const postTags = (post.tags || '').split(' ');
        const isBlacklisted = postTags.some(t => blacklist.includes(t));
        if (isBlacklisted) return false;
        if ((aiFilter ?? prefs.aiFilter) && post.isAiGenerated) return false;
        if (post.score < deps.normalizeMinScore(prefs.minScore, 1)) return false;
        if (prefs.highQualityOnly && !post.isHighQuality) return false;
        if (prefs.excludeLowQuality && !post.isHighQuality) return false;
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
        timeframe,
        options: {
            timeframe,
            excludeAi: aiFilter ?? prefs.aiFilter,
            minScore: deps.normalizeMinScore(prefs.minScore, 1),
            highQualityOnly: prefs.highQualityOnly ?? false,
            excludeLowQuality: prefs.excludeLowQuality ?? false
        } as any
    });

    const post = filteredPosts[0];
    deps.rule34Cache?.addToHistory?.(userId, post.id, { score: post.score });

    if (post.hasVideo && deps.postHandler?.createVideoEmbed) {
        const { embed, rows } = deps.postHandler.createVideoEmbed(post, {
            resultIndex: 0,
            totalResults: filteredPosts.length,
            userId
        });
        await interaction.editReply({ embeds: [embed], components: rows });
        return;
    }

    const { embed, rows } = await deps.postHandler.createPostEmbed(post, {
        resultIndex: 0,
        totalResults: filteredPosts.length,
        query: `🔥 Trending (${timeframe})`,
        userId
    });

    await interaction.editReply({ embeds: [embed], components: rows });
}

export async function handleRule34RelatedCommand(
    interaction: ChatInputCommandInteraction,
    deps: Rule34CommandHandlerDeps
): Promise<void> {
    await interaction.deferReply();

    const tag = interaction.options.getString('tag', true);
    const relatedTags = await deps.rule34Service?.getRelatedTags?.(tag, 20) || [];

    const embed = deps.postHandler?.createRelatedTagsEmbed?.(tag, relatedTags)
        || deps.infoEmbed('Related Tags', relatedTags.map(t => `• ${t.name || t}`).join('\n') || 'No related tags found');
    await interaction.editReply({ embeds: [embed] });
}

export async function handleRule34SettingsCommand(
    interaction: ChatInputCommandInteraction,
    userId: string,
    deps: Rule34CommandHandlerDeps
): Promise<void> {
    const prefs = deps.rule34Cache?.getPreferences?.(userId) || {};
    const blacklist = deps.rule34Cache?.getBlacklist?.(userId) || [];

    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('⚙️ Rule34 Settings & Blacklist')
        .setDescription('Configure your search preferences and manage blacklisted tags.');

    const aiStatus = prefs.aiFilter ? '✅ Hidden' : '❌ Shown';
    const qualityStatus = prefs.highQualityOnly ? '🔷 High Only' : (prefs.excludeLowQuality ? '🔶 No Low' : '⚪ All');
    const sortDisplay: Record<string, string> = {
        'score:desc': '⬆️ Score (High)',
        'score:asc': '⬇️ Score (Low)',
        'id:desc': '🆕 Newest',
        'id:asc': '📅 Oldest',
        'random': '🎲 Random'
    };

    const settingsText = [
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
            { label: 'AI Content Filter', value: 'ai', emoji: '🤖', description: 'Hide or show AI-generated content' },
            { label: 'Minimum Score', value: 'score', emoji: '⭐', description: 'Set minimum post score' },
            { label: 'Quality Filter', value: 'quality', emoji: '📊', description: 'Filter by image quality' },
            { label: 'Default Sort', value: 'sort', emoji: '📑', description: 'Change default sort order' },
            { label: 'Manage Blacklist', value: 'blacklist', emoji: '🚫', description: 'Add or remove blacklisted tags' }
        ]);

    const quickRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`rule34_settings_refresh_${userId}`)
            .setLabel('Refresh')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🔄'),
        new ButtonBuilder()
            .setCustomId(`rule34_settings_reset_${userId}`)
            .setLabel('Reset All')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️'),
        new ButtonBuilder()
            .setCustomId(`rule34_settings_close_${userId}`)
            .setLabel('Done')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅')
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
