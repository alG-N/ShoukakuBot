import { EmbedBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import rule34Service from '../../../services/api/rule34Service.js';
import { rule34Cache } from '../../../repositories/api/rule34Cache.js';
import { formatNumber } from '../../../utils/common/embed.js';
import { CONTENT_EMOJIS, RATING_COLORS, RATING_EMOJIS, SORT_DISPLAY } from './constants.js';
import { createPostButtons } from './buttons.js';
import { getTimeAgo } from './utils.js';
import type {
    EmbedResult,
    FavoriteEntry,
    PostEmbedOptions,
    PostRating,
    RelatedTag,
    Rule34HandlerPreferences,
    Rule34HistoryEntry,
    Rule34Post,
    SearchFilters,
    SearchResults,
    SortMode
} from './types.js';

export async function createPostEmbed(post: Rule34Post, options: PostEmbedOptions = {}): Promise<EmbedResult> {
    const {
        resultIndex = 0,
        totalResults = 1,
        searchPage = 1,
        userId = '',
        showTags = false
    } = options;

    const postRating = post.rating as PostRating;
    const ratingColor = RATING_COLORS[postRating] || RATING_COLORS.default;
    const ratingEmoji = RATING_EMOJIS[postRating] || '❓';
    const contentEmoji = CONTENT_EMOJIS[post.contentType] || '🖼️';

    const embed = new EmbedBuilder()
        .setColor(ratingColor)
        .setTitle(`${contentEmoji} Post #${post.id}`)
        .setURL(post.pageUrl);

    let description = '';
    description += `${ratingEmoji} **Rating:** ${post.rating?.toUpperCase() || 'Unknown'}\n`;
    description += `⭐ **Score:** ${formatNumber(post.score)}\n`;
    description += `📐 **Dimensions:** ${post.width} × ${post.height}`;

    if (post.isHighRes) description += ' 🔷';
    description += '\n';

    const indicators: string[] = [];
    if (post.isAiGenerated) indicators.push('🤖 AI');
    if (post.isAnimated) indicators.push('✨ Animated');
    if (post.hasSound) indicators.push('🔊 Sound');
    if (post.hasVideo) indicators.push('🎬 Video');
    if (post.isHighQuality) indicators.push('💎 HQ');

    if (indicators.length > 0) {
        description += indicators.join(' • ') + '\n';
    }

    if (post.owner) {
        description += `👤 **Uploader:** ${post.owner}\n`;
    }

    if (post.createdAt) {
        const uploadDate = new Date(post.createdAt);
        const uploadTimestamp = Math.floor(uploadDate.getTime() / 1000);
        description += `📅 **Uploaded:** <t:${uploadTimestamp}:R> (<t:${uploadTimestamp}:D>)\n`;
    }

    if (post.source && post.source.length > 0) {
        const sourceUrl = post.source.startsWith('http') ? post.source : 'https://' + post.source;
        description += `🔗 **Source:** [Link](${sourceUrl})\n`;
    }

    embed.setDescription(description);

    if (showTags && post.tagList?.length) {
        const formattedTags = rule34Service.formatTagsForDisplay?.(post.tagList, 1000) || post.tagList.slice(0, 20).join(', ');
        embed.addFields({ name: '🏷️ Tags', value: formattedTags || 'No tags', inline: false });
    }

    const imageUrl = post.hasVideo ? post.previewUrl : (post.sampleUrl || post.fileUrl);
    if (imageUrl && !post.hasVideo) {
        embed.setImage(imageUrl);
    } else if (post.previewUrl) {
        embed.setThumbnail(post.previewUrl);
    }

    const footerParts: string[] = [];
    footerParts.push(`Result ${resultIndex + 1}/${totalResults}`);
    if (searchPage > 1) footerParts.push(`Page ${searchPage}`);
    footerParts.push(`File: .${post.fileExtension}`);

    embed.setFooter({ text: footerParts.join(' • ') });
    embed.setTimestamp(post.createdAt ? new Date(post.createdAt) : new Date());

    const rows = createPostButtons(post, { resultIndex, totalResults, userId, searchPage });
    return { embed, rows };
}

export function createVideoEmbed(post: Rule34Post, options: PostEmbedOptions = {}): EmbedResult {
    const { resultIndex = 0, totalResults = 1 } = options;

    const postRating = post.rating as PostRating;
    const ratingEmoji = RATING_EMOJIS[postRating] || '❓';

    const embed = new EmbedBuilder()
        .setColor(RATING_COLORS[postRating] || RATING_COLORS.default)
        .setTitle(`🎬 Video Post #${post.id}`)
        .setURL(post.pageUrl)
        .setDescription(
            `${ratingEmoji} **Rating:** ${post.rating?.toUpperCase()}\n` +
            `⭐ **Score:** ${formatNumber(post.score)}\n` +
            `📐 **Dimensions:** ${post.width} × ${post.height}\n` +
            `${post.hasSound ? '🔊 Has Sound' : '🔇 No Sound'}\n\n` +
            `📹 **Videos cannot be embedded directly.**\n` +
            `Click the button below to watch.`
        );

    if (post.previewUrl) {
        embed.setImage(post.previewUrl);
    }

    embed.setFooter({ text: `Result ${resultIndex + 1}/${totalResults} • File: .${post.fileExtension}` });

    const rows = createPostButtons(post, options);
    const videoButton = new ButtonBuilder()
        .setLabel('▶️ Watch Video')
        .setStyle(ButtonStyle.Link)
        .setURL(post.fileUrl);

    if (rows[1]) {
        rows[1].components.unshift(videoButton);
        if (rows[1].components.length > 5) {
            rows[1].components.pop();
        }
    }

    return { embed, rows };
}

export function createSearchSummaryEmbed(
    results: SearchResults,
    query: string,
    options: { page?: number; filters?: SearchFilters } = {}
): EmbedBuilder {
    const { page = 1, filters = {} } = options;

    const embed = new EmbedBuilder()
        .setColor('#9400D3')
        .setTitle('🔍 Rule34 Search Results')
        .setDescription(
            `**Query:** \`${query || 'all'}\`\n` +
            `**Results Found:** ${results.posts.length}${results.hasMore ? '+' : ''}\n` +
            `**Page:** ${page}`
        );

    const activeFilters: string[] = [];
    if (filters.excludeAi) activeFilters.push('🤖 AI Excluded');
    if (filters.rating) activeFilters.push(`${RATING_EMOJIS[filters.rating]} ${filters.rating} only`);
    if (filters.minScore && filters.minScore > 0) activeFilters.push(`⭐ Score ≥${filters.minScore}`);
    if (filters.highQualityOnly) activeFilters.push('💎 HQ Only');
    if (filters.contentType) activeFilters.push(`📁 ${filters.contentType} only`);

    if (activeFilters.length > 0) {
        embed.addFields({ name: '⚙️ Active Filters', value: activeFilters.join(' • '), inline: false });
    }

    const stats: string[] = [];
    const aiCount = results.posts.filter(p => p.isAiGenerated).length;
    const videoCount = results.posts.filter(p => p.hasVideo).length;
    const animatedCount = results.posts.filter(p => p.isAnimated).length;

    if (aiCount > 0) stats.push(`🤖 ${aiCount} AI`);
    if (videoCount > 0) stats.push(`🎬 ${videoCount} Videos`);
    if (animatedCount > 0) stats.push(`✨ ${animatedCount} Animated`);

    if (stats.length > 0) {
        embed.addFields({ name: '📊 Content Stats', value: stats.join(' • '), inline: false });
    }

    return embed;
}

export function createNoResultsEmbed(query: string, suggestions: string[] = []): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setColor('#FF6B6B')
        .setTitle('❌ No Results Found')
        .setDescription(
            `No posts found for: \`${query || 'your search'}\`\n\n` +
            '**Tips:**\n' +
            '• Check spelling and try alternative tags\n' +
            '• Use underscores instead of spaces (e.g., `blue_eyes`)\n' +
            '• Try broader or fewer tags\n' +
            '• Use the wildcard `*` for partial matches'
        );

    if (suggestions.length > 0) {
        embed.addFields({
            name: '💡 Did you mean?',
            value: suggestions.slice(0, 5).map(s => `\`${s}\``).join(', '),
            inline: false
        });
    }

    return embed;
}

