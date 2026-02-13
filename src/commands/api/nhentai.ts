/**
 * NHentai Command - Presentation Layer
 * Search and browse doujinshi from nhentai
 * @module presentation/commands/api/nhentai
 */

import { 
    SlashCommandBuilder, 
    EmbedBuilder,
    ChatInputCommandInteraction,
    ButtonInteraction,
    ModalSubmitInteraction,
    ActionRowBuilder,
    ButtonBuilder
} from 'discord.js';
import { BaseCommand, CommandCategory, type CommandData } from '../BaseCommand.js';
import { checkAccess, AccessType } from '../../services/index.js';
import { getDefault } from '../../utils/common/moduleHelper.js';
// TYPES
interface GalleryData {
    id: number;
    num_pages: number;
    title?: {
        english?: string;
        japanese?: string;
        pretty?: string;
    };
}

interface GalleryResult {
    success: boolean;
    data?: GalleryData;
    error?: string;
}

interface SearchResult {
    success: boolean;
    data?: GalleryData[];
}

interface NHentaiService {
    fetchGallery: (code: number) => Promise<GalleryResult>;
    fetchRandomGallery: () => Promise<GalleryResult>;
    fetchPopularGallery: () => Promise<GalleryResult>;
    search: (query: string, options: { sort: string; page: number }) => Promise<SearchResult>;
}

interface NHentaiHandler {
    createGalleryEmbed: (data: GalleryData, options?: { isRandom?: boolean; isPopular?: boolean }) => EmbedBuilder;
    createMainButtons: (id: number, userId: string, numPages: number, data: GalleryData) => Promise<ActionRowBuilder<ButtonBuilder>[]>;
    createSearchResultsEmbed?: (data: GalleryData[], query: string, options: { page: number; sort: string }) => EmbedBuilder;
    createFavouritesEmbed: (userId: string) => Promise<{ embed?: EmbedBuilder; buttons?: ActionRowBuilder<ButtonBuilder>[] }>;
    handleButton?: (interaction: ButtonInteraction) => Promise<void>;
    handleModal?: (interaction: ModalSubmitInteraction) => Promise<void>;
}
// SERVICE IMPORTS
let nhentaiService: NHentaiService | undefined;
let nhentaiHandler: NHentaiHandler | undefined;

try {
    nhentaiService = getDefault(require('../../services/api/nhentaiService'));
    nhentaiHandler = getDefault(require('../../handlers/api/nhentaiHandler'));
} catch (e) {
    console.warn('[NHentai] Could not load services:', (e as Error).message);
}
// COMMAND
class NHentaiCommand extends BaseCommand {
    constructor() {
        super({
            category: CommandCategory.API,
            cooldown: 3,
            deferReply: true,
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
            )
            .addSubcommand(sub => sub
                .setName('search')
                .setDescription('Search for galleries by tag')
                .addStringOption(opt => opt
                    .setName('query')
                    .setDescription('Search query (tag, artist, parody, etc.)')
                    .setRequired(true)
                )
                .addStringOption(opt => opt
                    .setName('sort')
                    .setDescription('Sort order')
                    .setRequired(false)
                    .addChoices(
                        { name: '📅 Recent', value: 'recent' },
                        { name: '🔥 Popular Today', value: 'popular-today' },
                        { name: '📊 Popular This Week', value: 'popular-week' },
                        { name: '📈 All Time Popular', value: 'popular' }
                    )
                )
                .addIntegerOption(opt => opt
                    .setName('page')
                    .setDescription('Page number')
                    .setMinValue(1)
                    .setMaxValue(100)
                )
            )
            .addSubcommand(sub => sub
                .setName('favourites')
                .setDescription('View your saved favourites')
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
            }
        } catch (error) {
            console.error('[NHentai]', error);
            await this.safeReply(interaction, { 
                embeds: [this.errorEmbed('An error occurred while fetching data from nhentai.')], 
                ephemeral: true 
            });
        }
    }

    private async _handleCode(interaction: ChatInputCommandInteraction): Promise<void> {
        const code = interaction.options.getInteger('code', true);
        const result = await nhentaiService!.fetchGallery(code);

        if (!result?.success || !result.data) {
            await this.safeReply(interaction, { 
                embeds: [this.errorEmbed(`Gallery **${code}** not found or unavailable.`)], 
                ephemeral: true 
            });
            return;
        }

        const embed = nhentaiHandler!.createGalleryEmbed(result.data);
        const buttons = await nhentaiHandler!.createMainButtons(
            result.data.id, 
            interaction.user.id, 
            result.data.num_pages,
            result.data
        );
        
        await this.safeReply(interaction, { embeds: [embed], components: buttons });
    }

    private async _handleRandom(interaction: ChatInputCommandInteraction): Promise<void> {
        const result = await nhentaiService!.fetchRandomGallery();

        if (!result?.success || !result.data) {
            await this.safeReply(interaction, { 
                embeds: [this.errorEmbed('Could not fetch a random gallery. Please try again.')], 
                ephemeral: true 
            });
            return;
        }

        const embed = nhentaiHandler!.createGalleryEmbed(result.data, { isRandom: true });
        const buttons = await nhentaiHandler!.createMainButtons(
            result.data.id, 
            interaction.user.id, 
            result.data.num_pages,
            result.data
        );
        
        await this.safeReply(interaction, { embeds: [embed], components: buttons });
    }

    private async _handlePopular(interaction: ChatInputCommandInteraction): Promise<void> {
        const result = await nhentaiService!.fetchPopularGallery();

        if (!result?.success || !result.data) {
            await this.safeReply(interaction, { 
                embeds: [this.errorEmbed('Could not fetch a popular gallery. Please try again.')], 
                ephemeral: true 
            });
            return;
        }

        const embed = nhentaiHandler!.createGalleryEmbed(result.data, { isPopular: true });
        const buttons = await nhentaiHandler!.createMainButtons(
            result.data.id, 
            interaction.user.id, 
            result.data.num_pages,
            result.data
        );
        
        await this.safeReply(interaction, { embeds: [embed], components: buttons });
    }

    private async _handleSearch(interaction: ChatInputCommandInteraction): Promise<void> {
        const query = interaction.options.getString('query', true);
        const sort = interaction.options.getString('sort') || 'recent';
        const page = interaction.options.getInteger('page') || 1;

        const result = await nhentaiService!.search(query, { sort, page });

        if (!result?.success || !result?.data?.length) {
            await this.safeReply(interaction, { 
                embeds: [this.errorEmbed(`No results found for **${query}**.`)], 
                ephemeral: true 
            });
            return;
        }

        // Show first result with navigation
        const embed = nhentaiHandler!.createSearchResultsEmbed?.(result.data, query, { page, sort }) 
            || nhentaiHandler!.createGalleryEmbed(result.data[0]);
        const buttons = await nhentaiHandler!.createMainButtons(
            result.data[0].id,
            interaction.user.id,
            result.data[0].num_pages,
            result.data[0]
        );

        await this.safeReply(interaction, { embeds: [embed], components: buttons });
    }

    private async _handleFavourites(interaction: ChatInputCommandInteraction): Promise<void> {
        const result = await nhentaiHandler!.createFavouritesEmbed(interaction.user.id);

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

    async handleButton(interaction: ButtonInteraction): Promise<void> {
        await nhentaiHandler?.handleButton?.(interaction);
    }

    async handleModal(interaction: ModalSubmitInteraction): Promise<void> {
        await nhentaiHandler?.handleModal?.(interaction);
    }
}

export default new NHentaiCommand();
