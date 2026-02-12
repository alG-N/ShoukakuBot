/**
 * Pixiv Command - Presentation Layer
 * Search for artwork, manga, or novels on Pixiv
 * @module presentation/commands/api/pixiv
 */

import { 
    SlashCommandBuilder, 
    ChatInputCommandInteraction,
    AutocompleteInteraction,
    ButtonInteraction
} from 'discord.js';
import { BaseCommand, CommandCategory, type CommandData } from '../BaseCommand.js';
import { checkAccess, AccessType } from '../../services/index.js';
import { getDefault } from '../../utils/common/moduleHelper.js';
// TYPES
interface Artwork {
    id: number;
    type?: string;
    page_count?: number;
}

interface SearchOptions {
    type?: string;
    sort?: string;
    nsfw?: string;
    aiFilter?: boolean;
    qualityFilter?: boolean;
    translate?: boolean;
    page?: number;
    offset?: number;
    minBookmarks?: number;
}

interface SearchResult {
    items?: Artwork[];
    nextUrl?: string;
}

interface CachedSearch {
    items: Artwork[];
    query: string;
    options: SearchOptions;
    hasNextPage: boolean;
    currentIndex?: number;
    mangaPageIndex?: number;
}

interface ContentEmbedResult {
    embed: import('discord.js').EmbedBuilder;
    rows?: import('discord.js').ActionRowBuilder<import('discord.js').ButtonBuilder>[];
}

interface PixivService {
    getArtwork: (id: string) => Promise<Artwork | null>;
    search: (query: string, options: SearchOptions) => Promise<SearchResult>;
    getAutocompleteSuggestions: (query: string) => Promise<Array<{ name?: string; tag_translation?: string; tag?: string; value?: string }>>;
}

interface PixivCache {
    getSearchSuggestions?: (query: string) => Array<{ name: string; value: string }> | null;
    setSearchSuggestions?: (query: string, suggestions: Array<{ name: string; value: string }>) => void;
    setSearchResults?: (key: string, data: CachedSearch) => void;
    getSearchResults?: (key: string) => CachedSearch | null;
    updateSearchResults?: (key: string, updates: Partial<CachedSearch>) => void;
}

interface ContentHandler {
    createContentEmbed: (artwork: Artwork, options: {
        resultIndex: number;
        totalResults: number;
        searchPage?: number;
        cacheKey: string;
        contentType: string;
        mangaPageIndex?: number;
        hasNextPage?: boolean;
        originalQuery?: string;
        sortMode?: string;
        showNsfw?: boolean;
    }) => Promise<ContentEmbedResult>;
    createNoResultsEmbed: (query: string) => import('discord.js').EmbedBuilder;
    createErrorEmbed?: (error: Error) => import('discord.js').EmbedBuilder;
}
// SERVICE IMPORTS
let pixivService: PixivService | undefined;
let pixivCache: PixivCache | undefined;
let contentHandler: ContentHandler | undefined;


try {
    pixivService = getDefault(require('../../services/api/pixivService'));
    pixivCache = getDefault(require('../../repositories/api/pixivCache'));
    contentHandler = getDefault(require('../../handlers/api/pixivContentHandler'));
} catch (e) {
    console.warn('[Pixiv] Could not load services:', (e as Error).message);
}
// COMMAND
class PixivCommand extends BaseCommand {
    constructor() {
        super({
            category: CommandCategory.API,
            cooldown: 3,
            deferReply: true
        });
    }

    get data(): CommandData {
        return new SlashCommandBuilder()
            .setName('pixiv')
            .setDescription('Search for artwork, manga, or novels on Pixiv')
            .addStringOption(option =>
                option.setName('query')
                    .setDescription('Search by tag/keyword OR artwork ID (e.g., 139155931)')
                    .setRequired(true)
                    .setAutocomplete(true)
            )
            .addStringOption(option =>
                option.setName('type')
                    .setDescription('Type of content to search for')
                    .setRequired(false)
                    .addChoices(
                        { name: '🎨 Illustration', value: 'illust' },
                        { name: '📚 Manga', value: 'manga' },
                        { name: '📖 Light Novel', value: 'novel' }
                    )
            )
            .addStringOption(option =>
                option.setName('sort')
                    .setDescription('Sort results')
                    .setRequired(false)
                    .addChoices(
                        { name: '🔥 Popular (Default)', value: 'popular_desc' },
                        { name: '🆕 Newest First', value: 'date_desc' },
                        { name: '📅 Oldest First', value: 'date_asc' },
                        { name: '📊 Daily Ranking', value: 'day' },
                        { name: '📈 Weekly Ranking', value: 'week' },
                        { name: '🏆 Monthly Ranking', value: 'month' }
                    )
            )
            .addStringOption(option =>
                option.setName('nsfw')
                    .setDescription('NSFW content filter')
                    .setRequired(false)
                    .addChoices(
                        { name: '✅ SFW Only (Default)', value: 'sfw' },
                        { name: '🔞 R18 + SFW (Show All)', value: 'all' },
                        { name: '🔥 R18 Only', value: 'r18only' }
                    )
            )
            .addBooleanOption(option =>
                option.setName('ai_filter')
                    .setDescription('Hide AI-generated content (Default: OFF - shows AI art)')
                    .setRequired(false)
            )
            .addBooleanOption(option =>
                option.setName('quality_filter')
                    .setDescription('Hide low quality art (under 1000 views)')
                    .setRequired(false)
            )
            .addBooleanOption(option =>
                option.setName('translate')
                    .setDescription('Translate your search to Japanese')
                    .setRequired(false)
            )
            .addIntegerOption(option =>
                option.setName('page')
                    .setDescription('Page number (default: 1)')
                    .setMinValue(1)
                    .setMaxValue(50)
            )
            .addIntegerOption(option =>
                option.setName('min_bookmarks')
                    .setDescription('Minimum bookmarks filter (e.g., 100, 500, 1000)')
                    .setMinValue(0)
                    .setMaxValue(100000)
            );
    }

