import axios, { AxiosResponse } from 'axios';
import { Buffer } from 'buffer';
import config from '../../config/services.js';
import { withRetry } from '../../utils/common/apiUtils.js';
import logger from '../../core/Logger.js';
import { circuitBreakerRegistry } from '../../core/CircuitBreakerRegistry.js';
import cacheService from '../../cache/CacheService.js';
// TYPES & INTERFACES
/**
 * Reddit OAuth token response
 */
interface RedditTokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
    scope: string;
}

/**
 * Subreddit search result
 */
export interface SubredditInfo {
    name: string;
    title: string;
    displayName: string;
}

/**
 * Parsed Reddit post
 */
export interface RedditPost {
    title: string;
    url: string;
    image: string | null;
    gallery: string[];
    video: string | null;
    isVideo: boolean;
    contentType: 'text' | 'image' | 'video' | 'gallery' | 'gif';
    selftext: string;
    permalink: string;
    upvotes: number;
    downvotes: number;
    comments: number;
    awards: number;
    author: string;
    nsfw: boolean;
    created: number | null;
}

/**
 * Result type for post fetching operations
 */
export interface RedditPostsResult {
    posts?: RedditPost[];
    error?: 'not_found' | 'rate_limited' | 'no_posts' | 'fetch_failed';
}

/**
 * Raw Reddit post data from API
 */
interface RawRedditPostData {
    title?: string;
    url?: string;
    url_overridden_by_dest?: string;
    post_hint?: string;
    preview?: {
        images?: Array<{
            source?: {
                url: string;
            };
            variants?: {
                gif?: {
                    source?: {
                        url: string;
                    };
                };
                mp4?: {
                    source?: {
                        url: string;
                    };
                };
            };
        }>;
        reddit_video_preview?: {
            fallback_url: string;
            is_gif?: boolean;
        };
    };
    gallery_data?: {
        items: Array<{
            media_id: string;
        }>;
    };
    media_metadata?: Record<string, {
        s?: {
            u?: string;
            gif?: string;
            mp4?: string;
        };
        e?: string;
    }>;
    is_video?: boolean;
    media?: {
        reddit_video?: {
            fallback_url: string;
            is_gif?: boolean;
        };
    };
    selftext?: string;
    permalink?: string;
    ups?: number;
    downs?: number;
    num_comments?: number;
    total_awards_received?: number;
    author?: string;
    over_18?: boolean;
    created_utc?: number;
    domain?: string;
}

/**
 * Raw Reddit API response for posts
 */
interface RawRedditListingResponse {
    data?: {
        children?: Array<{
            data: RawRedditPostData;
        }>;
    };
}

/**
 * Raw Reddit API response for subreddit about
 */
interface RawSubredditAboutResponse {
    kind?: string;
    data?: {
        display_name: string;
    };
}

/**
 * Raw Reddit subreddit search response
 */
interface RawSubredditSearchResponse {
    data: {
        children: Array<{
            data: {
                display_name: string;
                title?: string;
                display_name_prefixed: string;
            };
        }>;
    };
}

/**
 * Sort options for Reddit posts
 */
export type RedditSortBy = 'hot' | 'new' | 'top' | 'rising' | 'controversial';

/**
 * Time filter for top posts
 */
export type RedditTimeFilter = 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';

/**
 * Region filter for trending posts
 */
export type RedditRegion = 'global' | 'us' | 'uk' | 'ar' | 'au' | 'de' | 'es' | 'fr' | 'in' | 'it' | 'jp' | 'mx' | 'nl' | 'pl' | 'pt' | 'se';
// REDDIT SERVICE CLASS
/**
 * Service for interacting with Reddit API
 */
export class RedditService {
    private clientId: string;
    private secret: string;
    private accessToken: string | null = null;
    private tokenExpiry: number = 0;
    
    // Configurable timeouts
    private timeout: number;
    private authTimeout: number;
    private searchTimeout: number;
    private maxRetries: number;
    private userAgent: string;

    // Redis cache for cross-shard token sharing
    private static readonly AUTH_CACHE_NS = 'reddit_auth';
    private static readonly AUTH_CACHE_KEY = 'oauth_token';

    constructor() {
        this.clientId = config.reddit.clientId;
        this.secret = config.reddit.secretKey;
        
        // Configurable timeouts from config
        this.timeout = config.reddit.timeout || 10000;
        this.authTimeout = config.reddit.authTimeout || 5000;
        this.searchTimeout = config.reddit.searchTimeout || 2000;
        this.maxRetries = config.reddit.maxRetries || 2;
        this.userAgent = config.reddit.userAgent || 'DiscordBot/1.0';
    }

