/**
 * Google/Search Service
 * Handles Google Custom Search API and DuckDuckGo fallback
 * @module services/api/googleService
 */

import axios, { AxiosError } from 'axios';
import { circuitBreakerRegistry } from '../../core/CircuitBreakerRegistry.js';
import cacheService from '../../cache/CacheService.js';
// TYPES & INTERFACES
/**
 * Search result item
 */
export interface SearchResultItem {
    title: string;
    link: string;
    snippet: string;
    displayLink: string;
    thumbnail: string | null;
}

/**
 * Search response
 */
export interface SearchResponse {
    success: boolean;
    results?: SearchResultItem[];
    totalResults?: number;
    searchEngine: 'Google' | 'DuckDuckGo';
    error?: string;
    fromCache?: boolean;
}

/**
 * Search options
 */
export interface SearchOptions {
    safeSearch?: boolean;
    maxResults?: number;
}

/**
 * Cache entry
 */
/**
 * Google API response types
 */
interface GoogleSearchItem {
    title: string;
    link: string;
    snippet?: string;
    displayLink?: string;
    pagemap?: {
        cse_thumbnail?: Array<{ src: string }>;
    };
}

interface GoogleSearchResponse {
    items?: GoogleSearchItem[];
    searchInformation?: {
        totalResults?: string;
    };
}

/**
 * DuckDuckGo API response types
 */
interface DuckDuckGoTopic {
    FirstURL?: string;
    Text?: string;
    Icon?: { URL?: string };
}

interface DuckDuckGoResponse {
    Abstract?: string;
    Heading?: string;
    AbstractURL?: string;
    AbstractSource?: string;
    Image?: string;
    RelatedTopics?: DuckDuckGoTopic[];
}
// CONFIGURATION
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const GOOGLE_CX = process.env.GOOGLE_SEARCH_CX;
const USE_DUCKDUCKGO = !GOOGLE_API_KEY || !GOOGLE_CX;
const REQUEST_TIMEOUT = 10000;
// GOOGLE SERVICE CLASS
/**
 * Google Search Service with DuckDuckGo fallback
 */
class GoogleService {
    private readonly CACHE_NS = 'api';
    private readonly CACHE_TTL = 300; // 5 minutes in seconds
    private readonly useDuckDuckGo: boolean;

    constructor() {
        this.useDuckDuckGo = USE_DUCKDUCKGO;
    }

    /**
     * Main search method with circuit breaker protection
     */
    async search(query: string, options: SearchOptions = {}): Promise<SearchResponse> {
        const { safeSearch = true, maxResults = 5 } = options;

        // Check cache
        const cacheKey = `google:search_${query}_${safeSearch}_${maxResults}`;
        const cached = await cacheService.get<SearchResponse>(this.CACHE_NS, cacheKey);
        if (cached) return { ...cached, fromCache: true };

        // Execute with circuit breaker
        const result = await circuitBreakerRegistry.execute('google', async () => {
            if (this.useDuckDuckGo) {
                return this.searchDuckDuckGo(query);
            } else {
                return this.searchGoogle(query, safeSearch, maxResults);
            }
        });

        if (result.success) {
            await cacheService.set(this.CACHE_NS, cacheKey, result, this.CACHE_TTL);
        }

        return result;
    }

    /**
     * Search using Google Custom Search API
     */
    async searchGoogle(
        query: string, 
        safeSearch: boolean = true, 
        maxResults: number = 5
    ): Promise<SearchResponse> {
        try {
            const params = {
                key: GOOGLE_API_KEY,
                cx: GOOGLE_CX,
                q: query,
                num: Math.min(maxResults, 10),
                safe: safeSearch ? 'active' : 'off'
            };

            const response = await axios.get<GoogleSearchResponse>(
                'https://www.googleapis.com/customsearch/v1',
                { params, timeout: REQUEST_TIMEOUT }
            );

            if (!response.data.items || response.data.items.length === 0) {
                return {
                    success: true,
                    results: [],
                    totalResults: 0,
                    searchEngine: 'Google'
                };
            }

            const results: SearchResultItem[] = response.data.items.map(item => ({
                title: item.title,
                link: item.link,
                snippet: item.snippet || 'No description available.',
                displayLink: item.displayLink || '',
                thumbnail: item.pagemap?.cse_thumbnail?.[0]?.src || null
            }));

            return {
                success: true,
                results,
                totalResults: parseInt(response.data.searchInformation?.totalResults || String(results.length)),
                searchEngine: 'Google'
            };
        } catch (error) {
            const axiosError = error as AxiosError;
            console.error('[Google Search Error]', axiosError.message, `Status: ${axiosError.response?.status || 'N/A'}`);

            // Fallback to DuckDuckGo on ANY Google API error (403, 429, quota, etc.)
            console.log(`[Google] API error (${axiosError.response?.status || 'unknown'}), falling back to DuckDuckGo`);
            return this.searchDuckDuckGo(query);
        }
    }

