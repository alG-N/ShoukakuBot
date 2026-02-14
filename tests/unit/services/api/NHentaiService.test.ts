/**
 * NHentaiService Unit Tests
 * Tests for gallery fetching, search, pure helpers (getPageUrls, parseAllTags, etc.)
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
jest.mock('axios', () => ({
    __esModule: true,
    default: {
        get: mockAxiosGet,
    },
}));

// Mock CacheService
const mockCacheGet = jest.fn().mockResolvedValue(null);
const mockCacheSet = jest.fn().mockResolvedValue(undefined);
const mockCacheClearNamespace = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../../src/cache/CacheService', () => ({
    __esModule: true,
    default: {
        get: mockCacheGet,
        set: mockCacheSet,
        clearNamespace: mockCacheClearNamespace,
    },
}));

// Mock CircuitBreakerRegistry
jest.mock('../../../../src/core/CircuitBreakerRegistry', () => ({
    __esModule: true,
    circuitBreakerRegistry: {
        execute: jest.fn().mockImplementation((_name: string, fn: () => Promise<any>) => fn()),
    },
}));

// Mock nhentai config
jest.mock('../../../../src/config/services', () => ({
    __esModule: true,
    nhentai: {
        baseUrl: 'https://nhentai.net/api',
        cfClearance: '',
        userAgent: 'TestAgent',
    },
}));

import nhentaiService from '../../../../src/services/api/nhentaiService';

// Helper: create a mock gallery
function makeGallery(overrides: Record<string, any> = {}) {
    return {
        id: 177013,
        media_id: '987654',
        title: {
            english: 'Test Gallery',
            japanese: 'テストギャラリー',
            pretty: 'Test',
        },
        images: {
            pages: [
                { t: 'j', w: 1280, h: 1800 },
                { t: 'p', w: 1280, h: 1800 },
                { t: 'g', w: 800, h: 600 },
            ],
            cover: { t: 'j', w: 350, h: 500 },
            thumbnail: { t: 'j', w: 250, h: 350 },
        },
        scanlator: '',
        upload_date: 1609459200,
        tags: [
            { id: 1, type: 'artist' as const, name: 'test_artist', url: '/artist/test/', count: 100 },
            { id: 2, type: 'character' as const, name: 'test_char', url: '/char/test/', count: 50 },
            { id: 3, type: 'parody' as const, name: 'test_parody', url: '/parody/test/', count: 200 },
            { id: 4, type: 'tag' as const, name: 'comedy', url: '/tag/comedy/', count: 500 },
            { id: 5, type: 'language' as const, name: 'english', url: '/lang/en/', count: 99999 },
            { id: 6, type: 'group' as const, name: 'test_group', url: '/group/test/', count: 30 },
            { id: 7, type: 'category' as const, name: 'doujinshi', url: '/cat/doujin/', count: 10000 },
        ],
        num_pages: 3,
        num_favorites: 1000,
        ...overrides,
    };
}

describe('NHentaiService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockCacheGet.mockResolvedValue(null);
        mockAxiosGet.mockReset();
    });

    // --- fetchGallery ---
    describe('fetchGallery', () => {
        it('should return cached gallery when available', async () => {
            const gallery = makeGallery();
            mockCacheGet.mockResolvedValue(gallery);

            const result = await nhentaiService.fetchGallery(177013);

            expect(result).toEqual({ success: true, data: gallery, fromCache: true });
            expect(mockAxiosGet).not.toHaveBeenCalled();
        });

        it('should fetch gallery from API and cache it', async () => {
            const gallery = makeGallery();
            mockAxiosGet.mockResolvedValue({ data: gallery });

            const result = await nhentaiService.fetchGallery(177013);

            expect(result).toEqual({ success: true, data: gallery });
            expect(mockCacheSet).toHaveBeenCalledWith(
                'api:nhentai',
                'nhentai:gallery_177013',
                gallery,
                300
            );
        });

        it('should handle 404 errors', async () => {
            mockAxiosGet.mockRejectedValue({ response: { status: 404 } });

            const result = await nhentaiService.fetchGallery(999999);

            expect(result.success).toBe(false);
            expect(result.code).toBe('NOT_FOUND');
        });

        it('should handle 403 with retries', async () => {
            // The _fetchWithRetry logic retries on 403
            mockAxiosGet.mockRejectedValue({ response: { status: 403 } });

            const result = await nhentaiService.fetchGallery(12345);

            expect(result.success).toBe(false);
            expect(result.code).toBe('FORBIDDEN');
            // Should have retried (3 attempts total: initial + 2 retries)
            expect(mockAxiosGet).toHaveBeenCalledTimes(3);
        }, 15000);

        it('should handle 429 rate limit', async () => {
            mockAxiosGet.mockRejectedValue({ response: { status: 429 } });

            const result = await nhentaiService.fetchGallery(12345);

            expect(result.success).toBe(false);
            expect(result.code).toBe('RATE_LIMITED');
        });

        it('should handle timeout errors', async () => {
            mockAxiosGet.mockRejectedValue({ code: 'ECONNABORTED' });

            const result = await nhentaiService.fetchGallery(12345);

            expect(result.success).toBe(false);
            expect(result.code).toBe('TIMEOUT');
        });

        it('should accept string code', async () => {
            const gallery = makeGallery();
            mockAxiosGet.mockResolvedValue({ data: gallery });

            const result = await nhentaiService.fetchGallery('177013');
            expect(result.success).toBe(true);
        });
    });

    // --- searchGalleries ---
    describe('searchGalleries', () => {
        it('should return cached search results', async () => {
            const cachedData = { results: [makeGallery()], numPages: 1, perPage: 25, totalResults: 25 };
            mockCacheGet.mockResolvedValue(cachedData);

            const result = await nhentaiService.searchGalleries('test');

            expect(result).toEqual({ success: true, data: cachedData, fromCache: true });
            expect(mockAxiosGet).not.toHaveBeenCalled();
        });

        it('should search galleries and return results', async () => {
            mockAxiosGet.mockResolvedValue({
                data: {
                    result: [makeGallery()],
                    num_pages: 5,
                    per_page: 25,
                },
            });

            const result = await nhentaiService.searchGalleries('test');

            expect(result.success).toBe(true);
            expect(result.data!.results).toHaveLength(1);
            expect(result.data!.numPages).toBe(5);
            expect(result.data!.perPage).toBe(25);
        });

        it('should pass sort parameter correctly', async () => {
            mockAxiosGet.mockResolvedValue({
                data: { result: [], num_pages: 0, per_page: 25 },
            });

            await nhentaiService.searchGalleries('test', 1, 'recent');

            expect(mockAxiosGet).toHaveBeenCalledWith(
                expect.stringContaining('sort=date'),
                expect.anything()
            );
        });

        it('should cache search results', async () => {
            mockAxiosGet.mockResolvedValue({
                data: { result: [makeGallery()], num_pages: 1, per_page: 25 },
            });

            await nhentaiService.searchGalleries('test');

            expect(mockCacheSet).toHaveBeenCalledWith(
                'api:nhentai',
                expect.stringContaining('nhentai:search_test_1_popular'),
                expect.objectContaining({ results: expect.any(Array) }),
                300
            );
        });

        it('should handle API errors', async () => {
            mockAxiosGet.mockRejectedValue({ response: { status: 500 }, message: 'Server error' });

            const result = await nhentaiService.searchGalleries('error');

            expect(result.success).toBe(false);
        });
    });

    // --- getSearchSuggestions ---
    describe('getSearchSuggestions', () => {
        it('should return empty array for short queries', async () => {
            const result = await nhentaiService.getSearchSuggestions('a');
            expect(result).toEqual([]);
        });

        it('should return cached suggestions', async () => {
            mockCacheGet.mockResolvedValue(['tag1', 'tag2']);

            const result = await nhentaiService.getSearchSuggestions('test');

            expect(result).toEqual(['tag1', 'tag2']);
        });

        it('should extract tags from search results', async () => {
            const gallery = makeGallery({
                tags: [
                    { id: 1, type: 'tag', name: 'comedy', url: '', count: 100 },
                    { id: 2, type: 'character', name: 'test character', url: '', count: 50 },
                ],
                title: { english: 'Test Gallery', japanese: null, pretty: null },
            });
            mockAxiosGet.mockResolvedValue({
                data: { result: [gallery], num_pages: 1, per_page: 25 },
            });

            const result = await nhentaiService.getSearchSuggestions('test');

            expect(result.length).toBeGreaterThan(0);
            expect(mockCacheSet).toHaveBeenCalled();
        });

        it('should handle errors gracefully', async () => {
            mockAxiosGet.mockRejectedValue(new Error('Network error'));

            const result = await nhentaiService.getSearchSuggestions('test');

            expect(result).toEqual([]);
        });
    });

    // --- Pure helpers ---
    describe('getPageUrls', () => {
        it('should return correct page URLs', () => {
            const gallery = makeGallery();
            const urls = nhentaiService.getPageUrls(gallery);

            expect(urls).toHaveLength(3);
            expect(urls[0]).toEqual({
                pageNum: 1,
                url: 'https://i.nhentai.net/galleries/987654/1.jpg',
                width: 1280,
                height: 1800,
            });
            expect(urls[1].url).toContain('.png'); // page 2 is type 'p'
            expect(urls[2].url).toContain('.gif'); // page 3 is type 'g'
        });

        it('should support start and end page', () => {
            const gallery = makeGallery();
            const urls = nhentaiService.getPageUrls(gallery, 2, 3);

            expect(urls).toHaveLength(2);
            expect(urls[0].pageNum).toBe(2);
            expect(urls[1].pageNum).toBe(3);
        });

        it('should return empty array for gallery with no pages', () => {
            const gallery = makeGallery({ images: { pages: [], cover: { t: 'j' }, thumbnail: { t: 'j' } } });
            const urls = nhentaiService.getPageUrls(gallery);
            expect(urls).toEqual([]);
        });

        it('should clamp end page to actual page count', () => {
            const gallery = makeGallery();
            const urls = nhentaiService.getPageUrls(gallery, 1, 100);
            expect(urls).toHaveLength(3); // only 3 pages exist
        });
    });

    describe('getThumbnailUrl', () => {
        it('should return correct thumbnail URL', () => {
            const url = nhentaiService.getThumbnailUrl('12345', 'j');
            expect(url).toBe('https://t.nhentai.net/galleries/12345/cover.jpg');
        });

        it('should handle png type', () => {
            const url = nhentaiService.getThumbnailUrl('12345', 'p');
            expect(url).toBe('https://t.nhentai.net/galleries/12345/cover.png');
        });

        it('should default to jpg for unknown type', () => {
            const url = nhentaiService.getThumbnailUrl('12345', 'x');
            expect(url).toBe('https://t.nhentai.net/galleries/12345/cover.jpg');
        });
    });

    describe('getPageThumbnailUrl', () => {
        it('should return correct page thumbnail URL', () => {
            const url = nhentaiService.getPageThumbnailUrl('12345', 5, 'j');
            expect(url).toBe('https://t.nhentai.net/galleries/12345/5t.jpg');
        });
    });

    describe('getTagsByType', () => {
        it('should filter tags by type', () => {
            const tags = makeGallery().tags;
            expect(nhentaiService.getTagsByType(tags, 'artist')).toEqual(['test_artist']);
            expect(nhentaiService.getTagsByType(tags, 'character')).toEqual(['test_char']);
            expect(nhentaiService.getTagsByType(tags, 'tag')).toEqual(['comedy']);
        });

        it('should return empty array for undefined tags', () => {
            expect(nhentaiService.getTagsByType(undefined, 'artist')).toEqual([]);
        });

        it('should limit to 15 tags', () => {
            const manyTags = Array.from({ length: 20 }, (_, i) => ({
                id: i, type: 'tag' as const, name: `tag${i}`, url: '', count: i,
            }));
            const result = nhentaiService.getTagsByType(manyTags, 'tag');
            expect(result).toHaveLength(15);
        });
    });

    describe('parseAllTags', () => {
        it('should parse all tag types', () => {
            const tags = makeGallery().tags;
            const parsed = nhentaiService.parseAllTags(tags);

            expect(parsed.artists).toEqual(['test_artist']);
            expect(parsed.characters).toEqual(['test_char']);
            expect(parsed.parodies).toEqual(['test_parody']);
            expect(parsed.groups).toEqual(['test_group']);
            expect(parsed.tags).toEqual(['comedy']);
            expect(parsed.languages).toEqual(['english']);
            expect(parsed.categories).toEqual(['doujinshi']);
        });

        it('should handle undefined tags', () => {
            const parsed = nhentaiService.parseAllTags(undefined);
            expect(parsed.artists).toEqual([]);
            expect(parsed.tags).toEqual([]);
        });
    });

    // --- clearCache ---
    describe('clearCache', () => {
        it('should clear the nhentai cache namespace', async () => {
            await nhentaiService.clearCache();
            expect(mockCacheClearNamespace).toHaveBeenCalledWith('api:nhentai');
        });
    });

    // --- destroy ---
    describe('destroy', () => {
        it('should not throw', () => {
            expect(() => nhentaiService.destroy()).not.toThrow();
        });
    });
});
