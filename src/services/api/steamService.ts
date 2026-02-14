/**
 * Steam Service
 * Handles Steam API interactions for game sales and data
 * @module services/api/steamService
 */

import * as path from 'path';
import * as dotenv from 'dotenv';
import { circuitBreakerRegistry } from '../../core/CircuitBreakerRegistry.js';
import logger from '../../core/Logger.js';

dotenv.config({ path: path.join(__dirname, '../.env') });
// TYPES & INTERFACES
/**
 * Steam game data from sales search
 */
export interface SteamGame {
    id: number;
    name: string;
    discount_percent: number;
    original_price: number;
    final_price: number;
    currency?: string;
    needsUsdPrice?: boolean;
}

/**
 * Steam sale response from search API
 */
export interface SteamSaleResponse {
    success: number;
    results_html: string;
    total_count: number;
    start: number;
}

/**
 * Steam app details price overview
 */
export interface SteamPriceOverview {
    currency: string;
    initial: number;
    final: number;
    discount_percent: number;
    initial_formatted: string;
    final_formatted: string;
}

/**
 * Steam app details data
 */
export interface SteamAppDetailsData {
    price_overview?: SteamPriceOverview;
}

/**
 * Steam app details response
 */
export interface SteamAppDetailsResponse {
    success: boolean;
    data?: SteamAppDetailsData;
}

/**
 * Steam featured game item
 */
export interface SteamFeaturedGame {
    id: number;
    name: string;
    discount_percent: number;
    original_price: number;
    final_price: number;
}

/**
 * Steam featured categories response
 */
export interface SteamFeaturedCategoriesResponse {
    specials?: {
        items: SteamFeaturedGame[];
    };
}

/**
 * SteamSpy data response
 */
export interface SteamSpyData {
    appid: number;
    name: string;
    developer: string;
    publisher: string;
    score_rank: string;
    positive: number;
    negative: number;
    userscore: number;
    owners: string;
    average_forever: number;
    average_2weeks: number;
    median_forever: number;
    median_2weeks: number;
    price: string;
    initialprice: string;
    discount: string;
    ccu: number;
    languages: string;
    genre: string;
    tags: Record<string, number>;
}
// STEAM SERVICE CLASS
/**
 * Steam Service
 * Provides methods to fetch Steam sales, game data, and SteamSpy statistics
 */
export class SteamService {
    // Reserved for future authenticated Steam API calls
    private readonly apiKey: string;
    private readonly userAgent: string;

    constructor() {
        this.apiKey = process.env.STEAM_API_KEY || '';
        this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
    }

    /**
     * Fetch Steam sales with pagination
     * @param maxResults - Maximum number of results to fetch
     * @returns Array of games on sale
     */
    async fetchSteamSales(maxResults: number = 300): Promise<SteamGame[]> {
        return circuitBreakerRegistry.execute('steam', async () => {
            const allGames: SteamGame[] = [];
            const resultsPerPage = 100;
            const pages = Math.ceil(maxResults / resultsPerPage);

            for (let page = 0; page < pages; page++) {
                try {
                    const games = await this._fetchSalesPage(page, resultsPerPage);
                    if (!games || games.length === 0) break;
                    allGames.push(...games);

                    if (page < pages - 1) {
                        await this._delay(500);
                    }
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    logger.error('Steam', `Failed to fetch page ${page + 1}: ${errorMessage}`);
                    break;
                }
            }

            // Fetch USD prices for all games
            const gamesWithUsdPrices = await this._fetchUsdPrices(allGames);
            return this._deduplicateGames(gamesWithUsdPrices);
        });
    }

