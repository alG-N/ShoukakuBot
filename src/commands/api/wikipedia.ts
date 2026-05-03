/**
 * Wikipedia Command - Presentation Layer
 * Search and display Wikipedia articles
 * @module presentation/commands/wikipedia
 */

import { 
    SlashCommandBuilder, 
    ChatInputCommandInteraction,
    AutocompleteInteraction,
    ButtonInteraction,
    StringSelectMenuInteraction
} from 'discord.js';
import { BaseCommand, CommandCategory, CommandData } from '../baseCommand.js';
import cacheService from '../../cache/cacheService.js';
import { checkAccess, AccessType } from '../../services/index.js';
import logger from '../../core/observability/Logger.js';
import wikipediaService from '../../services/api/wikipediaService.js';
import wikipediaHandler from '../../handlers/api/wikipedia/index.js';
import type {
    OnThisDayDate,
    WikiSearchResult
} from '../../types/api/models/wikipedia.js';

const WIKIPEDIA_SEARCH_SESSION_NS = 'api:search';
const WIKIPEDIA_SEARCH_SESSION_TTL = 600;

type WikipediaSearchSession = {
    query: string;
    language: string;
    results: WikiSearchResult[];
};

// COMMAND
class WikipediaCommand extends BaseCommand {
    private _buildSearchSessionKey(userId: string, token: string): string {
        return `wikipedia:search:${userId}:${token}`;
    }

    private _createSearchSessionToken(): string {
        return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    }

    private async _setSearchSession(userId: string, token: string, session: WikipediaSearchSession): Promise<void> {
        await cacheService.set<WikipediaSearchSession>(
            WIKIPEDIA_SEARCH_SESSION_NS,
            this._buildSearchSessionKey(userId, token),
            session,
            WIKIPEDIA_SEARCH_SESSION_TTL
        );
    }

    private async _getSearchSession(userId: string, token: string): Promise<WikipediaSearchSession | null> {
        return cacheService.get<WikipediaSearchSession>(
            WIKIPEDIA_SEARCH_SESSION_NS,
            this._buildSearchSessionKey(userId, token)
        );
    }

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
        const language = 'en';
        const result = await wikipediaService.search(query, { language });
        
        if (!result || !result.results?.length) {
            await this.errorReply(interaction, `No Wikipedia articles found for: **${query}**`);
            return;
        }

        const sessionToken = this._createSearchSessionToken();
        await this._setSearchSession(interaction.user.id, sessionToken, {
            query,
            language,
            results: result.results
        });

