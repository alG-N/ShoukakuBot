import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { SORT_MODE_TEXT } from './constants.js';
import { buildIllustEmbed, buildNovelEmbed } from './builders.js';
import type {
    PixivItem,
    ContentEmbedOptions,
    ContentEmbedResult,
    PixivContentUser,
    BuildEmbedOptions
} from '../../../types/api/handlers/pixiv-handler.js';
import type { PixivTag } from '../../../types/api/pixiv.js';

export { type PixivItem, type PixivTag, type PixivContentUser, type ContentEmbedOptions, type ContentEmbedResult, type BuildEmbedOptions };

export async function createContentEmbed(
    item: PixivItem | null | undefined,
    options: ContentEmbedOptions = {}
): Promise<ContentEmbedResult> {
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

    const views = item.total_view || 0;
    const bookmarks = item.total_bookmarks || 0;
    const bookmarkRate = views > 0 ? ((bookmarks / views) * 100).toFixed(1) : '0';

    const buildOptions: BuildEmbedOptions = {
        sortModeText,
        nsfwStatus,
        aiStatus,
        searchPage,
        resultIndex,
        totalResults,
        shouldTranslate,
        originalQuery,
        mangaPageIndex,
        views,
        bookmarks,
        bookmarkRate
    };

    if (contentType === 'novel') {
        await buildNovelEmbed(embed, item, buildOptions);
    } else {
        await buildIllustEmbed(embed, item, buildOptions);
    }

    const resultNavRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setLabel('◀ Prev').setCustomId(`pixiv_prev_${cacheKey}`).setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setLabel(`${resultIndex + 1}/${totalResults}`).setCustomId(`pixiv_counter_${cacheKey}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setLabel('Next ▶').setCustomId(`pixiv_next_${cacheKey}`).setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setLabel('Pixiv')
            .setStyle(ButtonStyle.Link)
            .setEmoji('🔗')
            .setURL(contentType === 'novel' ? `https://www.pixiv.net/novel/show.php?id=${item.id}` : `https://www.pixiv.net/artworks/${item.id}`)
    );
    rows.push(resultNavRow);

    if (contentType !== 'novel' && item.page_count > 1) {
        const pageNavRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setLabel('◀ Prev Image').setCustomId(`pixiv_pagedown_${cacheKey}`).setStyle(ButtonStyle.Secondary).setDisabled(mangaPageIndex === 0),
            new ButtonBuilder().setLabel(`Image ${mangaPageIndex + 1}/${item.page_count}`).setCustomId(`pixiv_pagecounter_${cacheKey}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
            new ButtonBuilder().setLabel('Next Image ▶').setCustomId(`pixiv_pageup_${cacheKey}`).setStyle(ButtonStyle.Secondary).setDisabled(mangaPageIndex >= item.page_count - 1)
        );
        rows.push(pageNavRow);
    }

    const searchPageRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setLabel('⏪ Prev Page').setCustomId(`pixiv_searchprev_${cacheKey}`).setStyle(ButtonStyle.Success).setDisabled(searchPage <= 1),
        new ButtonBuilder().setLabel(`Search Page ${searchPage}`).setCustomId(`pixiv_searchpageinfo_${cacheKey}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setLabel('Next Page ⏩').setCustomId(`pixiv_searchnext_${cacheKey}`).setStyle(ButtonStyle.Success).setDisabled(!hasNextPage)
    );
    rows.push(searchPageRow);

    return { embed, rows };
}

export function createNoResultsEmbed(
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

export function createErrorEmbed(error: Error): EmbedBuilder {
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