    /**
     * Search using DuckDuckGo Instant Answer API with HTML fallback
     */
    async searchDuckDuckGo(query: string): Promise<SearchResponse> {
        try {
            // Try the HTML lite endpoint first for better results
            try {
                const htmlResults = await this._searchDuckDuckGoHtml(query);
                if (htmlResults.results && htmlResults.results.length > 0) {
                    return htmlResults;
                }
            } catch (htmlError) {
                console.log('[DuckDuckGo HTML] Fallback to Instant Answer API:', (htmlError as Error).message);
            }

            // Fallback to Instant Answer API
            const response = await axios.get<DuckDuckGoResponse>('https://api.duckduckgo.com/', {
                params: {
                    q: query,
                    format: 'json',
                    no_html: 1,
                    skip_disambig: 1
                },
                timeout: REQUEST_TIMEOUT
            });

            const data = response.data;
            const results: SearchResultItem[] = [];

            // Add abstract if available
            if (data.Abstract) {
                results.push({
                    title: data.Heading || query,
                    link: data.AbstractURL || `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
                    snippet: data.Abstract,
                    displayLink: data.AbstractSource || 'DuckDuckGo',
                    thumbnail: data.Image || null
                });
            }

            // Add related topics
            if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
                for (const topic of data.RelatedTopics.slice(0, 4)) {
                    if (topic.FirstURL && topic.Text) {
                        try {
                            results.push({
                                title: topic.Text.split(' - ')[0]?.substring(0, 100) || topic.Text.substring(0, 100),
                                link: topic.FirstURL,
                                snippet: topic.Text,
                                displayLink: new URL(topic.FirstURL).hostname,
                                thumbnail: topic.Icon?.URL || null
                            });
                        } catch {
                            // Skip malformed URLs
                        }
                    }
                }
            }

            // Provide search link if no results
            if (results.length === 0) {
                results.push({
                    title: `Search "${query}" on DuckDuckGo`,
                    link: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
                    snippet: 'Click to view search results on DuckDuckGo',
                    displayLink: 'duckduckgo.com',
                    thumbnail: null
                });
            }

            return {
                success: true,
                results,
                totalResults: results.length,
                searchEngine: 'DuckDuckGo'
            };
        } catch (error) {
            console.error('[DuckDuckGo Search Error]', (error as Error).message);
            return {
                success: false,
                error: 'Search failed. Please try again.',
                searchEngine: 'DuckDuckGo'
            };
        }
    }

    /**
     * Search DuckDuckGo using the HTML lite endpoint for better results
     */
    private async _searchDuckDuckGoHtml(query: string): Promise<SearchResponse> {
        const response = await axios.get('https://html.duckduckgo.com/html/', {
            params: { q: query },
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html',
                'Accept-Language': 'en-US,en;q=0.9',
            },
            timeout: REQUEST_TIMEOUT,
            responseType: 'text'
        });

        const html = response.data as string;
        const results: SearchResultItem[] = [];

        // Parse results from DuckDuckGo HTML lite response
        // Each result is in a <div class="result"> with <a class="result__a"> for URL/title
        // and <a class="result__snippet"> for snippet
        const resultBlocks = html.split(/class="result\s/);
        
        for (let i = 1; i < resultBlocks.length && results.length < 5; i++) {
            const block = resultBlocks[i];
            
            // Extract URL and title from result__a
            const linkMatch = block.match(/class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/);
            if (!linkMatch) continue;
            
            let link = linkMatch[1];
            // DuckDuckGo wraps URLs in a redirect, extract the actual URL
            const uddgMatch = link.match(/[?&]uddg=([^&]+)/);
            if (uddgMatch) {
                link = decodeURIComponent(uddgMatch[1]);
            }
            
            const title = linkMatch[2].replace(/<[^>]*>/g, '').trim();
            if (!title || !link || !link.startsWith('http')) continue;
            
            // Extract snippet
            const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
            const snippet = snippetMatch 
                ? snippetMatch[1].replace(/<[^>]*>/g, '').trim()
                : 'No description available.';
            
            let displayLink = '';
            try { displayLink = new URL(link).hostname; } catch { /* ignore */ }
            
            results.push({ title, link, snippet, displayLink, thumbnail: null });
        }

        return {
            success: results.length > 0,
            results,
            totalResults: results.length,
            searchEngine: 'DuckDuckGo'
        };
    }

    /**
     * Get current search engine being used
     */
    getSearchEngine(): 'Google' | 'DuckDuckGo' {
        return this.useDuckDuckGo ? 'DuckDuckGo' : 'Google';
    }

    /**
     * Cleanup on shutdown
     */
    shutdown(): void {
        // No local resources to clean up
    }
}

// Export singleton and class
const googleService = new GoogleService();

export { googleService, GoogleService };
export default googleService;
