/**
 * Wikipedia Command - Presentation Layer
 * Search and display Wikipedia articles
 * @module presentation/commands/api/wikipedia
 */

const { SlashCommandBuilder } = require('discord.js');
const { BaseCommand, CommandCategory } = require('../BaseCommand');
const { checkAccess, AccessType } = require('../../services');

// Import services
let wikipediaService, wikipediaHandler, cooldownManager, COOLDOWN_SETTINGS;
try {
    wikipediaService = require('../../services/api/wikipediaService');
    wikipediaHandler = require('../../handlers/api/wikipediaHandler');
    const cooldown = require('../../utils/common/cooldown');
    cooldownManager = cooldown.cooldownManager;
    COOLDOWN_SETTINGS = cooldown.COOLDOWN_SETTINGS;
} catch (e) {
    console.warn('[Wikipedia] Could not load services:', e.message);
}

const searchCache = new Map();

class WikipediaCommand extends BaseCommand {
    constructor() {
        super({
            category: CommandCategory.API,
            cooldown: 3,
            deferReply: true
        });
    }

    get data() {
        return new SlashCommandBuilder()
            .setName('wikipedia')
            .setDescription('Search and browse Wikipedia articles')
            .addSubcommand(sub => sub
                .setName('search')
                .setDescription('Search for Wikipedia articles')
                .addStringOption(option =>
                    option.setName('query')
                        .setDescription('What to search for')
                        .setRequired(true)
                        .setMaxLength(200)
                        .setAutocomplete(true)
                )
            )
            .addSubcommand(sub => sub
                .setName('article')
                .setDescription('Get a specific article by title')
                .addStringOption(option =>
                    option.setName('title')
                        .setDescription('Article title')
                        .setRequired(true)
                        .setMaxLength(200)
                        .setAutocomplete(true)
                )
                .addStringOption(option =>
                    option.setName('language')
                        .setDescription('Wikipedia language')
                        .setRequired(false)
                        .addChoices(
                            { name: 'English', value: 'en' },
                            { name: 'Japanese', value: 'ja' },
                            { name: 'German', value: 'de' },
                            { name: 'French', value: 'fr' },
                            { name: 'Spanish', value: 'es' }
                        )
                )
            )
            .addSubcommand(sub => sub
                .setName('random')
                .setDescription('Get a random Wikipedia article')
                .addStringOption(option =>
                    option.setName('language')
                        .setDescription('Wikipedia language')
                        .setRequired(false)
                        .addChoices(
                            { name: 'English', value: 'en' },
                            { name: 'Japanese', value: 'ja' },
                            { name: 'German', value: 'de' },
                            { name: 'French', value: 'fr' },
                            { name: 'Spanish', value: 'es' }
                        )
                )
            )
            .addSubcommand(sub => sub
                .setName('today')
                .setDescription('Get events that happened on this day in history')
            );
    }

    async run(interaction) {
        // Access control
        const access = await checkAccess(interaction, AccessType.SUB);
        if (access.blocked) {
            return interaction.reply({ embeds: [access.embed], ephemeral: true });
        }

        const subcommand = interaction.options.getSubcommand();

        try {
            switch (subcommand) {
                case 'search':
                    return this._handleSearch(interaction);
                case 'article':
                    return this._handleArticle(interaction);
                case 'random':
                    return this._handleRandom(interaction);
                case 'today':
                    return this._handleToday(interaction);
            }
        } catch (error) {
            console.error('[Wikipedia]', error);
            return this.errorReply(interaction, 'An error occurred while fetching Wikipedia data.');
        }
    }

    async _handleSearch(interaction) {
        const query = interaction.options.getString('query');
        const result = await wikipediaService.search(query);
        
        if (!result || !result.results?.length) {
            return this.errorReply(interaction, `No Wikipedia articles found for: **${query}**`);
        }

        const embed = wikipediaHandler.createSearchResultsEmbed(query, result.results);
        await this.safeReply(interaction, { embeds: [embed] });
    }

    async _handleArticle(interaction) {
        const title = interaction.options.getString('title');
        const language = interaction.options.getString('language') || 'en';
        
        const article = await wikipediaService.getArticle(title, language);
        
        if (!article) {
            return this.errorReply(interaction, `Article not found: **${title}**`);
        }

        const embed = wikipediaHandler.createArticleEmbed(article);
        const buttons = wikipediaHandler.createArticleButtons(article);
        await this.safeReply(interaction, { embeds: [embed], components: [buttons] });
    }

    async _handleRandom(interaction) {
        const language = interaction.options.getString('language') || 'en';
        const article = await wikipediaService.getRandomArticle(language);
        
        if (!article) {
            return this.errorReply(interaction, 'Failed to fetch random article.');
        }

        const embed = wikipediaHandler.createArticleEmbed(article);
        const buttons = wikipediaHandler.createArticleButtons(article);
        await this.safeReply(interaction, { embeds: [embed], components: [buttons] });
    }

    async _handleToday(interaction) {
        const events = await wikipediaService.getOnThisDay();
        
        if (!events || !events.length) {
            return this.errorReply(interaction, 'Failed to fetch events for today.');
        }

        const embed = wikipediaHandler.createOnThisDayEmbed(events);
        await this.safeReply(interaction, { embeds: [embed] });
    }

    async autocomplete(interaction) {
        const focused = interaction.options.getFocused();
        
        if (!focused || focused.length < 2) {
            return interaction.respond([]).catch(() => {});
        }

        try {
            const suggestions = await wikipediaService.autocomplete(focused);
            const choices = suggestions.slice(0, 25).map(s => ({
                name: s.slice(0, 100),
                value: s.slice(0, 100)
            }));
            await interaction.respond(choices).catch(() => {});
        } catch {
            await interaction.respond([]).catch(() => {});
        }
    }
}

module.exports = new WikipediaCommand();



