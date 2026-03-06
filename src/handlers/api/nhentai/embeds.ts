import { EmbedBuilder } from 'discord.js';
import type { SearchData } from '../../../types/api/nhentai.js';
import type { Gallery, GalleryTag, GalleryTitle } from '../../../types/api/handlers/nhentai-handler.js';
import { NhentaiCdnClient } from './cdn.js';
import {
    COLORS,
    formatDate,
    formatTagList,
    getSortLabel,
    getTitle,
    parseTags,
    truncate
} from './utils.js';
import type { UserPreferences } from '../../../types/api/handlers/nhentai-handler.js';

function periodLabel(period: UserPreferences['popularPeriod']): string {
    const labels: Record<UserPreferences['popularPeriod'], string> = {
        today: 'Today',
        week: 'This Week',
        month: 'This Month',
        all: 'All Time'
    };
    return labels[period] || 'All Time';
}

function randomPeriodLabel(period: UserPreferences['randomPeriod']): string {
    const labels: Record<UserPreferences['randomPeriod'], string> = {
        today: 'From popular today',
        week: 'From popular this week',
        month: 'From popular this month',
        all: 'From all-time popular'
    };
    return labels[period] || 'From all-time popular';
}

export function createGalleryEmbed(
    cdn: NhentaiCdnClient,
    gallery: Gallery,
    options: { isRandom?: boolean; isPopular?: boolean; popularPeriod?: string } = {}
): EmbedBuilder {
    const { isRandom = false, isPopular = false, popularPeriod } = options;
    const { id, media_id, title, tags, num_pages, upload_date, images, num_favorites } = gallery;

    const embed = new EmbedBuilder()
        .setColor(COLORS.NHENTAI)
        .setTitle(getTitle(title))
        .setURL(`https://nhentai.net/g/${id}/`)
        .setFooter({ text: `ID: ${id} • ${num_pages} pages • Uploaded: ${formatDate(upload_date)}` });

    const coverType = images?.cover?.t || 'j';
    embed.setThumbnail(cdn.getThumbnailUrl(media_id, coverType));

    if (isRandom) {
        embed.setAuthor({ name: '🎲 Random Gallery' });
    } else if (isPopular) {
        const periodText = popularPeriod ? ` • ${popularPeriod}` : '';
        embed.setAuthor({ name: `🔥 Popular Gallery${periodText}` });
    }

    const parsedTags = parseTags(tags as GalleryTag[]);
    const fields: { name: string; value: string; inline: boolean }[] = [];

    if (parsedTags.artists.length > 0) {
        fields.push({ name: '🎨 Artist', value: formatTagList(parsedTags.artists), inline: true });
    }
    if (parsedTags.parodies.length > 0) {
        fields.push({ name: '📚 Parody', value: formatTagList(parsedTags.parodies), inline: true });
    }
    if (parsedTags.characters.length > 0) {
        fields.push({ name: '👤 Characters', value: formatTagList(parsedTags.characters), inline: true });
    }
    if (parsedTags.groups.length > 0) {
        fields.push({ name: '👥 Group', value: formatTagList(parsedTags.groups), inline: true });
    }
    if (parsedTags.languages.length > 0) {
        fields.push({ name: '🌐 Language', value: formatTagList(parsedTags.languages), inline: true });
    }
    if (parsedTags.categories.length > 0) {
        fields.push({ name: '📂 Category', value: formatTagList(parsedTags.categories), inline: true });
    }
    if (typeof num_favorites === 'number') {
        fields.push({ name: '❤️ Favourite', value: num_favorites.toLocaleString('en-US'), inline: true });
    }
    if (parsedTags.tags.length > 0) {
        fields.push({ name: '🏷️ Tags', value: formatTagList(parsedTags.tags, 500), inline: false });
    }

    if (fields.length > 0) {
        embed.addFields(fields);
    }

    const galleryTitle = title as GalleryTitle;
    if (galleryTitle.japanese && galleryTitle.japanese !== galleryTitle.english) {
        embed.setDescription(`*${galleryTitle.japanese}*`);
    }

    return embed;
}

