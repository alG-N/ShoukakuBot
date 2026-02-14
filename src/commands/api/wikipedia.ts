/**
 * Wikipedia Command - Presentation Layer
 * Search and display Wikipedia articles
 * @module presentation/commands/api/wikipedia
 */

import { 
    SlashCommandBuilder, 
    ChatInputCommandInteraction,
    AutocompleteInteraction,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder
} from 'discord.js';
import { BaseCommand, CommandCategory, type CommandData } from '../BaseCommand.js';
import { checkAccess, AccessType } from '../../services/index.js';
import logger from '../../core/Logger.js';
import _wikipediaServiceModule from '../../services/api/wikipediaService.js';
import _wikipediaHandlerModule from '../../handlers/api/wikipediaHandler.js';
// TYPES
interface WikiArticle {
    title: string;
    url: string;
    extract?: string;
    thumbnail?: string;
}

interface WikiSearchResult {
    results?: WikiArticle[];
}

interface WikiEvent {
    year: string;
    text: string;
}

interface WikipediaService {
    search: (query: string) => Promise<WikiSearchResult>;
    getArticle: (title: string, language: string) => Promise<WikiArticle | null>;
    getRandomArticle: (language: string) => Promise<WikiArticle | null>;
    getOnThisDay: () => Promise<WikiEvent[] | null>;
    autocomplete: (query: string) => Promise<string[]>;
}

interface WikipediaHandler {
    createSearchResultsEmbed: (query: string, results: WikiArticle[]) => EmbedBuilder;
    createArticleEmbed: (article: WikiArticle) => EmbedBuilder;
    createArticleButtons: (article: WikiArticle) => ActionRowBuilder<ButtonBuilder>;
    createOnThisDayEmbed: (events: WikiEvent[]) => EmbedBuilder;
}
// SERVICE IMPORTS — static ESM imports (converted from CJS require())
const wikipediaService: WikipediaService = _wikipediaServiceModule as any;
const wikipediaHandler: WikipediaHandler = _wikipediaHandlerModule as any;
// COMMAND
class WikipediaCommand extends BaseCommand {
    constructor() {
        super({
            category: CommandCategory.API,
            cooldown: 3,
            deferReply: true
        });
    }

    get data(): CommandData {
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

    async run(interaction: ChatInputCommandInteraction): Promise<void> {
        // Access control
        const access = await checkAccess(interaction, AccessType.SUB);
        if (access.blocked) {
            await interaction.reply({ embeds: [access.embed!], ephemeral: true });
            return;
        }

        const subcommand = interaction.options.getSubcommand();

        try {
            switch (subcommand) {
                case 'search':
                    await this._handleSearch(interaction);
                    break;
                case 'article':
                    await this._handleArticle(interaction);
                    break;
                case 'random':
                    await this._handleRandom(interaction);
                    break;
                case 'today':
                    await this._handleToday(interaction);
                    break;
            }
        } catch (error) {
            logger.error('Wikipedia', `Error: ${(error as Error).message}`);
            await this.errorReply(interaction, 'An error occurred while fetching Wikipedia data.');
        }
    }

    private async _handleSearch(interaction: ChatInputCommandInteraction): Promise<void> {
        const query = interaction.options.getString('query', true);
        const result = await wikipediaService!.search(query);
        
        if (!result || !result.results?.length) {
            await this.errorReply(interaction, `No Wikipedia articles found for: **${query}**`);
            return;
        }

        const embed = wikipediaHandler!.createSearchResultsEmbed(query, result.results);
        await this.safeReply(interaction, { embeds: [embed] });
    }

    private async _handleArticle(interaction: ChatInputCommandInteraction): Promise<void> {
        const title = interaction.options.getString('title', true);
        const language = interaction.options.getString('language') || 'en';
        
        const article = await wikipediaService!.getArticle(title, language);
        
        if (!article) {
            await this.errorReply(interaction, `Article not found: **${title}**`);
            return;
        }

        const embed = wikipediaHandler!.createArticleEmbed(article);
        const buttons = wikipediaHandler!.createArticleButtons(article);
        await this.safeReply(interaction, { embeds: [embed], components: [buttons] });
    }

    private async _handleRandom(interaction: ChatInputCommandInteraction): Promise<void> {
        const language = interaction.options.getString('language') || 'en';
        const article = await wikipediaService!.getRandomArticle(language);
        
        if (!article) {
            await this.errorReply(interaction, 'Failed to fetch random article.');
            return;
        }

        const embed = wikipediaHandler!.createArticleEmbed(article);
        const buttons = wikipediaHandler!.createArticleButtons(article);
        await this.safeReply(interaction, { embeds: [embed], components: [buttons] });
    }

    private async _handleToday(interaction: ChatInputCommandInteraction): Promise<void> {
        const events = await wikipediaService!.getOnThisDay();
        
        if (!events || !events.length) {
            await this.errorReply(interaction, 'Failed to fetch events for today.');
            return;
        }

        const embed = wikipediaHandler!.createOnThisDayEmbed(events);
        await this.safeReply(interaction, { embeds: [embed] });
    }

    async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
        const focused = interaction.options.getFocused();
        
        if (!focused || focused.length < 2) {
            await interaction.respond([]).catch(() => {});
            return;
        }

        try {
            const suggestions = await wikipediaService!.autocomplete(focused);
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

export default new WikipediaCommand();
