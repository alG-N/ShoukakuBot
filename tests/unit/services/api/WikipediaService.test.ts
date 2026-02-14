/**
 * WikipediaService Unit Tests
 * Tests for Wikipedia API search, article summary, random, on-this-day
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
jest.mock('../../../../src/cache/CacheService', () => ({
    __esModule: true,
    default: {
        get: mockCacheGet,
        set: mockCacheSet,
    },
}));

// Mock CircuitBreakerRegistry
jest.mock('../../../../src/core/CircuitBreakerRegistry', () => ({
    __esModule: true,
    circuitBreakerRegistry: {
        execute: jest.fn().mockImplementation((_name: string, fn: () => Promise<any>) => fn()),
    },
}));

import wikipediaService from '../../../../src/services/api/wikipediaService';

describe('WikipediaService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockCacheGet.mockResolvedValue(null);
    });

    describe('search', () => {
        it('should return cached results if available', async () => {
            const cachedResult = {
                success: true,
                results: [{ title: 'Test', description: 'Cached', url: 'https://en.wikipedia.org/wiki/Test' }],
                query: 'test',
            };
            mockCacheGet.mockResolvedValue(cachedResult);

            const result = await wikipediaService.search('test');

            expect(result.success).toBe(true);
            expect(result.fromCache).toBe(true);
            expect(result.results).toEqual(cachedResult.results);
            expect(mockAxiosGet).not.toHaveBeenCalled();
        });

        it('should search Wikipedia API successfully', async () => {
            mockAxiosGet.mockResolvedValue({
                data: [
                    'test',
                    ['Test Article', 'Testing'],
                    ['Description 1', 'Description 2'],
                    ['https://en.wikipedia.org/wiki/Test_Article', 'https://en.wikipedia.org/wiki/Testing'],
                ],
            });

            const result = await wikipediaService.search('test');

            expect(result.success).toBe(true);
            expect(result.results).toHaveLength(2);
            expect(result.results![0].title).toBe('Test Article');
            expect(result.results![0].description).toBe('Description 1');
            expect(result.results![0].url).toBe('https://en.wikipedia.org/wiki/Test_Article');
        });

        it('should cache successful results', async () => {
            mockAxiosGet.mockResolvedValue({
                data: ['test', ['Result'], ['Desc'], ['https://en.wikipedia.org/wiki/Result']],
            });

            await wikipediaService.search('test');

            expect(mockCacheSet).toHaveBeenCalledWith(
                'api:search',
                expect.stringContaining('wiki:search'),
                expect.objectContaining({ success: true }),
                600
            );
        });

        it('should return empty results when no matches', async () => {
            mockAxiosGet.mockResolvedValue({
                data: ['obscurequery', [], [], []],
            });

            const result = await wikipediaService.search('obscurequery');

            expect(result.success).toBe(true);
            expect(result.results).toHaveLength(0);
        });

        it('should handle API errors gracefully', async () => {
            mockAxiosGet.mockRejectedValue(new Error('Network error'));

            const result = await wikipediaService.search('test');

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });

        it('should respect language option', async () => {
            mockAxiosGet.mockResolvedValue({
                data: ['テスト', ['テスト記事'], ['説明'], ['https://ja.wikipedia.org/wiki/テスト記事']],
            });

            await wikipediaService.search('テスト', { language: 'ja' });

            expect(mockAxiosGet).toHaveBeenCalledWith(
                'https://ja.wikipedia.org/w/api.php',
                expect.objectContaining({
                    params: expect.objectContaining({
                        search: 'テスト',
                    }),
                })
            );
        });

        it('should limit results to max 10', async () => {
            mockAxiosGet.mockResolvedValue({
                data: ['test', [], [], []],
            });

            await wikipediaService.search('test', { limit: 50 });

            expect(mockAxiosGet).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    params: expect.objectContaining({
                        limit: 10,
                    }),
                })
            );
        });

        it('should use cache key with language prefix', async () => {
            mockAxiosGet.mockResolvedValue({
                data: ['test', ['R'], ['D'], ['https://de.wikipedia.org/wiki/R']],
            });

            await wikipediaService.search('test', { language: 'de' });

            expect(mockCacheSet).toHaveBeenCalledWith(
                'api:search',
                expect.stringContaining('de_test'),
                expect.anything(),
                expect.any(Number)
            );
        });
    });

    describe('getArticleSummary', () => {
        it('should return cached article if available', async () => {
            const cachedArticle = {
                success: true,
                article: {
                    title: 'Test',
                    displayTitle: 'Test',
                    description: 'A test',
                    extract: 'Test extract',
                    url: 'https://en.wikipedia.org/wiki/Test',
                    thumbnail: null,
                    originalImage: null,
                    language: 'en',
                },
            };
            mockCacheGet.mockResolvedValue(cachedArticle);

            const result = await wikipediaService.getArticleSummary('Test');

            expect(result.success).toBe(true);
            expect(result.fromCache).toBe(true);
            expect(mockAxiosGet).not.toHaveBeenCalled();
        });

        it('should fetch article summary from REST API', async () => {
            mockAxiosGet.mockResolvedValue({
                data: {
                    title: 'JavaScript',
                    displaytitle: 'JavaScript',
                    description: 'Programming language',
                    extract: 'JavaScript is a programming language...',
                    extract_html: '<p>JavaScript is...</p>',
                    content_urls: {
                        desktop: { page: 'https://en.wikipedia.org/wiki/JavaScript' },
                        mobile: { page: 'https://en.m.wikipedia.org/wiki/JavaScript' },
                    },
                    thumbnail: { source: 'https://upload.wikimedia.org/thumb.png' },
                    originalimage: { source: 'https://upload.wikimedia.org/original.png' },
                    type: 'standard',
                    timestamp: '2024-01-01T00:00:00Z',
                    coordinates: null,
                },
            });

            const result = await wikipediaService.getArticleSummary('JavaScript');

            expect(result.success).toBe(true);
            expect(result.article).toBeDefined();
            expect(result.article!.title).toBe('JavaScript');
            expect(result.article!.description).toBe('Programming language');
            expect(result.article!.thumbnail).toBe('https://upload.wikimedia.org/thumb.png');
            expect(result.article!.url).toBe('https://en.wikipedia.org/wiki/JavaScript');
        });

        it('should handle 404 (article not found)', async () => {
            mockAxiosGet.mockRejectedValue({ response: { status: 404 } });

            const result = await wikipediaService.getArticleSummary('NonExistentArticle12345');

            expect(result.success).toBe(false);
            expect(result.code).toBe('NOT_FOUND');
        });

        it('should handle API errors', async () => {
            mockAxiosGet.mockRejectedValue(new Error('Server error'));

            const result = await wikipediaService.getArticleSummary('Test');

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });

        it('should encode title with spaces', async () => {
            mockAxiosGet.mockResolvedValue({
                data: {
                    title: 'Machine Learning',
                    displaytitle: 'Machine Learning',
                    extract: 'Machine learning is...',
                    content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Machine_learning' } },
                },
            });

            await wikipediaService.getArticleSummary('Machine Learning');

            expect(mockAxiosGet).toHaveBeenCalledWith(
                expect.stringContaining('Machine_Learning'),
                expect.anything()
            );
        });

        it('should use different language endpoints', async () => {
            mockAxiosGet.mockResolvedValue({
                data: {
                    title: 'Test',
                    extract: 'Test',
                    content_urls: { desktop: { page: 'https://fr.wikipedia.org/wiki/Test' } },
                },
            });

            await wikipediaService.getArticleSummary('Test', 'fr');

            expect(mockAxiosGet).toHaveBeenCalledWith(
                expect.stringContaining('fr.wikipedia.org'),
                expect.anything()
            );
        });
    });

    describe('getRandomArticle', () => {
        it('should fetch random article', async () => {
            mockAxiosGet.mockResolvedValue({
                data: {
                    title: 'Random Town',
                    displaytitle: 'Random Town',
                    description: 'A small town',
                    extract: 'Random Town is a small town...',
                    content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Random_Town' } },
                    thumbnail: { source: 'https://upload.wikimedia.org/random.png' },
                    type: 'standard',
                },
            });

            const result = await wikipediaService.getRandomArticle();

            expect(result.success).toBe(true);
            expect(result.article).toBeDefined();
            expect(result.article!.title).toBe('Random Town');
        });

        it('should use correct endpoint', async () => {
            mockAxiosGet.mockResolvedValue({
                data: { title: 'T', extract: 'T', content_urls: { desktop: { page: '' } } },
            });

            await wikipediaService.getRandomArticle('ja');

            expect(mockAxiosGet).toHaveBeenCalledWith(
                expect.stringContaining('ja.wikipedia.org/api/rest_v1/page/random/summary'),
                expect.anything()
            );
        });

        it('should handle errors', async () => {
            mockAxiosGet.mockRejectedValue(new Error('Timeout'));

            const result = await wikipediaService.getRandomArticle();

            expect(result.success).toBe(false);
        });
    });

    describe('getOnThisDay', () => {
        it('should fetch on-this-day events', async () => {
            mockAxiosGet.mockResolvedValue({
                data: {
                    events: [
                        {
                            year: 1969,
                            text: 'Apollo 11 lands on the Moon',
                            pages: [
                                {
                                    title: 'Apollo 11',
                                    content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Apollo_11' } },
                                },
                            ],
                        },
                        {
                            year: 1776,
                            text: 'Declaration of Independence signed',
                            pages: [],
                        },
                    ],
                },
            });

            const result = await wikipediaService.getOnThisDay(7, 20);

            expect(result.success).toBe(true);
            expect(result.events).toBeDefined();
            expect(result.events!.length).toBeGreaterThan(0);
            expect(result.events![0].year).toBe(1969);
            expect(result.events![0].text).toContain('Apollo');
            expect(result.date).toEqual({ month: 7, day: 20 });
        });

        it('should limit pages per event to 3', async () => {
            const manyPages = Array.from({ length: 10 }, (_, i) => ({
                title: `Page ${i}`,
                content_urls: { desktop: { page: `https://en.wikipedia.org/wiki/Page_${i}` } },
            }));
            mockAxiosGet.mockResolvedValue({
                data: {
                    events: [{ year: 2000, text: 'Event', pages: manyPages }],
                },
            });

            const result = await wikipediaService.getOnThisDay(1, 1);

            expect(result.events![0].pages).toHaveLength(3);
        });

        it('should limit events to 5', async () => {
            const manyEvents = Array.from({ length: 20 }, (_, i) => ({
                year: 2000 + i,
                text: `Event ${i}`,
                pages: [],
            }));
            mockAxiosGet.mockResolvedValue({
                data: { events: manyEvents },
            });

            const result = await wikipediaService.getOnThisDay(1, 1);

            expect(result.events).toHaveLength(5);
        });

        it('should handle errors', async () => {
            mockAxiosGet.mockRejectedValue(new Error('API error'));

            const result = await wikipediaService.getOnThisDay(1, 1);

            expect(result.success).toBe(false);
        });

        it('should handle empty events', async () => {
            mockAxiosGet.mockResolvedValue({
                data: { events: null },
            });

            const result = await wikipediaService.getOnThisDay(1, 1);

            expect(result.success).toBe(true);
            expect(result.events).toHaveLength(0);
        });
    });

    describe('getFeaturedArticle', () => {
        it('should fetch featured article', async () => {
            mockAxiosGet.mockResolvedValue({
                data: {
                    tfa: {
                        title: 'Featured Article',
                        displaytitle: 'Featured Article',
                        extract: 'This is the featured article...',
                        content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Featured' } },
                        thumbnail: { source: 'https://upload.wikimedia.org/featured.png' },
                    },
                },
            });

            const result = await wikipediaService.getFeaturedArticle(new Date('2024-06-15'));

            expect(result.success).toBe(true);
            expect(result.article).toBeDefined();
            expect(result.article!.title).toBe('Featured Article');
        });

        it('should use correct date in URL', async () => {
            mockAxiosGet.mockResolvedValue({
                data: {
                    tfa: {
                        title: 'Test',
                        extract: 'Test',
                        content_urls: { desktop: { page: '' } },
                    },
                },
            });

            await wikipediaService.getFeaturedArticle(new Date('2024-03-05'));

            expect(mockAxiosGet).toHaveBeenCalledWith(
                expect.stringContaining('/feed/featured/2024/03/05'),
                expect.anything()
            );
        });

        it('should return error when no featured article', async () => {
            mockAxiosGet.mockResolvedValue({
                data: { tfa: null },
            });

            const result = await wikipediaService.getFeaturedArticle();

            expect(result.success).toBe(false);
            expect(result.error).toContain('No featured article');
        });

        it('should handle API errors', async () => {
            mockAxiosGet.mockRejectedValue(new Error('Network error'));

            const result = await wikipediaService.getFeaturedArticle();

            expect(result.success).toBe(false);
        });
    });

    describe('shutdown', () => {
        it('should not throw on shutdown', () => {
            expect(() => wikipediaService.shutdown()).not.toThrow();
        });
    });
});