    /**
     * Fetch a single page of sales results
     * @param page - Page number (0-indexed)
     * @param resultsPerPage - Number of results per page
     * @returns Array of games from this page
     */
    private async _fetchSalesPage(page: number, resultsPerPage: number): Promise<SteamGame[]> {
        const start = page * resultsPerPage;
        // Force US region with cc=us parameter
        const searchUrl = `https://store.steampowered.com/search/results/?query&start=${start}&count=${resultsPerPage}&dynamic_data=&sort_by=_ASC&specials=1&snr=1_7_7_151_7&filter=topsellers&infinite=1&cc=us`;

        // Create abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        try {
            const response = await fetch(searchUrl, {
                headers: {
                    'Accept': 'application/json, text/plain, */*',
                    'User-Agent': this.userAgent,
                    'Accept-Language': 'en-US,en;q=0.9'
                },
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const html = await response.text();
            let data: SteamSaleResponse;

            try {
                data = JSON.parse(html);
            } catch {
                throw new Error('Failed to parse response');
            }

            if (!data.results_html) return [];

            return this._parseGamesFromHtml(data.results_html, page);
        } catch (error) {
            clearTimeout(timeoutId);
            throw error;
        }
    }

    /**
     * Parse games from HTML response
     * @param html - HTML string containing game data
     * @param page - Current page number for logging
     * @returns Array of parsed games
     */
    private _parseGamesFromHtml(html: string, page: number): SteamGame[] {
        const games: SteamGame[] = [];

        const gameMatches = [...html.matchAll(/data-ds-appid="(\d+)"/g)];
        const nameMatches = [...html.matchAll(/<span class="title">([^<]+)<\/span>/g)];
        const discountMatches = [...html.matchAll(/<div class="discount_pct">-(\d+)%<\/div>/g)];
        const originalPriceMatches = [...html.matchAll(/<div class="discount_original_price">([^<]+)<\/div>/g)];
        const finalPriceMatches = [...html.matchAll(/<div class="discount_final_price">([^<]+)<\/div>/g)];

        logger.info('Steam', `Page ${page + 1}: Found ${gameMatches.length} games`);

        for (let i = 0; i < gameMatches.length; i++) {
            const gameMatch = gameMatches[i];
            const discountMatch = discountMatches[i];
            const nameMatch = nameMatches[i];
            const originalPriceMatch = originalPriceMatches[i];
            const finalPriceMatch = finalPriceMatches[i];

            if (!gameMatch || !discountMatch) continue;

            const gameId = parseInt(gameMatch[1] ?? '0');
            const gameName = nameMatch?.[1] ?? `Game ${gameId}`;
            const discountPercent = parseInt(discountMatch[1] ?? '0');

            // Parse prices - these may be in local currency from HTML
            let originalPrice = 0;
            let finalPrice = 0;

            if (originalPriceMatch?.[1]) {
                originalPrice = this._parsePrice(originalPriceMatch[1]);
            }
            if (finalPriceMatch?.[1]) {
                finalPrice = this._parsePrice(finalPriceMatch[1]);
            }

            games.push({
                id: gameId,
                name: gameName,
                discount_percent: discountPercent,
                original_price: originalPrice,
                final_price: finalPrice,
                needsUsdPrice: true // Flag to fetch USD price
            });
        }

        return games;
    }

    /**
     * Parse price string to number
     * @param priceStr - Price string with currency symbols
     * @returns Parsed price as number
     */
    private _parsePrice(priceStr: string): number {
        if (!priceStr) return 0;
        // Remove currency symbols and parse number
        const cleaned = priceStr.trim().replace(/[^0-9.,]/g, '').replace(',', '.');
        return parseFloat(cleaned) || 0;
    }

    /**
     * Fetch USD prices for games in batches
     * @param games - Array of games to fetch prices for
     * @returns Games with updated USD prices
     */
    private async _fetchUsdPrices(games: SteamGame[]): Promise<SteamGame[]> {
        if (games.length === 0) return games;

        // Batch fetch USD prices (max 50 at a time due to API limits)
        const batchSize = 50;
        const enrichedGames = [...games];

        for (let i = 0; i < games.length; i += batchSize) {
            const batch = games.slice(i, i + batchSize);
            const appIds = batch.map(g => g.id).join(',');

            try {
                // Create abort controller for timeout
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000);

                const response = await fetch(
                    `https://store.steampowered.com/api/appdetails?appids=${appIds}&cc=us&filters=price_overview`,
                    {
                        headers: {
                            'User-Agent': this.userAgent,
                            'Accept-Language': 'en-US,en;q=0.9'
                        },
                        signal: controller.signal
                    }
                );

                clearTimeout(timeoutId);

                if (response.ok) {
                    const data = await response.json() as Record<string, SteamAppDetailsResponse>;

                    for (const game of batch) {
                        const gameIndex = enrichedGames.findIndex(g => g.id === game.id);
                        if (gameIndex === -1) continue;

                        const appData = data[game.id];
                        const enrichedGame = enrichedGames[gameIndex];
                        if (appData?.success && appData?.data?.price_overview && enrichedGame) {
                            const priceInfo = appData.data.price_overview;
                            enrichedGame.original_price = priceInfo.initial / 100;
                            enrichedGame.final_price = priceInfo.final / 100;
                            enrichedGame.discount_percent = priceInfo.discount_percent;
                            enrichedGame.currency = 'USD';
                        }
                    }
                }

                // Rate limit delay
                if (i + batchSize < games.length) {
                    await this._delay(300);
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                logger.info('Steam', `USD Price batch fetch error: ${errorMessage}`);
            }
        }

        return enrichedGames;
    }

    /**
     * Remove duplicate games and filter out non-discounted items
     * @param games - Array of games to deduplicate
     * @returns Deduplicated array of games
     */
    private _deduplicateGames(games: SteamGame[]): SteamGame[] {
        const uniqueGames: SteamGame[] = [];
        const seenIds = new Set<number>();

        for (const game of games) {
            if (!seenIds.has(game.id) && game.discount_percent > 0) {
                seenIds.add(game.id);
                uniqueGames.push(game);
            }
        }

        return uniqueGames;
    }

    /**
     * Fetch featured sales from Steam API
     * @returns Array of featured sale games
     */
    async fetchFeaturedSales(): Promise<SteamGame[]> {
        return circuitBreakerRegistry.execute('steam', async () => {
            try {
                // Force US region
                const response = await fetch('https://store.steampowered.com/api/featuredcategories?cc=us&l=english');
                const data = await response.json() as SteamFeaturedCategoriesResponse;

                if (data.specials?.items) {
                    return data.specials.items.map(game => ({
                        id: game.id,
                        name: game.name,
                        discount_percent: game.discount_percent,
                        original_price: game.original_price / 100,
                        final_price: game.final_price / 100,
                        currency: 'USD'
                    }));
                }

                return [];
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                logger.error('Steam', `Featured API error: ${errorMessage}`);
                return [];
            }
        });
    }

    /**
     * Get SteamSpy data for a specific app
     * @param appId - Steam app ID
     * @returns SteamSpy data or null if unavailable
     */
    async getSteamSpyData(appId: number): Promise<SteamSpyData | null> {
        return circuitBreakerRegistry.execute('steam', async () => {
            try {
                const response = await fetch(`https://steamspy.com/api.php?request=appdetails&appid=${appId}`);
                if (!response.ok) return null;
                return await response.json() as SteamSpyData;
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                logger.error('Steam', `SteamSpy error for ${appId}: ${errorMessage}`);
                return null;
            }
        });
    }

    /**
     * Filter games by minimum discount percentage
     * @param games - Array of games to filter
     * @param minDiscount - Minimum discount percentage (0 = free games only)
     * @returns Filtered and sorted array of games
     */
    filterGamesByDiscount(games: SteamGame[], minDiscount: number): SteamGame[] {
        return games.filter(game => {
            if (minDiscount === 0) {
                return game.discount_percent === 100;
            }
            return game.discount_percent >= minDiscount;
        }).sort((a, b) => b.discount_percent - a.discount_percent);
    }

    /**
     * Format owners string from SteamSpy
     * @param ownersString - Raw owners string (e.g., "1,000,000 .. 2,000,000")
     * @returns Formatted string (e.g., "~1.5M")
     */
    formatOwners(ownersString: string | undefined): string {
        if (!ownersString) return 'Unknown';
        const parts = ownersString.split('..');
        if (parts.length === 2 && parts[0] && parts[1]) {
            const min = parseInt(parts[0].replace(/,/g, '').trim());
            const max = parseInt(parts[1].replace(/,/g, '').trim());
            const avg = Math.floor((min + max) / 2);

            if (avg >= 1000000) return `~${(avg / 1000000).toFixed(1)}M`;
            if (avg >= 1000) return `~${(avg / 1000).toFixed(0)}K`;
            return `~${avg}`;
        }
        return ownersString;
    }

    /**
     * Delay utility function
     * @param ms - Milliseconds to delay
     * @returns Promise that resolves after the delay
     */
    private _delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
// EXPORTS
// Export singleton instance and class
const steamService = new SteamService();

export { steamService };
export default steamService;
