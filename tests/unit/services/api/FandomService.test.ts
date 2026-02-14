/**
 * FandomService Unit Tests
 * Tests for Fandom wiki API integration (search, article, wiki info)
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

import { FandomService, fandomService } from '../../../../src/services/api/fandomService';

describe('FandomService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockCacheGet.mockResolvedValue(null);
    });

    describe('getWikiSubdomain', () => {
        it('should resolve popular wiki aliases', () => {
            expect(fandomService.getWikiSubdomain('genshin')).toBe('genshin-impact');
            expect(fandomService.getWikiSubdomain('minecraft')).toBe('minecraft');
            expect(fandomService.getWikiSubdomain('naruto')).toBe('naruto');
            expect(fandomService.getWikiSubdomain('jjk')).toBe('jujutsu-kaisen');
        });

        it('should normalize custom wiki names', () => {
            expect(fandomService.getWikiSubdomain('My Wiki')).toBe('my-wiki');
            expect(fandomService.getWikiSubdomain('some_wiki')).toBe('some-wiki');
        });

        it('should handle case insensitivity', () => {
            expect(fandomService.getWikiSubdomain('GENSHIN')).toBe('genshin-impact');
            expect(fandomService.getWikiSubdomain('Minecraft')).toBe('minecraft');
        });
    });

    describe('search', () => {
        it('should search wiki and return results', async () => {
            mockAxiosGet.mockResolvedValue({
                data: {
                    query: {
                        search: [
                            { title: 'Luffy', pageid: 1, snippet: '<b>Monkey D. Luffy</b> is a pirate' },
                            { title: 'Zoro', pageid: 2, snippet: 'Roronoa <b>Zoro</b>' },
                        ],
                    },
                },
            });

            const result = await fandomService.search('onepiece', 'luffy');

            expect(result.success).toBe(true);
            expect(result.results).toHaveLength(2);
            expect(result.results![0].title).toBe('Luffy');
            // Snippet should have HTML stripped
            expect(result.results![0].snippet).not.toContain('<b>');
        });

        it('should return cached results', async () => {
            const cached = { success: true, results: [{ title: 'Cached' }], wiki: 'test' };
            mockCacheGet.mockResolvedValue(cached);

            const result = await fandomService.search('test', 'query');

            expect(result.fromCache).toBe(true);
            expect(mockAxiosGet).not.toHaveBeenCalled();
        });

        it('should return empty results when nothing found', async () => {
            mockAxiosGet.mockResolvedValue({
                data: { query: { search: [] } },
            });

            const result = await fandomService.search('test', 'nonexistent');

            expect(result.success).toBe(true);
            expect(result.results).toHaveLength(0);
        });

        it('should handle 404 wiki not found', async () => {
            const error: any = new Error('Not Found');
            error.response = { status: 404 };
            mockAxiosGet.mockRejectedValue(error);

            const result = await fandomService.search('fakewiki', 'query');

            expect(result.success).toBe(false);
            expect(result.error).toContain('not found');
        });

        it('should handle network errors', async () => {
            mockAxiosGet.mockRejectedValue(new Error('Network error'));

            const result = await fandomService.search('test', 'query');

            expect(result.success).toBe(false);
        });

        it('should cache successful results', async () => {
            mockAxiosGet.mockResolvedValue({
                data: { query: { search: [{ title: 'Test', pageid: 1, snippet: 'Test' }] } },
            });

            await fandomService.search('test', 'query');

            expect(mockCacheSet).toHaveBeenCalled();
        });
    });

    describe('getArticle', () => {
        it('should fetch and return article data', async () => {
            mockAxiosGet.mockResolvedValue({
                data: {
                    query: {
                        pages: {
                            '123': {
                                title: 'Luffy',
                                extract: 'Monkey D. Luffy is the main protagonist.',
                                fullurl: 'https://onepiece.fandom.com/wiki/Luffy',
                                thumbnail: { source: 'https://example.com/thumb.jpg' },
                                categories: [{ title: 'Category:Characters' }],
                            },
                        },
                    },
                },
            });

            const result = await fandomService.getArticle('onepiece', 'Luffy');

            expect(result.success).toBe(true);
            expect(result.article?.title).toBe('Luffy');
            expect(result.article?.extract).toContain('Monkey D. Luffy');
            expect(result.article?.thumbnail).toBe('https://example.com/thumb.jpg');
        });

        it('should handle article not found (page ID -1)', async () => {
            mockAxiosGet.mockResolvedValue({
                data: { query: { pages: { '-1': { title: 'Not Found', missing: true } } } },
            });

            const result = await fandomService.getArticle('test', 'NonExistent');

            expect(result.success).toBe(false);
            expect(result.error).toContain('not found');
        });

        it('should handle API errors', async () => {
            mockAxiosGet.mockRejectedValue(new Error('Server error'));

            const result = await fandomService.getArticle('test', 'Test');

            expect(result.success).toBe(false);
        });

        it('should cache successful articles', async () => {
            mockAxiosGet.mockResolvedValue({
                data: { query: { pages: { '1': { title: 'Test', extract: 'Content' } } } },
            });

            await fandomService.getArticle('test', 'Test');

            expect(mockCacheSet).toHaveBeenCalled();
        });
    });

    describe('getRandomArticle', () => {
        it('should fetch a random article', async () => {
            let callCount = 0;
            mockAxiosGet.mockImplementation(() => {
                callCount++;
                if (callCount === 1) {
                    // Random endpoint
                    return Promise.resolve({
                        data: { query: { random: [{ title: 'Random Article' }] } },
                    });
                }
                // Article fetch
                return Promise.resolve({
                    data: { query: { pages: { '1': { title: 'Random Article', extract: 'Content' } } } },
                });
            });

            const result = await fandomService.getRandomArticle('test');

            expect(result.success).toBe(true);
        });

        it('should handle empty random response', async () => {
            mockAxiosGet.mockResolvedValue({
                data: { query: { random: [] } },
            });

            const result = await fandomService.getRandomArticle('test');

            expect(result.success).toBe(false);
        });
    });

    describe('getWikiInfo', () => {
        it('should fetch wiki information', async () => {
            mockAxiosGet.mockResolvedValue({
                data: {
                    query: {
                        general: {
                            sitename: 'One Piece Wiki',
                            base: 'https://onepiece.fandom.com',
                            logo: 'https://example.com/logo.png',
                            lang: 'en',
                            generator: 'MediaWiki 1.39',
                        },
                        statistics: {
                            articles: 15000,
                            pages: 100000,
                            edits: 500000,
                            users: 50000,
                            activeusers: 500,
                            images: 30000,
                        },
                    },
                },
            });

            const result = await fandomService.getWikiInfo('onepiece');

            expect(result.success).toBe(true);
            expect(result.info?.name).toBe('One Piece Wiki');
            expect(result.info?.articles).toBe(15000);
        });

        it('should handle missing general info', async () => {
            mockAxiosGet.mockResolvedValue({
                data: { query: {} },
            });

            const result = await fandomService.getWikiInfo('test');

            expect(result.success).toBe(false);
        });
    });

    describe('getPopularWikis', () => {
        it('should return a list of popular wikis', () => {
            const wikis = fandomService.getPopularWikis();

            expect(wikis.length).toBeGreaterThan(0);
            expect(wikis[0]).toHaveProperty('name');
            expect(wikis[0]).toHaveProperty('alias');
            expect(wikis[0]).toHaveProperty('subdomain');
        });
    });

    describe('searchWikis', () => {
        it('should return local matches', async () => {
            const results = await fandomService.searchWikis('minecraft');

            expect(results.length).toBeGreaterThan(0);
            expect(results.some(r => r.subdomain === 'minecraft')).toBe(true);
        });

        it('should search community API when few local matches', async () => {
            mockAxiosGet.mockResolvedValue({
                data: { query: { wikiasearch: { result: [] } } },
            });

            const results = await fandomService.searchWikis('obscure-wiki-xyz');

            expect(results).toBeDefined();
        });
    });

    describe('destroy', () => {
        it('should not throw', () => {
            expect(() => fandomService.destroy()).not.toThrow();
        });
    });
});