    async run(interaction: ChatInputCommandInteraction): Promise<void> {
        // Access control
        const access = await checkAccess(interaction, AccessType.SUB);
        if (access.blocked) {
            await interaction.reply({ embeds: [access.embed!], ephemeral: true });
            return;
        }

        const query = interaction.options.getString('query', true);
        const type = interaction.options.getString('type') || 'illust';
        const sort = interaction.options.getString('sort') || 'popular_desc';
        const nsfw = interaction.options.getString('nsfw') || 'sfw';
        const aiFilter = interaction.options.getBoolean('ai_filter') || false;
        const qualityFilter = interaction.options.getBoolean('quality_filter') || false;
        const translate = interaction.options.getBoolean('translate') || false;
        const page = interaction.options.getInteger('page') || 1;
        const minBookmarks = interaction.options.getInteger('min_bookmarks') || 0;

        // Check NSFW permissions
        const channel = interaction.channel;
        const isNsfwChannel = channel && 'nsfw' in channel ? channel.nsfw : false;
        if ((nsfw === 'all' || nsfw === 'r18only') && !isNsfwChannel) {
            await this.safeReply(interaction, { embeds: [this.errorEmbed('🔞 NSFW content can only be viewed in NSFW channels.')], ephemeral: true });
            return;
        }

        try {
            // Check if query is an artwork ID
            if (/^\d+$/.test(query)) {
                await this._handleArtworkById(interaction, query);
                return;
            }

            // Search by query
            await this._handleSearch(interaction, {
                query,
                type,
                sort,
                nsfw,
                aiFilter,
                qualityFilter,
                translate,
                page,
                minBookmarks
            });
        } catch (error) {
            console.error('[Pixiv]', error);
            const embed = contentHandler?.createErrorEmbed?.(error as Error) || this.errorEmbed('An error occurred while searching Pixiv.');
            await this.safeReply(interaction, { embeds: [embed], ephemeral: true });
        }
    }

    private async _handleArtworkById(interaction: ChatInputCommandInteraction, artworkId: string): Promise<void> {
        const artwork = await pixivService!.getArtwork(artworkId);
        
        if (!artwork) {
            await this.safeReply(interaction, { embeds: [this.errorEmbed(`Artwork **${artworkId}** not found.`)], ephemeral: true });
            return;
        }

        const cacheKey = `${interaction.user.id}_${artworkId}`;
        const { embed, rows } = await contentHandler!.createContentEmbed(artwork, {
            resultIndex: 0,
            totalResults: 1,
            cacheKey,
            contentType: artwork.type || 'illust'
        });
        await this.safeReply(interaction, { embeds: [embed], components: rows || [] });
    }

    private async _handleSearch(interaction: ChatInputCommandInteraction, options: SearchOptions & { query: string }): Promise<void> {
        const offset = ((options.page || 1) - 1) * 30;
        
        const searchResult = await pixivService!.search(options.query, {
            type: options.type,
            sort: options.sort,
            nsfw: options.nsfw,
            aiFilter: options.aiFilter,
            qualityFilter: options.qualityFilter,
            translate: options.translate,
            offset: offset,
            minBookmarks: options.minBookmarks
        });

        const results = searchResult?.items || [];
        
        if (!results || results.length === 0) {
            const embed = contentHandler!.createNoResultsEmbed(options.query);
            await this.safeReply(interaction, { embeds: [embed] });
            return;
        }

        const cacheKey = `${interaction.user.id}_${Date.now()}`;
        
        if (pixivCache?.setSearchResults) {
            pixivCache.setSearchResults(cacheKey, {
                items: results,
                query: options.query,
                options: options,
                hasNextPage: !!searchResult?.nextUrl
            });
        }
        
        const { embed, rows } = await contentHandler!.createContentEmbed(results[0], {
            resultIndex: 0,
            totalResults: results.length,
            searchPage: options.page,
            cacheKey,
            contentType: options.type || 'illust',
            originalQuery: options.query,
            sortMode: options.sort,
            showNsfw: options.nsfw !== 'sfw',
            hasNextPage: !!searchResult?.nextUrl
        });
        await this.safeReply(interaction, { embeds: [embed], components: rows || [] });
    }

