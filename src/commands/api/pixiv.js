/**
 * Pixiv Command - Presentation Layer
 * Search for artwork, manga, or novels on Pixiv
 * @module presentation/commands/api/pixiv
 */

const { SlashCommandBuilder } = require('discord.js');
const { BaseCommand, CommandCategory } = require('../BaseCommand');
const { checkAccess, AccessType } = require('../../services');

// Import services
let pixivService, pixivCache, contentHandler;
try {
    pixivService = require('../../services/api/pixivService');
    pixivCache = require('../../repositories/api/pixivCache');
    contentHandler = require('../../handlers/api/pixivContentHandler');
} catch (e) {
    console.warn('[Pixiv] Could not load services:', e.message);
}

class PixivCommand extends BaseCommand {
    constructor() {
        super({
            category: CommandCategory.API,
            cooldown: 3,
            deferReply: true
        });
    }

    get data() {
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

    async run(interaction) {
        // Access control
        const access = await checkAccess(interaction, AccessType.SUB);
        if (access.blocked) {
            return interaction.reply({ embeds: [access.embed], ephemeral: true });
        }

        const query = interaction.options.getString('query');
        const type = interaction.options.getString('type') || 'illust';
        const sort = interaction.options.getString('sort') || 'popular_desc';
        const nsfw = interaction.options.getString('nsfw') || 'sfw';
        const aiFilter = interaction.options.getBoolean('ai_filter') || false;
        const qualityFilter = interaction.options.getBoolean('quality_filter') || false;
        const translate = interaction.options.getBoolean('translate') || false;
        const page = interaction.options.getInteger('page') || 1;
        const minBookmarks = interaction.options.getInteger('min_bookmarks') || 0;

        // Check NSFW permissions
        const isNsfwChannel = interaction.channel?.nsfw || false;
        if ((nsfw === 'all' || nsfw === 'r18only') && !isNsfwChannel) {
            return this.safeReply(interaction, { embeds: [this.errorEmbed('🔞 NSFW content can only be viewed in NSFW channels.')], ephemeral: true });
        }

        try {
            // Check if query is an artwork ID
            if (/^\d+$/.test(query)) {
                return this._handleArtworkById(interaction, query);
            }

            // Search by query
            return this._handleSearch(interaction, {
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
            const embed = contentHandler?.createErrorEmbed?.(error) || this.errorEmbed('An error occurred while searching Pixiv.');
            return this.safeReply(interaction, { embeds: [embed], ephemeral: true });
        }
    }

    async _handleArtworkById(interaction, artworkId) {
        const artwork = await pixivService.getArtwork(artworkId);
        
        if (!artwork) {
            return this.safeReply(interaction, { embeds: [this.errorEmbed(`Artwork **${artworkId}** not found.`)], ephemeral: true });
        }

        const cacheKey = `${interaction.user.id}_${artworkId}`;
        const { embed, rows } = await contentHandler.createContentEmbed(artwork, {
            resultIndex: 0,
            totalResults: 1,
            cacheKey,
            contentType: artwork.type || 'illust'
        });
        await this.safeReply(interaction, { embeds: [embed], components: rows || [] });
    }

    async _handleSearch(interaction, options) {
        // Calculate offset from page number (each page has ~30 items)
        const offset = ((options.page || 1) - 1) * 30;
        
        const searchResult = await pixivService.search(options.query, {
            type: options.type,
            sort: options.sort,
            nsfw: options.nsfw,
            aiFilter: options.aiFilter,
            qualityFilter: options.qualityFilter,
            translate: options.translate,
            offset: offset,
            minBookmarks: options.minBookmarks
        });

        // Service returns { items, nextUrl } - extract items array
        const results = searchResult?.items || searchResult || [];
        
        if (!results || results.length === 0) {
            const embed = contentHandler.createNoResultsEmbed(options.query);
            return this.safeReply(interaction, { embeds: [embed] });
        }

        // Use first result with createContentEmbed
        const cacheKey = `${interaction.user.id}_${Date.now()}`;
        
        // Cache results for button navigation
        if (pixivCache?.setSearchResults) {
            pixivCache.setSearchResults(cacheKey, {
                items: results,
                query: options.query,
                options: options,
                hasNextPage: !!searchResult?.nextUrl
            });
        }
        
        const { embed, rows } = await contentHandler.createContentEmbed(results[0], {
            resultIndex: 0,
            totalResults: results.length,
            searchPage: options.page,
            cacheKey,
            contentType: options.type,
            originalQuery: options.query,
            sortMode: options.sort,
            showNsfw: options.nsfw !== 'sfw',
            hasNextPage: !!searchResult?.nextUrl
        });
        await this.safeReply(interaction, { embeds: [embed], components: rows || [] });
    }

    async autocomplete(interaction) {
        try {
            const focused = interaction.options.getFocused(true);

            if (focused.name !== 'query') {
                return interaction.respond([]).catch(() => {});
            }

            const value = focused.value?.trim();

            if (!value || value.length < 1) {
                return interaction.respond([
                    { name: '💡 Type to search...', value: ' ' }
                ]).catch(() => {});
            }

            // Check cache
            const cached = pixivCache?.getSearchSuggestions?.(value);
            if (cached) {
                return interaction.respond(cached).catch(() => {});
            }

            const suggestions = await pixivService.getAutocompleteSuggestions(value);
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

    async handleButton(interaction) {
        const customId = interaction.customId;
        const parts = customId.split('_');
        const action = parts[1]; // prev, next, counter, pageup, pagedown, searchprev, searchnext
        const cacheKey = parts.slice(2).join('_'); // Everything after action is cacheKey

        try {
            // Get cached search results
            const cached = pixivCache?.getSearchResults?.(cacheKey);
            if (!cached || !cached.items) {
                return interaction.reply({
                    content: '⏱️ Session expired. Please run the command again.',
                    ephemeral: true
                });
            }

            await interaction.deferUpdate();

            let resultIndex = cached.currentIndex || 0;
            let mangaPageIndex = cached.mangaPageIndex || 0;
            let searchPage = cached.options?.page || 1;
            const items = cached.items;

            switch (action) {
                case 'prev':
                    resultIndex = Math.max(0, resultIndex - 1);
                    mangaPageIndex = 0; // Reset manga page when changing result
                    break;
                case 'next':
                    resultIndex = Math.min(items.length - 1, resultIndex + 1);
                    mangaPageIndex = 0;
                    break;
                case 'pageup':
                    // Next image in manga/multi-page
                    const maxPages = items[resultIndex]?.page_count || 1;
                    mangaPageIndex = Math.min(maxPages - 1, mangaPageIndex + 1);
                    break;
                case 'pagedown':
                    mangaPageIndex = Math.max(0, mangaPageIndex - 1);
                    break;
                case 'searchnext':
                    // Load next search page
                    searchPage++;
                    return this._loadSearchPage(interaction, cached, cacheKey, searchPage);
                case 'searchprev':
                    searchPage = Math.max(1, searchPage - 1);
                    return this._loadSearchPage(interaction, cached, cacheKey, searchPage);
                case 'counter':
                case 'pagecounter':
                case 'searchpageinfo':
                    // Info buttons - just ignore
                    return;
                default:
                    return;
            }

            // Update cache
            pixivCache?.updateSearchResults?.(cacheKey, {
                currentIndex: resultIndex,
                mangaPageIndex: mangaPageIndex
            });

            // Build new embed
            const item = items[resultIndex];
            const { embed, rows } = await contentHandler.createContentEmbed(item, {
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

    async _loadSearchPage(interaction, cached, cacheKey, newPage) {
        try {
            // Fetch new page - calculate offset based on page number
            // Pixiv uses offset, not page number. Each page has ~30 items
            const offset = (newPage - 1) * 30;
            
            const searchResult = await pixivService.search(cached.query, {
                ...cached.options,
                page: newPage,
                offset: offset  // Pass offset explicitly
            });

            const results = searchResult?.items || searchResult || [];

            if (!results || results.length === 0) {
                return interaction.followUp({
                    content: '❌ No more results found.',
                    ephemeral: true
                });
            }

            // Update cache with new results
            pixivCache?.setSearchResults?.(cacheKey, {
                items: results,
                query: cached.query,
                options: { ...cached.options, page: newPage },
                hasNextPage: !!searchResult?.nextUrl,
                currentIndex: 0,
                mangaPageIndex: 0
            });

            // Build embed for first result of new page
            const { embed, rows } = await contentHandler.createContentEmbed(results[0], {
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

module.exports = new PixivCommand();



