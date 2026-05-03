import { EmbedBuilder } from 'discord.js';
import logger from '../../../core/observability/Logger.js';
import pixivService from '../../../services/api/pixivService.js';
import type { BuildEmbedOptions, PixivItem } from '../../../types/api/pixiv/handler.js';

export async function buildNovelEmbed(embed: EmbedBuilder, item: PixivItem, options: BuildEmbedOptions): Promise<void> {
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

export async function buildIllustEmbed(embed: EmbedBuilder, item: PixivItem, options: BuildEmbedOptions): Promise<void> {
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