export function createErrorEmbed(error: Error | { message?: string }, details: string = ''): EmbedBuilder {
    return new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('❌ Error')
        .setDescription(
            `An error occurred: ${error.message || 'Unknown error'}\n` +
            (details ? `\n${details}` : '') +
            '\n\nPlease try again later.'
        )
        .setTimestamp();
}

export function createBlacklistEmbed(_userId: string, blacklist: string[]): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setColor('#2F3136')
        .setTitle('🚫 Your Blacklist')
        .setDescription(
            blacklist.length > 0
                ? `You have **${blacklist.length}** blacklisted tag${blacklist.length > 1 ? 's' : ''}:`
                : '📭 Your blacklist is empty.\n\nUse `/rule34 blacklist add <tags>` to add tags you want to filter out.'
        );

    if (blacklist.length > 0) {
        const tagDisplay = blacklist.map(t => `\`${t}\``).join(' ');
        embed.addFields({
            name: '🏷️ Blocked Tags',
            value: tagDisplay.length > 1024 ? tagDisplay.slice(0, 1020) + '...' : tagDisplay,
            inline: false
        });

        embed.addFields({
            name: '📝 Commands',
            value:
                '• `/rule34 blacklist add <tags>` - Add more tags\n' +
                '• `/rule34 blacklist remove <tags>` - Remove tags\n' +
                '• `/rule34 blacklist clear` - Clear all tags',
            inline: false
        });
    }

    const suggestions = rule34Service.getBlacklistSuggestions?.()?.slice(0, 10) || [];
    if (suggestions.length > 0) {
        embed.addFields({
            name: '💡 Suggested Tags to Blacklist',
            value: suggestions.map((t: string) => `\`${t}\``).join(' '),
            inline: false
        });
    }

    embed.setFooter({ text: '💡 Blacklisted tags are automatically filtered from all searches' });
    return embed;
}