    /**
     * Get or refresh OAuth access token
     * Uses Redis to share tokens across shards
     */
    async getAccessToken(): Promise<string> {
        // 1. Fast path: local in-memory token still valid
        if (this.accessToken && Date.now() < this.tokenExpiry) {
            return this.accessToken;
        }

        // 2. Check Redis for a token another shard may have refreshed
        try {
            const cached = await cacheService.get<{ accessToken: string; tokenExpiry: number }>(
                RedditService.AUTH_CACHE_NS, RedditService.AUTH_CACHE_KEY
            );
            if (cached && Date.now() < cached.tokenExpiry) {
                this.accessToken = cached.accessToken;
                this.tokenExpiry = cached.tokenExpiry;
                return cached.accessToken;
            }
        } catch {
            // Redis unavailable — fall through to refresh
        }

        // 3. Refresh token from Reddit API
        const auth = Buffer.from(`${this.clientId}:${this.secret}`).toString('base64');

        // Use retry logic for authentication
        return withRetry(async () => {
            const response: AxiosResponse<RedditTokenResponse> = await circuitBreakerRegistry.execute(
                'externalApi',
                async () => axios.post<RedditTokenResponse>(
                    'https://www.reddit.com/api/v1/access_token',
                    'grant_type=client_credentials',
                    {
                        headers: {
                            'Authorization': `Basic ${auth}`,
                            'Content-Type': 'application/x-www-form-urlencoded',
                        },
                        timeout: this.authTimeout
                    }
                )
            );

            this.accessToken = response.data.access_token;
            this.tokenExpiry = Date.now() + (response.data.expires_in * 1000) - 60000;

            // 4. Store in Redis for other shards
            try {
                const ttlSeconds = Math.max(Math.floor((this.tokenExpiry - Date.now()) / 1000), 60);
                await cacheService.set(RedditService.AUTH_CACHE_NS, RedditService.AUTH_CACHE_KEY, {
                    accessToken: this.accessToken,
                    tokenExpiry: this.tokenExpiry
                }, ttlSeconds);
            } catch {
                // Redis unavailable — token still works locally
            }

            return this.accessToken;
        }, {
            name: 'Reddit Auth',
            maxRetries: this.maxRetries,
            retryDelay: 500
        } as any).catch((error: any) => {
            logger.error('Reddit', `Authentication failed: ${error.response?.data || error.message}`);
            throw new Error('Failed to authenticate with Reddit');
        });
    }

    /**
     * Search for subreddits matching a query
     * @param query - Search query
     * @param limit - Maximum number of results
     */
    async searchSubreddits(query: string, limit: number = 10): Promise<SubredditInfo[]> {
        try {
            const res = await circuitBreakerRegistry.execute(
                'externalApi',
                async () => axios.get<RawSubredditSearchResponse>(
                    `https://www.reddit.com/subreddits/search.json?q=${encodeURIComponent(query)}&limit=${limit}`,
                    {
                        headers: { 'User-Agent': this.userAgent },
                        timeout: this.searchTimeout
                    }
                )
            );

            return res.data.data.children.map(c => ({
                name: c.data.display_name,
                title: c.data.title?.slice(0, 50) || '',
                displayName: c.data.display_name_prefixed
            }));
        } catch (error: any) {
            logger.debug('Reddit', `Subreddit search timeout/error: ${error.message}`);
            return [];
        }
    }

