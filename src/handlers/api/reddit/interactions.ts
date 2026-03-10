import {
    ActionRowBuilder,
    ButtonBuilder,
    ChatInputCommandInteraction,
    ButtonInteraction,
    EmbedBuilder
} from 'discord.js';
import { formatNumber, truncateText } from '../../../utils/common/embed.js';
import redditCache from '../../../cache/api/redditCache.js';
import { createBackButton, createGalleryButtons, createPaginationButtons, createPostButtons } from './components.js';
import { createPostListEmbed } from './embeds.js';
import { POSTS_PER_PAGE } from './constants.js';
import type { RedditPost } from '../../../types/api/models/reddit.js';
import type { RedditSortType } from '../../../types/api/handlers/reddit-post-handler.js';

export async function sendPostListEmbed(
    interaction: ChatInputCommandInteraction,
    subreddit: string,
    posts: RedditPost[],
    sortBy: RedditSortType,
    currentPage: number,
    isNsfwChannel: boolean = false
): Promise<void> {
    const totalPages = Math.ceil(posts.length / POSTS_PER_PAGE);
    const startIdx = currentPage * POSTS_PER_PAGE;
    const pagePosts = posts.slice(startIdx, startIdx + POSTS_PER_PAGE);

    const embed = createPostListEmbed(subreddit, posts, sortBy, currentPage);

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

export async function showPostDetails(
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