export function createFavoritesEmbed(_userId: string, favorites: FavoriteEntry[], page: number = 0): EmbedBuilder {
    const perPage = 10;
    const totalPages = Math.ceil(favorites.length / perPage);
    const start = page * perPage;
    const pageFavorites = favorites.slice(start, start + perPage);

    const embed = new EmbedBuilder()
        .setColor('#FF69B4')
        .setTitle('💖 Your Favorites')
        .setDescription(
            favorites.length > 0
                ? `You have **${favorites.length}** favorited posts.`
                : '📭 No favorites yet.\n\nClick the ❤️ button on any post to add it to your favorites!'
        );

    if (pageFavorites.length > 0) {
        const list = pageFavorites.map((fav, i) =>
            `**${start + i + 1}.** [Post #${fav.id}](https://rule34.xxx/index.php?page=post&s=view&id=${fav.id})` +
            (fav.score ? ` ⭐${fav.score}` : '')
        ).join('\n');

        embed.addFields({ name: `Page ${page + 1}/${totalPages}`, value: list, inline: false });
    }

    embed.setFooter({ text: `Page ${page + 1} of ${totalPages || 1}` });
    return embed;
}

export function createSettingsEmbed(userId: string): EmbedBuilder {
    const prefs: Rule34HandlerPreferences = rule34Cache.getPreferences(userId) || {};
    const blacklist: string[] = rule34Cache.getBlacklist(userId) || [];

    const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('⚙️ Rule34 Settings')
        .setDescription('Configure your search preferences using the menus below.\nSettings are saved automatically.');

    const aiStatus = prefs.aiFilter ? '✅ Hidden' : '❌ Shown';
    const qualityStatus = prefs.highQualityOnly
        ? '🔷 High Only'
        : (prefs.excludeLowQuality ? '🔶 No Low' : '⚪ All');
    const sortDisplay = SORT_DISPLAY[prefs.sortMode as SortMode] || prefs.sortMode || 'score:desc';

    const settingsText = [
        `🤖 **AI Content:** ${aiStatus}`,
        `⭐ **Min Score:** ${prefs.minScore || 0}`,
        `📊 **Quality:** ${qualityStatus}`,
        `📑 **Sort:** ${sortDisplay}`,
        `🚫 **Blacklist:** ${blacklist.length} tags`
    ].join('\n');

    embed.addFields({ name: '📋 Current Settings', value: settingsText, inline: false });
    embed.setFooter({ text: '💡 Tip: Use /rule34 blacklist to manage blocked tags' });

    return embed;
}

export function createRelatedTagsEmbed(originalTag: string, relatedTags: RelatedTag[]): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle(`🔗 Tags Related to "${originalTag}"`)
        .setDescription(
            relatedTags.length > 0
                ? relatedTags.map(({ tag, count }) => `\`${tag}\` (${count} posts)`).join('\n')
                : 'No related tags found.'
        );

    return embed;
}

export function createHistoryEmbed(_userId: string, history: Rule34HistoryEntry[]): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setColor('#9B59B6')
        .setTitle('📜 Your View History')
        .setDescription(
            history.length > 0
                ? `Your last **${history.length}** viewed posts:`
                : '📭 No view history yet.'
        );

    if (history.length > 0) {
        const list = history.slice(0, 15).map((item, i) => {
            const timeAgo = getTimeAgo(item.viewedAt);
            return `**${i + 1}.** [Post #${item.id}](https://rule34.xxx/index.php?page=post&s=view&id=${item.id}) - ${timeAgo}`;
        }).join('\n');

        embed.addFields({ name: 'Recent Views', value: list, inline: false });
    }

    return embed;
}

export function createAutoPlayEmbed(track: { info?: { title?: string }; title?: string }): EmbedBuilder {
    return new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('🔄 Auto-Play')
        .setDescription(`Now playing: **${track?.info?.title || track?.title || 'Unknown'}**`)
        .setFooter({ text: 'Auto-play found a similar track' });
}
