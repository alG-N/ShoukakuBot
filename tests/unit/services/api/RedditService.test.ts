/**
 * RedditService Unit Tests
 * Tests for Reddit API integration with OAuth, cache, and circuit breaker
 */

// Mock Logger
jest.mock('../../../../src/core/Logger', () => ({
    __esModule: true,
    default: {
        error: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        success: jest.fn(),
    },
}));

// Mock axios
const mockAxiosGet = jest.fn();
const mockAxiosPost = jest.fn();
jest.mock('axios', () => ({
    __esModule: true,
    default: {
        get: mockAxiosGet,
        post: mockAxiosPost,
    },
}));

// Mock CacheService
const mockCacheGet = jest.fn().mockResolvedValue(null);
const mockCacheSet = jest.fn().mockResolvedValue(undefined);
const mockCachePeek = jest.fn().mockResolvedValue(null);
jest.mock('../../../../src/cache/CacheService', () => ({
    __esModule: true,
    default: {
        get: mockCacheGet,
        set: mockCacheSet,
        peek: mockCachePeek,
    },
}));

// Mock CircuitBreakerRegistry
jest.mock('../../../../src/core/CircuitBreakerRegistry', () => ({
    __esModule: true,
    circuitBreakerRegistry: {
        execute: jest.fn().mockImplementation((_name: string, fn: () => Promise<any>) => fn()),
    },
}));

// Mock config
jest.mock('../../../../src/config/services', () => ({
    __esModule: true,
    default: {
        reddit: {
            clientId: 'test-client-id',
            secretKey: 'test-secret',
            timeout: 10000,
            authTimeout: 5000,
            searchTimeout: 2000,
            maxRetries: 1,
            userAgent: 'TestBot/1.0',
        },
    },
}));

// Mock apiUtils
jest.mock('../../../../src/utils/common/apiUtils', () => ({
    __esModule: true,
    withRetry: jest.fn().mockImplementation((fn: () => Promise<any>) => fn()),
}));

import { RedditService, redditService } from '../../../../src/services/api/redditService';

