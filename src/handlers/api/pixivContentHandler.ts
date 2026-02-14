/**
 * Pixiv Content Handler
 * Creates embeds and buttons for Pixiv search results
 * @module handlers/api/pixivContentHandler
 */

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import logger from '../../core/Logger.js';
import pixivService from '../../services/api/pixivService.js';
// TYPES & INTERFACES
interface PixivTag {
    name: string;
    translated_name?: string;
}

interface PixivUser {
    id: number;
    name: string;
}

interface PixivImageUrls {
    large?: string;
    medium?: string;
    square_medium?: string;
}

interface PixivItem {
    id: number;
    title: string;
    user: PixivUser;
    tags?: PixivTag[];
    page_count: number;
    x_restrict: number; // 0 = SFW, 1 = R18, 2 = R18G
    illust_ai_type?: number; // 2 = AI generated
    type?: string; // 'illust', 'manga', 'ugoira'
    total_view?: number;
    total_bookmarks?: number;
    create_date: string;
    image_urls?: PixivImageUrls;
    text?: string; // For novels
    text_length?: number; // For novels
}

interface ContentEmbedOptions {
    resultIndex?: number;
    totalResults?: number;
    searchPage?: number;
    cacheKey?: string;
    contentType?: 'illust' | 'novel';
    hasNextPage?: boolean;
    shouldTranslate?: boolean;
    originalQuery?: string;
    translatedQuery?: string;
    mangaPageIndex?: number;
    sortMode?: string;
    showNsfw?: boolean;
}

