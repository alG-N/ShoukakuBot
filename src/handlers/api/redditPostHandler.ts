/**
 * Reddit Post Handler
 * Creates embeds and buttons for Reddit post listings
 * @module handlers/api/redditPostHandler
 */

import { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    ChatInputCommandInteraction,
    ButtonInteraction
} from 'discord.js';
import { formatNumber, truncateText } from '../../utils/common/embed.js';
import redditCache from '../../repositories/api/redditCache.js';
// TYPES & INTERFACES
interface RedditPost {
    title: string;
    author: string;
    permalink: string;
    url?: string;
    upvotes?: number;
    ups?: number;
    comments?: number;
    num_comments?: number;
    awards?: number;
    nsfw?: boolean;
    over_18?: boolean;
    created?: number;
    contentType?: 'video' | 'gallery' | 'image' | 'text' | 'gif';
    selftext?: string;
    image?: string;
    thumbnail?: string;
    video?: string;
    gallery?: string[];
}

type SortType = 'hot' | 'best' | 'top' | 'new' | 'rising';

interface SortConfigItem {
    emoji: string;
    name: string;
}
// CONSTANTS
const POSTS_PER_PAGE = 5;

const SORT_CONFIG: Record<SortType, SortConfigItem> = {
    hot: { emoji: '🔥', name: 'Hot' },
    best: { emoji: '⭐', name: 'Best' },
    top: { emoji: '🏆', name: 'Top' },
    new: { emoji: '🆕', name: 'New' },
    rising: { emoji: '📈', name: 'Rising' }
};

const CONTENT_ICONS: Record<string, string> = {
    video: '🎥',
    gallery: '🖼️',
    image: '📷',
    gif: '🎬',
    text: '📝'
};
// EMBED CREATORS
function createPostListEmbed(
    subreddit: string, 
    posts: RedditPost[], 
    sortBy: SortType, 
    currentPage: number
): EmbedBuilder {
    const totalPosts = posts.length;
    const totalPages = Math.ceil(totalPosts / POSTS_PER_PAGE);

    const startIdx = currentPage * POSTS_PER_PAGE;
    const endIdx = Math.min(startIdx + POSTS_PER_PAGE, totalPosts);
    const pagePosts = posts.slice(startIdx, endIdx);

    const { emoji, name } = SORT_CONFIG[sortBy] || SORT_CONFIG.top;

    const embed = new EmbedBuilder()
        .setTitle(`${emoji} ${name} Posts from r/${subreddit}`)
        .setDescription(`Showing posts ${startIdx + 1}-${endIdx} of ${totalPosts}\nSelect a post below to view full details!`)
        .setColor(0xFF4500)
        .setFooter({ text: `Powered by FumoBOT • Reddit API • Page ${currentPage + 1}/${totalPages}` })
        .setTimestamp();

    pagePosts.forEach((post, idx) => {
        const globalIndex = startIdx + idx;
        const contentIcon = CONTENT_ICONS[post.contentType || 'text'] || CONTENT_ICONS.text;
        const nsfwTag = post.nsfw ? '🔞 ' : '';

        const title = `${globalIndex + 1}. ${nsfwTag}${contentIcon} ${post.title.slice(0, 80)}${post.title.length > 80 ? '...' : ''}`;
        const value = `👍 ${formatNumber(post.upvotes || post.ups || 0)} | 💬 ${formatNumber(post.comments || post.num_comments || 0)} | 🏆 ${post.awards || 0}\n[View on Reddit](${post.permalink})`;

        embed.addFields({ name: title, value, inline: false });
    });

    return embed;
}

function createPostButtons(postCount: number, startIdx: number, userId: string): ActionRowBuilder<ButtonBuilder>[] {
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    const row = new ActionRowBuilder<ButtonBuilder>();

    for (let i = 0; i < Math.min(postCount, 5); i++) {
        const globalIndex = startIdx + i;
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`reddit_show_${globalIndex}_${userId}`)
                .setLabel(`Post ${globalIndex + 1}`)
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📖')
        );
    }

    rows.push(row);
    return rows;
}

