/**
 * Pixiv Command - Presentation Layer
 * /pixiv search [character_name] + optional [follow_setting: true/false]
 * /pixiv settings — per-user search preferences
 * @module presentation/commands/pixiv
 */

import { 
    SlashCommandBuilder, 
    ChatInputCommandInteraction,
    AutocompleteInteraction,
    ButtonInteraction,
    StringSelectMenuInteraction,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    EmbedBuilder,
    StringSelectMenuBuilder
} from 'discord.js';
import { BaseCommand, CommandCategory, CommandData } from '../BaseCommand.js';
import { checkAccess, AccessType } from '../../services/index.js';
import logger from '../../core/observability/Logger.js';
import _pixivServiceModule from '../../services/api/pixivService.js';
import _pixivCacheModule from '../../cache/api/pixivCache.js';
import * as _contentHandlerModule from '../../handlers/api/pixiv/index.js';
import type {
    PixivCommandSearchOptions,
    PixivCachedSearch as CachedSearch,
    PixivUserPreferences
} from '../../types/api/models/content-session.js';
import type { PixivSearchOptions } from '../../types/api/pixiv/model.js';
import type {
    PixivService,
    PixivCache,
    ContentHandler
} from '../../types/commands/pixiv.js';
// SERVICE IMPORTS — static ESM imports (converted from CJS require())
const pixivService: PixivService = _pixivServiceModule as any;
const pixivCache: PixivCache = _pixivCacheModule as any;
const contentHandler: ContentHandler = _contentHandlerModule as any;

// Settings handler imports
const settingsHandler = _contentHandlerModule as unknown as {
    createSettingsEmbed: (prefs: PixivUserPreferences) => EmbedBuilder;
    createSettingsComponents: (userId: string, prefs: PixivUserPreferences) => ActionRowBuilder<any>[];
    getUserPreferences: (userId: string) => Promise<PixivUserPreferences>;
    setUserPreferences: (userId: string, prefs: Partial<PixivUserPreferences>) => Promise<PixivUserPreferences>;
};
// COMMAND
class PixivCommand extends BaseCommand {
    constructor() {
        super({
            category: CommandCategory.API,
            cooldown: 3,
            deferReply: false // Manual defer — settings is ephemeral, search is public
        });
    }

    get data(): CommandData {
        return new SlashCommandBuilder()
            .setName('pixiv')
            .setDescription('Search for artwork, manga, or novels on Pixiv')
            .addSubcommand(sub =>
                sub.setName('search')
                    .setDescription('Search Pixiv by character name, tag, or artwork ID')
                    .addStringOption(option =>
                        option.setName('query')
                            .setDescription('Character name, tag, keyword, or artwork ID')
                            .setRequired(true)
                            .setAutocomplete(true)
                    )
                    .addBooleanOption(option =>
                        option.setName('follow_setting')
                            .setDescription('Use your saved settings (default: true)')
                            .setRequired(false)
                    )
                    .addStringOption(option =>
                        option.setName('type')
                            .setDescription('Choose content type for this search')
                            .setRequired(false)
                            .addChoices(
                                { name: '🎨 Illustration', value: 'illust' },
                                { name: '📚 Manga', value: 'manga' },
                                { name: '📖 Light Novel', value: 'novel' }
                            )
                    )
                    .addStringOption(option =>
                        option.setName('sort')
                            .setDescription('Choose sort mode for this search')
                            .setRequired(false)
                            .addChoices(
                                { name: '🔥 Popular', value: 'popular_desc' },
                                { name: '🆕 Newest First', value: 'date_desc' },
                                { name: '📅 Oldest First', value: 'date_asc' },
                                { name: '📊 Daily Ranking', value: 'day' },
                                { name: '📈 Weekly Ranking', value: 'week' },
                                { name: '🏆 Monthly Ranking', value: 'month' }
                            )
                    )
                    .addStringOption(option =>
                        option.setName('nsfw')
                            .setDescription('Choose NSFW filter for this search')
                            .setRequired(false)
                            .addChoices(
                                { name: '✅ SFW Only', value: 'sfw' },
                                { name: '🔞 NSFW + SFW (Show All)', value: 'all' },
                                { name: '🔥 R18 Only', value: 'r18only' }
                            )
                    )
                    .addIntegerOption(option =>
                        option.setName('page')
                            .setDescription('Page number (default: 1)')
                            .setMinValue(1)
                            .setMaxValue(50)
                    )
            )
            .addSubcommand(sub =>
                sub.setName('settings')
                    .setDescription('Manage your Pixiv search preferences')
            );
    }

