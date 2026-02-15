/**
 * Rule34 Post Handler
 * Handles embed creation and UI components for Rule34 posts
 * @module handlers/api/rule34PostHandler
 */

import {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder
} from 'discord.js';

import rule34Service from '../../services/api/rule34Service.js';
import { rule34Cache, UserPreferences as CacheUserPreferences } from '../../repositories/api/rule34Cache.js';
import { truncateText, formatNumber } from '../../utils/common/embed.js';
/**
 * Post rating types
 */
export type PostRating = 'safe' | 'questionable' | 'explicit';

/**
 * Content type enum
 */
export type ContentType = 'video' | 'gif' | 'animated' | 'comic' | 'image';

/**
 * Sort mode options
 */
export type SortMode = 'score:desc' | 'score:asc' | 'id:desc' | 'id:asc' | 'updated:desc' | 'random';

/**
 * Rule34 post structure
 */
export interface Rule34Post {
    id: number;
    rating: PostRating;
    score: number;
    width: number;
    height: number;
    fileUrl: string;
    sampleUrl?: string;
    previewUrl?: string;
    pageUrl: string;
    contentType: ContentType;
    fileExtension: string;
    isAiGenerated?: boolean;
    isAnimated?: boolean;
    hasSound?: boolean;
    hasVideo?: boolean;
    isHighQuality?: boolean;
    isHighRes?: boolean;
    owner?: string;
    source?: string;
    tags?: string[];
    createdAt?: string | Date;
}

/**
 * Search results structure
 */
export interface SearchResults {
    posts: Rule34Post[];
    hasMore: boolean;
    totalCount?: number;
}

/**
 * Post embed options
 */
export interface PostEmbedOptions {
    resultIndex?: number;
    totalResults?: number;
    searchPage?: number;
    query?: string;
    userId?: string;
    showTags?: boolean;
    compactMode?: boolean;
}

/**
 * Search filter options
 */
export interface SearchFilters {
    excludeAi?: boolean;
    rating?: PostRating;
    minScore?: number;
    highQualityOnly?: boolean;
    contentType?: ContentType;
}

/**
 * User preferences (alias from cache)
 */
export type UserPreferences = CacheUserPreferences;

/**
 * Favorite entry
 */
export interface FavoriteEntry {
    id: number;
    score?: number;
    addedAt?: number;
}

/**
 * History entry
 */
export interface HistoryEntry {
    id: number;
    viewedAt: number;
}

/**
 * Related tag entry
 */
export interface RelatedTag {
    tag: string;
    count: number;
}

/**
 * Embed result with components
 */
export interface EmbedResult {
    embed: EmbedBuilder;
    rows: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[];
}
/**
 * Rating colors
 */
export const RATING_COLORS: Record<PostRating | 'default', `#${string}`> = {
    safe: '#00FF00',
    questionable: '#FFD700',
    explicit: '#FF0000',
    default: '#9400D3'
};

/**
 * Rating emojis
 */
export const RATING_EMOJIS: Record<PostRating, string> = {
    safe: '🟢',
    questionable: '🟡',
    explicit: '🔴'
};

/**
 * Content type emojis
 */
export const CONTENT_EMOJIS: Record<ContentType, string> = {
    video: '🎬',
    gif: '🎞️',
    animated: '✨',
    comic: '📖',
    image: '🖼️'
};

/**
 * Sort mode display labels
 */
export const SORT_DISPLAY: Record<SortMode, string> = {
    'score:desc': '⬆️ Score (High to Low)',
    'score:asc': '⬇️ Score (Low to High)',
    'id:desc': '🆕 Newest First',
    'id:asc': '📅 Oldest First',
    'updated:desc': '🔄 Recently Updated',
    'random': '🎲 Random'
};
/**
 * Get time ago string from timestamp
 */
function getTimeAgo(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}
/**
 * Create the main post embed
 */
