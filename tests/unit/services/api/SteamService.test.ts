/**
 * SteamService Unit Tests
 * Tests for Steam sale fetching, price parsing, and utility functions
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

import { SteamService } from '../../../../src/services/api/steamService';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('SteamService', () => {
    let steamService: SteamService;

    beforeEach(() => {
        jest.clearAllMocks();
        mockFetch.mockReset();
        steamService = new SteamService();
    });

    describe('filterGamesByDiscount', () => {
        const games = [
            { id: 1, name: 'Game A', discount_percent: 75, original_price: 59.99, final_price: 14.99 },
            { id: 2, name: 'Game B', discount_percent: 50, original_price: 29.99, final_price: 14.99 },
            { id: 3, name: 'Game C', discount_percent: 25, original_price: 19.99, final_price: 14.99 },
            { id: 4, name: 'Game D', discount_percent: 100, original_price: 9.99, final_price: 0 },
            { id: 5, name: 'Game E', discount_percent: 90, original_price: 49.99, final_price: 4.99 },
        ];

        it('should filter games by minimum discount', () => {
            const result = steamService.filterGamesByDiscount(games, 50);
            expect(result.length).toBe(4); // 75, 50, 100, 90
            expect(result.every(g => g.discount_percent >= 50)).toBe(true);
        });

        it('should sort by discount descending', () => {
            const result = steamService.filterGamesByDiscount(games, 50);
            for (let i = 1; i < result.length; i++) {
                expect(result[i].discount_percent).toBeLessThanOrEqual(result[i - 1].discount_percent);
            }
        });

        it('should return only 100% discount games when minDiscount is 0', () => {
            const result = steamService.filterGamesByDiscount(games, 0);
            expect(result.length).toBe(1);
            expect(result[0].name).toBe('Game D');
            expect(result[0].discount_percent).toBe(100);
        });

        it('should return empty array when no games match', () => {
            const result = steamService.filterGamesByDiscount(games, 99);
            expect(result.length).toBe(1); // Only 100%
        });

        it('should handle empty input', () => {
            const result = steamService.filterGamesByDiscount([], 50);
            expect(result).toEqual([]);
        });
    });

    describe('formatOwners', () => {
        it('should format millions', () => {
            const result = steamService.formatOwners('5,000,000 .. 10,000,000');
            expect(result).toBe('~7.5M');
        });

        it('should format thousands', () => {
            const result = steamService.formatOwners('50,000 .. 100,000');
            expect(result).toBe('~75K');
        });

        it('should format small numbers', () => {
            const result = steamService.formatOwners('100 .. 200');
            expect(result).toBe('~150');
        });

        it('should return "Unknown" for undefined', () => {
            expect(steamService.formatOwners(undefined)).toBe('Unknown');
        });

        it('should return original string for invalid format', () => {
            expect(steamService.formatOwners('Unknown')).toBe('Unknown');
        });

        it('should handle single value format', () => {
            expect(steamService.formatOwners('1000000')).toBe('1000000');
        });
    });

    describe('fetchSteamSales', () => {
        it('should fetch and parse sales pages', async () => {
            const mockHtml = `
                <a data-ds-appid="123">
                    <span class="title">Cool Game</span>
                    <div class="discount_pct">-75%</div>
                    <div class="discount_original_price">$59.99</div>
                    <div class="discount_final_price">$14.99</div>
                </a>
            `;

            // Page 0: sales page
            mockFetch.mockResolvedValueOnce({
                ok: true,
                text: jest.fn().mockResolvedValue(JSON.stringify({
                    success: 1,
                    results_html: mockHtml,
                    total_count: 1,
                    start: 0,
                })),
            });

            // USD price fetch (page loop ends after 1 page for maxResults=100)
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: jest.fn().mockResolvedValue({
                    '123': {
                        success: true,
                        data: {
                            price_overview: {
                                initial: 5999,
                                final: 1499,
                                discount_percent: 75,
                                currency: 'USD',
                            },
                        },
                    },
                }),
            });

            const result = await steamService.fetchSteamSales(100);
            expect(result.length).toBe(1);
            expect(result[0].name).toBe('Cool Game');
            expect(result[0].discount_percent).toBe(75);
        });

        it('should handle fetch errors gracefully', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            const result = await steamService.fetchSteamSales(100);
            expect(result).toEqual([]);
        });

        it('should deduplicate games', async () => {
            const mockHtml = `
                <a data-ds-appid="123">
                    <span class="title">Same Game</span>
                    <div class="discount_pct">-50%</div>
                    <div class="discount_original_price">$20.00</div>
                    <div class="discount_final_price">$10.00</div>
                </a>
                <a data-ds-appid="123">
                    <span class="title">Same Game</span>
                    <div class="discount_pct">-50%</div>
                    <div class="discount_original_price">$20.00</div>
                    <div class="discount_final_price">$10.00</div>
                </a>
            `;

            // Page 0: HTML with duplicate appIds
            mockFetch.mockResolvedValueOnce({
                ok: true,
                text: jest.fn().mockResolvedValue(JSON.stringify({
                    success: 1,
                    results_html: mockHtml,
                    total_count: 2,
                    start: 0,
                })),
            });

            // USD price batch (pages=1 for maxResults=100)
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: jest.fn().mockResolvedValue({}),
            });

            const result = await steamService.fetchSteamSales(100);
            expect(result.length).toBe(1); // deduplicated
        });
    });

    describe('fetchFeaturedSales', () => {
        it('should fetch featured sales', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: jest.fn().mockResolvedValue({
                    specials: {
                        items: [
                            {
                                id: 1,
                                name: 'Featured Game',
                                discount_percent: 80,
                                original_price: 4999,
                                final_price: 999,
                            },
                        ],
                    },
                }),
            });

            const result = await steamService.fetchFeaturedSales();
            expect(result.length).toBe(1);
            expect(result[0].name).toBe('Featured Game');
            expect(result[0].original_price).toBe(49.99);
            expect(result[0].final_price).toBe(9.99);
            expect(result[0].currency).toBe('USD');
        });

        it('should return empty array on error', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            const result = await steamService.fetchFeaturedSales();
            expect(result).toEqual([]);
        });

        it('should return empty array when no specials', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: jest.fn().mockResolvedValue({}),
            });

            const result = await steamService.fetchFeaturedSales();
            expect(result).toEqual([]);
        });
    });

    describe('getSteamSpyData', () => {
        it('should fetch SteamSpy data', async () => {
            const mockData = {
                appid: 730,
                name: 'Counter-Strike 2',
                developer: 'Valve',
                publisher: 'Valve',
                owners: '50,000,000 .. 100,000,000',
                positive: 5000000,
                negative: 500000,
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: jest.fn().mockResolvedValue(mockData),
            });

            const result = await steamService.getSteamSpyData(730);
            expect(result).toBeDefined();
            expect(result!.name).toBe('Counter-Strike 2');
            expect(result!.appid).toBe(730);
        });

        it('should return null on error', async () => {
            mockFetch.mockRejectedValueOnce(new Error('API error'));

            const result = await steamService.getSteamSpyData(999);
            expect(result).toBeNull();
        });

        it('should return null on non-ok response', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 404,
            });

            const result = await steamService.getSteamSpyData(999);
            expect(result).toBeNull();
        });
    });
});