interface ContentEmbedResult {
    embed: EmbedBuilder;
    rows: ActionRowBuilder<ButtonBuilder>[];
}
// CONSTANTS
const SORT_MODE_TEXT: Record<string, string> = {
    'popular': '🔥 Popular',
    'day': '📅 Daily',
    'week': '📊 Weekly',
    'month': '📈 Monthly'
};
// EMBED CREATORS
async function createContentEmbed(
    item: PixivItem | null | undefined, 
    options: ContentEmbedOptions = {}
): Promise<ContentEmbedResult> {
    // Handle undefined/null item
    if (!item) {
        const errorEmbed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('❌ Content Not Found')
            .setDescription('Could not load this content. Please try again.');
        return { embed: errorEmbed, rows: [] };
    }

    const {
        resultIndex = 0,
        totalResults = 1,
        searchPage = 1,
        cacheKey = '',
        contentType = 'illust',
        hasNextPage = false,
        shouldTranslate = false,
        originalQuery = '',
        mangaPageIndex = 0,
        sortMode = 'popular'
    } = options;

    const embed = new EmbedBuilder().setColor(0x0096FA);
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];

    const sortModeText = SORT_MODE_TEXT[sortMode] || '🔥 Popular';
    
    // Enhanced NSFW display
    // x_restrict: 0 = SFW, 1 = R18, 2 = R18G
    const nsfwLevel = item.x_restrict || 0;
    let nsfwStatus: string;
    if (nsfwLevel === 0) {
        nsfwStatus = '✅ SFW';
    } else if (nsfwLevel === 1) {
        nsfwStatus = '🔞 R18';
    } else if (nsfwLevel === 2) {
        nsfwStatus = '⛔ R18G';
    } else {
        nsfwStatus = '❓ Unknown';
    }

    const isAI = item.illust_ai_type === 2;
    const aiStatus = isAI ? '🤖 AI Generated' : '✅ Human Art';

    // Add quality indicators
    const views = item.total_view || 0;
    const bookmarks = item.total_bookmarks || 0;
    const bookmarkRate = views > 0 ? ((bookmarks / views) * 100).toFixed(1) : '0';

    if (contentType === 'novel') {
        await buildNovelEmbed(embed, item, {
            sortModeText, nsfwStatus, aiStatus, searchPage, resultIndex,
            totalResults, shouldTranslate, originalQuery, views, bookmarks, bookmarkRate
        });
    } else {
        await buildIllustEmbed(embed, item, {
            sortModeText, nsfwStatus, aiStatus, searchPage, resultIndex,
            totalResults, mangaPageIndex, shouldTranslate, originalQuery, views, bookmarks, bookmarkRate
        });
    }

    // Row 1: Result navigation
    const resultNavRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setLabel('◀ Prev')
            .setCustomId(`pixiv_prev_${cacheKey}`)
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setLabel(`${resultIndex + 1}/${totalResults}`)
            .setCustomId(`pixiv_counter_${cacheKey}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setLabel('Next ▶')
            .setCustomId(`pixiv_next_${cacheKey}`)
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setLabel('Pixiv')
            .setStyle(ButtonStyle.Link)
            .setEmoji('🔗')
            .setURL(contentType === 'novel'
                ? `https://www.pixiv.net/novel/show.php?id=${item.id}`
                : `https://www.pixiv.net/artworks/${item.id}`)
    );
    rows.push(resultNavRow);

    // Row 2: Multi-page image navigation (if applicable)
    if (contentType !== 'novel' && item.page_count > 1) {
        const pageNavRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setLabel('◀ Prev Image')
                .setCustomId(`pixiv_pagedown_${cacheKey}`)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(mangaPageIndex === 0),
            new ButtonBuilder()
                .setLabel(`Image ${mangaPageIndex + 1}/${item.page_count}`)
                .setCustomId(`pixiv_pagecounter_${cacheKey}`)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true),
            new ButtonBuilder()
                .setLabel('Next Image ▶')
                .setCustomId(`pixiv_pageup_${cacheKey}`)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(mangaPageIndex >= item.page_count - 1)
        );
        rows.push(pageNavRow);
    }

    // Row 3: Search page navigation (load more results)
    const searchPageRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setLabel('⏪ Prev Page')
            .setCustomId(`pixiv_searchprev_${cacheKey}`)
            .setStyle(ButtonStyle.Success)
            .setDisabled(searchPage <= 1),
        new ButtonBuilder()
            .setLabel(`Search Page ${searchPage}`)
            .setCustomId(`pixiv_searchpageinfo_${cacheKey}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setLabel('Next Page ⏩')
            .setCustomId(`pixiv_searchnext_${cacheKey}`)
            .setStyle(ButtonStyle.Success)
            .setDisabled(!hasNextPage)
    );
    rows.push(searchPageRow);

    return { embed, rows };
}

interface BuildEmbedOptions {
    sortModeText: string;
    nsfwStatus: string;
    aiStatus: string;
    searchPage: number;
    resultIndex: number;
    totalResults: number;
    shouldTranslate: boolean;
    originalQuery: string;
    views: number;
    bookmarks: number;
    bookmarkRate: string;
    mangaPageIndex?: number;
}

async function buildNovelEmbed(
    embed: EmbedBuilder, 
    item: PixivItem, 
    options: BuildEmbedOptions
): Promise<void> {
    const { 
        sortModeText, nsfwStatus, aiStatus, searchPage, resultIndex, 
        totalResults, shouldTranslate, originalQuery, views, bookmarks, bookmarkRate 
    } = options;

    const textPreview = item.text 
        ? item.text.substring(0, 400) + (item.text.length > 400 ? '...' : '') 
        : 'No preview available';

    embed
        .setTitle(item.title)
        .setURL(`https://www.pixiv.net/novel/show.php?id=${item.id}`)
        .setDescription(
            `**Author:** ${item.user.name}\n` +
            `**Rating:** ${nsfwStatus}\n` +
            `**Type:** ${aiStatus}\n` +
            `**Views:** ${views.toLocaleString()} 👁️\n` +
            `**Bookmarks:** ${bookmarks.toLocaleString()} ❤️ (${bookmarkRate}%)\n\n` +
            `**Preview:**\n${textPreview}`
        )
        .addFields(
            {
                name: '🏷️ Tags',
                value: item.tags?.slice(0, 10).map(t => `\`${t.name}\``).join(' ') || 'None',
                inline: false
            },
            {
                name: '📊 Stats',
                value: `📝 ${item.text_length?.toLocaleString() || '?'} characters`,
                inline: true
            }
        )
        .setFooter({
            text: `${sortModeText} • Page ${searchPage} • Novel ${resultIndex + 1}/${totalResults} • ID: ${item.id}${shouldTranslate ? ` • From "${originalQuery}"` : ''}`
        })
        .setTimestamp(new Date(item.create_date));

    if (item.image_urls?.large) {
        try {
            const proxyImageUrl = await pixivService.getProxyImageUrl(item as any, 0);
            embed.setThumbnail(proxyImageUrl);
        } catch (err) {
            logger.error('PixivContent', `Failed to set thumbnail: ${(err as Error).message}`);
        }
    }
}

