import {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder
} from 'discord.js';
import { COLORS, MONTH_NAMES, WIKIPEDIA_ICON } from './constants.js';
import type {
    WikiArticle as WikipediaArticle,
    WikiSearchResult,
    OnThisDayEvent,
    OnThisDayDate
} from '../../../types/api/wikipedia.js';

export class WikipediaHandler {
    createArticleEmbed(article: WikipediaArticle | null | undefined): EmbedBuilder {
        if (!article) {
            return new EmbedBuilder()
                .setColor(COLORS.ERROR)
                .setTitle('Article Not Found')
                .setDescription('Could not load this article. Please try again.');
        }

        const title = article.displayTitle || article.title || 'Unknown Article';
        const embed = new EmbedBuilder()
            .setColor(COLORS.WIKIPEDIA)
            .setAuthor({
                name: 'Wikipedia',
                iconURL: WIKIPEDIA_ICON,
                url: 'https://en.wikipedia.org'
            })
            .setTitle(title)
            .setTimestamp();

        if (article.url) {
            embed.setURL(article.url);
        }

        let description = '';
        if (article.description) {
            description = `*${article.description}*\n\n`;
        }
        description += this.truncate(article.extract, 1800 - description.length);
        embed.setDescription(description);

        if (article.thumbnail) {
            embed.setThumbnail(article.thumbnail);
        }

        if (article.coordinates) {
            embed.addFields({
                name: '📍 Location',
                value: `[${article.coordinates.lat.toFixed(4)}, ${article.coordinates.lon.toFixed(4)}](https://www.google.com/maps?q=${article.coordinates.lat},${article.coordinates.lon})`,
                inline: true
            });
        }

        const typeLabel = article.type === 'disambiguation' ? '(Disambiguation Page)' : '';
        const langLabel = article.language ? `[${article.language.toUpperCase()}]` : '';
        embed.setFooter({ text: `Wikipedia ${langLabel} ${typeLabel}`.trim() });

        return embed;
    }

    createSearchResultsEmbed(query: string, results: WikiSearchResult[]): EmbedBuilder {
        const embed = new EmbedBuilder()
            .setColor(COLORS.WIKIPEDIA)
            .setAuthor({
                name: 'Wikipedia Search',
                iconURL: WIKIPEDIA_ICON
            })
            .setTitle(`🔍 Search: "${this.truncate(query, 50)}"`)
            .setTimestamp();

        if (results.length === 0) {
            embed.setDescription('No articles found. Try a different search term.');
            return embed;
        }

        const description = results.map((result, i) => {
            const desc = this.truncate(result.description, 100);
            return `**${i + 1}. [${result.title}](${result.url})**\n${desc}`;
        }).join('\n\n');

        embed.setDescription(description);
        embed.setFooter({ text: `Found ${results.length} articles` });

        return embed;
    }

    createRandomArticleEmbed(article: WikipediaArticle): EmbedBuilder {
        const embed = this.createArticleEmbed(article);
        embed.setAuthor({
            name: '🎲 Random Wikipedia Article',
            iconURL: WIKIPEDIA_ICON,
            url: 'https://en.wikipedia.org/wiki/Special:Random'
        });
        return embed;
    }

    createOnThisDayEmbed(events: OnThisDayEvent[], date: OnThisDayDate): EmbedBuilder {
        const embed = new EmbedBuilder()
            .setColor(COLORS.WIKIPEDIA)
            .setAuthor({
                name: 'Wikipedia - On This Day',
                iconURL: WIKIPEDIA_ICON
            })
            .setTitle(`📅 ${MONTH_NAMES[date.month - 1]} ${date.day}`)
            .setTimestamp();

        if (events.length === 0) {
            embed.setDescription('No events found for this date.');
            return embed;
        }

        const description = events.map(event => {
            const pageLinks = event.pages?.map(p => `[${p.title}](${p.url})`).join(', ') || '';
            return `**${event.year}** - ${this.truncate(event.text, 200)}${pageLinks ? `\n*Related: ${pageLinks}*` : ''}`;
        }).join('\n\n');

        embed.setDescription(description);
        return embed;
    }

    createArticleButtons(article: WikipediaArticle, userId: string): ActionRowBuilder<ButtonBuilder> {
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setLabel('Read on Wikipedia')
                .setStyle(ButtonStyle.Link)
                .setURL(article.url || 'https://en.wikipedia.org')
                .setEmoji('📖'),
            new ButtonBuilder()
                .setCustomId(`wiki_random_${userId}`)
                .setLabel('Random Article')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🎲')
        );

        if (article.originalImage) {
            row.addComponents(
                new ButtonBuilder()
                    .setLabel('View Image')
                    .setStyle(ButtonStyle.Link)
                    .setURL(article.originalImage)
                    .setEmoji('🖼️')
            );
        }

        return row;
    }

    createSearchSelectMenu(
        results: WikiSearchResult[],
        userId: string
    ): ActionRowBuilder<StringSelectMenuBuilder> | null {
        if (results.length === 0) return null;

        const options = results.map((result, i) => ({
            label: this.truncate(result.title, 100),
            description: this.truncate(result.description, 100),
            value: `wiki_select_${i}_${userId}`,
            emoji: '📄'
        }));

        return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`wiki_search_${userId}`)
                .setPlaceholder('Select an article to view...')
                .addOptions(options)
        );
    }

    createErrorEmbed(message: string): EmbedBuilder {
        return new EmbedBuilder()
            .setColor(COLORS.ERROR)
            .setTitle('❌ Error')
            .setDescription(message)
            .setTimestamp();
    }

    createCooldownEmbed(remaining: number): EmbedBuilder {
        return new EmbedBuilder()
            .setColor(COLORS.ERROR)
            .setTitle('⏳ Cooldown')
            .setDescription(`Please wait **${remaining}s** before using this command again.`)
            .setTimestamp();
    }

    private truncate(text: string | undefined | null, maxLength: number): string {
        if (!text) return '';
        const clean = text.replace(/<[^>]*>/g, '');
        return clean.length > maxLength ? clean.substring(0, maxLength - 3) + '...' : clean;
    }
}
