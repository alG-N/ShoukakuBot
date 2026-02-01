/**
 * Reddit Command - Presentation Layer
 * Fetch posts from Reddit
 * @module presentation/commands/api/reddit
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { BaseCommand, CommandCategory } = require('../BaseCommand');
const { COLORS } = require('../../constants');
const { checkAccess, AccessType } = require('../../services');

// Import services
let redditService, redditCache, postHandler;
try {
    redditService = require('../../services/api/redditService');
    redditCache = require('../../repositories/api/redditCache');
    postHandler = require('../../handlers/api/redditPostHandler');
} catch (e) {
    console.warn('[Reddit] Could not load services:', e.message);
}

class RedditCommand extends BaseCommand {
    constructor() {
        super({
            category: CommandCategory.API,
            cooldown: 5,
            deferReply: false // Manual defer
        });
    }

    get data() {
        return new SlashCommandBuilder()
            .setName('reddit')
            .setDescription('Fetches posts from Reddit')
            .addSubcommand(sub =>
                sub.setName('browse')
                    .setDescription('Browse a specific subreddit')
                    .addStringOption(option =>
                        option.setName('subreddit')
                            .setDescription('The subreddit to fetch')
                            .setRequired(true)
                            .setAutocomplete(true)
                    )
                    .addStringOption(option =>
                        option.setName('sort')
                            .setDescription('How to sort the posts')
                            .setRequired(false)
                            .addChoices(
                                { name: '🔥 Hot', value: 'hot' },
                                { name: '⭐ Best', value: 'best' },
                                { name: '🏆 Top', value: 'top' },
                                { name: '🆕 New', value: 'new' },
                                { name: '📈 Rising', value: 'rising' }
                            )
                    )
                    .addStringOption(option =>
                        option.setName('count')
                            .setDescription('Number of posts to fetch (default: 5)')
                            .setRequired(false)
                            .addChoices(
                                { name: '5 posts', value: '5' },
                                { name: '10 posts', value: '10' },
                                { name: '15 posts', value: '15' }
                            )
                    )
            )
            .addSubcommand(sub =>
                sub.setName('trending')
                    .setDescription('See what\'s trending on Reddit right now')
                    .addStringOption(option =>
                        option.setName('source')
                            .setDescription('Where to get trending posts from')
                            .setRequired(false)
                            .addChoices(
                                { name: '🌍 r/popular (Global)', value: 'popular' },
                                { name: '🌐 r/all (Everything)', value: 'all' }
                            )
                    )
                    .addStringOption(option =>
                        option.setName('count')
                            .setDescription('Number of posts to fetch (default: 10)')
                            .setRequired(false)
                            .addChoices(
                                { name: '5 posts', value: '5' },
                                { name: '10 posts', value: '10' },
                                { name: '15 posts', value: '15' },
                                { name: '20 posts', value: '20' }
                            )
                    )
            );
    }

    async run(interaction) {
        // Access control
        const access = await checkAccess(interaction, AccessType.SUB);
        if (access.blocked) {
            return interaction.reply({ embeds: [access.embed], ephemeral: true });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'trending') {
            return this._handleTrending(interaction);
        }

        return this._handleBrowse(interaction);
    }

    async _handleBrowse(interaction) {
        const subreddit = interaction.options.getString('subreddit').replace(/\s/g, '').trim();
        const sortBy = interaction.options.getString('sort') || 'top';
        const count = parseInt(interaction.options.getString('count') || '5');
        const isNsfwChannel = interaction.channel?.nsfw || false;

        await interaction.deferReply();

        const sortNames = {
            hot: 'Hot', best: 'Best', top: 'Top', new: 'New', rising: 'Rising'
        };

        const loadingEmbed = new EmbedBuilder()
            .setTitle('🔄 Fetching Posts...')
            .setDescription(`Retrieving **${count} ${sortNames[sortBy]}** posts from **r/${subreddit}**\n\nThis may take a moment...`)
            .setColor(COLORS.PRIMARY)
            .setThumbnail('https://www.redditstatic.com/desktop2x/img/favicon/android-icon-192x192.png')
            .setTimestamp();

        await interaction.editReply({ embeds: [loadingEmbed] });

        // Rate limiting delay
        await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 1500));

        const result = await redditService.fetchSubredditPosts(subreddit, sortBy, count);

        if (result.error === 'not_found') {
            const similarSubreddits = await redditService.searchSimilarSubreddits(subreddit);
            const embed = postHandler.createNotFoundEmbed(subreddit, similarSubreddits);
            return interaction.editReply({ embeds: [embed] });
        }

        if (result.error || !result.posts || result.posts.length === 0) {
            return interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor(COLORS.ERROR)
                    .setTitle('❌ Error')
                    .setDescription(result.error || 'No posts found.')
                ]
            });
        }

        // Filter NSFW if not in NSFW channel
        let filteredPosts = result.posts;
        if (!isNsfwChannel) {
            filteredPosts = result.posts.filter(p => !p.nsfw && !p.over_18);
            if (filteredPosts.length === 0 && result.posts.length > 0) {
                return interaction.editReply({
                    embeds: [new EmbedBuilder()
                        .setColor(COLORS.WARNING)
                        .setDescription('⚠️ All posts are NSFW. Use this command in an age-restricted channel.')
                    ]
                });
            }
        }

        // Store in cache for button interactions
        redditCache.setPosts(interaction.user.id, filteredPosts);
        redditCache.setPage(interaction.user.id, 0);
        redditCache.setSort(interaction.user.id, sortBy);
        redditCache.setNsfwChannel(interaction.user.id, isNsfwChannel);

        // Send interactive post list
        await postHandler.sendPostListEmbed(interaction, subreddit, filteredPosts, sortBy, 0, isNsfwChannel);
    }

    async _handleTrending(interaction) {
        const source = interaction.options.getString('source') || 'popular';
        const count = parseInt(interaction.options.getString('count') || '10');
        const isNsfwChannel = interaction.channel?.nsfw || false;

        await interaction.deferReply();

        const sourceNames = { popular: 'r/popular', all: 'r/all' };
        
        const loadingEmbed = new EmbedBuilder()
            .setTitle('🔥 Fetching Trending Posts...')
            .setDescription(`Getting **${count}** hot posts from **${sourceNames[source]}**\n\nThis may take a moment...`)
            .setColor(COLORS.PRIMARY)
            .setThumbnail('https://www.redditstatic.com/desktop2x/img/favicon/android-icon-192x192.png')
            .setTimestamp();

        await interaction.editReply({ embeds: [loadingEmbed] });
        await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 1500));

        let result;
        if (source === 'all') {
            result = await redditService.fetchAllPosts?.('hot', count) || 
                     await redditService.fetchSubredditPosts('all', 'hot', count);
        } else {
            result = await redditService.fetchTrendingPosts?.('global', count) ||
                     await redditService.fetchSubredditPosts('popular', 'hot', count);
        }

        if (result.error || !result.posts || result.posts.length === 0) {
            return interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor(COLORS.ERROR)
                    .setDescription('❌ Failed to fetch trending posts. Please try again later.')
                ]
            });
        }

        // Filter NSFW
        let filteredPosts = result.posts;
        if (!isNsfwChannel) {
            filteredPosts = result.posts.filter(p => !p.nsfw && !p.over_18);
            if (filteredPosts.length === 0) {
                return interaction.editReply({
                    embeds: [new EmbedBuilder()
                        .setColor(COLORS.WARNING)
                        .setDescription('⚠️ All trending posts are NSFW. Use this command in an age-restricted channel.')
                    ]
                });
            }
        }

        // Store in cache
        redditCache.setPosts(interaction.user.id, filteredPosts);
        redditCache.setPage(interaction.user.id, 0);
        redditCache.setSort(interaction.user.id, 'hot');
        redditCache.setNsfwChannel(interaction.user.id, isNsfwChannel);

        const displayName = source === 'all' ? 'all (Trending)' : 'popular (Trending)';
        await postHandler.sendPostListEmbed(interaction, displayName, filteredPosts, 'hot', 0, isNsfwChannel);
    }

    /**
     * Handle button interactions
     */
    async handleButton(interaction) {
        const customId = interaction.customId;
        const userId = interaction.user.id;

        // Extract user ID from button
        const parts = customId.split('_');
        const buttonUserId = parts[parts.length - 1];

        if (userId !== buttonUserId) {
            return interaction.reply({ content: '❌ This button is not for you!', ephemeral: true });
        }

        const posts = redditCache.getPosts(userId);
        if (!posts || posts.length === 0) {
            return interaction.reply({ content: '⚠️ Session expired. Please run the command again.', ephemeral: true });
        }

        await interaction.deferUpdate();

        try {
            // Page navigation
            if (customId.startsWith('reddit_prev_') || customId.startsWith('reddit_next_')) {
                const currentPage = redditCache.getPage(userId);
                const totalPages = Math.ceil(posts.length / 5);
                
                let newPage = currentPage;
                if (customId.startsWith('reddit_prev_')) {
                    newPage = Math.max(0, currentPage - 1);
                } else {
                    newPage = Math.min(totalPages - 1, currentPage + 1);
                }
                
                redditCache.setPage(userId, newPage);
                const sortBy = redditCache.getSort(userId);
                const isNsfw = redditCache.getNsfwChannel(userId);
                
                // Get subreddit name from current message if possible
                const subreddit = interaction.message?.embeds?.[0]?.title?.match(/r\/(\S+)/)?.[1] || 'reddit';
                await postHandler.sendPostListEmbed(interaction, subreddit, posts, sortBy, newPage, isNsfw);
            }

            // Show post details
            else if (customId.startsWith('reddit_show_')) {
                const postIndex = parseInt(parts[2]);
                const post = posts[postIndex];
                if (post) {
                    await postHandler.showPostDetails(interaction, post, postIndex, userId);
                }
            }

            // Gallery navigation
            else if (customId.startsWith('reddit_gprev_') || customId.startsWith('reddit_gnext_')) {
                const postIndex = parseInt(parts[2]);
                const post = posts[postIndex];
                if (post && post.gallery) {
                    const currentGalleryPage = redditCache.getGalleryPage(userId, postIndex);
                    let newGalleryPage = currentGalleryPage;
                    
                    if (customId.startsWith('reddit_gprev_')) {
                        newGalleryPage = Math.max(0, currentGalleryPage - 1);
                    } else {
                        newGalleryPage = Math.min(post.gallery.length - 1, currentGalleryPage + 1);
                    }
                    
                    redditCache.setGalleryPage(userId, postIndex, newGalleryPage);
                    await postHandler.showPostDetails(interaction, post, postIndex, userId);
                }
            }

            // Back to post list
            else if (customId.startsWith('reddit_back_') || customId.startsWith('reddit_gclose_')) {
                const currentPage = redditCache.getPage(userId);
                const sortBy = redditCache.getSort(userId);
                const isNsfw = redditCache.getNsfwChannel(userId);
                const subreddit = interaction.message?.embeds?.[0]?.footer?.text?.match(/r\/(\S+)/)?.[1] || 'reddit';
                await postHandler.sendPostListEmbed(interaction, subreddit, posts, sortBy, currentPage, isNsfw);
            }
        } catch (error) {
            console.error('[Reddit Button Error]', error);
        }
    }

    async autocomplete(interaction) {
        const focused = interaction.options.getFocused();

        if (!focused || focused.length < 2) {
            return interaction.respond([]).catch(() => {});
        }

        try {
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Timeout')), 2500)
            );

            const searchPromise = redditService.searchSubreddits(focused, 8);
            const subreddits = await Promise.race([searchPromise, timeoutPromise]);

            const choices = subreddits.map(sub => ({
                name: `${sub.displayName} — ${sub.title}`.slice(0, 100),
                value: sub.name
            }));

            await interaction.respond(choices).catch(() => {});
        } catch (error) {
            await interaction.respond([]).catch(() => {});
        }
    }
}

module.exports = new RedditCommand();