describe('RedditService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockCacheGet.mockResolvedValue(null);
        mockCachePeek.mockResolvedValue(null);
    });

    describe('getAccessToken', () => {
        it('should return cached token from Redis if not expired', async () => {
            // Use a fresh instance so no in-memory token exists
            const freshService = new RedditService();
            mockCachePeek.mockResolvedValue({
                accessToken: 'cached-token',
                tokenExpiry: Date.now() + 3600000,
            });

            const token = await freshService.getAccessToken();

            expect(token).toBe('cached-token');
            expect(mockAxiosPost).not.toHaveBeenCalled();
        });

        it('should authenticate with Reddit API when no cache', async () => {
            const freshService = new RedditService();
            mockAxiosPost.mockResolvedValue({
                data: {
                    access_token: 'test-token',
                    token_type: 'bearer',
                    expires_in: 3600,
                    scope: '*',
                },
            });

            const token = await freshService.getAccessToken();

            expect(token).toBe('test-token');
        });

        it('should throw on auth failure', async () => {
            const freshService = new RedditService();
            mockAxiosPost.mockRejectedValue(new Error('Auth failed'));

            await expect(freshService.getAccessToken()).rejects.toThrow();
        });
    });

    describe('searchSubreddits', () => {
        it('should return subreddit suggestions', async () => {
            mockAxiosGet.mockResolvedValue({
                data: {
                    data: {
                        children: [
                            {
                                data: {
                                    display_name: 'gaming',
                                    title: 'Gaming',
                                    display_name_prefixed: 'r/gaming',
                                },
                            },
                        ],
                    },
                },
            });

            const results = await redditService.searchSubreddits('gaming');

            expect(results).toHaveLength(1);
            expect(results[0].name).toBe('gaming');
        });

        it('should return empty array on error', async () => {
            mockAxiosGet.mockRejectedValue(new Error('Timeout'));

            const results = await redditService.searchSubreddits('test');

            expect(results).toEqual([]);
        });
    });

    describe('fetchSubredditPosts', () => {
        beforeEach(() => {
            // Ensure we have a valid token
            mockAxiosPost.mockResolvedValue({
                data: { access_token: 'test-token', expires_in: 3600 },
            });
        });

        it('should fetch and parse posts', async () => {
            mockAxiosGet.mockImplementation((url: string) => {
                if (url.includes('/about')) {
                    return Promise.resolve({
                        data: { kind: 't5', data: { display_name: 'gaming' } },
                        headers: { 'x-ratelimit-remaining': '100' },
                    });
                }
                return Promise.resolve({
                    data: {
                        data: {
                            children: [
                                {
                                    data: {
                                        title: 'Test Post',
                                        url: 'https://example.com',
                                        selftext: 'Post content',
                                        permalink: '/r/gaming/comments/abc',
                                        ups: 100,
                                        downs: 5,
                                        num_comments: 20,
                                        total_awards_received: 2,
                                        author: 'testuser',
                                        over_18: false,
                                        created_utc: 1700000000,
                                    },
                                },
                            ],
                        },
                    },
                });
            });

            const result = await redditService.fetchSubredditPosts('gaming');

            expect(result.posts).toBeDefined();
            expect(result.posts!.length).toBeGreaterThan(0);
            expect(result.posts![0].title).toBe('Test Post');
            expect(result.posts![0].author).toBe('testuser');
        });

        it('should return not_found for invalid subreddit', async () => {
            mockAxiosGet.mockResolvedValue({
                data: { kind: 'wrong', data: {} },
                headers: { 'x-ratelimit-remaining': '100' },
            });

            const result = await redditService.fetchSubredditPosts('nonexistent');

            expect(result.error).toBe('not_found');
        });

        it('should handle 404 error', async () => {
            const error: any = new Error('Not found');
            error.response = { status: 404 };
            mockAxiosGet.mockRejectedValue(error);

            const result = await redditService.fetchSubredditPosts('fake');

            expect(result.error).toBe('not_found');
        });

        it('should return rate_limited when low remaining', async () => {
            mockAxiosGet.mockResolvedValue({
                data: { kind: 't5', data: { display_name: 'gaming' } },
                headers: { 'x-ratelimit-remaining': '2' },
            });

            const result = await redditService.fetchSubredditPosts('gaming');

            expect(result.error).toBe('rate_limited');
        });
    });

    describe('fetchTrendingPosts', () => {
        beforeEach(() => {
            mockAxiosPost.mockResolvedValue({
                data: { access_token: 'test-token', expires_in: 3600 },
            });
        });

        it('should fetch trending posts', async () => {
            mockAxiosGet.mockResolvedValue({
                data: {
                    data: {
                        children: [
                            { data: { title: 'Trending', url: 'https://example.com', permalink: '/r/all/abc', ups: 50000 } },
                        ],
                    },
                },
            });

            const result = await redditService.fetchTrendingPosts();

            expect(result.posts).toBeDefined();
        });

        it('should handle empty response', async () => {
            mockAxiosGet.mockResolvedValue({ data: {} });

            const result = await redditService.fetchTrendingPosts();

            expect(result.error).toBe('no_posts');
        });

        it('should handle errors', async () => {
            mockAxiosGet.mockRejectedValue(new Error('Network error'));

            const result = await redditService.fetchTrendingPosts();

            expect(result.error).toBe('fetch_failed');
        });
    });

    describe('fetchAllPosts', () => {
        beforeEach(() => {
            mockAxiosPost.mockResolvedValue({
                data: { access_token: 'test-token', expires_in: 3600 },
            });
        });

        it('should fetch r/all posts', async () => {
            mockAxiosGet.mockResolvedValue({
                data: {
                    data: {
                        children: [{ data: { title: 'All Post', url: 'https://example.com', permalink: '/r/all/xyz' } }],
                    },
                },
            });

            const result = await redditService.fetchAllPosts('hot', 5);

            expect(result.posts).toBeDefined();
        });
    });

    describe('post parsing', () => {
        beforeEach(() => {
            mockAxiosPost.mockResolvedValue({
                data: { access_token: 'test-token', expires_in: 3600 },
            });
        });

        it('should parse gallery posts', async () => {
            mockAxiosGet.mockImplementation((url: string) => {
                if (url.includes('/about')) {
                    return Promise.resolve({
                        data: { kind: 't5', data: { display_name: 'test' } },
                        headers: { 'x-ratelimit-remaining': '100' },
                    });
                }
                return Promise.resolve({
                    data: {
                        data: {
                            children: [{
                                data: {
                                    title: 'Gallery Post',
                                    url: 'https://reddit.com/gallery/abc',
                                    gallery_data: { items: [{ media_id: 'img1' }, { media_id: 'img2' }] },
                                    media_metadata: {
                                        img1: { s: { u: 'https://preview.redd.it/img1.jpg' } },
                                        img2: { s: { u: 'https://preview.redd.it/img2.jpg' } },
                                    },
                                    permalink: '/r/test/comments/abc',
                                },
                            }],
                        },
                    },
                });
            });

            const result = await redditService.fetchSubredditPosts('test');

            expect(result.posts![0].contentType).toBe('gallery');
            expect(result.posts![0].gallery.length).toBe(2);
        });

        it('should parse video posts', async () => {
            mockAxiosGet.mockImplementation((url: string) => {
                if (url.includes('/about')) {
                    return Promise.resolve({
                        data: { kind: 't5', data: { display_name: 'test' } },
                        headers: { 'x-ratelimit-remaining': '100' },
                    });
                }
                return Promise.resolve({
                    data: {
                        data: {
                            children: [{
                                data: {
                                    title: 'Video Post',
                                    is_video: true,
                                    media: { reddit_video: { fallback_url: 'https://v.redd.it/abc/DASH_720.mp4' } },
                                    permalink: '/r/test/comments/xyz',
                                },
                            }],
                        },
                    },
                });
            });

            const result = await redditService.fetchSubredditPosts('test');

            expect(result.posts![0].contentType).toBe('video');
            expect(result.posts![0].isVideo).toBe(true);
        });
    });
});