function createPaginationButtons(
    currentPage: number, 
    totalPages: number, 
    userId: string
): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`reddit_prev_${userId}`)
            .setLabel('◀️ Previous')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage === 0),
        new ButtonBuilder()
            .setCustomId(`reddit_pageinfo_${userId}`)
            .setLabel(`Page ${currentPage + 1}/${totalPages}`)
            .setStyle(ButtonStyle.Success)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`reddit_next_${userId}`)
            .setLabel('Next ▶️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage === totalPages - 1)
    );
}

function createGalleryButtons(
    currentPage: number, 
    totalPages: number, 
    postIndex: number, 
    userId: string
): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`reddit_gprev_${postIndex}_${userId}`)
            .setLabel('Previous')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('◀️')
            .setDisabled(currentPage === 0),
        new ButtonBuilder()
            .setCustomId(`reddit_gpage_${postIndex}_${userId}`)
            .setLabel(`${currentPage + 1}/${totalPages}`)
            .setStyle(ButtonStyle.Success)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`reddit_gnext_${postIndex}_${userId}`)
            .setLabel('Next')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('▶️')
            .setDisabled(currentPage === totalPages - 1),
        new ButtonBuilder()
            .setCustomId(`reddit_gclose_${postIndex}_${userId}`)
            .setLabel('Back')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🔙')
    );
}

function createBackButton(userId: string): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`reddit_back_${userId}`)
            .setLabel('Back to Posts')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🔙')
    );
}

/**
 * Create a single post embed (for browse/trending commands)
 */
function createPostEmbed(post: RedditPost, subreddit: string): EmbedBuilder {
    const contentIcon = CONTENT_ICONS[post.contentType || 'text'] || CONTENT_ICONS.text;
    const nsfwTag = post.over_18 || post.nsfw ? '🔞 ' : '';
    
    const embed = new EmbedBuilder()
        .setTitle(`${nsfwTag}${contentIcon} ${truncateText(post.title, 200)}`)
        .setURL(post.permalink || `https://reddit.com${post.url}`)
        .setColor(0xFF4500)
        .setAuthor({ name: `Posted by u/${post.author}` })
        .setFooter({ text: `r/${subreddit} • 👍 ${formatNumber(post.upvotes || post.ups || 0)} • 💬 ${formatNumber(post.comments || post.num_comments || 0)}` })
        .setTimestamp(post.created ? new Date(post.created * 1000) : null);
    
    // Add description if text post
    if (post.selftext?.trim()) {
        embed.setDescription(truncateText(post.selftext, 500));
    }
    
    // Add image if available
    if (post.image || post.thumbnail) {
        const imageUrl = post.image || (post.thumbnail?.startsWith('http') ? post.thumbnail : null);
        if (imageUrl && !imageUrl.includes('self') && !imageUrl.includes('default')) {
            embed.setImage(imageUrl);
        }
    }
    
    return embed;
}
// INTERACTION HANDLERS
async function sendPostListEmbed(
    interaction: ChatInputCommandInteraction, 
    subreddit: string, 
    posts: RedditPost[], 
    sortBy: SortType, 
    currentPage: number, 
    isNsfwChannel: boolean = false
): Promise<void> {
    const totalPages = Math.ceil(posts.length / POSTS_PER_PAGE);
    const startIdx = currentPage * POSTS_PER_PAGE;
    const pagePosts = posts.slice(startIdx, startIdx + POSTS_PER_PAGE);

    const embed = createPostListEmbed(subreddit, posts, sortBy, currentPage);
    
    // Add NSFW filter notice if not in NSFW channel
    if (!isNsfwChannel) {
        const currentDesc = embed.data.description || '';
        embed.setDescription(currentDesc + '\n\n*🔒 NSFW posts are hidden. Use an age-restricted channel to view all posts.*');
    }
    
    const components: ActionRowBuilder<ButtonBuilder>[] = [
        ...createPostButtons(pagePosts.length, startIdx, interaction.user.id)
    ];

    if (totalPages > 1) {
        components.push(createPaginationButtons(currentPage, totalPages, interaction.user.id));
    }

    await interaction.editReply({ embeds: [embed], components });
}

