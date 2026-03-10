import { EmbedBuilder } from 'discord.js';
import { formatNumber, truncateText } from '../../../utils/common/embed.js';
import { CONTENT_ICONS, POSTS_PER_PAGE, SORT_CONFIG } from './constants.js';
import type { RedditPost } from '../../../types/api/models/reddit.js';
import type { RedditSortType } from '../../../types/api/handlers/reddit-post-handler.js';

export function createPostListEmbed(
    subreddit: string,
    posts: RedditPost[],
    sortBy: RedditSortType,
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

export function createPostEmbed(post: RedditPost, subreddit: string): EmbedBuilder {
    const contentIcon = CONTENT_ICONS[post.contentType || 'text'] || CONTENT_ICONS.text;
    const nsfwTag = post.over_18 || post.nsfw ? '🔞 ' : '';

    const embed = new EmbedBuilder()
        .setTitle(`${nsfwTag}${contentIcon} ${truncateText(post.title, 200)}`)
        .setURL(post.permalink || `https://reddit.com${post.url}`)
        .setColor(0xFF4500)
        .setAuthor({ name: `Posted by u/${post.author}` })
        .setFooter({ text: `r/${subreddit} • 👍 ${formatNumber(post.upvotes || post.ups || 0)} • 💬 ${formatNumber(post.comments || post.num_comments || 0)}` })
        .setTimestamp(post.created ? new Date(post.created * 1000) : null);

    if (post.selftext?.trim()) {
        embed.setDescription(truncateText(post.selftext, 500));
    }

    if (post.image || post.thumbnail) {
        const imageUrl = post.image || (post.thumbnail?.startsWith('http') ? post.thumbnail : null);
        if (imageUrl && !imageUrl.includes('self') && !imageUrl.includes('default')) {
            embed.setImage(imageUrl);
        }
    }

    return embed;
}

export function createNotFoundEmbed(subreddit: string, similarSubreddits: string[] = []): EmbedBuilder {
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
