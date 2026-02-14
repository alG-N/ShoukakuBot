/**
 * AnilistService Unit Tests
 * Tests for AniList GraphQL API integration
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

// Mock graphql-request
const mockRequest = jest.fn();
jest.mock('graphql-request', () => ({
    __esModule: true,
    GraphQLClient: jest.fn().mockImplementation(() => ({
        request: mockRequest,
    })),
    gql: jest.fn().mockImplementation((strings: TemplateStringsArray) => strings.join('')),
}));

// Mock CacheService
const mockCacheGet = jest.fn().mockResolvedValue(null);
const mockCacheSet = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../../src/cache/CacheService', () => ({
    __esModule: true,
    default: {
        get: mockCacheGet,
        set: mockCacheSet,
    },
}));

// Mock CircuitBreakerRegistry
const mockCBExecute = jest.fn().mockImplementation((fn: () => Promise<any>) => fn());
jest.mock('../../../../src/core/CircuitBreakerRegistry', () => ({
    __esModule: true,
    circuitBreakerRegistry: {
        initialize: jest.fn(),
        get: jest.fn().mockReturnValue({
            execute: mockCBExecute,
        }),
    },
}));

// Mock GracefulDegradation
jest.mock('../../../../src/core/GracefulDegradation', () => ({
    __esModule: true,
    default: {
        initialize: jest.fn(),
        registerFallback: jest.fn(),
        markHealthy: jest.fn(),
        markDegraded: jest.fn(),
    },
}));

import { AnilistService, anilistService } from '../../../../src/services/api/anilistService';

describe('AnilistService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockCacheGet.mockResolvedValue(null);
        mockCBExecute.mockImplementation((fn: () => Promise<any>) => fn());
    });

    describe('searchAnime', () => {
        it('should search and return anime data', async () => {
            const mockAnime = {
                id: 1,
                title: { romaji: 'Naruto', english: 'Naruto', native: 'ナルト' },
                coverImage: { large: 'https://example.com/cover.jpg', color: '#FF0000' },
                description: 'A ninja anime',
                episodes: 220,
                averageScore: 79,
                status: 'FINISHED',
                genres: ['Action', 'Adventure'],
            };
            mockRequest.mockResolvedValue({ Media: mockAnime });

            const result = await anilistService.searchAnime('Naruto');

            expect(result).toBeDefined();
            expect(result?.title?.romaji).toBe('Naruto');
        });

        it('should return cached result', async () => {
            const cached = {
                id: 1,
                title: { romaji: 'Cached Anime' },
            };
            mockCacheGet.mockResolvedValue(cached);

            const result = await anilistService.searchAnime('cached');

            expect(result?.title?.romaji).toBe('Cached Anime');
            expect(mockRequest).not.toHaveBeenCalled();
        });

        it('should return null when no results', async () => {
            mockRequest.mockResolvedValue({ Media: null });

            const result = await anilistService.searchAnime('nonexistent');

            expect(result).toBeNull();
        });

        it('should handle API errors gracefully', async () => {
            mockRequest.mockRejectedValue(new Error('API Error'));
            mockCBExecute.mockRejectedValue(new Error('API Error'));

            await expect(anilistService.searchAnime('error')).rejects.toThrow();
        });
    });

    describe('searchAnimeAutocomplete', () => {
        it('should return autocomplete suggestions', async () => {
            mockRequest.mockResolvedValue({
                Page: {
                    media: [
                        { id: 1, title: { romaji: 'Naruto' }, format: 'TV', status: 'FINISHED', seasonYear: 2002, averageScore: 79 },
                        { id: 2, title: { romaji: 'Naruto Shippuden' }, format: 'TV', status: 'FINISHED', seasonYear: 2007, averageScore: 85 },
                    ],
                },
            });

            const results = await anilistService.searchAnimeAutocomplete('Naruto');

            expect(results).toHaveLength(2);
            expect(results[0].title.romaji).toBe('Naruto');
        });

        it('should return empty array on error', async () => {
            mockRequest.mockRejectedValue(new Error('Error'));

            const results = await anilistService.searchAnimeAutocomplete('error');

            expect(results).toEqual([]);
        });
    });

    describe('getAnimeById', () => {
        it('should fetch anime by ID', async () => {
            mockRequest.mockResolvedValue({
                Media: { id: 1, title: { romaji: 'Test Anime' }, status: 'FINISHED' },
            });

            const result = await anilistService.getAnimeById(1);

            expect(result?.id).toBe(1);
        });

        it('should return null on error', async () => {
            mockRequest.mockRejectedValue(new Error('Not found'));

            const result = await anilistService.getAnimeById(999999);

            expect(result).toBeNull();
        });
    });

    describe('utility methods', () => {
        it('formatDuration should format minutes to hours and minutes', () => {
            expect(anilistService.formatDuration(90)).toBe('1h 30m');
            expect(anilistService.formatDuration(24)).toBe('24m');
            expect(anilistService.formatDuration(null)).toBe('N/A');
            expect(anilistService.formatDuration(120)).toBe('2h 0m');
        });

        it('getRecommendation should return appropriate labels', () => {
            expect(anilistService.getRecommendation(90)).toBe('🔥 Must Watch');
            expect(anilistService.getRecommendation(75)).toBe('👍 Good');
            expect(anilistService.getRecommendation(60)).toBe('👌 Decent');
            expect(anilistService.getRecommendation(40)).toBe('😬 Skip or Unknown');
            expect(anilistService.getRecommendation(null)).toBe('😬 Skip or Unknown');
        });

        it('truncate should trim long strings', () => {
            expect(anilistService.truncate('Short')).toBe('Short');
            expect(anilistService.truncate('x'.repeat(1500), 1000)).toBe('x'.repeat(1000) + '...');
            expect(anilistService.truncate(null)).toBe('');
        });

        it('formatDate should format FuzzyDate', () => {
            expect(anilistService.formatDate({ year: 2024, month: 1, day: 15 })).toBe('15/1/2024');
            expect(anilistService.formatDate({ year: 2024, month: null, day: null })).toBe('?/?/2024');
            expect(anilistService.formatDate(null)).toBe('Unknown');
        });

        it('formatCountdown should format seconds to d/h/m', () => {
            expect(anilistService.formatCountdown(90061)).toBe('1d 1h 1m');
            expect(anilistService.formatCountdown(3661)).toBe('0d 1h 1m');
            expect(anilistService.formatCountdown(0)).toBe('Airing now');
            expect(anilistService.formatCountdown(-1)).toBe('Airing now');
        });

        it('getTrailerUrl should build trailer links', () => {
            expect(anilistService.getTrailerUrl({ id: 'abc', site: 'youtube' }))
                .toContain('youtube.com/watch?v=abc');
            expect(anilistService.getTrailerUrl({ id: 'abc', site: 'dailymotion' }))
                .toContain('dailymotion.com/video/abc');
            expect(anilistService.getTrailerUrl(null)).toBe('None');
            expect(anilistService.getTrailerUrl({ id: null, site: null })).toBe('None');
        });

        it('formatRelatedEntries should format relation edges', () => {
            const edges = [
                {
                    relationType: 'SEQUEL' as const,
                    node: {
                        id: 2,
                        title: { romaji: 'Test S2', english: null, native: null },
                        type: 'ANIME',
                        status: 'FINISHED',
                        averageScore: 85,
                    },
                },
            ];

            const result = anilistService.formatRelatedEntries(edges);

            expect(result).toContain('Test S2');
            expect(result).toContain('[TV]');
        });

        it('formatRelatedEntries should return message when no entries', () => {
            expect(anilistService.formatRelatedEntries(null)).toContain('No other seasons');
            expect(anilistService.formatRelatedEntries([])).toContain('No other seasons');
        });

        it('formatRelatedEntries should skip non-anime/movie entries', () => {
            const edges = [
                {
                    relationType: 'ADAPTATION' as const,
                    node: {
                        id: 3,
                        title: { romaji: 'Manga Ver', english: null, native: null },
                        type: 'MANGA',
                        status: 'FINISHED',
                        averageScore: 90,
                    },
                },
            ];

            const result = anilistService.formatRelatedEntries(edges);

            expect(result).toContain('No other seasons');
        });
    });
});
