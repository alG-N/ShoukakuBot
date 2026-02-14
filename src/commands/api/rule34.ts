/**
 * Rule34 Command - Presentation Layer
 * Search Rule34 for images and videos
 * @module presentation/commands/api/rule34
 */

import { 
    SlashCommandBuilder, 
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChatInputCommandInteraction,
    AutocompleteInteraction,
    ButtonInteraction,
    StringSelectMenuInteraction,
    PermissionFlagsBits
} from 'discord.js';
import { BaseCommand, CommandCategory, type CommandData } from '../BaseCommand.js';
import { checkAccess, AccessType } from '../../services/index.js';
import _rule34Service from '../../services/api/rule34Service.js';
import _rule34Cache from '../../repositories/api/rule34Cache.js';
import _postHandler from '../../handlers/api/rule34PostHandler.js';
import logger from '../../core/Logger.js';
// TYPES
interface Post {
    id: number;
    tags?: string;
    tagList?: string[];
    score?: number;
    rating?: string;
    hasVideo?: boolean;
}

interface SearchOptions {
    limit?: number;
    page?: number;
    sort?: string;
    rating?: string | null;
    excludeAi?: boolean;
    minScore?: number;
    contentType?: string;
    excludeTags?: string[];
    minWidth?: number;
    minHeight?: number;
    highQualityOnly?: boolean;
    excludeLowQuality?: boolean;
}

interface SearchResult {
    posts?: Post[];
    hasMore?: boolean;
}

interface Session {
    type: string;
    query?: string;
    posts: Post[];
    options?: SearchOptions;
    currentIndex: number;
    currentPage?: number;
    hasMore?: boolean;
    timeframe?: string;
    showTags?: boolean;
}

interface Preferences {
    aiFilter?: boolean;
    minScore?: number;
    sortMode?: string;
    defaultRating?: string;
    highQualityOnly?: boolean;
    excludeLowQuality?: boolean;
}

interface Rule34Service {
    search: (tags: string, options: SearchOptions) => Promise<SearchResult>;
    getRandom?: (options: { tags?: string; count?: number; excludeAi?: boolean; minScore?: number }) => Promise<Post[]>;
    getPostById?: (id: number) => Promise<Post | null>;
    getTrending?: (options: { timeframe?: string; excludeAi?: boolean; page?: number }) => Promise<SearchResult>;
    getRelatedTags?: (tag: string, limit: number) => Promise<Array<{ name?: string }>>;
    getAutocompleteSuggestions?: (query: string) => Promise<Array<{ name: string; count?: number; value?: string }>>;
}

interface Rule34Cache {
    getPreferences?: (userId: string) => Preferences | null;
    setPreferences?: (userId: string, prefs: Partial<Preferences>) => void;
    resetPreferences?: (userId: string) => void;
    getBlacklist?: (userId: string) => string[];
    addToBlacklist?: (userId: string, tag: string) => boolean;
    removeFromBlacklist?: (userId: string, tag: string) => boolean;
    clearBlacklist?: (userId: string) => void;
    getSession?: (userId: string) => Session | null;
    setSession?: (userId: string, session: Session) => void;
    updateSession?: (userId: string, updates: Partial<Session>) => void;
    addToHistory?: (userId: string, postId: number, data: { score?: number }) => void;
    isFavorited?: (userId: string, postId: number) => boolean;
    addFavorite?: (userId: string, postId: number, data: { score?: number; rating?: string }) => void;
    removeFavorite?: (userId: string, postId: number) => void;
    getAutocompleteSuggestions?: (query: string) => Array<{ name: string; count?: number; value?: string }> | null;
    setAutocompleteSuggestions?: (query: string, suggestions: Array<{ name: string; count?: number; value?: string }>) => void;
}

interface PostHandler {
    createPostEmbed: (post: Post, options: {
        resultIndex: number;
        totalResults: number;
        query?: string;
        userId: string;
        searchPage?: number;
        showTags?: boolean;
    }) => Promise<{ embed: EmbedBuilder; rows: ActionRowBuilder<ButtonBuilder>[] }>;
    createVideoEmbed?: (post: Post, options: {
        resultIndex: number;
        totalResults: number;
        userId: string;
        searchPage?: number;
        showTags?: boolean;
    }) => { embed: EmbedBuilder; rows: ActionRowBuilder<ButtonBuilder>[] };
    createNoResultsEmbed?: (tags: string) => EmbedBuilder;
    createRelatedTagsEmbed?: (tag: string, relatedTags: Array<{ name?: string }>) => EmbedBuilder;
    createSettingsEmbed?: (userId: string) => EmbedBuilder;
    createSettingsComponents?: (userId: string) => ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[];
    createErrorEmbed?: (error: Error) => EmbedBuilder;
}
// SERVICE IMPORTS — static ESM imports (converted from CJS require())
const rule34Service: Rule34Service = _rule34Service as any;
const rule34Cache: Rule34Cache = _rule34Cache as any;
const postHandler: PostHandler = _postHandler as any;
// COMMAND
class Rule34Command extends BaseCommand {
    constructor() {
        super({
            category: CommandCategory.API,
            cooldown: 3,
            deferReply: false,
            nsfw: true
        });
    }