        const embed = wikipediaHandler.createSearchResultsEmbed(query, result.results);
        const selectMenu = wikipediaHandler.createSearchSelectMenu(result.results, interaction.user.id, sessionToken);
        await this.safeReply(interaction, {
            embeds: [embed],
            components: selectMenu ? [selectMenu] : []
        });
    }

    private async _handleArticle(interaction: ChatInputCommandInteraction): Promise<void> {
        const title = interaction.options.getString('title', true);
        const language = interaction.options.getString('language') || 'en';

        const result = await wikipediaService.getArticleSummary(title, language);

        if (!result.success || !result.article) {
            await this.errorReply(interaction, result.error || `Article not found: **${title}**`);
            return;
        }

        const article = result.article;
        const embed = wikipediaHandler.createArticleEmbed(article);
        const buttons = wikipediaHandler.createArticleButtons(article, interaction.user.id);
        await this.safeReply(interaction, { embeds: [embed], components: [buttons] });
    }

    private async _handleRandom(interaction: ChatInputCommandInteraction): Promise<void> {
        const language = interaction.options.getString('language') || 'en';
        const result = await wikipediaService.getRandomArticle(language);

        if (!result.success || !result.article) {
            await this.errorReply(interaction, result.error || 'Failed to fetch random article.');
            return;
        }

        const article = result.article;
        const embed = wikipediaHandler.createRandomArticleEmbed(article);
        const buttons = wikipediaHandler.createArticleButtons(article, interaction.user.id);
        await this.safeReply(interaction, { embeds: [embed], components: [buttons] });
    }

    private async _handleToday(interaction: ChatInputCommandInteraction): Promise<void> {
        const now = new Date();
        const result = await wikipediaService.getOnThisDay(now.getMonth() + 1, now.getDate());

        if (!result.success || !result.events?.length) {
            await this.errorReply(interaction, result.error || 'Failed to fetch events for today.');
            return;
        }

        const date: OnThisDayDate = result.date || { month: now.getMonth() + 1, day: now.getDate() };
        const embed = wikipediaHandler.createOnThisDayEmbed(result.events, date);
        await this.safeReply(interaction, { embeds: [embed] });
    }

    async handleButton(interaction: ButtonInteraction): Promise<void> {
        const parts = interaction.customId.split('_');
        const action = parts[1];
        const language = parts[2] || 'en';
        const targetUserId = parts[3];

        if (action !== 'random' || !targetUserId) {
            return;
        }

        if (interaction.user.id !== targetUserId) {
            await interaction.reply({ content: '❌ This button is not for you!', ephemeral: true });
            return;
        }

        await interaction.deferUpdate();

        const result = await wikipediaService.getRandomArticle(language);
        if (!result.success || !result.article) {
            await interaction.followUp({
                content: result.error || '❌ Failed to fetch a random article.',
                ephemeral: true
            }).catch(() => {});
            return;
        }

        const embed = wikipediaHandler.createRandomArticleEmbed(result.article);
        const buttons = wikipediaHandler.createArticleButtons(result.article, targetUserId);
        await interaction.editReply({ embeds: [embed], components: [buttons] });
    }

    async handleSelectMenu(interaction: StringSelectMenuInteraction): Promise<void> {
        const parts = interaction.customId.split('_');
        const action = parts[1];
        const sessionToken = parts[2];
        const targetUserId = parts[3];

        if (action !== 'search' || !sessionToken || !targetUserId) {
            return;
        }

        if (interaction.user.id !== targetUserId) {
            await interaction.reply({ content: '❌ This menu is not for you!', ephemeral: true });
            return;
        }

        const selectedValue = interaction.values[0];
        const selectedIndex = Number.parseInt(selectedValue || '', 10);
        if (!Number.isInteger(selectedIndex) || selectedIndex < 0) {
            await interaction.reply({ content: '❌ Invalid selection.', ephemeral: true });
            return;
        }

        const session = await this._getSearchSession(targetUserId, sessionToken);
        if (!session) {
            await interaction.reply({ content: '⏱️ Search session expired. Please run the command again.', ephemeral: true });
            return;
        }

        const selectedResult = session.results[selectedIndex];
        if (!selectedResult) {
            await interaction.reply({ content: '❌ Selected article is no longer available.', ephemeral: true });
            return;
        }

        await interaction.deferUpdate();

        const articleResult = await wikipediaService.getArticleSummary(selectedResult.title, session.language);
        if (!articleResult.success || !articleResult.article) {
            await interaction.followUp({
                content: articleResult.error || '❌ Failed to load the selected article.',
                ephemeral: true
            }).catch(() => {});
            return;
        }

        const embed = wikipediaHandler.createArticleEmbed(articleResult.article);
        const buttons = wikipediaHandler.createArticleButtons(articleResult.article, targetUserId);
        await interaction.editReply({ embeds: [embed], components: [buttons] });
    }

    async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
        const focused = interaction.options.getFocused();
        
        if (!focused || focused.length < 2) {
            await interaction.respond([]).catch(() => {});
            return;
        }

        try {
            const result = await wikipediaService.search(focused, { limit: 10 });
            if (!result.success || !result.results?.length) {
                await interaction.respond([]).catch(() => {});
                return;
            }

            const suggestions = [...new Set(result.results.map(resultItem => resultItem.title).filter(Boolean))];
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