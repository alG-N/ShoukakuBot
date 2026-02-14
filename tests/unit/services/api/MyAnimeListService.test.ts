/**
 * MyAnimeListService Unit Tests
 * Tests for MAL/Jikan API search, transform, autocomplete, rate limiting
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

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

import myAnimeListService from '../../../../src/services/api/myAnimeListService';

// Helper: build a typical Jikan anime response
function makeJikanAnime(overrides: Record<string, any> = {}) {
    return {
        mal_id: 1,
        title: 'Cowboy Bebop',
        title_english: 'Cowboy Bebop',
        title_japanese: 'カウボーイビバップ',
        images: { jpg: { image_url: 'https://img.jpg', large_image_url: 'https://img-lg.jpg' } },
        synopsis: 'A bounty hunter story.',
        episodes: 26,
        score: 8.78,
        scored_by: 500000,
        rank: 28,
        popularity: 39,
        members: 1500000,
        favorites: 60000,
        type: 'TV',
        season: 'spring',
        year: 1998,
        status: 'Finished Airing',
        source: 'Original',
        genres: [{ mal_id: 1, name: 'Action' }, { mal_id: 24, name: 'Sci-Fi' }],
        duration: '24 min per ep',
        aired: { from: '1998-04-03T00:00:00+00:00', to: '1999-04-24T00:00:00+00:00' },
        studios: [{ mal_id: 14, name: 'Sunrise' }],
        trailer: { youtube_id: 'abc123' },
        url: 'https://myanimelist.net/anime/1/Cowboy_Bebop',
        rating: 'R - 17+ (violence & profanity)',
        broadcast: { string: 'Saturdays at 01:00 (JST)' },
        relations: [
            {
                relation: 'Sequel',
                entry: [{ mal_id: 5, name: 'Cowboy Bebop: Tengoku no Tobira', type: 'anime' }],
            },
        ],
        ...overrides,
    };
}

function makeJikanManga(overrides: Record<string, any> = {}) {
    return {
        mal_id: 2,
        title: 'Berserk',
        title_english: 'Berserk',
        title_japanese: 'ベルセルク',
        images: { jpg: { image_url: 'https://manga.jpg' } },
        synopsis: 'A dark fantasy epic.',
        chapters: 364,
        volumes: 41,
        score: 9.43,
        scored_by: 300000,
        rank: 1,
        popularity: 2,
        members: 500000,
        favorites: 80000,
        type: 'Manga',
        status: 'Publishing',
        genres: [{ mal_id: 1, name: 'Action' }],
        themes: [{ name: 'Military' }],
        demographics: [{ name: 'Seinen' }],
        published: { from: '1989-08-25', to: null },
        authors: [{ name: 'Miura, Kentarou', type: 'Story & Art' }],
        serializations: [{ name: 'Young Animal' }],
        url: 'https://myanimelist.net/manga/2/Berserk',
        relations: [],
        ...overrides,
    };
}

describe('MyAnimeListService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockCacheGet.mockResolvedValue(null);
        mockCachePeek.mockResolvedValue(null);
        mockFetch.mockReset();
    });

    // --- searchMedia (anime) ---
    describe('searchMedia', () => {
        it('should return cached result when available', async () => {
            const cachedAnime = { id: 1, title: { romaji: 'Cached' } };
            mockCacheGet.mockResolvedValue(cachedAnime);

            const result = await myAnimeListService.searchMedia('test');

            expect(result).toEqual(cachedAnime);
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('should fetch and transform anime data', async () => {
            const anime = makeJikanAnime();
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ data: [anime] }),
            });

            const result = await myAnimeListService.searchMedia('cowboy bebop');

            expect(result).not.toBeNull();
            expect(result!.id).toBe(1);
            expect(result!.title.romaji).toBe('Cowboy Bebop');
            expect(result!.title.english).toBe('Cowboy Bebop');
            expect((result as any).averageScore).toBe(88); // 8.78 * 10 = 87.8 → rounded 88
            expect((result as any).genres).toEqual(['Action', 'Sci-Fi']);
            expect((result as any).studios?.nodes).toEqual([{ name: 'Sunrise' }]);
        });

        it('should cache the fetched result', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ data: [makeJikanAnime()] }),
            });

            await myAnimeListService.searchMedia('test');

            expect(mockCacheSet).toHaveBeenCalledWith(
                'api:anime',
                expect.stringContaining('mal:search_anime_test'),
                expect.objectContaining({ id: 1 }),
                300
            );
        });

        it('should return null when no results found', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ data: [] }),
            });

            const result = await myAnimeListService.searchMedia('nonexistent');
            expect(result).toBeNull();
        });

        it('should return null on API error', async () => {
            mockFetch.mockResolvedValue({ ok: false, status: 500 });

            const result = await myAnimeListService.searchMedia('error');
            expect(result).toBeNull();
        });

        it('should handle manga type search', async () => {
            const manga = makeJikanManga();
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ data: [manga] }),
            });

            const result = await myAnimeListService.searchMedia('berserk', 'manga' as any);

            expect(result).not.toBeNull();
            expect(result!.id).toBe(2);
            expect((result as any).chapters).toBe(364);
            expect((result as any).volumes).toBe(41);
            expect((result as any).authors).toEqual([{ name: 'Miura, Kentarou', role: 'Story & Art' }]);
        });

        it('should handle lightnovel type', async () => {
            const ln = makeJikanManga({ type: 'Light Novel' });
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ data: [ln] }),
            });

            const result = await myAnimeListService.searchMedia('sword art', 'lightnovel' as any);

            expect(result).not.toBeNull();
            // URL should include &type=lightnovel
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('type=lightnovel'),
                expect.anything()
            );
        });

        it('should transform relations correctly', async () => {
            const anime = makeJikanAnime();
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ data: [anime] }),
            });

            const result = await myAnimeListService.searchMedia('test');

            expect((result as any).relations.edges).toHaveLength(1);
            expect((result as any).relations.edges[0].relationType).toBe('SEQUEL');
            expect((result as any).relations.edges[0].node.id).toBe(5);
        });

        it('should transform trailer correctly', async () => {
            const anime = makeJikanAnime({ trailer: { youtube_id: 'xyz789' } });
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ data: [anime] }),
            });

            const result = await myAnimeListService.searchMedia('test');

            expect((result as any).trailer).toEqual({ id: 'xyz789', site: 'youtube' });
        });

        it('should set trailer to null when no youtube_id', async () => {
            const anime = makeJikanAnime({ trailer: {} });
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ data: [anime] }),
            });

            const result = await myAnimeListService.searchMedia('test');

            expect((result as any).trailer).toBeNull();
        });

        it('should map anime status correctly', async () => {
            const anime = makeJikanAnime({ status: 'Currently Airing' });
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ data: [anime] }),
            });

            const result = await myAnimeListService.searchMedia('test');
            expect(result!.status).toBe('RELEASING');
        });

        it('should map manga status correctly', async () => {
            const manga = makeJikanManga({ status: 'On Hiatus' });
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ data: [manga] }),
            });

            const result = await myAnimeListService.searchMedia('test', 'manga' as any);
            expect(result!.status).toBe('HIATUS');
        });

        it('should parse dates correctly', async () => {
            const anime = makeJikanAnime();
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ data: [anime] }),
            });

            const result = await myAnimeListService.searchMedia('test');

            expect((result as any).startDate).toEqual(expect.objectContaining({
                year: expect.any(Number),
                month: expect.any(Number),
                day: expect.any(Number),
            }));
        });

        it('should handle missing optional fields gracefully', async () => {
            const minimal = makeJikanAnime({
                title_english: undefined,
                title_japanese: undefined,
                images: undefined,
                synopsis: undefined,
                episodes: undefined,
                score: undefined,
                genres: undefined,
                studios: undefined,
                trailer: undefined,
                aired: undefined,
                relations: undefined,
            });
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ data: [minimal] }),
            });

            const result = await myAnimeListService.searchMedia('test');

            expect(result).not.toBeNull();
            expect(result!.title.english).toBeNull();
            expect((result as any).coverImage.large).toBeNull();
            expect((result as any).description).toBeNull();
            expect((result as any).episodes).toBeNull();
            expect((result as any).averageScore).toBeNull();
            expect((result as any).genres).toEqual([]);
        });
    });

    // --- searchAnime ---
    describe('searchAnime', () => {
        it('should delegate to searchMedia with anime type', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ data: [makeJikanAnime()] }),
            });

            const result = await myAnimeListService.searchAnime('test');
            expect(result).not.toBeNull();
            expect((result as any).mediaType).toBe('anime');
        });
    });

    // --- searchMediaAutocomplete ---
    describe('searchMediaAutocomplete', () => {
        it('should return cached autocomplete results', async () => {
            const cached = [{ id: 1, title: { romaji: 'Test' } }];
            mockCacheGet.mockResolvedValue(cached);

            const result = await myAnimeListService.searchMediaAutocomplete('test');

            expect(result).toEqual(cached);
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('should fetch and transform autocomplete results', async () => {
            const animeList = [
                makeJikanAnime({ mal_id: 10, title: 'Naruto', score: 8.0 }),
                makeJikanAnime({ mal_id: 20, title: 'Naruto Shippuuden', score: 8.5 }),
            ];
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ data: animeList }),
            });

            const result = await myAnimeListService.searchMediaAutocomplete('naruto');

            expect(result).toHaveLength(2);
            expect(result[0].id).toBe(10);
            expect(result[0].title.romaji).toBe('Naruto');
            expect(result[0].averageScore).toBe(80);
        });

        it('should cache autocomplete results', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ data: [makeJikanAnime()] }),
            });

            await myAnimeListService.searchMediaAutocomplete('test');

            expect(mockCacheSet).toHaveBeenCalledWith(
                'api:anime',
                expect.stringContaining('mal:autocomplete_anime_test'),
                expect.any(Array),
                300
            );
        });

        it('should not cache empty results', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ data: [] }),
            });

            const result = await myAnimeListService.searchMediaAutocomplete('empty');

            expect(result).toEqual([]);
            // cacheSet may be called for rate limit key, but NOT for autocomplete key
            const autocompleteCacheCall = mockCacheSet.mock.calls.find(
                (call: any[]) => call[1]?.includes('autocomplete')
            );
            expect(autocompleteCacheCall).toBeUndefined();
        });

        it('should return empty array on API failure', async () => {
            mockFetch.mockResolvedValue({ ok: false, status: 500 });

            const result = await myAnimeListService.searchMediaAutocomplete('error');
            expect(result).toEqual([]);
        });

        it('should respect limit parameter', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ data: [makeJikanAnime()] }),
            });

            await myAnimeListService.searchMediaAutocomplete('test', 'anime' as any, 5);

            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('limit=5'),
                expect.anything()
            );
        });
    });

    // --- getAnimeById ---
    describe('getAnimeById', () => {
        it('should return cached anime by ID', async () => {
            const cached = { id: 1, title: { romaji: 'Cached' } };
            mockCacheGet.mockResolvedValue(cached);

            const result = await myAnimeListService.getAnimeById(1);

            expect(result).toEqual(cached);
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('should fetch anime by ID from API', async () => {
            const anime = makeJikanAnime({ mal_id: 42 });
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ data: anime }),
            });

            const result = await myAnimeListService.getAnimeById(42);

            expect(result).not.toBeNull();
            expect(result!.id).toBe(42);
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('/anime/42/full'),
                expect.anything()
            );
        });

        it('should return null on API error', async () => {
            mockFetch.mockResolvedValue({ ok: false, status: 404 });

            const result = await myAnimeListService.getAnimeById(999999);
            expect(result).toBeNull();
        });

        it('should cache fetched anime', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ data: makeJikanAnime({ mal_id: 7 }) }),
            });

            await myAnimeListService.getAnimeById(7);

            expect(mockCacheSet).toHaveBeenCalledWith(
                'api:anime',
                'mal:anime_7',
                expect.objectContaining({ id: 7 }),
                300
            );
        });
    });

    // --- searchAnimeAutocomplete ---
    describe('searchAnimeAutocomplete', () => {
        it('should delegate to searchMediaAutocomplete', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ data: [makeJikanAnime()] }),
            });

            const result = await myAnimeListService.searchAnimeAutocomplete('test', 5);
            expect(result).toHaveLength(1);
        });
    });
});