export async function createPostEmbed(
    post: Rule34Post, 
    options: PostEmbedOptions = {}
): Promise<EmbedResult> {
    const {
        resultIndex = 0,
        totalResults = 1,
        searchPage = 1,
        query = '',
        userId = '',
        showTags = false,
        compactMode = false
    } = options;

    const ratingColor = RATING_COLORS[post.rating] || RATING_COLORS.default;
    const ratingEmoji = RATING_EMOJIS[post.rating] || '❓';
    const contentEmoji = CONTENT_EMOJIS[post.contentType] || '🖼️';

    const embed = new EmbedBuilder()
        .setColor(ratingColor)
        .setTitle(`${contentEmoji} Post #${post.id}`)
        .setURL(post.pageUrl);

    // Build description
    let description = '';

    // Rating and basic info
    description += `${ratingEmoji} **Rating:** ${post.rating?.toUpperCase() || 'Unknown'}\n`;
    description += `⭐ **Score:** ${formatNumber(post.score)}\n`;
    description += `📐 **Dimensions:** ${post.width} × ${post.height}`;
    
    if (post.isHighRes) description += ' 🔷';
    description += '\n';

    // Indicators
    const indicators: string[] = [];
    if (post.isAiGenerated) indicators.push('🤖 AI');
    if (post.isAnimated) indicators.push('✨ Animated');
    if (post.hasSound) indicators.push('🔊 Sound');
    if (post.hasVideo) indicators.push('🎬 Video');
    if (post.isHighQuality) indicators.push('💎 HQ');
    
    if (indicators.length > 0) {
        description += indicators.join(' • ') + '\n';
    }

    // Owner/uploader
    if (post.owner) {
        description += `👤 **Uploader:** ${post.owner}\n`;
    }

    // Upload date
    if (post.createdAt) {
        const uploadDate = new Date(post.createdAt);
        const uploadTimestamp = Math.floor(uploadDate.getTime() / 1000);
        description += `📅 **Uploaded:** <t:${uploadTimestamp}:R> (<t:${uploadTimestamp}:D>)\n`;
    }

    // Source
    if (post.source && post.source.length > 0) {
        const sourceUrl = post.source.startsWith('http') ? post.source : 'https://' + post.source;
        description += `🔗 **Source:** [Link](${sourceUrl})\n`;
    }

    embed.setDescription(description);

    // Tags field (optional, for expanded view)
    if (showTags && post.tags) {
        const formattedTags = rule34Service.formatTagsForDisplay?.(post.tags, 1000) || post.tags.slice(0, 20).join(', ');
        embed.addFields({ name: '🏷️ Tags', value: formattedTags || 'No tags', inline: false });
    }

    // Set image (use sample for large files)
    const imageUrl = post.hasVideo ? post.previewUrl : (post.sampleUrl || post.fileUrl);
    if (imageUrl && !post.hasVideo) {
        embed.setImage(imageUrl);
    } else if (post.previewUrl) {
        embed.setThumbnail(post.previewUrl);
    }

    // Footer with navigation info
    const footerParts: string[] = [];
    footerParts.push(`Result ${resultIndex + 1}/${totalResults}`);
    if (searchPage > 1) footerParts.push(`Page ${searchPage}`);
    footerParts.push(`File: .${post.fileExtension}`);
    
    embed.setFooter({ text: footerParts.join(' • ') });
    embed.setTimestamp(post.createdAt ? new Date(post.createdAt) : new Date());

    // Create buttons
    const rows = createPostButtons(post, { resultIndex, totalResults, userId, searchPage });

    return { embed, rows };
}

/**
 * Create navigation and action buttons
 */