export function createPageEmbed(cdn: NhentaiCdnClient, gallery: Gallery, pageNum: number): EmbedBuilder {
    const { id, media_id, title, num_pages, images } = gallery;
    const pages = images?.pages || [];

    if (pageNum < 1 || pageNum > pages.length) {
        return createErrorEmbed('Invalid page number.');
    }

    const page = pages[pageNum - 1];
    const imageUrl = cdn.getPageImageUrl(media_id, pageNum, page.t);
    const thumbUrl = cdn.getPageThumbUrl(media_id, pageNum, page.t);

    return new EmbedBuilder()
        .setColor(COLORS.NHENTAI)
        .setAuthor({
            name: truncate(getTitle(title), 100),
            url: `https://nhentai.net/g/${id}/`
        })
        .setImage(imageUrl)
        .setThumbnail(thumbUrl)
        .setFooter({ text: `Page ${pageNum}/${num_pages} • ID: ${id}` });
}

export function createSearchResultsEmbed(query: string, data: SearchData, page: number, sort: string): EmbedBuilder {
    const { results, numPages, totalResults } = data;

    const embed = new EmbedBuilder()
        .setColor(COLORS.NHENTAI)
        .setTitle(`🔍 Search Results: "${query}"`)
        .setDescription(`Found **${totalResults}+** results • Page **${page}** of **${numPages}** • Sorted by **${getSortLabel(sort)}**`)
        .setFooter({ text: 'Select a gallery to view more details' });

    const displayResults = results.slice(0, 10);
    let resultsList = '';

    displayResults.forEach((gallery, index) => {
        const galleryTitle = truncate(getTitle(gallery.title), 50);
        const pages = gallery.num_pages || '?';
        const galleryId = gallery.id;
        resultsList += `**${index + 1}.** \`${galleryId}\` - ${galleryTitle} (${pages}p)\n`;
    });

    if (resultsList) {
        embed.addFields({ name: '📚 Results', value: resultsList, inline: false });
    }

    return embed;
}

export function createErrorEmbed(message: string): EmbedBuilder {
    return new EmbedBuilder()
        .setColor(COLORS.ERROR)
        .setTitle('❌ Error')
        .setDescription(message)
        .setTimestamp();
}

export function createSettingsEmbed(userId: string, prefs: UserPreferences): EmbedBuilder {
    return new EmbedBuilder()
        .setColor(COLORS.NHENTAI)
        .setTitle('⚙️ NHentai Settings')
        .setDescription('These settings apply to button actions for `Popular` and `Random`.')
        .addFields(
            { name: '🔥 Popular Timeframe', value: periodLabel(prefs.popularPeriod), inline: true },
            { name: '🎲 Random Pool', value: randomPeriodLabel(prefs.randomPeriod), inline: true },
            { name: '👤 User', value: `<@${userId}>`, inline: false }
        )
        .setFooter({ text: 'Use the dropdown menus below to update your preferences' });
}

export function applyTranslatedTitle(
    embed: EmbedBuilder,
    originalTitle: string,
    translatedTitle: string
): EmbedBuilder {
    const updated = EmbedBuilder.from(embed);
    updated.setTitle(translatedTitle);

    const existingDescription = updated.data.description || '';
    const translationNote = `**Original:** ${originalTitle}`;
    updated.setDescription(existingDescription ? `${existingDescription}\n\n${translationNote}` : translationNote);
    return updated;
}

export function createCooldownEmbed(remaining: number): EmbedBuilder {
    return new EmbedBuilder()
        .setColor(COLORS.ERROR)
        .setTitle('⏳ Cooldown')
        .setDescription(`Please wait **${remaining}s** before using this command again.`)
        .setTimestamp();
}
