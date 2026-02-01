/**
 * NHentai Command - Presentation Layer
 * Search and browse doujinshi from nhentai
 * @module presentation/commands/api/nhentai
 */

const { SlashCommandBuilder } = require('discord.js');
const { BaseCommand, CommandCategory } = require('../BaseCommand');
const { checkAccess, AccessType } = require('../../services');

// Import services
let nhentaiService, nhentaiHandler;
try {
    nhentaiService = require('../../services/api/nhentaiService');
    nhentaiHandler = require('../../handlers/api/nhentaiHandler');
} catch (e) {
    console.warn('[NHentai] Could not load services:', e.message);
}

class NHentaiCommand extends BaseCommand {
    constructor() {
        super({
            category: CommandCategory.API,
            cooldown: 3,
            deferReply: true,
            nsfw: true
        });
    }

    get data() {
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

    async run(interaction) {
        // Access control
        const access = await checkAccess(interaction, AccessType.SUB);
        if (access.blocked) {
            return interaction.reply({ embeds: [access.embed], ephemeral: true });
        }

        // NSFW check
        if (!interaction.channel?.nsfw) {
            return this.safeReply(interaction, { 
                embeds: [this.errorEmbed('🔞 This command can only be used in NSFW channels.')], 
                ephemeral: true 
            });
        }

        const subcommand = interaction.options.getSubcommand();

        try {
            switch (subcommand) {
                case 'code':
                    return this._handleCode(interaction);
                case 'random':
                    return this._handleRandom(interaction);
                case 'popular':
                    return this._handlePopular(interaction);
                case 'search':
                    return this._handleSearch(interaction);
                case 'favourites':
                    return this._handleFavourites(interaction);
            }
        } catch (error) {
            console.error('[NHentai]', error);
            return this.safeReply(interaction, { 
                embeds: [this.errorEmbed('An error occurred while fetching data from nhentai.')], 
                ephemeral: true 
            });
        }
    }

    async _handleCode(interaction) {
        const code = interaction.options.getInteger('code');
        const result = await nhentaiService.fetchGallery(code);

        if (!result?.success) {
            return this.safeReply(interaction, { 
                embeds: [this.errorEmbed(`Gallery **${code}** not found or unavailable.`)], 
                ephemeral: true 
            });
        }

        const embed = nhentaiHandler.createGalleryEmbed(result.data);
        const buttons = await nhentaiHandler.createMainButtons(
            result.data.id, 
            interaction.user.id, 
            result.data.num_pages,
            result.data
        );
        
        await this.safeReply(interaction, { embeds: [embed], components: buttons });
    }

    async _handleRandom(interaction) {
        const result = await nhentaiService.fetchRandomGallery();

        if (!result?.success) {
            return this.safeReply(interaction, { 
                embeds: [this.errorEmbed('Could not fetch a random gallery. Please try again.')], 
                ephemeral: true 
            });
        }

        const embed = nhentaiHandler.createGalleryEmbed(result.data, { isRandom: true });
        const buttons = await nhentaiHandler.createMainButtons(
            result.data.id, 
            interaction.user.id, 
            result.data.num_pages,
            result.data
        );
        
        await this.safeReply(interaction, { embeds: [embed], components: buttons });
    }

    async _handlePopular(interaction) {
        const result = await nhentaiService.fetchPopularGallery();

        if (!result?.success) {
            return this.safeReply(interaction, { 
                embeds: [this.errorEmbed('Could not fetch a popular gallery. Please try again.')], 
                ephemeral: true 
            });
        }

        const embed = nhentaiHandler.createGalleryEmbed(result.data, { isPopular: true });
        const buttons = await nhentaiHandler.createMainButtons(
            result.data.id, 
            interaction.user.id, 
            result.data.num_pages,
            result.data
        );
        
        await this.safeReply(interaction, { embeds: [embed], components: buttons });
    }

    async _handleSearch(interaction) {
        const query = interaction.options.getString('query');
        const sort = interaction.options.getString('sort') || 'recent';
        const page = interaction.options.getInteger('page') || 1;

        const result = await nhentaiService.search(query, { sort, page });

        if (!result?.success || !result?.data?.length) {
            return this.safeReply(interaction, { 
                embeds: [this.errorEmbed(`No results found for **${query}**.`)], 
                ephemeral: true 
            });
        }

        // Show first result with navigation
        const embed = nhentaiHandler.createSearchResultsEmbed?.(result.data, query, { page, sort }) 
            || nhentaiHandler.createGalleryEmbed(result.data[0]);
        const buttons = await nhentaiHandler.createMainButtons(
            result.data[0].id,
            interaction.user.id,
            result.data[0].num_pages,
            result.data[0]
        );

        await this.safeReply(interaction, { embeds: [embed], components: buttons });
    }

    async _handleFavourites(interaction) {
        const result = await nhentaiHandler.createFavouritesEmbed(interaction.user.id);

        if (!result?.embed) {
            return this.safeReply(interaction, { 
                embeds: [this.errorEmbed('You have no saved favourites yet.')], 
                ephemeral: true 
            });
        }

        await this.safeReply(interaction, { 
            embeds: [result.embed], 
            components: result.buttons || [] 
        });
    }

    async handleButton(interaction) {
        return nhentaiHandler.handleButton?.(interaction);
    }
}

module.exports = new NHentaiCommand();