async function showPostDetails(
    interaction: ChatInputCommandInteraction | ButtonInteraction, 
    post: RedditPost, 
    postIndex: number, 
    userId: string
): Promise<void> {
    const subreddit = post.permalink.split('/')[4];

    const embed = new EmbedBuilder()
        .setTitle(post.title)
        .setURL(post.permalink)
        .setColor(0xFF4500)
        .setAuthor({ name: `Posted by u/${post.author}` })
        .setFooter({ text: `r/${subreddit}${post.nsfw ? ' • NSFW' : ''}` })
        .setTimestamp(post.created ? new Date(post.created * 1000) : null);

    const statsField = {
        name: '📊 Statistics',
        value: `👍 ${formatNumber(post.upvotes || 0)} upvotes\n💬 ${formatNumber(post.comments || 0)} comments\n🏆 ${post.awards || 0} awards`,
        inline: true
    };

    const components: ActionRowBuilder<ButtonBuilder>[] = [createBackButton(userId)];

    switch (post.contentType) {
        case 'video':
            embed.addFields(
                statsField,
                {
                    name: '🎥 Reddit Video',
                    value: `[▶️ Watch Video](${post.video})\n*Note: Discord doesn't embed Reddit videos directly.*`,
                    inline: true
                }
            );
            if (post.image) embed.setImage(post.image);
            break;

        case 'gif':
            if (post.image) {
                embed.setImage(post.image);
            }
            embed.addFields(
                statsField,
                {
                    name: '🎬 GIF',
                    value: post.url && post.url !== post.permalink ? `[🔗 View Original](${post.url})` : 'Animated GIF',
                    inline: true
                }
            );
            break;

        case 'gallery':
            if (post.gallery && post.gallery.length > 0) {
                const galleryPage = redditCache.getGalleryPage(userId, postIndex);
                embed.setImage(post.gallery[galleryPage]);
                embed.addFields(
                    statsField,
                    {
                        name: '🖼️ Gallery',
                        value: `Image ${galleryPage + 1} of ${post.gallery.length}`,
                        inline: true
                    }
                );
                components.unshift(createGalleryButtons(galleryPage, post.gallery.length, postIndex, userId));
            }
            break;

        case 'image':
            if (post.image) embed.setImage(post.image);
            embed.addFields(statsField);
            break;

        default:
            embed.addFields(statsField);
            if (post.selftext?.trim()) {
                embed.setDescription(truncateText(post.selftext, 3000));
            } else if (post.url !== post.permalink) {
                embed.addFields({
                    name: '🔗 External Link',
                    value: `[View Content](${post.url})`,
                    inline: true
                });
            }
    }

    if (post.selftext?.trim() && post.contentType !== 'text') {
        const maxLength = post.contentType === 'gallery' ? 800 : 1000;
        embed.addFields({
            name: '📝 Post Content',
            value: truncateText(post.selftext, maxLength),
            inline: false
        });
    }

    await interaction.editReply({ embeds: [embed], components });
}

function createNotFoundEmbed(subreddit: string, similarSubreddits: string[] = []): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setTitle('❌ Subreddit Not Found')
        .setColor(0xFF4500)
        .setFooter({ text: 'Use /reddit [subreddit] to try again' })
        .setTimestamp();

    if (similarSubreddits.length > 0) {
        embed.setDescription(`**r/${subreddit}** doesn't exist, but check out these similar subreddits:`);
        similarSubreddits.forEach((sub, index) => {
            embed.addFields({
                name: `${index + 1}. r/${sub}`,
                value: `[Visit](https://reddit.com/r/${sub})`,
                inline: true
            });
        });
    } else {
        embed.setDescription(`**r/${subreddit}** could not be found.\nPlease check the spelling and try again.`);
    }

    return embed;
}
// EXPORTS
export {
    sendPostListEmbed,
    showPostDetails,
    createPostListEmbed,
    createPostEmbed,
    createNotFoundEmbed,
    POSTS_PER_PAGE
};

export type {
    RedditPost,
    SortType
};
