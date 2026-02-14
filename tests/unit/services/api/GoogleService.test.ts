/**
 * GoogleService Unit Tests
 * Tests for Google/DuckDuckGo search with caching and circuit breaker
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

// Set env vars before import — no Google API key → DuckDuckGo fallback
const originalEnv = process.env;

describe('GoogleService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockCacheGet.mockResolvedValue(null);
    });

    describe('DuckDuckGo mode (no Google API key)', () => {
        let googleService: any;

        beforeAll(async () => {
            // Import with no google keys set → DuckDuckGo mode
            delete process.env.GOOGLE_API_KEY;
            delete process.env.GOOGLE_SEARCH_CX;
            jest.resetModules();
            // Re-mock after reset
            jest.mock('../../../../src/core/Logger', () => ({
                __esModule: true,
                default: { error: jest.fn(), debug: jest.fn(), info: jest.fn(), warn: jest.fn(), success: jest.fn() },
            }));
            jest.mock('axios', () => ({ __esModule: true, default: { get: mockAxiosGet } }));
            jest.mock('../../../../src/cache/CacheService', () => ({
                __esModule: true, default: { get: mockCacheGet, set: mockCacheSet },
            }));
            jest.mock('../../../../src/core/CircuitBreakerRegistry', () => ({
                __esModule: true,
                circuitBreakerRegistry: { execute: jest.fn().mockImplementation((_n: string, fn: () => Promise<any>) => fn()) },
            }));
            const mod = await import('../../../../src/services/api/googleService.js');
            googleService = mod.default;
        });

        it('should identify as DuckDuckGo engine', () => {
            expect(googleService.getSearchEngine()).toBe('DuckDuckGo');
        });

        it('should return cached results if available', async () => {
            const cachedResult = {
                success: true,
                results: [{ title: 'Cached', link: 'https://example.com', snippet: 'Test', displayLink: 'example.com', thumbnail: null }],
                searchEngine: 'DuckDuckGo',
            };
            mockCacheGet.mockResolvedValue(cachedResult);

            const result = await googleService.search('test');

            expect(result.fromCache).toBe(true);
            expect(mockAxiosGet).not.toHaveBeenCalled();
        });

        it('should search DuckDuckGo HTML lite endpoint', async () => {
            // HTML lite returns results
            mockAxiosGet.mockImplementation((url: string) => {
                if (url.includes('html.duckduckgo.com')) {
                    return Promise.resolve({
                        data: `
                            <div class="result results_links results_links_deep web-result">
                                <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpage">Example Page</a>
                                <a class="result__snippet">Example description text</a>
                            </div>
                        `,
                    });
                }
                return Promise.reject(new Error('Unexpected URL'));
            });

            const result = await googleService.search('test');

            expect(result.success).toBe(true);
            expect(result.searchEngine).toBe('DuckDuckGo');
        });

        it('should fall back to Instant Answer API when HTML fails', async () => {
            // HTML lite fails, Instant Answer API returns data
            mockAxiosGet.mockImplementation((url: string) => {
                if (url.includes('html.duckduckgo.com')) {
                    return Promise.reject(new Error('HTML endpoint down'));
                }
                if (url.includes('api.duckduckgo.com')) {
                    return Promise.resolve({
                        data: {
                            Abstract: 'Test is a test article.',
                            Heading: 'Test',
                            AbstractURL: 'https://en.wikipedia.org/wiki/Test',
                            AbstractSource: 'Wikipedia',
                            Image: 'https://example.com/image.png',
                            RelatedTopics: [
                                {
                                    FirstURL: 'https://example.com/related',
                                    Text: 'Related Topic - Description',
                                    Icon: { URL: '' },
                                },
                            ],
                        },
                    });
                }
                return Promise.reject(new Error('Unexpected'));
            });

            const result = await googleService.search('test');

            expect(result.success).toBe(true);
            expect(result.results).toBeDefined();
            expect(result.results!.length).toBeGreaterThan(0);
            expect(result.results![0].title).toBe('Test');
            expect(result.results![0].snippet).toContain('Test is a test article');
        });

        it('should provide search link fallback when no DDG results', async () => {
            mockAxiosGet.mockImplementation((url: string) => {
                if (url.includes('html.duckduckgo.com')) {
                    return Promise.resolve({ data: '<html></html>' }); // empty HTML
                }
                if (url.includes('api.duckduckgo.com')) {
                    return Promise.resolve({
                        data: {
                            Abstract: '',
                            RelatedTopics: [],
                        },
                    });
                }
                return Promise.reject(new Error('Unexpected'));
            });

            const result = await googleService.search('obscure query');

            expect(result.success).toBe(true);
            expect(result.results).toBeDefined();
            expect(result.results!.length).toBeGreaterThan(0);
            expect(result.results![0].link).toContain('duckduckgo.com');
        });

        it('should handle complete search failure', async () => {
            mockAxiosGet.mockRejectedValue(new Error('All endpoints down'));

            const result = await googleService.search('test');

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });

        it('should cache successful results', async () => {
            mockAxiosGet.mockImplementation((url: string) => {
                if (url.includes('html.duckduckgo.com')) {
                    return Promise.resolve({ data: '<html></html>' });
                }
                return Promise.resolve({
                    data: {
                        Abstract: 'Something',
                        Heading: 'Something',
                        AbstractURL: 'https://example.com',
                        AbstractSource: 'Source',
                        RelatedTopics: [],
                    },
                });
            });

            await googleService.search('test');

            expect(mockCacheSet).toHaveBeenCalledWith(
                'api:search',
                expect.stringContaining('google:search'),
                expect.objectContaining({ success: true }),
                300
            );
        });

        it('should not cache failed results', async () => {
            mockAxiosGet.mockRejectedValue(new Error('Failed'));

            await googleService.search('test');

            expect(mockCacheSet).not.toHaveBeenCalled();
        });
    });

    describe('Google Search API mode', () => {
        let googleServiceGoogle: any;

        beforeAll(async () => {
            process.env.GOOGLE_API_KEY = 'test-api-key';
            process.env.GOOGLE_SEARCH_CX = 'test-cx';
            jest.resetModules();
            jest.mock('../../../../src/core/Logger', () => ({
                __esModule: true,
                default: { error: jest.fn(), debug: jest.fn(), info: jest.fn(), warn: jest.fn(), success: jest.fn() },
            }));
            jest.mock('axios', () => ({ __esModule: true, default: { get: mockAxiosGet } }));
            jest.mock('../../../../src/cache/CacheService', () => ({
                __esModule: true, default: { get: mockCacheGet, set: mockCacheSet },
            }));
            jest.mock('../../../../src/core/CircuitBreakerRegistry', () => ({
                __esModule: true,
                circuitBreakerRegistry: { execute: jest.fn().mockImplementation((_n: string, fn: () => Promise<any>) => fn()) },
            }));
            const mod = await import('../../../../src/services/api/googleService.js');
            googleServiceGoogle = mod.default;
        });

        afterAll(() => {
            delete process.env.GOOGLE_API_KEY;
            delete process.env.GOOGLE_SEARCH_CX;
        });

        it('should identify as Google engine', () => {
            expect(googleServiceGoogle.getSearchEngine()).toBe('Google');
        });

        it('should search using Google Custom Search API', async () => {
            mockAxiosGet.mockResolvedValue({
                data: {
                    items: [
                        {
                            title: 'Google Result',
                            link: 'https://example.com',
                            snippet: 'A search result',
                            displayLink: 'example.com',
                            pagemap: {
                                cse_thumbnail: [{ src: 'https://example.com/thumb.png' }],
                            },
                        },
                    ],
                    searchInformation: { totalResults: '100' },
                },
            });

            const result = await googleServiceGoogle.search('test');

            expect(result.success).toBe(true);
            expect(result.results).toHaveLength(1);
            expect(result.results![0].title).toBe('Google Result');
            expect(result.results![0].thumbnail).toBe('https://example.com/thumb.png');
            expect(result.searchEngine).toBe('Google');
        });

        it('should return empty results when Google returns no items', async () => {
            mockAxiosGet.mockResolvedValue({
                data: { items: null, searchInformation: { totalResults: '0' } },
            });

            const result = await googleServiceGoogle.search('nothing');

            expect(result.success).toBe(true);
            expect(result.results).toHaveLength(0);
        });

        it('should fall back to DuckDuckGo on Google API error', async () => {
            // First call (Google) fails, subsequent (DDG) succeeds
            let callCount = 0;
            mockAxiosGet.mockImplementation((url: string) => {
                callCount++;
                if (url.includes('googleapis.com') || callCount === 1) {
                    const error: any = new Error('Quota exceeded');
                    error.response = { status: 403 };
                    return Promise.reject(error);
                }
                if (url.includes('html.duckduckgo.com')) {
                    return Promise.resolve({ data: '<html></html>' });
                }
                return Promise.resolve({
                    data: {
                        Abstract: 'DDG Fallback Result',
                        Heading: 'Fallback',
                        AbstractURL: 'https://example.com/fallback',
                        AbstractSource: 'DDG',
                        RelatedTopics: [],
                    },
                });
            });

            const result = await googleServiceGoogle.searchGoogle('test');

            expect(result.searchEngine).toBe('DuckDuckGo');
        });

        it('should respect maxResults parameter', async () => {
            mockAxiosGet.mockResolvedValue({
                data: { items: [], searchInformation: { totalResults: '0' } },
            });

            await googleServiceGoogle.searchGoogle('test', true, 3);

            expect(mockAxiosGet).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    params: expect.objectContaining({ num: 3 }),
                })
            );
        });

        it('should cap maxResults at 10', async () => {
            mockAxiosGet.mockResolvedValue({
                data: { items: [], searchInformation: { totalResults: '0' } },
            });

            await googleServiceGoogle.searchGoogle('test', true, 50);

            expect(mockAxiosGet).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    params: expect.objectContaining({ num: 10 }),
                })
            );
        });
    });

    describe('shutdown', () => {
        it('should not throw on shutdown', async () => {
            jest.resetModules();
            jest.mock('../../../../src/core/Logger', () => ({
                __esModule: true,
                default: { error: jest.fn(), debug: jest.fn(), info: jest.fn(), warn: jest.fn() },
            }));
            jest.mock('axios', () => ({ __esModule: true, default: { get: jest.fn() } }));
            jest.mock('../../../../src/cache/CacheService', () => ({ __esModule: true, default: { get: jest.fn(), set: jest.fn() } }));
            jest.mock('../../../../src/core/CircuitBreakerRegistry', () => ({
                __esModule: true, circuitBreakerRegistry: { execute: jest.fn() },
            }));
            const mod = await import('../../../../src/services/api/googleService.js');
            expect(() => (mod.default as any).shutdown()).not.toThrow();
        });
    });
});