export function createPostButtons(
    post: Rule34Post, 
    options: PostEmbedOptions = {}
): ActionRowBuilder<ButtonBuilder>[] {
    const { resultIndex = 0, totalResults = 1, userId = '', searchPage = 1 } = options;
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];

    // Row 1: Navigation buttons
    const navRow = new ActionRowBuilder<ButtonBuilder>();
    
    navRow.addComponents(
        new ButtonBuilder()
            .setCustomId(`rule34_prev_${userId}`)
            .setLabel('◀')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(resultIndex === 0 && searchPage === 1),
        new ButtonBuilder()
            .setCustomId(`rule34_counter_${userId}`)
            .setLabel(`${resultIndex + 1}/${totalResults}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`rule34_next_${userId}`)
            .setLabel('▶')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(resultIndex >= totalResults - 1),
        new ButtonBuilder()
            .setCustomId(`rule34_random_${userId}`)
            .setLabel('🎲 Random')
            .setStyle(ButtonStyle.Secondary)
    );
    rows.push(navRow);

    // Row 2: Action buttons
    const actionRow = new ActionRowBuilder<ButtonBuilder>();
    
    // Full image link
    actionRow.addComponents(
        new ButtonBuilder()
            .setLabel('Full Image')
            .setStyle(ButtonStyle.Link)
            .setURL(post.fileUrl)
    );
    
    // View on site
    actionRow.addComponents(
        new ButtonBuilder()
            .setLabel('View on Site')
            .setStyle(ButtonStyle.Link)
            .setURL(post.pageUrl)
    );
    
    // Favorite button
    const isFavorited = rule34Cache.isFavorited(userId, post.id);
    actionRow.addComponents(
        new ButtonBuilder()
            .setCustomId(`rule34_fav_${post.id}_${userId}`)
            .setLabel(isFavorited ? '💔' : '❤️')
            .setStyle(isFavorited ? ButtonStyle.Danger : ButtonStyle.Secondary)
    );
    
    // Tags toggle
    actionRow.addComponents(
        new ButtonBuilder()
            .setCustomId(`rule34_tags_${userId}`)
            .setLabel('🏷️')
            .setStyle(ButtonStyle.Secondary)
    );
    
    rows.push(actionRow);

    // Row 3: Page navigation (if needed)
    const pageRow = new ActionRowBuilder<ButtonBuilder>();
    
    pageRow.addComponents(
        new ButtonBuilder()
            .setCustomId(`rule34_prevpage_${userId}`)
            .setLabel('⏮ Prev Page')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(searchPage <= 1),
        new ButtonBuilder()
            .setCustomId(`rule34_pageinfo_${userId}`)
            .setLabel(`Page ${searchPage}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`rule34_nextpage_${userId}`)
            .setLabel('Next Page ⏭')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`rule34_related_${userId}`)
            .setLabel('🔗 Related')
            .setStyle(ButtonStyle.Secondary)
    );
    rows.push(pageRow);

    return rows;
}

/**
 * Create video embed (for .mp4/.webm content)
 */
export function createVideoEmbed(
    post: Rule34Post, 
    options: PostEmbedOptions = {}
): EmbedResult {
    const { resultIndex = 0, totalResults = 1, userId = '' } = options;
    
    const ratingEmoji = RATING_EMOJIS[post.rating] || '❓';
    
    const embed = new EmbedBuilder()
        .setColor(RATING_COLORS[post.rating] || RATING_COLORS.default)
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

    // Create buttons with video-specific options
    const rows = createPostButtons(post, options);
    
    // Add video button to first action row
    const videoButton = new ButtonBuilder()
        .setLabel('▶️ Watch Video')
        .setStyle(ButtonStyle.Link)
        .setURL(post.fileUrl);
    
    // Insert at the beginning of action row
    if (rows[1]) {
        rows[1].components.unshift(videoButton);
        // Keep only 5 buttons max per row
        if (rows[1].components.length > 5) {
            rows[1].components.pop();
        }
    }

    return { embed, rows };
}

