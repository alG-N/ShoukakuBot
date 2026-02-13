/**
 * Wikipedia Service
 * Handles Wikipedia API requests with circuit breaker protection
 * @module services/api/wikipediaService
 */

import axios, { AxiosRequestConfig } from 'axios';
import { circuitBreakerRegistry } from '../../core/CircuitBreakerRegistry.js';
import cacheService from '../../cache/CacheService.js';
// TYPES & INTERFACES
export interface WikiSearchResult {
    title: string;
    description: string;
    url: string;
}

export interface WikiSearchResponse {
    success: boolean;
    results?: WikiSearchResult[];
    query?: string;
    error?: string;
    fromCache?: boolean;
}

export interface WikiArticle {
    title: string;
    displayTitle: string;
    description: string | null;
    extract: string;
    extractHtml?: string | null;
    url: string;
    mobileUrl?: string | null;
    thumbnail: string | null;
    originalImage: string | null;
    type?: string;
    timestamp?: string;
    language: string;
    coordinates?: { lat: number; lon: number } | null;
}

export interface WikiArticleResponse {
    success: boolean;
    article?: WikiArticle;
    error?: string;
    code?: string;
    fromCache?: boolean;
}

export interface OnThisDayPage {
    title: string;
    url: string;
}

export interface OnThisDayEvent {
    year: number;
    text: string;
    pages?: OnThisDayPage[];
}

export interface OnThisDayResponse {
    success: boolean;
    events?: OnThisDayEvent[];
    date?: { month: number; day: number };
    error?: string;
}

export interface SearchOptions {
    language?: string;
    limit?: number;
}

type SupportedLanguage = 'en' | 'ja' | 'de' | 'fr' | 'es';
// CONFIGURATION
const LANGUAGE_ENDPOINTS: Record<SupportedLanguage, { api: string; rest: string }> = {
    en: { api: 'https://en.wikipedia.org/w/api.php', rest: 'https://en.wikipedia.org/api/rest_v1' },
    ja: { api: 'https://ja.wikipedia.org/w/api.php', rest: 'https://ja.wikipedia.org/api/rest_v1' },
    de: { api: 'https://de.wikipedia.org/w/api.php', rest: 'https://de.wikipedia.org/api/rest_v1' },
    fr: { api: 'https://fr.wikipedia.org/w/api.php', rest: 'https://fr.wikipedia.org/api/rest_v1' },
    es: { api: 'https://es.wikipedia.org/w/api.php', rest: 'https://es.wikipedia.org/api/rest_v1' }
};

const REQUEST_CONFIG: AxiosRequestConfig = {
    timeout: 10000,
    headers: {
        'User-Agent': 'FumoBOT/2.0 (Discord Bot; https://github.com/fumobot)',
        'Accept': 'application/json'
    }
};
// WIKIPEDIA SERVICE CLASS
class WikipediaService {
    private readonly CACHE_NS = 'api:search';
    private readonly CACHE_TTL = 600; // 10 minutes in seconds
    private readonly defaultLanguage: SupportedLanguage;

    constructor() {
        this.defaultLanguage = 'en';
    }

    private _getEndpoints(language: string): { api: string; rest: string } {
        return LANGUAGE_ENDPOINTS[language as SupportedLanguage] || LANGUAGE_ENDPOINTS.en;
    }

    /**
     * Search Wikipedia for articles
     */
    async search(query: string, options: SearchOptions = {}): Promise<WikiSearchResponse> {
        const { language = this.defaultLanguage, limit = 5 } = options;
        const endpoints = this._getEndpoints(language);

        // Check cache
        const cacheKey = `wiki:search_${language}_${query}`;
        const cached = await cacheService.get<WikiSearchResponse>(this.CACHE_NS, cacheKey);
        if (cached) return { ...cached, fromCache: true };

        return circuitBreakerRegistry.execute('wikipedia', async () => {
            try {
                const response = await axios.get(endpoints.api, {
                    ...REQUEST_CONFIG,
                    params: {
                        action: 'opensearch',
                        search: query,
                        limit: Math.min(limit, 10),
                        namespace: 0,
                        format: 'json'
                    }
                });

                const [searchTerm, titles, descriptions, urls] = response.data as [string, string[], string[], string[]];

                if (!titles || titles.length === 0) {
                    return { success: true, results: [], query: searchTerm };
                }

                const results: WikiSearchResult[] = titles.map((title, i) => ({
                    title,
                    description: descriptions[i] || 'No description available.',
                    url: urls[i] || ''
                }));

                const result: WikiSearchResponse = { success: true, results, query: searchTerm };
                await cacheService.set(this.CACHE_NS, cacheKey, result, this.CACHE_TTL);

                return result;
            } catch (error) {
                console.error('[Wikipedia Search Error]', (error as Error).message);
                return { success: false, error: 'Failed to search Wikipedia. Please try again.' };
            }
        });
    }

