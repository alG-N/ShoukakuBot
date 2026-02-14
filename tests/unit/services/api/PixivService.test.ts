/**
 * PixivService Unit Tests
 * Tests for authentication, search, ranking, filtering, proxy, and pure helpers
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

// Mock dotenv
jest.mock('dotenv', () => ({
    config: jest.fn(),
}));

// Mock path
jest.mock('path', () => ({
    join: jest.fn((...args: string[]) => args.join('/')),
}));

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Set env vars before import
process.env.PIXIV_REFRESH_TOKEN = 'test-refresh-token';
process.env.PIXIV_CLIENT_ID = 'test-client-id';
process.env.PIXIV_CLIENT_SECRET = 'test-client-secret';

import pixivService, { PixivService } from '../../../../src/services/api/pixivService';

// Helper: make a Pixiv illust object
function makeIllust(overrides: Record<string, any> = {}): any {
    return {
        id: 12345,
        title: 'Test Artwork',
        type: 'illust',
        image_urls: {
            square_medium: 'https://i.pximg.net/img/square.jpg',
            medium: 'https://i.pximg.net/img/medium.jpg',
            large: 'https://i.pximg.net/img/large.jpg',
        },
        caption: 'A test artwork',
        restrict: 0,
        user: {
            id: 100,
            name: 'TestArtist',
            account: 'testartist',
            profile_image_urls: { medium: 'https://i.pximg.net/profile.jpg' },
        },
        tags: [{ name: 'test', translated_name: 'test' }],
        tools: [],
        create_date: '2024-01-01T00:00:00+09:00',
        page_count: 1,
        width: 1920,
        height: 1080,
        sanity_level: 2,
        x_restrict: 0,
        series: null,
        meta_single_page: { original_image_url: 'https://i.pximg.net/img/original.jpg' },
        meta_pages: [],
        total_view: 10000,
        total_bookmarks: 500,
        is_bookmarked: false,
        visible: true,
        is_muted: false,
        illust_ai_type: 1,
        ...overrides,
    };
}

describe('PixivService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockCacheGet.mockResolvedValue(null);
        mockCachePeek.mockResolvedValue(null);
        mockFetch.mockReset();
    });

    // --- authenticate ---
    describe('authenticate', () => {
        it('should return cached token from Redis', async () => {
            mockCachePeek.mockResolvedValue({
                accessToken: 'redis-token',
                refreshToken: 'rt',
                expiresAt: Date.now() + 60000,
            });

            // Need to create a fresh instance to test auth
            const svc = new PixivService();
            const token = await svc.authenticate();

            expect(token).toBe('redis-token');
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('should refresh token from Pixiv API when no cache', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({
                    access_token: 'new-token',
                    refresh_token: 'new-refresh',
                    expires_in: 3600,
                }),
            });

            const svc = new PixivService();
            const token = await svc.authenticate();

            expect(token).toBe('new-token');
            expect(mockFetch).toHaveBeenCalledWith(
                'https://oauth.secure.pixiv.net/auth/token',
                expect.objectContaining({ method: 'POST' })
            );
        });

        it('should store refreshed token in Redis', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({
                    access_token: 'stored-token',
                    refresh_token: 'stored-refresh',
                    expires_in: 3600,
                }),
            });

            const svc = new PixivService();
            await svc.authenticate();

            expect(mockCacheSet).toHaveBeenCalledWith(
                'pixiv_auth',
                'oauth_token',
                expect.objectContaining({ accessToken: 'stored-token' }),
                expect.any(Number)
            );
        });

        it('should throw on auth failure', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({}), // no access_token
            });

            const svc = new PixivService();
            await expect(svc.authenticate()).rejects.toThrow('Failed to authenticate');
        });

        it('should reuse in-memory token when still valid', async () => {
            // First call: get token from API
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({
                    access_token: 'mem-token',
                    refresh_token: 'mem-refresh',
                    expires_in: 3600,
                }),
            });

            const svc = new PixivService();
            await svc.authenticate();
            mockFetch.mockReset();

            // Second call: should use in-memory
            const token = await svc.authenticate();
            expect(token).toBe('mem-token');
            expect(mockFetch).not.toHaveBeenCalled();
        });
    });

    // --- search ---
    describe('search', () => {
        beforeEach(() => {
            // Mock authenticate to always return a token
            mockFetch.mockImplementation(async (url: string) => {
                if (url.includes('oauth.secure.pixiv.net')) {
                    return {
                        ok: true,
                        json: async () => ({
                            access_token: 'test-token',
                            refresh_token: 'test-refresh',
                            expires_in: 3600,
                        }),
                    };
                }
                // Default search response
                return {
                    ok: true,
                    json: async () => ({
                        illusts: [makeIllust()],
                        next_url: null,
                    }),
                };
            });
        });

        it('should search and return filtered results', async () => {
            const svc = new PixivService();
            const result = await svc.search('test');

            expect(result.items).toHaveLength(1);
            expect(result.items[0].id).toBe(12345);
        });

        it('should filter R18 content when showNsfw is false', async () => {
            mockFetch.mockImplementation(async (url: string) => {
                if (url.includes('oauth.secure.pixiv.net')) {
                    return {
                        ok: true,
                        json: async () => ({
                            access_token: 'tk', refresh_token: 'rt', expires_in: 3600,
                        }),
                    };
                }
                return {
                    ok: true,
                    json: async () => ({
                        illusts: [
                            makeIllust({ id: 1, x_restrict: 0 }),
                            makeIllust({ id: 2, x_restrict: 1 }),
                        ],
                        next_url: null,
                    }),
                };
            });

            const svc = new PixivService();
            const result = await svc.search('test', { showNsfw: false });

            // Only SFW item should remain
            expect(result.items.every(i => i.x_restrict === 0)).toBe(true);
        });

        it('should return only R18 when r18Only is true', async () => {
            mockFetch.mockImplementation(async (url: string) => {
                if (url.includes('oauth.secure.pixiv.net')) {
                    return {
                        ok: true,
                        json: async () => ({
                            access_token: 'tk', refresh_token: 'rt', expires_in: 3600,
                        }),
                    };
                }
                return {
                    ok: true,
                    json: async () => ({
                        illusts: [
                            makeIllust({ id: 1, x_restrict: 0 }),
                            makeIllust({ id: 2, x_restrict: 1 }),
                        ],
                        next_url: null,
                    }),
                };
            });

            const svc = new PixivService();
            const result = await svc.search('test', { r18Only: true, showNsfw: true });

            expect(result.items.every(i => i.x_restrict > 0)).toBe(true);
        });

        it('should filter AI content when aiFilter is true', async () => {
            mockFetch.mockImplementation(async (url: string) => {
                if (url.includes('oauth.secure.pixiv.net')) {
                    return {
                        ok: true,
                        json: async () => ({
                            access_token: 'tk', refresh_token: 'rt', expires_in: 3600,
                        }),
                    };
                }
                return {
                    ok: true,
                    json: async () => ({
                        illusts: [
                            makeIllust({ id: 1, illust_ai_type: 1 }),
                            makeIllust({ id: 2, illust_ai_type: 2 }),
                        ],
                        next_url: null,
                    }),
                };
            });

            const svc = new PixivService();
            const result = await svc.search('test', { aiFilter: true });

            expect(result.items.every(i => i.illust_ai_type !== 2)).toBe(true);
        });

        it('should apply quality filter', async () => {
            mockFetch.mockImplementation(async (url: string) => {
                if (url.includes('oauth.secure.pixiv.net')) {
                    return {
                        ok: true,
                        json: async () => ({
                            access_token: 'tk', refresh_token: 'rt', expires_in: 3600,
                        }),
                    };
                }
                return {
                    ok: true,
                    json: async () => ({
                        illusts: [
                            makeIllust({ id: 1, total_view: 5000 }),
                            makeIllust({ id: 2, total_view: 500 }),
                        ],
                        next_url: null,
                    }),
                };
            });

            const svc = new PixivService();
            const result = await svc.search('test', { qualityFilter: true });

            expect(result.items.every(i => (i.total_view || 0) >= 1000)).toBe(true);
        });

        it('should apply minBookmarks filter', async () => {
            mockFetch.mockImplementation(async (url: string) => {
                if (url.includes('oauth.secure.pixiv.net')) {
                    return {
                        ok: true,
                        json: async () => ({
                            access_token: 'tk', refresh_token: 'rt', expires_in: 3600,
                        }),
                    };
                }
                return {
                    ok: true,
                    json: async () => ({
                        illusts: [
                            makeIllust({ id: 1, total_bookmarks: 100 }),
                            makeIllust({ id: 2, total_bookmarks: 10 }),
                        ],
                        next_url: null,
                    }),
                };
            });

            const svc = new PixivService();
            const result = await svc.search('test', { minBookmarks: 50 });

            expect(result.items.every(i => (i.total_bookmarks || 0) >= 50)).toBe(true);
        });

        it('should sort results by bookmarks', async () => {
            mockFetch.mockImplementation(async (url: string) => {
                if (url.includes('oauth.secure.pixiv.net')) {
                    return {
                        ok: true,
                        json: async () => ({
                            access_token: 'tk', refresh_token: 'rt', expires_in: 3600,
                        }),
                    };
                }
                return {
                    ok: true,
                    json: async () => ({
                        illusts: [
                            makeIllust({ id: 1, total_bookmarks: 100 }),
                            makeIllust({ id: 2, total_bookmarks: 500 }),
                        ],
                        next_url: null,
                    }),
                };
            });

            const svc = new PixivService();
            const result = await svc.search('test');

            expect(result.items[0].total_bookmarks).toBeGreaterThanOrEqual(result.items[1].total_bookmarks);
        });

        it('should handle empty results', async () => {
            mockFetch.mockImplementation(async (url: string) => {
                if (url.includes('oauth.secure.pixiv.net')) {
                    return {
                        ok: true,
                        json: async () => ({
                            access_token: 'tk', refresh_token: 'rt', expires_in: 3600,
                        }),
                    };
                }
                return {
                    ok: true,
                    json: async () => ({
                        illusts: [],
                        next_url: null,
                    }),
                };
            });

            const svc = new PixivService();
            const result = await svc.search('empty');

            expect(result.items).toHaveLength(0);
        });
    });

    // --- getRanking ---
    describe('getRanking', () => {
        beforeEach(() => {
            mockFetch.mockImplementation(async (url: string) => {
                if (url.includes('oauth.secure.pixiv.net')) {
                    return {
                        ok: true,
                        json: async () => ({
                            access_token: 'tk', refresh_token: 'rt', expires_in: 3600,
                        }),
                    };
                }
                return {
                    ok: true,
                    json: async () => ({
                        illusts: [makeIllust()],
                        next_url: null,
                    }),
                };
            });
        });

        it('should fetch ranking with default options', async () => {
            const svc = new PixivService();
            const result = await svc.getRanking();

            expect(result.items).toHaveLength(1);
        });

        it('should use R18 ranking mode when showNsfw', async () => {
            const svc = new PixivService();
            await svc.getRanking({ showNsfw: true, mode: 'day' });

            // Should have called ranking API with day_r18
            const rankingCall = mockFetch.mock.calls.find(c => c[0].includes('illust/ranking'));
            expect(rankingCall?.[0]).toContain('mode=day_r18');
        });

        it('should apply filters to ranking results', async () => {
            mockFetch.mockImplementation(async (url: string) => {
                if (url.includes('oauth.secure.pixiv.net')) {
                    return {
                        ok: true,
                        json: async () => ({
                            access_token: 'tk', refresh_token: 'rt', expires_in: 3600,
                        }),
                    };
                }
                return {
                    ok: true,
                    json: async () => ({
                        illusts: [
                            makeIllust({ id: 1, illust_ai_type: 2 }),
                            makeIllust({ id: 2, illust_ai_type: 1 }),
                        ],
                        next_url: null,
                    }),
                };
            });

            const svc = new PixivService();
            const result = await svc.getRanking({ aiFilter: true });

            expect(result.items.every(i => i.illust_ai_type !== 2)).toBe(true);
        });
    });

    // --- isJapaneseText ---
    describe('isJapaneseText', () => {
        it('should detect hiragana', () => {
            expect(pixivService.isJapaneseText('あいう')).toBe(true);
        });

        it('should detect katakana', () => {
            expect(pixivService.isJapaneseText('アイウ')).toBe(true);
        });

        it('should detect kanji', () => {
            expect(pixivService.isJapaneseText('漢字')).toBe(true);
        });

        it('should return false for English text', () => {
            expect(pixivService.isJapaneseText('Hello World')).toBe(false);
        });

        it('should return false for numbers', () => {
            expect(pixivService.isJapaneseText('12345')).toBe(false);
        });
    });

    // --- isEnglishText ---
    describe('isEnglishText', () => {
        it('should return true for English text', () => {
            expect(pixivService.isEnglishText('Hello World')).toBe(true);
        });

        it('should return false for Japanese text', () => {
            expect(pixivService.isEnglishText('こんにちは')).toBe(false);
        });

        it('should return false for mixed text with mostly Japanese', () => {
            expect(pixivService.isEnglishText('あいうえおa')).toBe(false);
        });

        it('should return true for text with > 30% ascii letters', () => {
            expect(pixivService.isEnglishText('Test 123')).toBe(true);
        });
    });

    // --- getProxyImageUrl ---
    describe('getProxyImageUrl', () => {
        it('should try proxy URLs for single page illust', async () => {
            mockFetch.mockResolvedValue({ ok: true });

            const illust = makeIllust();
            const url = await pixivService.getProxyImageUrl(illust);

            expect(url).toContain('large.jpg');
        });

        it('should use meta_pages for multi-page illust', async () => {
            mockFetch.mockResolvedValue({ ok: true });

            const illust = makeIllust({
                page_count: 3,
                meta_pages: [
                    { image_urls: { large: 'https://i.pximg.net/img/page1.jpg' } },
                    { image_urls: { large: 'https://i.pximg.net/img/page2.jpg' } },
                    { image_urls: { large: 'https://i.pximg.net/img/page3.jpg' } },
                ],
            });

            const url = await pixivService.getProxyImageUrl(illust, 1);
            expect(url).toContain('page2.jpg');
        });

        it('should return empty string when no image URL', async () => {
            const illust = makeIllust({
                image_urls: {},
                meta_single_page: {},
            });

            const url = await pixivService.getProxyImageUrl(illust);
            expect(url).toBe('');
        });

        it('should fallback to pixiv.cat proxy when others fail', async () => {
            mockFetch.mockResolvedValue({ ok: false });

            const illust = makeIllust();
            const url = await pixivService.getProxyImageUrl(illust);

            expect(url).toContain('i.pixiv.cat');
        });
    });

    // --- translateToJapanese ---
    describe('translateToJapanese', () => {
        it('should return cached translation', async () => {
            mockCacheGet.mockResolvedValue('テスト');

            const result = await pixivService.translateToJapanese('test');
            expect(result).toBe('テスト');
        });

        it('should fetch translation from Google Translate', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => [[['テスト']]],
            });

            const result = await pixivService.translateToJapanese('test');

            expect(result).toBe('テスト');
            expect(mockCacheSet).toHaveBeenCalledWith(
                'api:translate',
                expect.stringContaining('translate:en_ja_test'),
                'テスト',
                3600
            );
        });

        it('should return original text on error', async () => {
            mockFetch.mockRejectedValue(new Error('Network error'));

            const result = await pixivService.translateToJapanese('test');
            expect(result).toBe('test');
        });
    });

    // --- translateToEnglish ---
    describe('translateToEnglish', () => {
        it('should return cached translation', async () => {
            mockCacheGet.mockResolvedValue('test');

            const result = await pixivService.translateToEnglish('テスト');
            expect(result).toBe('test');
        });

        it('should return null on error', async () => {
            mockFetch.mockRejectedValue(new Error('Network error'));

            const result = await pixivService.translateToEnglish('テスト');
            expect(result).toBeNull();
        });
    });

    // --- getArtworkById ---
    describe('getArtworkById', () => {
        it('should fetch artwork by ID', async () => {
            mockFetch.mockImplementation(async (url: string) => {
                if (url.includes('oauth.secure.pixiv.net')) {
                    return {
                        ok: true,
                        json: async () => ({
                            access_token: 'tk', refresh_token: 'rt', expires_in: 3600,
                        }),
                    };
                }
                return {
                    ok: true,
                    json: async () => ({
                        illust: makeIllust({ id: 99999 }),
                    }),
                };
            });

            const svc = new PixivService();
            const result = await svc.getArtworkById(99999);

            expect(result.id).toBe(99999);
        });

        it('should throw on API error', async () => {
            mockFetch.mockImplementation(async (url: string) => {
                if (url.includes('oauth.secure.pixiv.net')) {
                    return {
                        ok: true,
                        json: async () => ({
                            access_token: 'tk', refresh_token: 'rt', expires_in: 3600,
                        }),
                    };
                }
                return {
                    ok: false,
                    status: 404,
                    text: async () => 'Not found',
                };
            });

            const svc = new PixivService();
            await expect(svc.getArtworkById(0)).rejects.toThrow();
        });

        it('should throw when illust is null', async () => {
            mockFetch.mockImplementation(async (url: string) => {
                if (url.includes('oauth.secure.pixiv.net')) {
                    return {
                        ok: true,
                        json: async () => ({
                            access_token: 'tk', refresh_token: 'rt', expires_in: 3600,
                        }),
                    };
                }
                return {
                    ok: true,
                    json: async () => ({ illust: null }),
                };
            });

            const svc = new PixivService();
            await expect(svc.getArtworkById(1)).rejects.toThrow('Artwork not found');
        });
    });

    // --- Singleton export ---
    describe('Singleton', () => {
        it('should export a default singleton instance', () => {
            expect(pixivService).toBeDefined();
            expect(typeof pixivService.search).toBe('function');
            expect(typeof pixivService.authenticate).toBe('function');
        });
    });
});