async function buildIllustEmbed(
    embed: EmbedBuilder, 
    item: PixivItem, 
    options: BuildEmbedOptions
): Promise<void> {
    const { 
        sortModeText, nsfwStatus, aiStatus, searchPage, resultIndex, 
        totalResults, mangaPageIndex = 0, shouldTranslate, originalQuery, 
        views, bookmarks, bookmarkRate 
    } = options;

    const typeEmoji = item.type === 'manga' ? '📚' : item.type === 'ugoira' ? '🎬' : '🎨';
    const typeText = item.type === 'manga' ? 'Manga' : item.type === 'ugoira' ? 'Animated' : 'Illustration';

    try {
        const proxyImageUrl = await pixivService.getProxyImageUrl(item as any, mangaPageIndex);

        embed
            .setTitle(item.title)
            .setURL(`https://www.pixiv.net/artworks/${item.id}`)
            .setDescription(
                `**Artist:** [${item.user.name}](https://www.pixiv.net/users/${item.user.id})\n` +
                `**Content:** ${typeEmoji} ${typeText}${item.page_count > 1 ? ` (${item.page_count} images)` : ''}\n` +
                `**Rating:** ${nsfwStatus}\n` +
                `**Type:** ${aiStatus}\n` +
                `**Views:** ${views.toLocaleString()} 👁️ | **Bookmarks:** ${bookmarks.toLocaleString()} ❤️ (${bookmarkRate}%)`
            )
            .setImage(proxyImageUrl)
            .addFields({
                name: '🏷️ Tags',
                value: item.tags?.slice(0, 10).map(t => `\`${t.name}\``).join(' ') || 'None',
                inline: false
            })
            .setFooter({
                text: `${sortModeText} • Page ${searchPage} • Result ${resultIndex + 1}/${totalResults}${item.page_count > 1 ? ` • Image ${mangaPageIndex + 1}/${item.page_count}` : ''} • ID: ${item.id}${shouldTranslate ? ` • "${originalQuery}"` : ''}`
            })
            .setTimestamp(new Date(item.create_date));
    } catch (err) {
        logger.error('PixivContent', `Failed to load image: ${(err as Error).message}`);

        embed
            .setTitle(item.title)
            .setURL(`https://www.pixiv.net/artworks/${item.id}`)
            .setDescription(
                `**Artist:** ${item.user.name}\n` +
                `**Content:** ${typeEmoji} ${typeText}\n` +
                `⚠️ *Image failed to load - click link to view*\n` +
                `**Rating:** ${nsfwStatus}\n` +
                `**Type:** ${aiStatus}`
            )
            .addFields({
                name: '🏷️ Tags',
                value: item.tags?.slice(0, 10).map(t => `\`${t.name}\``).join(' ') || 'None',
                inline: false
            })
            .setFooter({
                text: `${sortModeText} • Search Page ${searchPage} • Result ${resultIndex + 1}/${totalResults} • ID: ${item.id}`
            })
            .setTimestamp(new Date(item.create_date));
    }
}

function createNoResultsEmbed(
    query: string, 
    translatedQuery: string, 
    shouldTranslate: boolean, 
    contentType: 'illust' | 'novel'
): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setColor(0xFF6B6B)
        .setTitle('❌ No Results Found')
        .setDescription(
            `No ${contentType === 'novel' ? 'novels' : 'artwork'} found for: **${translatedQuery}**` +
            (shouldTranslate ? `\n(Translated from: "${query}")` : '')
        )
        .addFields({
            name: '📝 Search Tips',
            value: 
                '• Try Japanese tags (e.g., `巫女` instead of `miko`)\n' +
                '• Add `R-18` to your search for explicit content\n' +
                '• Use artwork ID directly (e.g., `/pixiv query:139155931`)\n' +
                '• Try different sorting options',
            inline: false
        })
        .setFooter({ text: 'Note: Pixiv API results may differ from website results' })
        .setTimestamp();
    
    return embed;
}

function createErrorEmbed(error: Error): EmbedBuilder {
    return new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('❌ Error')
        .setDescription('Failed to fetch content from Pixiv. Please try again later.')
        .addFields({
            name: 'Error Details',
            value: `\`\`\`${error.message}\`\`\``
        })
        .setFooter({ text: 'If this persists, contact the developer' })
        .setTimestamp();
}
// EXPORTS
export {
    createContentEmbed,
    createNoResultsEmbed,
    createErrorEmbed
};

export type {
    PixivItem,
    PixivTag,
    PixivUser,
    ContentEmbedOptions,
    ContentEmbedResult
};
