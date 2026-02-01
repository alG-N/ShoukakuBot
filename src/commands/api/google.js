/**
 * Google Command - Presentation Layer
 * Search the web using Google Custom Search or DuckDuckGo fallback
 * @module presentation/commands/api/google
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { BaseCommand, CommandCategory } = require('../BaseCommand');
const { COLORS } = require('../../constants');
const { checkAccess, AccessType } = require('../../services');

// Import services
let googleService, googleHandler, cooldownManager, COOLDOWN_SETTINGS;
try {
    googleService = require('../../services/api/googleService');
    googleHandler = require('../../handlers/api/googleHandler');
    const cooldown = require('../../utils/common/cooldown');
    cooldownManager = cooldown.cooldownManager;
    COOLDOWN_SETTINGS = cooldown.COOLDOWN_SETTINGS;
} catch (e) {
    console.warn('[Google] Could not load services:', e.message);
}

class GoogleCommand extends BaseCommand {
    constructor() {
        super({
            category: CommandCategory.API,
            cooldown: 3,
            deferReply: false // Manual for subcommand handling
        });
    }

    get data() {
        return new SlashCommandBuilder()
            .setName('google')
            .setDescription('Search the web')
            .addSubcommand(sub => sub
                .setName('search')
                .setDescription('Search for websites and information')
                .addStringOption(option =>
                    option.setName('query')
                        .setDescription('What to search for')
                        .setRequired(true)
                        .setMaxLength(200)
                )
                .addBooleanOption(option =>
                    option.setName('safe')
                        .setDescription('Enable SafeSearch filter (default: true)')
                        .setRequired(false)
                )
            )
            .addSubcommand(sub => sub
                .setName('image')
                .setDescription('Open image search in browser')
                .addStringOption(option =>
                    option.setName('query')
                        .setDescription('What to search for')
                        .setRequired(true)
                        .setMaxLength(200)
                )
            );
    }

    async run(interaction) {
        // Access control
        const access = await checkAccess(interaction, AccessType.SUB);
        if (access.blocked) {
            return interaction.reply({ embeds: [access.embed], ephemeral: true });
        }

        // Cooldown check
        if (cooldownManager && COOLDOWN_SETTINGS) {
            const cooldown = cooldownManager.check(interaction.user.id, 'google', COOLDOWN_SETTINGS.google);
            if (cooldown.onCooldown) {
                const embed = googleHandler?.createCooldownEmbed?.(cooldown.remaining) ||
                    new EmbedBuilder()
                        .setColor(COLORS.WARNING)
                        .setDescription(`⏳ Please wait ${cooldown.remaining}s before searching again.`);
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }
        }

        const subcommand = interaction.options.getSubcommand();
        const query = interaction.options.getString('query');

        if (subcommand === 'image') {
            return this._handleImageSearch(interaction, query);
        }

        return this._handleWebSearch(interaction, query);
    }

    async _handleImageSearch(interaction, query) {
        const searchEngine = googleService?.getSearchEngine?.() || 'Google';
        const url = searchEngine === 'Google'
            ? `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`
            : `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`;
        
        return interaction.reply({
            content: `🖼️ **Image Search:** [Click here to search "${query}"](${url})`,
            ephemeral: false
        });
    }

    async _handleWebSearch(interaction, query) {
        await interaction.deferReply();

        try {
            const safeSearch = interaction.options.getBoolean('safe') ?? true;
            
            const result = await googleService.search(query, { 
                safeSearch,
                maxResults: 5 
            });

            if (!result.success) {
                const errorEmbed = googleHandler?.createErrorEmbed?.(result.error) ||
                    new EmbedBuilder()
                        .setColor(COLORS.ERROR)
                        .setTitle('❌ Search Failed')
                        .setDescription(result.error || 'Unknown error');
                return interaction.editReply({ embeds: [errorEmbed] });
            }

            const embed = googleHandler?.createResultsEmbed?.(query, result.results, {
                totalResults: result.totalResults,
                searchEngine: result.searchEngine
            }) || this._createResultsEmbed(query, result);
            
            const buttons = googleHandler?.createSearchButtons?.(query, result.searchEngine) ||
                this._createSearchButtons(query);

            await interaction.editReply({ embeds: [embed], components: [buttons] });
        } catch (error) {
            console.error('[Google Command]', error);
            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor(COLORS.ERROR)
                    .setTitle('❌ Error')
                    .setDescription('An unexpected error occurred. Please try again.')
                ]
            });
        }
    }

    _createResultsEmbed(query, result) {
        const embed = new EmbedBuilder()
            .setColor(COLORS.PRIMARY)
            .setTitle(`🔍 Search Results: ${query}`)
            .setFooter({ text: `Powered by ${result.searchEngine || 'Web Search'}` });

        if (result.results && result.results.length > 0) {
            const description = result.results.map((r, i) => 
                `**${i + 1}.** [${r.title}](${r.link})\n${r.snippet || ''}`
            ).join('\n\n');
            embed.setDescription(description.slice(0, 4096));
        } else {
            embed.setDescription('No results found.');
        }

        return embed;
    }

    _createSearchButtons(query) {
        return new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('View on Google')
                .setStyle(ButtonStyle.Link)
                .setURL(`https://www.google.com/search?q=${encodeURIComponent(query)}`)
                .setEmoji('🔍'),
            new ButtonBuilder()
                .setLabel('View on DuckDuckGo')
                .setStyle(ButtonStyle.Link)
                .setURL(`https://duckduckgo.com/?q=${encodeURIComponent(query)}`)
                .setEmoji('🦆')
        );
    }
}

module.exports = new GoogleCommand();



