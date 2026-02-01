/**
 * Fandom Command - Presentation Layer
 * Search and browse wiki articles from Fandom
 * @module presentation/commands/api/fandom
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { BaseCommand, CommandCategory } = require('../BaseCommand');
const { COLORS } = require('../../constants');
const { checkAccess, AccessType } = require('../../services');

// Import service
let fandomService;
try {
    fandomService = require('../../services/api/fandomService');
} catch (e) {
    console.warn('[Fandom] Could not load service:', e.message);
}

const searchSessionCache = new Map();
const CACHE_EXPIRY = 600000;

class FandomCommand extends BaseCommand {
    constructor() {
        super({
            category: CommandCategory.API,
            cooldown: 3,
            deferReply: true
        });
    }

    get data() {
        return new SlashCommandBuilder()
            .setName('fandom')
            .setDescription('Search Fandom wikis for games, anime, movies, and more')
            .addSubcommand(sub => sub
                .setName('search')
                .setDescription('Search for articles in a wiki')
                .addStringOption(opt => opt
                    .setName('wiki')
                    .setDescription('Wiki name (e.g., genshin, naruto, marvel, minecraft)')
                    .setRequired(true)
                    .setAutocomplete(true)
                )
                .addStringOption(opt => opt
                    .setName('query')
                    .setDescription('What to search for')
                    .setRequired(true)
                    .setAutocomplete(true)
                )
            )
            .addSubcommand(sub => sub
                .setName('article')
                .setDescription('Get a specific article from a wiki')
                .addStringOption(opt => opt
                    .setName('wiki')
                    .setDescription('Wiki name (e.g., genshin, naruto, marvel)')
                    .setRequired(true)
                    .setAutocomplete(true)
                )
                .addStringOption(opt => opt
                    .setName('title')
                    .setDescription('Article title')
                    .setRequired(true)
                    .setAutocomplete(true)
                )
            )
            .addSubcommand(sub => sub
                .setName('random')
                .setDescription('Get a random article from a wiki')
                .addStringOption(opt => opt
                    .setName('wiki')
                    .setDescription('Wiki name (e.g., genshin, naruto, marvel)')
                    .setRequired(true)
                    .setAutocomplete(true)
                )
            )
            .addSubcommand(sub => sub
                .setName('info')
                .setDescription('Get information about a wiki')
                .addStringOption(opt => opt
                    .setName('wiki')
                    .setDescription('Wiki name (e.g., genshin, naruto, marvel)')
                    .setRequired(true)
                    .setAutocomplete(true)
                )
            );
    }

    async run(interaction) {
        // Access control
        const access = await checkAccess(interaction, AccessType.SUB);
        if (access.blocked) {
            return interaction.reply({ embeds: [access.embed], ephemeral: true });
        }

        const subcommand = interaction.options.getSubcommand();
        const wiki = interaction.options.getString('wiki');

        try {
            switch (subcommand) {
                case 'search':
                    return this._handleSearch(interaction, wiki);
                case 'article':
                    return this._handleArticle(interaction, wiki);
                case 'random':
                    return this._handleRandom(interaction, wiki);
                case 'info':
                    return this._handleInfo(interaction, wiki);
            }
        } catch (error) {
            console.error('[Fandom]', error);
            return this.safeReply(interaction, { embeds: [this.errorEmbed('An error occurred while fetching Fandom data.')], ephemeral: true });
        }
    }

    async _handleSearch(interaction, wiki) {
        const query = interaction.options.getString('query');
        const results = await fandomService.searchArticles(wiki, query);
        
        if (!results || results.length === 0) {
            return this.safeReply(interaction, { embeds: [this.errorEmbed(`No articles found for **${query}** on ${wiki} wiki.`)], ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setColor(0x00D6D6)
            .setTitle(`🔍 Search: "${query}" on ${wiki}`)
            .setDescription(results.slice(0, 10).map((r, i) => 
                `**${i + 1}.** [${r.title}](${r.url})`
            ).join('\n'))
            .setFooter({ text: `Found ${results.length} results` });

        await this.safeReply(interaction, { embeds: [embed] });
    }

    async _handleArticle(interaction, wiki) {
        const title = interaction.options.getString('title');
        const result = await fandomService.getArticle(wiki, title);
        
        if (!result?.success || !result?.article) {
            return this.safeReply(interaction, { embeds: [this.errorEmbed(result?.error || `Article **${title}** not found on ${wiki} wiki.`)], ephemeral: true });
        }

        const article = result.article;
        const embed = new EmbedBuilder()
            .setColor(0x00D6D6)
            .setTitle(article.title)
            .setURL(article.url)
            .setDescription(article.extract?.slice(0, 4096) || 'No description available.')
            .setThumbnail(article.thumbnail)
            .setFooter({ text: `${article.wikiName || wiki} Wiki | Fandom` });

        const components = [];
        if (article.url) {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel('View on Fandom')
                    .setStyle(ButtonStyle.Link)
                    .setURL(article.url)
            );
            components.push(row);
        }

        await this.safeReply(interaction, { embeds: [embed], components });
    }

    async _handleRandom(interaction, wiki) {
        const result = await fandomService.getRandomArticle(wiki);
        
        if (!result?.success || !result?.article) {
            return this.safeReply(interaction, { embeds: [this.errorEmbed(result?.error || `Failed to get random article from ${wiki} wiki.`)], ephemeral: true });
        }

        const article = result.article;
        const embed = new EmbedBuilder()
            .setColor(0x00D6D6)
            .setTitle(`🎲 ${article.title}`)
            .setURL(article.url)
            .setDescription(article.extract?.slice(0, 4096) || 'No description available.')
            .setThumbnail(article.thumbnail)
            .setFooter({ text: `Random article from ${article.wikiName || wiki} Wiki` });

        const components = [];
        if (article.url) {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel('View on Fandom')
                    .setStyle(ButtonStyle.Link)
                    .setURL(article.url)
            );
            components.push(row);
        }

        await this.safeReply(interaction, { embeds: [embed], components });
    }

    async _handleInfo(interaction, wiki) {
        const result = await fandomService.getWikiInfo(wiki);
        
        if (!result?.success || !result?.info) {
            return this.safeReply(interaction, { embeds: [this.errorEmbed(result?.error || `Wiki **${wiki}** not found.`)], ephemeral: true });
        }

        const info = result.info;
        const embed = new EmbedBuilder()
            .setColor(0x00D6D6)
            .setTitle(info.name || wiki)
            .setURL(info.base)
            .setDescription(`A Fandom wiki with **${info.articles?.toLocaleString() || 'N/A'}** articles`)
            .addFields(
                { name: '📊 Statistics', value: `Articles: ${info.articles?.toLocaleString() || 'N/A'}\nPages: ${info.pages?.toLocaleString() || 'N/A'}\nEdits: ${info.edits?.toLocaleString() || 'N/A'}`, inline: true },
                { name: '👥 Users', value: `Total: ${info.users?.toLocaleString() || 'N/A'}\nActive: ${info.activeUsers?.toLocaleString() || 'N/A'}`, inline: true }
            )
            .setThumbnail(info.logo)
            .setFooter({ text: 'Powered by Fandom' });

        await this.safeReply(interaction, { embeds: [embed] });
    }

    async autocomplete(interaction) {
        const focused = interaction.options.getFocused(true);
        const wiki = interaction.options.getString('wiki');

        try {
            if (focused.name === 'wiki') {
                const query = focused.value;
                
                if (!query || query.length < 2) {
                    const popular = fandomService.getPopularWikis().slice(0, 15);
                    return interaction.respond(
                        popular.map(w => ({ name: w.name, value: w.subdomain }))
                    ).catch(() => {});
                }

                const suggestions = await fandomService.searchWikis(query);
                return interaction.respond(
                    suggestions.map(w => ({ name: w.name, value: w.subdomain }))
                ).catch(() => {});
            }

            if (focused.name === 'query' || focused.name === 'title') {
                if (!wiki || !focused.value || focused.value.length < 2) {
                    return interaction.respond([]).catch(() => {});
                }

                const suggestions = await fandomService.autocomplete(wiki, focused.value);
                return interaction.respond(
                    suggestions.slice(0, 25).map(s => ({ 
                        name: s.title.slice(0, 100), 
                        value: s.title.slice(0, 100) 
                    }))
                ).catch(() => {});
            }
        } catch {
            await interaction.respond([]).catch(() => {});
        }
    }
}

module.exports = new FandomCommand();