    async run(interaction: ChatInputCommandInteraction): Promise<void> {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'settings') {
            await this._handleSettings(interaction);
            return;
        }

        // subcommand === 'search'
        await interaction.deferReply();
        await this._handleSearchSubcommand(interaction);
    }

    private async _handleSettings(interaction: ChatInputCommandInteraction): Promise<void> {
        await interaction.deferReply({ ephemeral: true });

        try {
            const prefs = await settingsHandler.getUserPreferences(interaction.user.id);
            const embed = settingsHandler.createSettingsEmbed(prefs);
            const components = settingsHandler.createSettingsComponents(interaction.user.id, prefs);
            await interaction.editReply({ embeds: [embed], components });
        } catch (error) {
            logger.error('Pixiv', `Settings error: ${(error as Error).message}`);
            await interaction.editReply({ embeds: [this.errorEmbed('Failed to load settings.')] });
        }
    }

    private async _handleSearchSubcommand(interaction: ChatInputCommandInteraction): Promise<void> {
        // Access control
        const access = await checkAccess(interaction, AccessType.SUB);
        if (access.blocked) {
            await interaction.editReply({ embeds: [access.embed!] });
            return;
        }

        const query = interaction.options.getString('query', true);
        const followSetting = interaction.options.getBoolean('follow_setting') ?? true;
        const channel = interaction.channel;
        const isNsfwChannel = channel && 'nsfw' in channel ? channel.nsfw : false;

        try {
            // Load user preferences if follow_setting is true
            let prefs: PixivUserPreferences | null = null;
            if (followSetting) {
                prefs = await settingsHandler.getUserPreferences(interaction.user.id);
            }

            // Resolve options: command overrides > saved settings > defaults
            const typeOverride = interaction.options.getString('type');
            const sortOverride = interaction.options.getString('sort');
            const nsfwOverride = interaction.options.getString('nsfw');
            const page = interaction.options.getInteger('page') || 1;

            let type = typeOverride || (prefs ? prefs.contentTypes[0] || 'illust' : 'illust');
            let sort = sortOverride || (prefs ? prefs.sortMode : 'popular_desc');
            let aiFilter = prefs ? prefs.aiFilter : false;
            let qualityFilter = prefs ? prefs.qualityFilter : false;
            let translate = prefs ? prefs.translate : false;
            let minBookmarks = prefs ? prefs.minBookmarks : 0;

            // Resolve NSFW mode: command override > saved settings > channel auto-detect
            let nsfw: string;
            if (nsfwOverride) {
                nsfw = nsfwOverride;
            } else if (prefs) {
                if (prefs.r18Enabled) {
                    nsfw = 'r18only';
                } else {
                    nsfw = prefs.nsfwMode === 'all' ? 'all' : (isNsfwChannel ? 'all' : 'sfw');
                }
            } else {
                nsfw = isNsfwChannel ? 'all' : 'sfw';
            }

            // Check NSFW permissions
            if ((nsfw === 'all' || nsfw === 'r18only') && !isNsfwChannel) {
                await interaction.editReply({ embeds: [this.errorEmbed('🔞 NSFW content can only be viewed in NSFW channels.')] });
                return;
            }

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
            logger.error('Pixiv', `Search error: ${(error as Error).message}`);
            const embed = contentHandler?.createErrorEmbed?.(error as Error) || this.errorEmbed('An error occurred while searching Pixiv.');
            await interaction.editReply({ embeds: [embed] });
        }
    }

    private _mapCommandOptionsToServiceOptions(options: PixivCommandSearchOptions): PixivSearchOptions {
        const nsfwMode = options.nsfw || 'sfw';

        return {
            contentType: (options.type as PixivSearchOptions['contentType']) || 'illust',
            sort: options.sort || 'popular_desc',
            showNsfw: nsfwMode === 'all' || nsfwMode === 'r18only',
            r18Only: nsfwMode === 'r18only',
            aiFilter: options.aiFilter || false,
            qualityFilter: options.qualityFilter || false,
            minBookmarks: options.minBookmarks || 0,
            offset: options.offset || 0
        };
    }

    private async _handleArtworkById(interaction: ChatInputCommandInteraction, artworkId: string): Promise<void> {
        const artwork = await pixivService!.getArtworkById(artworkId);
        
        if (!artwork) {
            await interaction.editReply({ embeds: [this.errorEmbed(`Artwork **${artworkId}** not found.`)] });
            return;
        }

        const cacheKey = `${interaction.user.id}_${artworkId}`;
        const { embed, rows } = await contentHandler!.createContentEmbed(artwork, {
            resultIndex: 0,
            totalResults: 1,
            cacheKey,
            contentType: artwork.type || 'illust'
        });
        await interaction.editReply({ embeds: [embed], components: rows || [] });
    }

    private async _handleSearch(interaction: ChatInputCommandInteraction, options: PixivCommandSearchOptions & { query: string }): Promise<void> {
        const offset = ((options.page || 1) - 1) * 30;
        const serviceOptions = this._mapCommandOptionsToServiceOptions({ ...options, offset });

        logger.debug(
            'Pixiv Debug',
            `Search map | Query: "${options.query}" | Mode: ${options.nsfw || 'sfw'} | showNsfw: ${Boolean(serviceOptions.showNsfw)} | r18Only: ${Boolean(serviceOptions.r18Only)} | Type: ${serviceOptions.contentType || 'illust'} | Offset: ${serviceOptions.offset || 0}`
        );
        
        const searchResult = await pixivService!.search(options.query, serviceOptions);

        const results = searchResult?.items || [];
        
        if (!results || results.length === 0) {
            const embed = contentHandler!.createNoResultsEmbed(options.query);
            await interaction.editReply({ embeds: [embed] });
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
        await interaction.editReply({ embeds: [embed], components: rows || [] });
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

        // Handle settings toggle buttons
        if (action === 'setting') {
            await this._handleSettingButton(interaction, parts);
            return;
        }

        const cacheKey = parts.slice(2).join('_');

        try {
            await pixivCache?.ensureSearchResultsHydrated?.(cacheKey);

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
                    await this._withFetchingState(interaction, 'other artworks', async () => {
                        await this._loadSearchPage(interaction, cached, cacheKey, searchPage);
                    });
                    return;
                case 'searchprev':
                    searchPage = Math.max(1, searchPage - 1);
                    await this._withFetchingState(interaction, 'other artworks', async () => {
                        await this._loadSearchPage(interaction, cached, cacheKey, searchPage);
                    });
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
            logger.error('Pixiv', `Button error: ${(error as Error).message}`);
            await interaction.followUp({
                content: '❌ An error occurred. Please try again.',
                ephemeral: true
            }).catch(() => {});
        }
    }

    async handleSelectMenu(interaction: StringSelectMenuInteraction): Promise<void> {
        const parts = interaction.customId.split('_');
        // pixiv_setting_<type>_<userId>
        if (parts[1] !== 'setting') return;

        const settingType = parts[2];
        const userId = parts.slice(3).join('_');

        if (interaction.user.id !== userId) {
            await interaction.reply({ content: '❌ This menu is not for you!', ephemeral: true });
            return;
        }

        await interaction.deferUpdate();

        try {
            const selected = interaction.values;

            switch (settingType) {
                case 'menu': {
                    const option = selected[0] as 'contenttype' | 'nsfw' | 'sort' | 'minbookmarks';
                    const prefs = await settingsHandler.getUserPreferences(userId);
                    const embed = settingsHandler.createSettingsEmbed(prefs);
                    const components = this._buildSettingsSubmenu(option, userId, prefs);
                    await interaction.editReply({ embeds: [embed], components });
                    return;
                }

                case 'contenttype':
                    await settingsHandler.setUserPreferences(userId, { contentTypes: selected });
                    break;

                case 'nsfw': {
                    const value = selected[0];
                    if (value === 'r18') {
                        await settingsHandler.setUserPreferences(userId, { r18Enabled: true, nsfwMode: 'sfw' });
                    } else {
                        await settingsHandler.setUserPreferences(userId, { r18Enabled: false, nsfwMode: value as 'sfw' | 'all' });
                    }
                    break;
                }

                case 'sort':
                    await settingsHandler.setUserPreferences(userId, { sortMode: selected[0] });
                    break;

                case 'minbookmarks': {
                    const raw = selected[0] || '0';
                    const value = Number.parseInt(raw, 10);
                    await settingsHandler.setUserPreferences(userId, { minBookmarks: Number.isFinite(value) ? Math.max(0, value) : 0 });
                    break;
                }
            }

            // Refresh settings UI
            const prefs = await settingsHandler.getUserPreferences(userId);
            const embed = settingsHandler.createSettingsEmbed(prefs);
            const components = settingsHandler.createSettingsComponents(userId, prefs);
            await interaction.editReply({ embeds: [embed], components });
        } catch (error) {
            logger.error('Pixiv', `Settings select error: ${(error as Error).message}`);
            await interaction.followUp({ content: '❌ Failed to update setting.', ephemeral: true }).catch(() => {});
        }
    }

    private async _handleSettingButton(interaction: ButtonInteraction, parts: string[]): Promise<void> {
        // pixiv_setting_<toggle>_<userId>
        const toggle = parts[2];
        const userId = parts.slice(3).join('_');

        if (interaction.user.id !== userId) {
            await interaction.reply({ content: '❌ This button is not for you!', ephemeral: true });
            return;
        }

        await interaction.deferUpdate();

        try {
            const prefs = await settingsHandler.getUserPreferences(userId);

            switch (toggle) {
                case 'ai':
                    await settingsHandler.setUserPreferences(userId, { aiFilter: !prefs.aiFilter });
                    break;
                case 'quality':
                    await settingsHandler.setUserPreferences(userId, { qualityFilter: !prefs.qualityFilter });
                    break;
                case 'translate':
                    await settingsHandler.setUserPreferences(userId, { translate: !prefs.translate });
                    break;
                case 'reset':
                    await settingsHandler.setUserPreferences(userId, {
                        contentTypes: ['illust'],
                        r18Enabled: false,
                        nsfwMode: 'sfw',
                        sortMode: 'popular_desc',
                        aiFilter: false,
                        qualityFilter: false,
                        minBookmarks: 0,
                        translate: false
                    });
                    break;
                case 'back':
                    break;
            }

            const updated = await settingsHandler.getUserPreferences(userId);
            const embed = settingsHandler.createSettingsEmbed(updated);
            const components = settingsHandler.createSettingsComponents(userId, updated);
            await interaction.editReply({ embeds: [embed], components });
        } catch (error) {
            logger.error('Pixiv', `Settings button error: ${(error as Error).message}`);
            await interaction.followUp({ content: '❌ Failed to update setting.', ephemeral: true }).catch(() => {});
        }
    }

    private _buildSettingsSubmenu(
        option: 'contenttype' | 'nsfw' | 'sort' | 'minbookmarks',
        userId: string,
        prefs: PixivUserPreferences
    ): ActionRowBuilder<any>[] {
        let selectRow: ActionRowBuilder<StringSelectMenuBuilder>;

        if (option === 'contenttype') {
            selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`pixiv_setting_contenttype_${userId}`)
                    .setPlaceholder('Select content types')
                    .setMinValues(1)
                    .setMaxValues(3)
                    .addOptions(
                        { label: 'Illustration', value: 'illust', emoji: '🎨', default: prefs.contentTypes.includes('illust') },
                        { label: 'Manga', value: 'manga', emoji: '📚', default: prefs.contentTypes.includes('manga') },
                        { label: 'Light Novel', value: 'novel', emoji: '📖', default: prefs.contentTypes.includes('novel') }
                    )
            );
        } else if (option === 'nsfw') {
            selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`pixiv_setting_nsfw_${userId}`)
                    .setPlaceholder('Select NSFW mode')
                    .addOptions(
                        { label: 'SFW Only', value: 'sfw', emoji: '✅', default: !prefs.r18Enabled && prefs.nsfwMode === 'sfw' },
                        { label: 'NSFW + SFW (All)', value: 'all', emoji: '🔞', default: !prefs.r18Enabled && prefs.nsfwMode === 'all' },
                        { label: 'R18 Only', value: 'r18', emoji: '🔥', default: prefs.r18Enabled }
                    )
            );
        } else if (option === 'sort') {
            selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`pixiv_setting_sort_${userId}`)
                    .setPlaceholder('Select sort mode')
                    .addOptions(
                        { label: 'Popular', value: 'popular_desc', emoji: '🔥', default: prefs.sortMode === 'popular_desc' },
                        { label: 'Newest First', value: 'date_desc', emoji: '🆕', default: prefs.sortMode === 'date_desc' },
                        { label: 'Oldest First', value: 'date_asc', emoji: '📅', default: prefs.sortMode === 'date_asc' },
                        { label: 'Daily Ranking', value: 'day', emoji: '📊', default: prefs.sortMode === 'day' },
                        { label: 'Weekly Ranking', value: 'week', emoji: '📈', default: prefs.sortMode === 'week' },
                        { label: 'Monthly Ranking', value: 'month', emoji: '🏆', default: prefs.sortMode === 'month' }
                    )
            );
        } else {
            selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`pixiv_setting_minbookmarks_${userId}`)
                    .setPlaceholder('Select minimum bookmarks')
                    .addOptions(
                        { label: 'No minimum', value: '0', emoji: '✅', default: prefs.minBookmarks === 0 },
                        { label: 'At least 50', value: '50', emoji: '⭐', default: prefs.minBookmarks === 50 },
                        { label: 'At least 100', value: '100', emoji: '⭐', default: prefs.minBookmarks === 100 },
                        { label: 'At least 500', value: '500', emoji: '⭐', default: prefs.minBookmarks === 500 },
                        { label: 'At least 1000', value: '1000', emoji: '🏆', default: prefs.minBookmarks === 1000 }
                    )
            );
        }

        const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(`pixiv_setting_back_${userId}`)
                .setLabel('Back')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('◀️')
        );

        return [selectRow, backRow];
    }

    private async _loadSearchPage(interaction: ButtonInteraction, cached: CachedSearch, cacheKey: string, newPage: number): Promise<void> {
        try {
            const offset = (newPage - 1) * 30;
            const serviceOptions = this._mapCommandOptionsToServiceOptions({
                ...cached.options,
                page: newPage,
                offset
            });

            logger.debug(
                'Pixiv Debug',
                `Page map | Query: "${cached.query}" | Page: ${newPage} | Mode: ${cached.options?.nsfw || 'sfw'} | showNsfw: ${Boolean(serviceOptions.showNsfw)} | r18Only: ${Boolean(serviceOptions.r18Only)} | Type: ${serviceOptions.contentType || 'illust'} | Offset: ${serviceOptions.offset || 0}`
            );
            
            const searchResult = await pixivService!.search(cached.query, serviceOptions);

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
            logger.error('Pixiv', `LoadPage error: ${(error as Error).message}`);
            await interaction.followUp({
                content: '❌ Failed to load next page.',
                ephemeral: true
            }).catch(() => {});
        }
    }

    private _buildDisabledButtonRows(interaction: ButtonInteraction): ActionRowBuilder<ButtonBuilder>[] {
        const rows: ActionRowBuilder<ButtonBuilder>[] = [];

        for (const row of interaction.message.components) {
            if (row.type !== ComponentType.ActionRow) continue;
            const rowComponents: any[] = (row as unknown as { components?: any[] }).components || [];
            const buttonRow = new ActionRowBuilder<ButtonBuilder>();
            for (const component of rowComponents) {
                if (component.type !== ComponentType.Button) continue;
                buttonRow.addComponents(ButtonBuilder.from(component as any).setDisabled(true));
            }
            if (buttonRow.components.length > 0) rows.push(buttonRow);
        }

        return rows;
    }

    private _buildFetchingEmbed(currentEmbed: EmbedBuilder, context: string, elapsedSec: number, totalSec: number = 60): EmbedBuilder {
        const embed = EmbedBuilder.from(currentEmbed);
        const statusLine = `⏳ Shoukaku is fetching ${context}... (${Math.min(elapsedSec, totalSec)}s / ${totalSec}s)`;
        const currentDescription = embed.data.description || '';
        const cleaned = currentDescription.replace(/^⏳ Shoukaku is fetching[^\n]*\n\n?/i, '');
        embed.setDescription(cleaned ? `${statusLine}\n\n${cleaned}` : statusLine);
        return embed;
    }

    private async _withFetchingState(
        interaction: ButtonInteraction,
        context: string,
        task: () => Promise<void>
    ): Promise<void> {
        if (!interaction.message.embeds.length) {
            await task();
            return;
        }

        const baseEmbed = EmbedBuilder.from(interaction.message.embeds[0]!);
        const disabledRows = this._buildDisabledButtonRows(interaction);
        let elapsed = 0;
        let stopped = false;

        const pushStatus = async (): Promise<void> => {
            if (stopped) return;
            const loadingEmbed = this._buildFetchingEmbed(baseEmbed, context, elapsed, 60);
            await interaction.editReply({ embeds: [loadingEmbed], components: disabledRows }).catch(() => {});
        };

        await pushStatus();

        const timer = setInterval(() => {
            elapsed += 1;
            if (elapsed <= 60) {
                void pushStatus();
            } else {
                clearInterval(timer);
            }
        }, 1000);

        try {
            await task();
        } finally {
            stopped = true;
            clearInterval(timer);
        }
    }
}

export default new PixivCommand();