    /**
     * Fetch posts from a subreddit
     * @param subreddit - Subreddit name (without r/)
     * @param sortBy - Sort method
     * @param limit - Number of posts to fetch
     */
    async fetchSubredditPosts(
        subreddit: string, 
        sortBy: RedditSortBy = 'top', 
        limit: number = 5
    ): Promise<RedditPostsResult> {
        const token = await this.getAccessToken();

        // Use retry logic for fetching posts
        return withRetry(async () => {
            // First verify subreddit exists
            const aboutResponse: AxiosResponse<RawSubredditAboutResponse> = await circuitBreakerRegistry.execute(
                'externalApi',
                async () => axios.get<RawSubredditAboutResponse>(
                    `https://oauth.reddit.com/r/${subreddit}/about`,
                    {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'User-Agent': this.userAgent
                        },
                        timeout: this.timeout
                    }
                )
            );

            if (!aboutResponse.data || aboutResponse.data.kind !== 't5') {
                return { error: 'not_found' as const };
            }

            // Check rate limit
            const rateLimitRemaining = parseInt(aboutResponse.headers['x-ratelimit-remaining'] as string, 10);
            if (rateLimitRemaining < 5) {
                return { error: 'rate_limited' as const };
            }

            // Fetch posts
            const params: Record<string, any> = { limit };
            if (sortBy === 'top') {
                params.t = 'day';
            }

            const response: AxiosResponse<RawRedditListingResponse> = await circuitBreakerRegistry.execute(
                'externalApi',
                async () => axios.get<RawRedditListingResponse>(
                    `https://oauth.reddit.com/r/${subreddit}/${sortBy}`,
                    {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'User-Agent': this.userAgent
                        },
                        params,
                        timeout: this.timeout
                    }
                )
            );

            if (!response.data?.data?.children) {
                return { error: 'no_posts' as const };
            }

            return {
                posts: response.data.data.children.map(child => this._parsePost(child.data))
            };
        }, {
            name: 'Reddit Fetch',
            maxRetries: this.maxRetries,
            retryDelay: 1000
        } as any).catch((error: any) => {
            if (error.response?.status === 404) {
                return { error: 'not_found' as const };
            }
            logger.error('Reddit', `Error fetching from /r/${subreddit}: ${error.message}`);
            return { error: 'fetch_failed' as const };
        });
    }

    /**
     * Search for similar subreddits
     * @param subreddit - Subreddit name to find similar ones for
     */
    async searchSimilarSubreddits(subreddit: string): Promise<string[]> {
        const token = await this.getAccessToken();

        try {
            const response = await circuitBreakerRegistry.execute(
                'externalApi',
                async () => axios.get<RawRedditListingResponse>(
                    'https://oauth.reddit.com/subreddits/search',
                    {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'User-Agent': 'DiscordBot/1.0'
                        },
                        params: {
                            q: subreddit,
                            limit: 5,
                            sort: 'relevance'
                        }
                    }
                )
            );

            return response.data?.data?.children?.map(child => (child.data as any).display_name) || [];
        } catch (error: any) {
            console.error('Error fetching similar subreddits:', error.message);
            return [];
        }
    }

    /**
     * Fetch trending/popular posts from Reddit
     * @param region - Region filter (global, us, uk, etc)
     * @param limit - Number of posts to fetch
     */
    async fetchTrendingPosts(region: RedditRegion = 'global', limit: number = 10): Promise<RedditPostsResult> {
        const token = await this.getAccessToken();

        try {
            // Use /r/popular for trending content
            const endpoint = region === 'global' 
                ? 'https://oauth.reddit.com/r/popular/hot'
                : `https://oauth.reddit.com/r/popular/hot?geo_filter=${region.toUpperCase()}`;

            const response: AxiosResponse<RawRedditListingResponse> = await circuitBreakerRegistry.execute(
                'externalApi',
                async () => axios.get<RawRedditListingResponse>(endpoint, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'User-Agent': 'DiscordBot/1.0'
                    },
                    params: { limit }
                })
            );

            if (!response.data?.data?.children) {
                return { error: 'no_posts' };
            }

            return {
                posts: response.data.data.children.map(child => this._parsePost(child.data))
            };
        } catch (error: any) {
            logger.error('Reddit', `Error fetching trending posts: ${error.message}`);
            return { error: 'fetch_failed' };
        }
    }

    /**
     * Fetch posts from r/all (everything trending)
     * @param sortBy - Sort method
     * @param limit - Number of posts
     */
    async fetchAllPosts(sortBy: RedditSortBy = 'hot', limit: number = 10): Promise<RedditPostsResult> {
        const token = await this.getAccessToken();

        try {
            const response: AxiosResponse<RawRedditListingResponse> = await circuitBreakerRegistry.execute(
                'externalApi',
                async () => axios.get<RawRedditListingResponse>(
                    `https://oauth.reddit.com/r/all/${sortBy}`,
                    {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'User-Agent': 'DiscordBot/1.0'
                        },
                        params: { limit }
                    }
                )
            );

            if (!response.data?.data?.children) {
                return { error: 'no_posts' };
            }

            return {
                posts: response.data.data.children.map(child => this._parsePost(child.data))
            };
        } catch (error: any) {
            logger.error('Reddit', `Error fetching r/all posts: ${error.message}`);
            return { error: 'fetch_failed' };
        }
    }

    /**
     * Parse raw Reddit post data into structured format
     * @param postData - Raw post data from Reddit API
     */
    private _parsePost(postData: RawRedditPostData): RedditPost {
        let fullSizeImage: string | null = null;
        let gifUrl: string | null = null;

        // Check for GIF variants in preview
        if (postData.preview?.images?.[0]?.variants?.gif?.source) {
            gifUrl = postData.preview.images[0].variants.gif.source.url.replace(/&amp;/g, '&');
        } else if (postData.preview?.images?.[0]?.variants?.mp4?.source) {
            gifUrl = postData.preview.images[0].variants.mp4.source.url.replace(/&amp;/g, '&');
        }

        if (postData.preview?.images?.[0]?.source) {
            fullSizeImage = postData.preview.images[0].source.url.replace(/&amp;/g, '&');
        }

        // Check if URL itself is a GIF
        const postUrl = postData.url_overridden_by_dest || postData.url || '';
        const isGifUrl = /\.(gif|gifv)$/i.test(postUrl) || 
                         postUrl.includes('giphy.com') || 
                         postUrl.includes('tenor.com') ||
                         postUrl.includes('i.imgur.com') && postUrl.endsWith('.gif') ||
                         postData.post_hint === 'link' && /gif/i.test(postUrl);

        // Check reddit_video_preview for GIFs (Reddit-hosted animated content)
        const redditVideoPreview = postData.preview?.reddit_video_preview;
        const isRedditGif = redditVideoPreview?.is_gif || 
                           (postData.media?.reddit_video?.is_gif);

        if (isGifUrl && !gifUrl) {
            // For Giphy/Tenor, use the URL directly
            if (postUrl.includes('giphy.com')) {
                // Convert giphy page URL to direct GIF URL
                const giphyMatch = postUrl.match(/giphy\.com\/(?:gifs|media)\/(?:.*-)?([a-zA-Z0-9]+)/);
                if (giphyMatch) {
                    gifUrl = `https://media.giphy.com/media/${giphyMatch[1]}/giphy.gif`;
                } else {
                    gifUrl = postUrl;
                }
            } else if (postUrl.includes('tenor.com')) {
                // For tenor, the URL field usually has the direct GIF
                gifUrl = postUrl;
            } else if (postUrl.endsWith('.gifv')) {
                // Imgur .gifv -> .gif
                gifUrl = postUrl.replace('.gifv', '.gif');
            } else {
                gifUrl = postUrl;
            }
        }

        if (isRedditGif && !gifUrl) {
            gifUrl = redditVideoPreview?.fallback_url || 
                     postData.media?.reddit_video?.fallback_url || null;
        }

        let galleryImages: string[] = [];
        if (postData.gallery_data && postData.media_metadata) {
            galleryImages = postData.gallery_data.items
                .map(item => {
                    const media = postData.media_metadata![item.media_id];
                    return media?.s?.u?.replace(/&amp;/g, '&') || null;
                })
                .filter((url): url is string => url !== null);
        }

        let videoUrl: string | null = null;
        let isVideo = false;
        if (postData.is_video && postData.media?.reddit_video && !isRedditGif) {
            videoUrl = postData.media.reddit_video.fallback_url;
            isVideo = true;
        }

        let contentType: 'text' | 'image' | 'video' | 'gallery' | 'gif' = 'text';
        if (gifUrl || isGifUrl || isRedditGif) contentType = 'gif';
        else if (isVideo) contentType = 'video';
        else if (galleryImages.length > 0) contentType = 'gallery';
        else if (fullSizeImage) contentType = 'image';

        return {
            title: postData.title || '[No Title]',
            url: postData.url || '[No URL]',
            image: gifUrl || fullSizeImage,
            gallery: galleryImages,
            video: videoUrl,
            isVideo,
            contentType,
            selftext: postData.selftext || '',
            permalink: `https://reddit.com${postData.permalink}`,
            upvotes: postData.ups ?? 0,
            downvotes: postData.downs ?? 0,
            comments: postData.num_comments ?? 0,
            awards: postData.total_awards_received ?? 0,
            author: postData.author || '[deleted]',
            nsfw: postData.over_18 || false,
            created: postData.created_utc || null
        };
    }
}
// SINGLETON INSTANCE & EXPORTS
const redditService = new RedditService();

export { redditService };
export default redditService;