/**
 * Create search results summary embed
 */
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

    // Active filters
    const activeFilters: string[] = [];
    if (filters.excludeAi) activeFilters.push('🤖 AI Excluded');
    if (filters.rating) activeFilters.push(`${RATING_EMOJIS[filters.rating]} ${filters.rating} only`);
    if (filters.minScore && filters.minScore > 0) activeFilters.push(`⭐ Score ≥${filters.minScore}`);
    if (filters.highQualityOnly) activeFilters.push('💎 HQ Only');
    if (filters.contentType) activeFilters.push(`📁 ${filters.contentType} only`);
    
    if (activeFilters.length > 0) {
        embed.addFields({ name: '⚙️ Active Filters', value: activeFilters.join(' • '), inline: false });
    }

    // Stats
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

/**
 * Create no results embed
 */
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

/**
 * Create error embed
 */
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

/**
 * Create blacklist management embed
 */
export function createBlacklistEmbed(userId: string, blacklist: string[]): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setColor('#2F3136')
        .setTitle('🚫 Your Blacklist')
        .setDescription(
            blacklist.length > 0
                ? `You have **${blacklist.length}** blacklisted tag${blacklist.length > 1 ? 's' : ''}:`
                : '📭 Your blacklist is empty.\n\nUse `/rule34 blacklist add <tags>` to add tags you want to filter out.'
        );

    if (blacklist.length > 0) {
        // Split tags into chunks for better display
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

    // Suggested tags
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

/**
 * Create favorites embed
 */
export function createFavoritesEmbed(
    userId: string, 
    favorites: FavoriteEntry[], 
    page: number = 0
): EmbedBuilder {
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

/**
 * Create settings embed
 */
export function createSettingsEmbed(userId: string): EmbedBuilder {
    const prefs: UserPreferences = rule34Cache.getPreferences(userId) || {};
    const blacklist: string[] = rule34Cache.getBlacklist(userId) || [];
    
    const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('⚙️ Rule34 Settings')
        .setDescription('Configure your search preferences using the menus below.\nSettings are saved automatically.');

    // Current settings display
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

    embed.addFields(
        { name: '📋 Current Settings', value: settingsText, inline: false }
    );

    // Tips
    embed.setFooter({ text: '💡 Tip: Use /rule34 blacklist to manage blocked tags' });

    return embed;
}

/**
 * Create settings select menu
 */
export function createSettingsComponents(
    userId: string
): ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] {
    const prefs: UserPreferences = rule34Cache.getPreferences(userId) || {};
    const rows: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];

    // AI Filter toggle
    const row1 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`rule34_setting_aifilter_${userId}`)
            .setPlaceholder('🤖 AI Content Filter')
            .addOptions([
                { 
                    label: 'Hide AI Content', 
                    description: 'Filter out AI-generated posts',
                    value: 'true', 
                    emoji: '🚫', 
                    default: !!prefs.aiFilter 
                },
                { 
                    label: 'Show AI Content', 
                    description: 'Include AI-generated posts',
                    value: 'false', 
                    emoji: '✅', 
                    default: !prefs.aiFilter 
                }
            ])
    );
    rows.push(row1);

    // Sort mode
    const row2 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`rule34_setting_sort_${userId}`)
            .setPlaceholder('📑 Default Sort Order')
            .addOptions([
                { 
                    label: 'Score (High to Low)', 
                    description: 'Best rated posts first',
                    value: 'score:desc', 
                    emoji: '⬆️', 
                    default: prefs.sortMode === 'score:desc' 
                },
                { 
                    label: 'Score (Low to High)', 
                    description: 'Lowest rated posts first',
                    value: 'score:asc', 
                    emoji: '⬇️', 
                    default: prefs.sortMode === 'score:asc' 
                },
                { 
                    label: 'Newest First', 
                    description: 'Most recent posts first',
                    value: 'id:desc', 
                    emoji: '🆕', 
                    default: prefs.sortMode === 'id:desc' 
                },
                { 
                    label: 'Oldest First', 
                    description: 'Oldest posts first',
                    value: 'id:asc', 
                    emoji: '📅', 
                    default: prefs.sortMode === 'id:asc' 
                },
                { 
                    label: 'Random', 
                    description: 'Randomize results',
                    value: 'random', 
                    emoji: '🎲', 
                    default: prefs.sortMode === 'random' 
                }
            ])
    );
    rows.push(row2);

    // Quality settings
    const row3 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`rule34_setting_quality_${userId}`)
            .setPlaceholder('📊 Quality Filter')
            .addOptions([
                { 
                    label: 'Show All Quality', 
                    description: 'No quality filtering',
                    value: 'all', 
                    emoji: '⚪',
                    default: !prefs.excludeLowQuality && !prefs.highQualityOnly
                },
                { 
                    label: 'Exclude Low Quality', 
                    description: 'Hide low resolution posts',
                    value: 'exclude_low', 
                    emoji: '🔶', 
                    default: !!prefs.excludeLowQuality 
                },
                { 
                    label: 'High Quality Only', 
                    description: 'Only show HD posts',
                    value: 'high_only', 
                    emoji: '🔷', 
                    default: !!prefs.highQualityOnly 
                }
            ])
    );
    rows.push(row3);

    // Min score
    const row4 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`rule34_setting_minscore_${userId}`)
            .setPlaceholder('⭐ Minimum Score')
            .addOptions([
                { label: 'No Minimum', description: 'Show all posts regardless of score', value: '0', emoji: '0️⃣', default: prefs.minScore === 0 || !prefs.minScore },
                { label: 'Score ≥ 10', description: 'Filter very low scored posts', value: '10', emoji: '🔟', default: prefs.minScore === 10 },
                { label: 'Score ≥ 50', description: 'Only decent posts', value: '50', default: prefs.minScore === 50 },
                { label: 'Score ≥ 100', description: 'Only good posts', value: '100', emoji: '💯', default: prefs.minScore === 100 },
                { label: 'Score ≥ 500', description: 'Only popular posts', value: '500', emoji: '🔥', default: prefs.minScore === 500 },
                { label: 'Score ≥ 1000', description: 'Only top posts', value: '1000', emoji: '⭐', default: prefs.minScore === 1000 }
            ])
    );
    rows.push(row4);

    // Buttons row
    const row5 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`rule34_settings_reset_${userId}`)
            .setLabel('Reset All')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🔄'),
        new ButtonBuilder()
            .setCustomId(`rule34_settings_close_${userId}`)
            .setLabel('Done')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅')
    );
    rows.push(row5);

    return rows;
}