    get data(): CommandData {
        return new SlashCommandBuilder()
            .setName('rule34')
            .setDescription('Search Rule34 for images and videos')
            .setNSFW(true)
            .addSubcommand(subcommand =>
                subcommand
                    .setName('search')
                    .setDescription('Search for posts by tags')
                    .addStringOption(option =>
                        option.setName('tags')
                            .setDescription('Tags to search for (space-separated)')
                            .setRequired(true)
                            .setAutocomplete(true)
                    )
                    .addStringOption(option =>
                        option.setName('rating')
                            .setDescription('Filter by rating')
                            .setRequired(false)
                            .addChoices(
                                { name: '🟢 Safe', value: 'safe' },
                                { name: '🟡 Questionable', value: 'questionable' },
                                { name: '🔴 Explicit', value: 'explicit' },
                                { name: '⚪ All Ratings', value: 'all' }
                            )
                    )
                    .addStringOption(option =>
                        option.setName('sort')
                            .setDescription('Sort results by')
                            .setRequired(false)
                            .addChoices(
                                { name: '⭐ Score (Highest)', value: 'score:desc' },
                                { name: '⭐ Score (Lowest)', value: 'score:asc' },
                                { name: '🆕 Newest First', value: 'id:desc' },
                                { name: '📅 Oldest First', value: 'id:asc' },
                                { name: '🔄 Recently Updated', value: 'updated:desc' }
                            )
                    )
                    .addBooleanOption(option =>
                        option.setName('ai_filter')
                            .setDescription('Hide AI-generated content (Default: uses your settings)')
                            .setRequired(false)
                    )
                    .addIntegerOption(option =>
                        option.setName('min_score')
                            .setDescription('Minimum score filter (0-10000)')
                            .setRequired(false)
                            .setMinValue(0)
                            .setMaxValue(10000)
                    )
                    .addStringOption(option =>
                        option.setName('content_type')
                            .setDescription('Filter by content type')
                            .setRequired(false)
                            .addChoices(
                                { name: '🎬 Videos Only', value: 'animated' },
                                { name: '📖 Comics Only', value: 'comic' },
                                { name: '📷 Images Only', value: 'image' }
                            )
                    )
                    .addBooleanOption(option =>
                        option.setName('high_quality')
                            .setDescription('Only show high quality posts')
                            .setRequired(false)
                    )
                    .addIntegerOption(option =>
                        option.setName('min_width')
                            .setDescription('Minimum image width')
                            .setRequired(false)
                            .setMinValue(100)
                            .setMaxValue(10000)
                    )
                    .addIntegerOption(option =>
                        option.setName('min_height')
                            .setDescription('Minimum image height')
                            .setRequired(false)
                            .setMinValue(100)
                            .setMaxValue(10000)
                    )
                    .addStringOption(option =>
                        option.setName('exclude')
                            .setDescription('Tags to exclude (space-separated)')
                            .setRequired(false)
                    )
                    .addIntegerOption(option =>
                        option.setName('page')
                            .setDescription('Page number (default: 1)')
                            .setRequired(false)
                            .setMinValue(1)
                            .setMaxValue(200)
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('random')
                    .setDescription('Get random posts')
                    .addStringOption(option =>
                        option.setName('tags')
                            .setDescription('Optional tags to filter by')
                            .setRequired(false)
                            .setAutocomplete(true)
                    )
                    .addIntegerOption(option =>
                        option.setName('count')
                            .setDescription('Number of random posts (1-10)')
                            .setRequired(false)
                            .setMinValue(1)
                            .setMaxValue(10)
                    )
                    .addBooleanOption(option =>
                        option.setName('ai_filter')
                            .setDescription('Hide AI-generated content')
                            .setRequired(false)
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('id')
                    .setDescription('Get a specific post by ID')
                    .addIntegerOption(option =>
                        option.setName('post_id')
                            .setDescription('The post ID to look up')
                            .setRequired(true)
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('trending')
                    .setDescription('Get trending/popular posts')
                    .addStringOption(option =>
                        option.setName('timeframe')
                            .setDescription('Timeframe for trending')
                            .setRequired(false)
                            .addChoices(
                                { name: '📅 Today', value: 'day' },
                                { name: '📊 This Week', value: 'week' },
                                { name: '📈 This Month', value: 'month' }
                            )
                    )
                    .addBooleanOption(option =>
                        option.setName('ai_filter')
                            .setDescription('Hide AI-generated content')
                            .setRequired(false)
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('related')
                    .setDescription('Find tags related to a tag')
                    .addStringOption(option =>
                        option.setName('tag')
                            .setDescription('Tag to find related tags for')
                            .setRequired(true)
                            .setAutocomplete(true)
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('settings')
                    .setDescription('Configure your Rule34 preferences and blacklist')
            );
    }

    async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
        try {
            const focused = interaction.options.getFocused(true);
            
            if (focused.name !== 'tags' && focused.name !== 'tag') {
                await interaction.respond([]).catch(() => {});
                return;
            }

            const focusedValue = focused.value?.trim();
            
            if (!focusedValue || focusedValue.length < 2) {
                await interaction.respond([
                    { name: '💡 Type at least 2 characters...', value: ' ' }
                ]).catch(() => {});
                return;
            }

            const cached = rule34Cache?.getAutocompleteSuggestions?.(focusedValue);
            if (cached) {
                const choices = cached.map(s => ({
                    name: `${s.name}${s.count ? ` (${s.count})` : ''}`.slice(0, 100),
                    value: (s.value || s.name).slice(0, 100)
                }));
                await interaction.respond(choices).catch(() => {});
                return;
            }

            const suggestions = await rule34Service?.getAutocompleteSuggestions?.(focusedValue) || [];
            
            rule34Cache?.setAutocompleteSuggestions?.(focusedValue, suggestions);
            
            const choices = [
                { name: `🔍 "${focusedValue}"`, value: focusedValue }
            ];
            
            for (const s of suggestions.slice(0, 24)) {
                choices.push({
                    name: `${s.name}${s.count ? ` (${s.count})` : ''}`.slice(0, 100),
                    value: (s.value || s.name || '').slice(0, 100)
                });
            }

            await interaction.respond(choices).catch(() => {});
        } catch (error) {
            logger.warn('Rule34', 'Autocomplete error: ' + (error as Error).message);
            const focusedValue = interaction.options.getFocused() || '';
            await interaction.respond([
                { name: `🔍 "${focusedValue.slice(0, 90)}"`, value: focusedValue.slice(0, 100) || 'search' }
            ]).catch(() => {});
        }
    }

    async run(interaction: ChatInputCommandInteraction): Promise<void> {
        // Access control
        const access = await checkAccess(interaction, AccessType.SUB);
        if (access.blocked) {
            await interaction.reply({ embeds: [access.embed!], ephemeral: true });
            return;
        }

        // Verify NSFW channel
        const channel = interaction.channel;
        const isNsfw = channel && 'nsfw' in channel ? channel.nsfw : false;
        if (!isNsfw) {
            await this.safeReply(interaction, {
                embeds: [this.errorEmbed('🔞 This command can only be used in NSFW channels!')],
                ephemeral: true
            });
            return;
        }

        const subcommand = interaction.options.getSubcommand();
        const userId = interaction.user.id;

        try {
            switch (subcommand) {
                case 'search':
                    await this._handleSearch(interaction, userId);
                    break;
                case 'random':
                    await this._handleRandom(interaction, userId);
                    break;
                case 'id':
                    await this._handleGetById(interaction, userId);
                    break;
                case 'trending':
                    await this._handleTrending(interaction, userId);
                    break;
                case 'related':
                    await this._handleRelated(interaction, userId);
                    break;
                case 'settings':
                    await this._handleSettings(interaction, userId);
                    break;
                default:
                    await this.safeReply(interaction, { 
                        embeds: [this.errorEmbed('Unknown command')], 
                        ephemeral: true 
                    });
            }
        } catch (error) {
            logger.error('Rule34', `Command error: ${(error as Error).message}`);
            const errorEmbed = postHandler?.createErrorEmbed?.(error as Error) || this.errorEmbed((error as Error).message || 'An error occurred');
            
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ embeds: [errorEmbed] }).catch(() => {});
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    }

    private async _handleSearch(interaction: ChatInputCommandInteraction, userId: string): Promise<void> {
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

        const prefs = rule34Cache?.getPreferences?.(userId) || {};
        const blacklist = rule34Cache?.getBlacklist?.(userId) || [];

        const searchOptions: SearchOptions = {
            limit: 50,
            page: page - 1,
            sort: sort || prefs.sortMode || 'score:desc',
            rating: rating === 'all' ? null : (rating || prefs.defaultRating),
            excludeAi: aiFilter ?? prefs.aiFilter,
            minScore: minScore ?? prefs.minScore ?? 0,
            contentType: contentType || undefined,
            excludeTags: [...blacklist, ...(exclude ? exclude.split(/\s+/) : [])],
            minWidth: minWidth || 0,
            minHeight: minHeight || 0,
            highQualityOnly: highQuality ?? prefs.highQualityOnly,
            excludeLowQuality: prefs.excludeLowQuality
        };

        const result = await rule34Service.search(tags, searchOptions);

        if (!result?.posts?.length) {
            const noResultsEmbed = postHandler?.createNoResultsEmbed?.(tags) || this.errorEmbed(`No results found for **${tags}**`);
            await interaction.editReply({ embeds: [noResultsEmbed] });
            return;
        }

        rule34Cache?.setSession?.(userId, {
            type: 'search',
            query: tags,
            posts: result.posts,
            options: searchOptions,
            currentIndex: 0,
            currentPage: page,
            hasMore: result.hasMore
        });

        const post = result.posts[0];
        rule34Cache?.addToHistory?.(userId, post.id, { score: post.score });

        if (post.hasVideo && postHandler?.createVideoEmbed) {
            const { embed, rows } = postHandler.createVideoEmbed(post, {
                resultIndex: 0,
                totalResults: result.posts.length,
                userId,
                searchPage: page
            });
            await interaction.editReply({ embeds: [embed], components: rows });
            return;
        }

        const { embed, rows } = await postHandler.createPostEmbed(post, {
            resultIndex: 0,
            totalResults: result.posts.length,
            query: tags,
            userId,
            searchPage: page
        });

        await interaction.editReply({ embeds: [embed], components: rows });
    }

    private async _handleRandom(interaction: ChatInputCommandInteraction, userId: string): Promise<void> {
        await interaction.deferReply();

        const tags = interaction.options.getString('tags') || '';
        const count = interaction.options.getInteger('count') || 1;
        const aiFilter = interaction.options.getBoolean('ai_filter');

        const prefs = rule34Cache?.getPreferences?.(userId) || {};
        const blacklist = rule34Cache?.getBlacklist?.(userId) || [];

        const rawPosts = await rule34Service?.getRandom?.({
            tags,
            count,
            excludeAi: aiFilter ?? prefs.aiFilter,
            minScore: prefs.minScore
        }) || (await rule34Service.search(tags, { limit: count, sort: 'random' })).posts || [];

        const filteredPosts = rawPosts.filter(post => {
            const postTags = (post.tags || '').split(' ');
            return !postTags.some(t => blacklist.includes(t));
        });

        if (filteredPosts.length === 0) {
            const noResultsEmbed = postHandler?.createNoResultsEmbed?.(tags || 'random') || this.errorEmbed('No results found');
            await interaction.editReply({ embeds: [noResultsEmbed] });
            return;
        }

        rule34Cache?.setSession?.(userId, {
            type: 'random',
            query: tags || '',
            posts: filteredPosts,
            currentIndex: 0,
            currentPage: 1
        });

        const post = filteredPosts[0];
        rule34Cache?.addToHistory?.(userId, post.id, { score: post.score });

        if (post.hasVideo && postHandler?.createVideoEmbed) {
            const { embed, rows } = postHandler.createVideoEmbed(post, {
                resultIndex: 0,
                totalResults: filteredPosts.length,
                userId
            });
            await interaction.editReply({ embeds: [embed], components: rows });
            return;
        }

        const { embed, rows } = await postHandler.createPostEmbed(post, {
            resultIndex: 0,
            totalResults: filteredPosts.length,
            userId
        });

        await interaction.editReply({ embeds: [embed], components: rows });
    }

    private async _handleGetById(interaction: ChatInputCommandInteraction, userId: string): Promise<void> {
        await interaction.deferReply();

        const postId = interaction.options.getInteger('post_id', true);
        const post = await rule34Service?.getPostById?.(postId);

        if (!post) {
            await interaction.editReply({
                embeds: [this.errorEmbed(`Post #${postId} not found.`)]
            });
            return;
        }

        rule34Cache?.setSession?.(userId, {
            type: 'single',
            posts: [post],
            currentIndex: 0
        });

        rule34Cache?.addToHistory?.(userId, post.id, { score: post.score });

        if (post.hasVideo && postHandler?.createVideoEmbed) {
            const { embed, rows } = postHandler.createVideoEmbed(post, {
                resultIndex: 0,
                totalResults: 1,
                userId
            });
            await interaction.editReply({ embeds: [embed], components: rows });
            return;
        }

        const { embed, rows } = await postHandler.createPostEmbed(post, {
            resultIndex: 0,
            totalResults: 1,
            userId
        });

        await interaction.editReply({ embeds: [embed], components: rows });
    }

    private async _handleTrending(interaction: ChatInputCommandInteraction, userId: string): Promise<void> {
        await interaction.deferReply();

        const timeframe = interaction.options.getString('timeframe') || 'day';
        const aiFilter = interaction.options.getBoolean('ai_filter');

        const prefs = rule34Cache?.getPreferences?.(userId) || {};
        const blacklist = rule34Cache?.getBlacklist?.(userId) || [];

        const result = await rule34Service?.getTrending?.({
            timeframe,
            excludeAi: aiFilter ?? prefs.aiFilter
        }) || await rule34Service.search('', { sort: 'score:desc', limit: 50 });

        const rawPosts = result?.posts || [];
        
        const filteredPosts = rawPosts.filter(post => {
            const postTags = (post.tags || '').split(' ');
            return !postTags.some(t => blacklist.includes(t));
        });

        if (filteredPosts.length === 0) {
            await interaction.editReply({
                embeds: [this.errorEmbed('No trending posts found matching your filters.')]
            });
            return;
        }

        rule34Cache?.setSession?.(userId, {
            type: 'trending',
            posts: filteredPosts,
            currentIndex: 0,
            currentPage: 1,
            timeframe,
            options: { timeframe, excludeAi: aiFilter ?? prefs.aiFilter } as any
        });

        const post = filteredPosts[0];
        rule34Cache?.addToHistory?.(userId, post.id, { score: post.score });

        if (post.hasVideo && postHandler?.createVideoEmbed) {
            const { embed, rows } = postHandler.createVideoEmbed(post, {
                resultIndex: 0,
                totalResults: filteredPosts.length,
                userId
            });
            await interaction.editReply({ embeds: [embed], components: rows });
            return;
        }

        const { embed, rows } = await postHandler.createPostEmbed(post, {
            resultIndex: 0,
            totalResults: filteredPosts.length,
            query: `🔥 Trending (${timeframe})`,
            userId
        });

        await interaction.editReply({ embeds: [embed], components: rows });
    }

    private async _handleRelated(interaction: ChatInputCommandInteraction, userId: string): Promise<void> {
        await interaction.deferReply();

        const tag = interaction.options.getString('tag', true);
        const relatedTags = await rule34Service?.getRelatedTags?.(tag, 20) || [];

        const embed = postHandler?.createRelatedTagsEmbed?.(tag, relatedTags) || 
            this.infoEmbed('Related Tags', relatedTags.map(t => `• ${t.name || t}`).join('\n') || 'No related tags found');
        await interaction.editReply({ embeds: [embed] });
    }

    private async _handleSettings(interaction: ChatInputCommandInteraction, userId: string): Promise<void> {
        const prefs = rule34Cache?.getPreferences?.(userId) || {};
        const blacklist = rule34Cache?.getBlacklist?.(userId) || [];
        
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
            `⭐ **Min Score:** ${prefs.minScore || 0}`,
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

    async handleButton(interaction: ButtonInteraction): Promise<void> {
        const parts = interaction.customId.split('_');
        const action = parts[1];
        const userId = parts[parts.length - 1];

        if (userId !== interaction.user.id) {
            await interaction.reply({
                content: '❌ This button is not for you!',
                ephemeral: true
            });
            return;
        }

        try {
            switch (action) {
                case 'prev':
                case 'next':
                case 'random':
                    await this._handleNavigation(interaction, action, userId);
                    break;
                case 'prevpage':
                case 'nextpage':
                    await this._handlePageNavigation(interaction, action, userId);
                    break;
                case 'fav':
                    await this._handleFavoriteToggle(interaction, parts[2], userId);
                    break;
                case 'tags':
                    await this._handleTagsToggle(interaction, userId);
                    break;
                case 'settings':
                    if (parts[2] === 'reset') {
                        rule34Cache?.resetPreferences?.(userId);
                        rule34Cache?.clearBlacklist?.(userId);
                        await this._refreshSettingsEmbed(interaction, userId);
                    } else if (parts[2] === 'refresh') {
                        await this._refreshSettingsEmbed(interaction, userId);
                    } else if (parts[2] === 'close') {
                        await interaction.update({ components: [] });
                    } else if (parts[2] === 'back') {
                        await this._refreshSettingsEmbed(interaction, userId);
                    }
                    break;
                case 'bl':
                    await this._handleBlacklistAction(interaction, parts[2], userId);
                    break;
                case 'counter':
                case 'pageinfo':
                    await interaction.deferUpdate();
                    break;
                default:
                    await interaction.deferUpdate();
            }
        } catch (error) {
            logger.error('Rule34', `Button error: ${(error as Error).message}`);
            await interaction.reply({
                content: '❌ An error occurred. Please try again.',
                ephemeral: true
            }).catch(() => {});
        }
    }

    private async _handleNavigation(interaction: ButtonInteraction, action: string, userId: string): Promise<void> {
        const session = rule34Cache?.getSession?.(userId);
        
        if (!session) {
            await interaction.reply({
                content: '⏱️ Session expired. Please run the command again.',
                ephemeral: true
            });
            return;
        }

        await interaction.deferUpdate();

        let newIndex = session.currentIndex;
        
        if (action === 'prev') {
            newIndex = Math.max(0, newIndex - 1);
        } else if (action === 'next') {
            newIndex = Math.min(session.posts.length - 1, newIndex + 1);
        } else if (action === 'random') {
            newIndex = Math.floor(Math.random() * session.posts.length);
        }

        rule34Cache?.updateSession?.(userId, { currentIndex: newIndex });

        const post = session.posts[newIndex];
        rule34Cache?.addToHistory?.(userId, post.id, { score: post.score });

        if (post.hasVideo && postHandler?.createVideoEmbed) {
            const { embed, rows } = postHandler.createVideoEmbed(post, {
                resultIndex: newIndex,
                totalResults: session.posts.length,
                userId,
                searchPage: session.currentPage || 1
            });
            await interaction.editReply({ embeds: [embed], components: rows });
            return;
        }

        const { embed, rows } = await postHandler.createPostEmbed(post, {
            resultIndex: newIndex,
            totalResults: session.posts.length,
            query: session.query,
            userId,
            searchPage: session.currentPage || 1
        });

        await interaction.editReply({ embeds: [embed], components: rows });
    }

    private async _handlePageNavigation(interaction: ButtonInteraction, action: string, userId: string): Promise<void> {
        const session = rule34Cache?.getSession?.(userId);
        
        if (!session || !['search', 'random', 'trending'].includes(session.type)) {
            await interaction.reply({
                content: '⏱️ Session expired. Please run the command again.',
                ephemeral: true
            });
            return;
        }

        await interaction.deferUpdate();

        const currentPage = session.currentPage || 1;
        const newPage = action === 'nextpage' ? currentPage + 1 : Math.max(1, currentPage - 1);

        let posts: Post[] = [];
        let hasMore = false;

        if (session.type === 'search' && session.options) {
            const result = await rule34Service.search(session.query || '', {
                ...session.options,
                page: newPage - 1
            });
            posts = result?.posts || [];
            hasMore = result?.hasMore || false;
        } else if (session.type === 'random') {
            // For random, fetch new random posts using getRandom
            const result = await rule34Service.getRandom?.({
                count: session.options?.limit || 50,
                excludeAi: session.options?.excludeAi,
                minScore: session.options?.minScore
            });
            posts = result || [];
            hasMore = true; // Random can always get more
        } else if (session.type === 'trending') {
            // For trending, fetch next page
            const result = await rule34Service.getTrending?.({
                ...session.options,
                page: newPage - 1
            });
            posts = result?.posts || [];
            hasMore = result?.hasMore || false;
        }

        if (posts.length === 0) {
            await interaction.followUp({
                content: '❌ No more results found.',
                ephemeral: true
            });
            return;
        }

        rule34Cache?.updateSession?.(userId, {
            posts: posts,
            currentIndex: 0,
            currentPage: newPage,
            hasMore: hasMore
        });

        const post = posts[0];
        rule34Cache?.addToHistory?.(userId, post.id, { score: post.score });

        if (post.hasVideo && postHandler?.createVideoEmbed) {
            const { embed, rows } = postHandler.createVideoEmbed(post, {
                resultIndex: 0,
                totalResults: posts.length,
                userId,
                searchPage: newPage
            });
            await interaction.editReply({ embeds: [embed], components: rows });
            return;
        }

        const { embed, rows } = await postHandler.createPostEmbed(post, {
            resultIndex: 0,
            totalResults: posts.length,
            query: session.query,
            userId,
            searchPage: newPage
        });

        await interaction.editReply({ embeds: [embed], components: rows });
    }

    private async _handleFavoriteToggle(interaction: ButtonInteraction, postIdStr: string, userId: string): Promise<void> {
        const postId = parseInt(postIdStr);
        const isFavorited = rule34Cache?.isFavorited?.(userId, postId);
        
        if (isFavorited) {
            rule34Cache?.removeFavorite?.(userId, postId);
            await interaction.reply({
                content: '💔 Removed from favorites.',
                ephemeral: true
            });
        } else {
            const session = rule34Cache?.getSession?.(userId);
            const post = session?.posts.find(p => p.id === postId);
            
            rule34Cache?.addFavorite?.(userId, postId, {
                score: post?.score,
                rating: post?.rating
            });
            
            await interaction.reply({
                content: '💖 Added to favorites!',
                ephemeral: true
            });
        }
    }

    private async _handleTagsToggle(interaction: ButtonInteraction, userId: string): Promise<void> {
        const session = rule34Cache?.getSession?.(userId);
        
        if (!session) {
            await interaction.reply({
                content: '⏱️ Session expired.',
                ephemeral: true
            });
            return;
        }

        await interaction.deferUpdate();

        const post = session.posts[session.currentIndex];
        const showTags = !session.showTags;
        
        rule34Cache?.updateSession?.(userId, { showTags });

        if (post.hasVideo && postHandler?.createVideoEmbed) {
            const { embed, rows } = postHandler.createVideoEmbed(post, {
                resultIndex: session.currentIndex,
                totalResults: session.posts.length,
                userId,
                searchPage: session.currentPage || 1,
                showTags
            });
            await interaction.editReply({ embeds: [embed], components: rows });
            return;
        }

        const { embed, rows } = await postHandler.createPostEmbed(post, {
            resultIndex: session.currentIndex,
            totalResults: session.posts.length,
            query: session.query,
            userId,
            searchPage: session.currentPage || 1,
            showTags
        });

        await interaction.editReply({ embeds: [embed], components: rows });
    }

    private async _handleBlacklistAction(interaction: ButtonInteraction, action: string, userId: string): Promise<void> {
        switch (action) {
            case 'add': {
                const modal = new ModalBuilder()
                    .setCustomId(`rule34_bl_add_modal_${userId}`)
                    .setTitle('➕ Add Tags to Blacklist');

                const input = new TextInputBuilder()
                    .setCustomId('tags_input')
                    .setLabel('Tags to blacklist (space-separated)')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Enter tags, e.g., ai_generated ugly bad_anatomy')
                    .setRequired(true)
                    .setMinLength(2)
                    .setMaxLength(500);

                modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
                await interaction.showModal(modal);

                try {
                    const modalResponse = await interaction.awaitModalSubmit({
                        filter: i => i.customId === `rule34_bl_add_modal_${userId}`,
                        time: 60000
                    });

                    const tagsInput = modalResponse.fields.getTextInputValue('tags_input');
                    const tags = tagsInput.toLowerCase().split(/\s+/).filter(t => t.length > 0);
                    
                    let addedCount = 0;
                    for (const tag of tags) {
                        if (rule34Cache?.addToBlacklist?.(userId, tag)) {
                            addedCount++;
                        }
                    }

                    await this._showBlacklistView(modalResponse, userId, `✅ Added ${addedCount} tag(s) to blacklist`);
                } catch {
                    // Modal timed out
                }
                break;
            }
            case 'remove': {
                const modal = new ModalBuilder()
                    .setCustomId(`rule34_bl_remove_modal_${userId}`)
                    .setTitle('➖ Remove Tags from Blacklist');

                const input = new TextInputBuilder()
                    .setCustomId('tags_input')
                    .setLabel('Tags to remove (space-separated)')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Enter tags to remove from blacklist')
                    .setRequired(true)
                    .setMinLength(2)
                    .setMaxLength(500);

                modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
                await interaction.showModal(modal);

                try {
                    const modalResponse = await interaction.awaitModalSubmit({
                        filter: i => i.customId === `rule34_bl_remove_modal_${userId}`,
                        time: 60000
                    });

                    const tagsInput = modalResponse.fields.getTextInputValue('tags_input');
                    const tags = tagsInput.toLowerCase().split(/\s+/).filter(t => t.length > 0);
                    
                    let removedCount = 0;
                    for (const tag of tags) {
                        if (rule34Cache?.removeFromBlacklist?.(userId, tag)) {
                            removedCount++;
                        }
                    }

                    await this._showBlacklistView(modalResponse, userId, `✅ Removed ${removedCount} tag(s) from blacklist`);
                } catch {
                    // Modal timed out
                }
                break;
            }
            case 'clear': {
                rule34Cache?.clearBlacklist?.(userId);
                await this._showBlacklistView(interaction, userId, '🗑️ Blacklist cleared!');
                break;
            }
        }
    }

    private async _showBlacklistView(interaction: ButtonInteraction | import('discord.js').ModalSubmitInteraction, userId: string, message: string | null = null): Promise<void> {
        const blacklist = rule34Cache?.getBlacklist?.(userId) || [];
        
        const embed = new EmbedBuilder()
            .setColor(0x2F3136)
            .setTitle('🚫 Manage Blacklist')
            .setDescription(
                (message ? `${message}\n\n` : '') +
                (blacklist.length > 0
                    ? `**Current blacklist (${blacklist.length}):**\n${blacklist.map(t => `\`${t}\``).join(' ')}`
                    : '*No tags blacklisted yet*')
            )
            .setFooter({ text: '💡 Click Add to blacklist tags, or Clear to remove all' });

        const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(`rule34_bl_add_${userId}`)
                .setLabel('Add Tags')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('➕'),
            new ButtonBuilder()
                .setCustomId(`rule34_bl_remove_${userId}`)
                .setLabel('Remove Tags')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('➖')
                .setDisabled(blacklist.length === 0),
            new ButtonBuilder()
                .setCustomId(`rule34_bl_clear_${userId}`)
                .setLabel('Clear All')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🗑️')
                .setDisabled(blacklist.length === 0),
            new ButtonBuilder()
                .setCustomId(`rule34_settings_back_${userId}`)
                .setLabel('Back')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('◀️')
        );

        if ('update' in interaction) {
            await interaction.update({ embeds: [embed], components: [buttons] });
        }
    }

    private async _refreshSettingsEmbed(interaction: ButtonInteraction | StringSelectMenuInteraction, userId: string): Promise<void> {
        const prefs = rule34Cache?.getPreferences?.(userId) || {};
        const blacklist = rule34Cache?.getBlacklist?.(userId) || [];
        
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
            `⭐ **Min Score:** ${prefs.minScore || 0}`,
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

        await interaction.update({ 
            embeds: [embed], 
            components: [
                new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(settingSelect), 
                quickRow
            ]
        });
    }

    async handleSelectMenu(interaction: StringSelectMenuInteraction): Promise<void> {
        const parts = interaction.customId.split('_');
        const userId = parts[parts.length - 1];

        if (userId !== interaction.user.id) {
            await interaction.reply({
                content: '❌ This menu is not for you!',
                ephemeral: true
            }).catch(() => {});
            return;
        }

        const value = interaction.values[0];

        try {
            if (interaction.customId.startsWith('rule34_settingmenu_')) {
                await this._handleSettingMenuSelect(interaction, value, userId);
                return;
            }

            if (interaction.customId.startsWith('rule34_sort_select_')) {
                rule34Cache?.setPreferences?.(userId, { sortMode: value });
                await this._refreshSettingsEmbed(interaction, userId);
                return;
            }
        } catch (error) {
            const err = error as Error & { code?: number };
            if (err.code !== 10062 && err.code !== 40060) {
                logger.error('Rule34', `SelectMenu error: ${(error as Error).message}`);
            }
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ Failed to update setting.',
                    ephemeral: true
                }).catch(() => {});
            }
        }
    }

    private async _handleSettingMenuSelect(interaction: StringSelectMenuInteraction, setting: string, userId: string): Promise<void> {
        try {
            switch (setting) {
                case 'ai': {
                    const prefs = rule34Cache?.getPreferences?.(userId) || {};
                    const newValue = !prefs.aiFilter;
                    rule34Cache?.setPreferences?.(userId, { aiFilter: newValue });
                    await this._refreshSettingsEmbed(interaction, userId);
                    break;
                }
                case 'quality': {
                    const prefs = rule34Cache?.getPreferences?.(userId) || {};
                    if (!prefs.excludeLowQuality && !prefs.highQualityOnly) {
                        rule34Cache?.setPreferences?.(userId, { excludeLowQuality: true, highQualityOnly: false });
                    } else if (prefs.excludeLowQuality) {
                        rule34Cache?.setPreferences?.(userId, { excludeLowQuality: false, highQualityOnly: true });
                    } else {
                        rule34Cache?.setPreferences?.(userId, { excludeLowQuality: false, highQualityOnly: false });
                    }
                    await this._refreshSettingsEmbed(interaction, userId);
                    break;
                }
                case 'sort': {
                    const sortSelect = new StringSelectMenuBuilder()
                        .setCustomId(`rule34_sort_select_${userId}`)
                        .setPlaceholder('Select sort order...')
                        .addOptions([
                            { label: 'Score (High to Low)', value: 'score:desc', emoji: '⬆️' },
                            { label: 'Score (Low to High)', value: 'score:asc', emoji: '⬇️' },
                            { label: 'Newest First', value: 'id:desc', emoji: '🆕' },
                            { label: 'Oldest First', value: 'id:asc', emoji: '📅' },
                            { label: 'Random', value: 'random', emoji: '🎲' }
                        ]);

                    const backBtn = new ButtonBuilder()
                        .setCustomId(`rule34_settings_back_${userId}`)
                        .setLabel('Back')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('◀️');

                    await interaction.update({
                        components: [
                            new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(sortSelect),
                            new ActionRowBuilder<ButtonBuilder>().addComponents(backBtn)
                        ]
                    });
                    break;
                }
                case 'blacklist': {
                    const blacklist = rule34Cache?.getBlacklist?.(userId) || [];
                    
                    const embed = new EmbedBuilder()
                        .setColor(0x2F3136)
                        .setTitle('🚫 Manage Blacklist')
                        .setDescription(
                            blacklist.length > 0
                                ? `**Current blacklist (${blacklist.length}):**\n${blacklist.map(t => `\`${t}\``).join(' ')}`
                                : '*No tags blacklisted yet*'
                        )
                        .setFooter({ text: '💡 Click Add to blacklist tags, or Clear to remove all' });

                    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`rule34_bl_add_${userId}`)
                            .setLabel('Add Tags')
                            .setStyle(ButtonStyle.Primary)
                            .setEmoji('➕'),
                        new ButtonBuilder()
                            .setCustomId(`rule34_bl_remove_${userId}`)
                            .setLabel('Remove Tags')
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji('➖')
                            .setDisabled(blacklist.length === 0),
                        new ButtonBuilder()
                            .setCustomId(`rule34_bl_clear_${userId}`)
                            .setLabel('Clear All')
                            .setStyle(ButtonStyle.Danger)
                            .setEmoji('🗑️')
                            .setDisabled(blacklist.length === 0),
                        new ButtonBuilder()
                            .setCustomId(`rule34_settings_back_${userId}`)
                            .setLabel('Back')
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji('◀️')
                    );

                    await interaction.update({ embeds: [embed], components: [buttons] });
                    break;
                }
                case 'score': {
                    const modal = new ModalBuilder()
                        .setCustomId(`rule34_score_modal_${userId}`)
                        .setTitle('⭐ Set Minimum Score');

                    const input = new TextInputBuilder()
                        .setCustomId('score_value')
                        .setLabel('Minimum score (0-10000)')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('Enter a number, e.g., 100')
                        .setRequired(true)
                        .setMinLength(1)
                        .setMaxLength(5);

                    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
                    await interaction.showModal(modal);

                    try {
                        const modalResponse = await interaction.awaitModalSubmit({
                            filter: i => i.customId === `rule34_score_modal_${userId}`,
                            time: 60000
                        });

                        const value = parseInt(modalResponse.fields.getTextInputValue('score_value'));
                        if (!isNaN(value) && value >= 0 && value <= 10000) {
                            rule34Cache?.setPreferences?.(userId, { minScore: value });
                        }
                        await this._refreshSettingsEmbed(modalResponse as unknown as StringSelectMenuInteraction, userId);
                    } catch {
                        // Modal timed out
                    }
                    break;
                }
            }
        } catch (error) {
            const err = error as Error & { code?: number };
            if (err.code !== 10062 && err.code !== 40060) {
                logger.error('Rule34', `SettingMenuSelect error: ${(error as Error).message}`);
            }
        }
    }
}

export default new Rule34Command();