    /**
     * Get article summary
     */
    async getArticleSummary(title: string, language: string = 'en'): Promise<WikiArticleResponse> {
        const endpoints = this._getEndpoints(language);

        // Check cache
        const cacheKey = `wiki:article_${language}_${title}`;
        const cached = await cacheService.get<WikiArticleResponse>(this.CACHE_NS, cacheKey);
        if (cached) return { ...cached, fromCache: true };

        return circuitBreakerRegistry.execute('wikipedia', async () => {
            try {
                const encodedTitle = encodeURIComponent(title.replace(/ /g, '_'));
                const response = await axios.get(
                    `${endpoints.rest}/page/summary/${encodedTitle}`,
                    REQUEST_CONFIG
                );

                const data = response.data;
                const article: WikiArticle = {
                    title: data.title,
                    displayTitle: data.displaytitle || data.title,
                    description: data.description || null,
                    extract: data.extract || 'No summary available.',
                    extractHtml: data.extract_html || null,
                    url: data.content_urls?.desktop?.page || `https://${language}.wikipedia.org/wiki/${encodedTitle}`,
                    mobileUrl: data.content_urls?.mobile?.page || null,
                    thumbnail: data.thumbnail?.source || null,
                    originalImage: data.originalimage?.source || null,
                    type: data.type,
                    timestamp: data.timestamp,
                    language,
                    coordinates: data.coordinates || null
                };

                const result: WikiArticleResponse = { success: true, article };
                await cacheService.set(this.CACHE_NS, cacheKey, result, this.CACHE_TTL);

                return result;
            } catch (error) {
                const axiosError = error as { response?: { status: number } };
                if (axiosError.response?.status === 404) {
                    return { success: false, error: 'Article not found.', code: 'NOT_FOUND' };
                }
                console.error('[Wikipedia Article Error]', (error as Error).message);
                return { success: false, error: 'Failed to fetch article. Please try again.' };
            }
        });
    }

    /**
     * Get random article
     */
    async getRandomArticle(language: string = 'en'): Promise<WikiArticleResponse> {
        const endpoints = this._getEndpoints(language);

        return circuitBreakerRegistry.execute('wikipedia', async () => {
            try {
                const response = await axios.get(
                    `${endpoints.rest}/page/random/summary`,
                    REQUEST_CONFIG
                );

                const data = response.data;
                return {
                    success: true,
                    article: {
                        title: data.title,
                        displayTitle: data.displaytitle || data.title,
                        description: data.description || null,
                        extract: data.extract || 'No summary available.',
                        url: data.content_urls?.desktop?.page,
                        thumbnail: data.thumbnail?.source || null,
                        originalImage: data.originalimage?.source || null,
                        type: data.type,
                        language
                    }
                };
            } catch (error) {
                console.error('[Wikipedia Random Error]', (error as Error).message);
                return { success: false, error: 'Failed to fetch random article. Please try again.' };
            }
        });
    }

    /**
     * Get "On This Day" events
     */
    async getOnThisDay(month: number, day: number, language: string = 'en'): Promise<OnThisDayResponse> {
        const endpoints = this._getEndpoints(language);

        return circuitBreakerRegistry.execute('wikipedia', async () => {
            try {
                const response = await axios.get(
                    `${endpoints.rest}/feed/onthisday/events/${month}/${day}`,
                    REQUEST_CONFIG
                );

                const events: OnThisDayEvent[] = response.data.events?.slice(0, 5).map((event: {
                    year: number;
                    text: string;
                    pages?: Array<{ title: string; content_urls?: { desktop?: { page: string } } }>;
                }) => ({
                    year: event.year,
                    text: event.text,
                    pages: event.pages?.slice(0, 3).map(p => ({
                        title: p.title,
                        url: p.content_urls?.desktop?.page
                    }))
                })) || [];

                return { success: true, events, date: { month, day } };
            } catch (error) {
                console.error('[Wikipedia OnThisDay Error]', (error as Error).message);
                return { success: false, error: 'Failed to fetch events. Please try again.' };
            }
        });
    }

    /**
     * Get featured article of the day
     */
    async getFeaturedArticle(date: Date = new Date(), language: string = 'en'): Promise<WikiArticleResponse> {
        const endpoints = this._getEndpoints(language);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');

        return circuitBreakerRegistry.execute('wikipedia', async () => {
            try {
                const response = await axios.get(
                    `${endpoints.rest}/feed/featured/${year}/${month}/${day}`,
                    REQUEST_CONFIG
                );

                const tfa = response.data.tfa;
                if (!tfa) {
                    return { success: false, error: 'No featured article available for this date.' };
                }

                return {
                    success: true,
                    article: {
                        title: tfa.title,
                        displayTitle: tfa.displaytitle || tfa.title,
                        description: null,
                        extract: tfa.extract,
                        url: tfa.content_urls?.desktop?.page,
                        thumbnail: tfa.thumbnail?.source || null,
                        originalImage: null,
                        language
                    }
                };
            } catch (error) {
                console.error('[Wikipedia Featured Error]', (error as Error).message);
                return { success: false, error: 'Failed to fetch featured article.' };
            }
        });
    }

    /**
     * Cleanup on shutdown
     */
    shutdown(): void {
        // No local resources to clean up
    }
}

// Export singleton and class
const wikipediaService = new WikipediaService();

export { wikipediaService, WikipediaService };
export default wikipediaService;