/**
 * Create related tags embed
 */
export function createRelatedTagsEmbed(originalTag: string, relatedTags: RelatedTag[]): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle(`🔗 Tags Related to "${originalTag}"`)
        .setDescription(
            relatedTags.length > 0
                ? relatedTags.map(({ tag, count }) => 
                    `\`${tag}\` (${count} posts)`
                  ).join('\n')
                : 'No related tags found.'
        );

    return embed;
}

/**
 * Create history embed
 */
export function createHistoryEmbed(userId: string, history: HistoryEntry[]): EmbedBuilder {
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

/**
 * Create auto-play notification embed (utility function from original)
 */
export function createAutoPlayEmbed(track: { info?: { title?: string }; title?: string }): EmbedBuilder {
    return new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('🔄 Auto-Play')
        .setDescription(`Now playing: **${track?.info?.title || track?.title || 'Unknown'}**`)
        .setFooter({ text: 'Auto-play found a similar track' });
}

// Default export for backward compatibility
export default {
    createPostEmbed,
    createVideoEmbed,
    createPostButtons,
    createSearchSummaryEmbed,
    createNoResultsEmbed,
    createErrorEmbed,
    createBlacklistEmbed,
    createFavoritesEmbed,
    createSettingsEmbed,
    createSettingsComponents,
    createRelatedTagsEmbed,
    createHistoryEmbed,
    createAutoPlayEmbed,
    RATING_COLORS,
    RATING_EMOJIS,
    CONTENT_EMOJIS,
    SORT_DISPLAY
};
