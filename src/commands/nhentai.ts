/**
 * NHentai Command - Presentation Layer
 * Search and browse doujinshi from nhentai
 * @module presentation/commands/nhentai
 */

import { 
    SlashCommandBuilder, 
    ChatInputCommandInteraction,
    AutocompleteInteraction,
    ButtonInteraction,
    StringSelectMenuInteraction,
    ModalSubmitInteraction
} from 'discord.js';
import { BaseCommand, CommandCategory, CommandData } from './BaseCommand.js';
import { checkAccess, AccessType } from '../services/index.js';
import logger from '../core/Logger.js';
import _nhentaiServiceModule from '../services/api/nhentaiService.js';
import _nhentaiHandlerModule from '../handlers/api/nhentai/index.js';
import type { NHentaiService, NHentaiHandler } from '../types/commands/external/nhentai-command.js';
// SERVICE IMPORTS — static ESM imports (converted from CJS require())
const nhentaiService: NHentaiService = _nhentaiServiceModule as any;
const nhentaiHandler: NHentaiHandler = _nhentaiHandlerModule as any;
// COMMAND
class NHentaiCommand extends BaseCommand {
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
            .setName('nhentai')
            .setDescription('Search and browse doujinshi from nhentai (NSFW only)')
            .setNSFW(true)
            .addSubcommand(sub => sub
                .setName('code')
                .setDescription('Get a gallery by its code')
                .addIntegerOption(opt => opt
                    .setName('code')
                    .setDescription('The 6-digit nhentai code')
                    .setRequired(true)
                    .setMinValue(1)
                    .setMaxValue(999999)
                )
            )
            .addSubcommand(sub => sub
                .setName('random')
                .setDescription('Get a random gallery')
            )
            .addSubcommand(sub => sub
                .setName('popular')
                .setDescription('Get a popular gallery')
                .addStringOption(opt => opt
                    .setName('period')
                    .setDescription('Time period for popular galleries')
                    .setRequired(false)
                    .addChoices(
                        { name: '🔥 Popular Today', value: 'today' },
                        { name: '📊 Popular This Week', value: 'week' },
                        { name: '📅 Popular This Month', value: 'month' },
                        { name: '🏆 All Time Popular', value: 'all' }
                    )
                )
            )
            .addSubcommand(sub => sub
                .setName('search')
                .setDescription('Search for galleries by tag')
                .addStringOption(opt => opt
                    .setName('query')
                    .setDescription('Search query (tag, artist, parody, etc.)')
                    .setRequired(true)
                    .setAutocomplete(true)
                )
                .addStringOption(opt => opt
                    .setName('sort')
                    .setDescription('Sort order')
                    .setRequired(false)
                    .addChoices(
                        { name: '📅 Recent', value: 'date' },
                        { name: '🔥 Popular Today', value: 'popular-today' },
                        { name: '📊 Popular This Week', value: 'popular-week' },
                        { name: '📅 Popular This Month', value: 'popular-month' },
                        { name: '🏆 All Time Popular', value: 'popular' }
                    )
                )
            )
            .addSubcommand(sub => sub
                .setName('favourites')
                .setDescription('View your saved favourites')
            )
            .addSubcommand(sub => sub
                .setName('settings')
                .setDescription('Manage your nhentai preferences')
            );
    }

    async run(interaction: ChatInputCommandInteraction): Promise<void> {
        // Access control
        const access = await checkAccess(interaction, AccessType.SUB);
        if (access.blocked) {
            await interaction.reply({ embeds: [access.embed!], ephemeral: true });
            return;
        }

        // NSFW check
        const channel = interaction.channel;
        const isNsfw = channel && 'nsfw' in channel ? channel.nsfw : false;
        if (!isNsfw) {
            await this.safeReply(interaction, { 
                embeds: [this.errorEmbed('🔞 This command can only be used in NSFW channels.')], 
                ephemeral: true 
            });
            return;
        }

        const subcommand = interaction.options.getSubcommand();

        // Manual defer so /nhentai settings can be truly ephemeral.
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply({ ephemeral: subcommand === 'settings' });
        }

        try {
            switch (subcommand) {
                case 'code':
                    await this._handleCode(interaction);
                    break;
                case 'random':
                    await this._handleRandom(interaction);
                    break;
                case 'popular':
                    await this._handlePopular(interaction);
                    break;
                case 'search':
                    await this._handleSearch(interaction);
                    break;
                case 'favourites':
                    await this._handleFavourites(interaction);
                    break;
                case 'settings':
                    await this._handleSettings(interaction);
                    break;
            }
        } catch (error) {
            logger.error('NHentai', `Error: ${(error as Error).message}`);
            await this.safeReply(interaction, { 
                embeds: [this.errorEmbed('An error occurred while fetching data from nhentai.')], 
                ephemeral: true 
            });
        }
    }

    private _createSessionToken(): string {
        return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    }

    private async _handleCode(interaction: ChatInputCommandInteraction): Promise<void> {
        const sessionId = this._createSessionToken();
        const code = interaction.options.getInteger('code', true);
        const result = await nhentaiService!.fetchGallery(code);

        if (!result?.success || !result.data) {
            await this.safeReply(interaction, { 
                embeds: [this.errorEmbed(`Gallery **${code}** not found or unavailable.`)], 
                ephemeral: true 
            });
            return;
        }

        const { embed, files } = await nhentaiHandler!.createGalleryResponse(result.data);
        const buttons = await nhentaiHandler!.createMainButtons(
            result.data.id, 
            interaction.user.id, 
            result.data.num_pages,
            result.data,
            sessionId
        );
        
        await this.safeReply(interaction, { embeds: [embed], components: buttons, files });
    }

    private async _handleRandom(interaction: ChatInputCommandInteraction): Promise<void> {
        const sessionId = this._createSessionToken();
        const result = await nhentaiService!.fetchRandomGallery();

        if (!result?.success || !result.data) {
            await this.safeReply(interaction, { 
                embeds: [this.errorEmbed('Could not fetch a random gallery. Please try again.')], 
                ephemeral: true 
            });
            return;
        }

        const { embed, files } = await nhentaiHandler!.createGalleryResponse(result.data, { isRandom: true, spoilerCover: true });
        const buttons = await nhentaiHandler!.createMainButtons(
            result.data.id, 
            interaction.user.id, 
            result.data.num_pages,
            result.data,
            sessionId
        );
        
        await this.safeReply(interaction, { embeds: [embed], components: buttons, files });
    }

    private async _handlePopular(interaction: ChatInputCommandInteraction): Promise<void> {
        const sessionId = this._createSessionToken();
        const period = interaction.options.getString('period') || 'all';
        const result = await nhentaiService!.fetchPopularGallery(period as 'today' | 'week' | 'month' | 'all');

        if (!result?.success || !result.data) {
            await this.safeReply(interaction, { 
                embeds: [this.errorEmbed('Could not fetch a popular gallery. Please try again.')], 
                ephemeral: true 
            });
            return;
        }

        const periodLabels: Record<string, string> = { today: 'Today', week: 'This Week', month: 'This Month', all: 'All Time' };
        const { embed, files } = await nhentaiHandler!.createGalleryResponse(result.data, { isPopular: true, popularPeriod: periodLabels[period] || 'All Time' });
        const buttons = await nhentaiHandler!.createMainButtons(
            result.data.id, 
            interaction.user.id, 
            result.data.num_pages,
            result.data,
            sessionId
        );
        
        await this.safeReply(interaction, { embeds: [embed], components: buttons, files });
    }

    private async _handleSearch(interaction: ChatInputCommandInteraction): Promise<void> {
        const sessionId = this._createSessionToken();
        const query = interaction.options.getString('query', true);
        const sortRaw = interaction.options.getString('sort') || 'date';

        // Pass sort value directly to the service (date, popular-today, popular-week, popular-month, popular)
        const sort = sortRaw;

        const result = await nhentaiService!.searchGalleries(query, 1, sort);

        if (!result?.success || !result?.data || result.data.results.length === 0) {
            await this.safeReply(interaction, { 
                embeds: [this.errorEmbed(`No results found for **${query}**.`)], 
                ephemeral: true 
            });
            return;
        }

        const searchData = result.data;

        // Store search session for pagination
        await nhentaiHandler!.setSearchSession?.(interaction.user.id, {
            query,
            sort: sortRaw,
            results: searchData.results,
            currentPage: 1,
            numPages: searchData.numPages,
            pageCache: {
                '1': searchData
            }
        }, sessionId);

        // Show search results with navigation
        const embed = nhentaiHandler!.createSearchResultsEmbed?.(
            query, searchData, 1, sortRaw
        ) || nhentaiHandler!.createGalleryEmbed(searchData.results[0]);

        const buttons = nhentaiHandler!.createSearchButtons?.(
            query, searchData, 1, interaction.user.id, sessionId
        ) || await nhentaiHandler!.createMainButtons(
            searchData.results[0].id,
            interaction.user.id,
            searchData.results[0].num_pages,
            searchData.results[0],
            sessionId
        );

        await this.safeReply(interaction, { embeds: [embed], components: buttons });

        if (searchData.numPages > 1) {
            void nhentaiService!.searchGalleries(query, 2, sort).catch(() => {});
        }
    }

    private async _handleFavourites(interaction: ChatInputCommandInteraction): Promise<void> {
        const sessionId = this._createSessionToken();
        const result = await nhentaiHandler!.createFavouritesEmbed(interaction.user.id, 1, 10, sessionId);

        if (!result?.embed) {
            await this.safeReply(interaction, { 
                embeds: [this.errorEmbed('You have no saved favourites yet.')], 
                ephemeral: true 
            });
            return;
        }

        await this.safeReply(interaction, { 
            embeds: [result.embed], 
            components: result.buttons || [] 
        });
    }

    private async _handleSettings(interaction: ChatInputCommandInteraction): Promise<void> {
        const handler = nhentaiHandler as NHentaiHandler & {
            getUserPreferences?: (userId: string) => Promise<{ popularPeriod: 'today' | 'week' | 'month' | 'all'; randomPeriod: 'today' | 'week' | 'month' | 'all' }>;
            createSettingsEmbed?: (userId: string, prefs: { popularPeriod: 'today' | 'week' | 'month' | 'all'; randomPeriod: 'today' | 'week' | 'month' | 'all' }) => any;
            createSettingsComponents?: (userId: string, prefs: { popularPeriod: 'today' | 'week' | 'month' | 'all'; randomPeriod: 'today' | 'week' | 'month' | 'all' }, galleryId?: number | null) => any[];
        };

        if (!handler.getUserPreferences || !handler.createSettingsEmbed || !handler.createSettingsComponents) {
            await this.safeReply(interaction, {
                embeds: [this.errorEmbed('Settings are temporarily unavailable.')],
                ephemeral: true
            });
            return;
        }

        const prefs = await handler.getUserPreferences(interaction.user.id);
        const embed = handler.createSettingsEmbed(interaction.user.id, prefs);
        const components = handler.createSettingsComponents(interaction.user.id, prefs, null);

        await this.safeReply(interaction, {
            embeds: [embed],
            components,
            ephemeral: true
        });
    }

    async handleButton(interaction: ButtonInteraction): Promise<void> {
        await nhentaiHandler?.handleButton?.(interaction);
    }

    async handleModal(interaction: ModalSubmitInteraction): Promise<void> {
        await nhentaiHandler?.handleModal?.(interaction);
    }

    async handleSelectMenu(interaction: StringSelectMenuInteraction): Promise<void> {
        await nhentaiHandler?.handleSelectMenu?.(interaction);
    }

    async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
        const focusedValue = interaction.options.getFocused();

        if (focusedValue.length < 2) {
            try { await interaction.respond([]); } catch { /* expired */ }
            return;
        }

        try {
            const raw = await nhentaiService!.getSearchSuggestions(focusedValue);
            const suggestions = Array.isArray(raw) ? raw : [];
            const choices = suggestions.slice(0, 25).map(s => ({
                name: s.length > 100 ? s.slice(0, 97) + '...' : s,
                value: s.slice(0, 100)
            }));
            await interaction.respond(choices);
        } catch (error) {
            const err = error as { code?: number; message?: string };
            if (err?.code === 10062 || err?.code === 40060) return;
            logger.error('NHentai', `Autocomplete error: ${(error as Error).message}`);
            try { await interaction.respond([]); } catch { /* expired */ }
        }
    }
}

export default new NHentaiCommand();