    async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
        try {
            const focused = interaction.options.getFocused(true);

            if (focused.name !== 'query') {
                await interaction.respond([]).catch(() => {});
                return;
            }

            const value = focused.value?.trim();

            if (!value || value.length < 1) {
                await interaction.respond([
                    { name: '💡 Type to search...', value: ' ' }
                ]).catch(() => {});
                return;
            }

            const cached = pixivCache?.getSearchSuggestions?.(value);
            if (cached) {
                await interaction.respond(cached).catch(() => {});
                return;
            }

            const suggestions = await pixivService!.getAutocompleteSuggestions(value);
            const choices = (suggestions || []).slice(0, 25).map(s => ({
                name: (s.name || s.tag_translation || s.tag || String(s)).slice(0, 100),
                value: (s.value || s.tag || String(s)).slice(0, 100)
            }));

            pixivCache?.setSearchSuggestions?.(value, choices);
            await interaction.respond(choices).catch(() => {});
        } catch {
            await interaction.respond([]).catch(() => {});
        }
    }

    async handleButton(interaction: ButtonInteraction): Promise<void> {
        const customId = interaction.customId;
        const parts = customId.split('_');
        const action = parts[1];
        const cacheKey = parts.slice(2).join('_');

        try {
            const cached = pixivCache?.getSearchResults?.(cacheKey);
            if (!cached || !cached.items) {
                await interaction.reply({
                    content: '⏱️ Session expired. Please run the command again.',
                    ephemeral: true
                });
                return;
            }

            await interaction.deferUpdate();

            let resultIndex = cached.currentIndex || 0;
            let mangaPageIndex = cached.mangaPageIndex || 0;
            let searchPage = cached.options?.page || 1;
            const items = cached.items;

            switch (action) {
                case 'prev':
                    resultIndex = Math.max(0, resultIndex - 1);
                    mangaPageIndex = 0;
                    break;
                case 'next':
                    resultIndex = Math.min(items.length - 1, resultIndex + 1);
                    mangaPageIndex = 0;
                    break;
                case 'pageup':
                    const maxPages = items[resultIndex]?.page_count || 1;
                    mangaPageIndex = Math.min(maxPages - 1, mangaPageIndex + 1);
                    break;
                case 'pagedown':
                    mangaPageIndex = Math.max(0, mangaPageIndex - 1);
                    break;
                case 'searchnext':
                    searchPage++;
                    await this._loadSearchPage(interaction, cached, cacheKey, searchPage);
                    return;
                case 'searchprev':
                    searchPage = Math.max(1, searchPage - 1);
                    await this._loadSearchPage(interaction, cached, cacheKey, searchPage);
                    return;
                case 'counter':
                case 'pagecounter':
                case 'searchpageinfo':
                    return;
                default:
                    return;
            }

            pixivCache?.updateSearchResults?.(cacheKey, {
                currentIndex: resultIndex,
                mangaPageIndex: mangaPageIndex
            });

            const item = items[resultIndex];
            const { embed, rows } = await contentHandler!.createContentEmbed(item, {
                resultIndex,
                totalResults: items.length,
                searchPage,
                cacheKey,
                contentType: cached.options?.type || 'illust',
                mangaPageIndex,
                hasNextPage: cached.hasNextPage,
                originalQuery: cached.query
            });

            await interaction.editReply({ embeds: [embed], components: rows });
        } catch (error) {
            console.error('[Pixiv Button Error]', error);
            await interaction.followUp({
                content: '❌ An error occurred. Please try again.',
                ephemeral: true
            }).catch(() => {});
        }
    }

    private async _loadSearchPage(interaction: ButtonInteraction, cached: CachedSearch, cacheKey: string, newPage: number): Promise<void> {
        try {
            const offset = (newPage - 1) * 30;
            
            const searchResult = await pixivService!.search(cached.query, {
                ...cached.options,
                page: newPage,
                offset: offset
            });

            const results = searchResult?.items || [];

            if (!results || results.length === 0) {
                await interaction.followUp({
                    content: '❌ No more results found.',
                    ephemeral: true
                });
                return;
            }

            pixivCache?.setSearchResults?.(cacheKey, {
                items: results,
                query: cached.query,
                options: { ...cached.options, page: newPage },
                hasNextPage: !!searchResult?.nextUrl,
                currentIndex: 0,
                mangaPageIndex: 0
            });

            const { embed, rows } = await contentHandler!.createContentEmbed(results[0], {
                resultIndex: 0,
                totalResults: results.length,
                searchPage: newPage,
                cacheKey,
                contentType: cached.options?.type || 'illust',
                mangaPageIndex: 0,
                hasNextPage: !!searchResult?.nextUrl,
                originalQuery: cached.query
            });

            await interaction.editReply({ embeds: [embed], components: rows });
        } catch (error) {
            console.error('[Pixiv LoadPage Error]', error);
            await interaction.followUp({
                content: '❌ Failed to load next page.',
                ephemeral: true
            }).catch(() => {});
        }
    }
}

export default new PixivCommand();
