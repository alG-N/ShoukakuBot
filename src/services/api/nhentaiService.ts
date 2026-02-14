/**
 * NHentai Service
 * Handles all API interactions with nhentai
 * @module services/api/nhentaiService
 */

import axios, { AxiosRequestConfig } from 'axios';
import { circuitBreakerRegistry } from '../../core/CircuitBreakerRegistry.js';
import logger from '../../core/Logger.js';
import cacheService from '../../cache/CacheService.js';
import { nhentai as nhentaiConfig } from '../../config/services.js';
// TYPES & INTERFACES
// API Configuration
const API_BASE = nhentaiConfig.baseUrl;
const GALLERY_ENDPOINT = '/gallery';
const THUMBNAIL_BASE = 'https://t.nhentai.net/galleries';
const IMAGE_BASE = 'https://i.nhentai.net/galleries';

// Alternative API mirrors to try when main API is Cloudflare-blocked
const API_MIRRORS = [
    'https://nhentai.net/api',        // Primary
    'https://nhentai.to/api',         // Mirror 1
];

// Image type mapping
const IMAGE_TYPES: Record<string, string> = {
    'j': 'jpg',
    'p': 'png',
    'g': 'gif'
};

// Known popular gallery IDs (curated fallback list)
const POPULAR_GALLERIES: number[] = [
    177013, 228922, 265918, 139808, 297974,
    331461, 255662, 324303, 271048, 317115,
    356399, 367270, 349115, 361710, 366028,
    386483, 393321, 393497, 396823, 400485
];

/**
 * Build request headers with Cloudflare bypass support.
 * nhentai.net uses Cloudflare protection — requests without proper
 * Referer + cf_clearance cookie get 403'd intermittently.
 */
function buildRequestHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
        'User-Agent': nhentaiConfig.userAgent,
        'Accept': 'application/json, text/html, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': 'https://nhentai.net/',
        'Origin': 'https://nhentai.net',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-CH-UA': '"Chromium";v="131", "Not_A Brand";v="24"',
        'Sec-CH-UA-Mobile': '?0',
        'Sec-CH-UA-Platform': '"Windows"',
    };

    // Add cf_clearance cookie if configured (obtained from real browser session)
    if (nhentaiConfig.cfClearance) {
        headers['Cookie'] = `cf_clearance=${nhentaiConfig.cfClearance}`;
    }

    return headers;
}

// Request configuration — rebuilt per-call to pick up hot-reloaded config
function getRequestConfig(overrides: Partial<AxiosRequestConfig> = {}): AxiosRequestConfig {
    return {
        timeout: 15000,
        headers: buildRequestHeaders(),
        // Don't follow redirects to detect Cloudflare challenge pages
        maxRedirects: 5,
        ...overrides,
    };
}

export interface NHentaiTag {
    id: number;
    type: 'tag' | 'artist' | 'character' | 'parody' | 'group' | 'language' | 'category';
    name: string;
    url: string;
    count: number;
}

export interface NHentaiPage {
    t: string; // Type: j, p, g
    w: number; // Width
    h: number; // Height
}

export interface NHentaiImages {
    pages: NHentaiPage[];
    cover: NHentaiPage;
    thumbnail: NHentaiPage;
}

export interface NHentaiTitle {
    english?: string;
    japanese?: string;
    pretty?: string;
}

export interface NHentaiGallery {
    id: number;
    media_id: string;
    title: NHentaiTitle;
    images: NHentaiImages;
    scanlator: string;
    upload_date: number;
    tags: NHentaiTag[];
    num_pages: number;
    num_favorites: number;
}

export interface GalleryResult {
    success: boolean;
    data?: NHentaiGallery;
    error?: string;
    code?: string;
    fromCache?: boolean;
}

export interface SearchData {
    results: NHentaiGallery[];
    numPages: number;
    perPage: number;
    totalResults: number;
}

export interface SearchResult {
    success: boolean;
    data?: SearchData;
    error?: string;
    code?: string;
    fromCache?: boolean;
}

export interface PageUrl {
    pageNum: number;
    url: string;
    width: number;
    height: number;
}

export interface ParsedTags {
    artists: string[];
    characters: string[];
    parodies: string[];
    groups: string[];
    tags: string[];
    languages: string[];
    categories: string[];
}

interface NHentaiSearchResponse {
    result: NHentaiGallery[];
    num_pages: number;
    per_page: number;
}
// NHENTAI SERVICE CLASS
class NHentaiService {
    private readonly CACHE_NS = 'api:nhentai';
    private readonly CACHE_TTL = 300; // 5 minutes in seconds

    constructor() {
        // No local cache setup needed — uses centralized cacheService
    }

    /**
     * Fetch gallery data by code with circuit breaker + automatic 403 retry
     */
    async fetchGallery(code: number | string): Promise<GalleryResult> {
        // Check cache first
        const cached = await cacheService.get<NHentaiGallery>(this.CACHE_NS, `nhentai:gallery_${code}`);
        if (cached) return { success: true, data: cached, fromCache: true };

        return circuitBreakerRegistry.execute('nsfw', async () => {
            return this._fetchWithRetry(
                `${API_BASE}${GALLERY_ENDPOINT}/${code}`,
                async (url) => {
                    const response = await axios.get<NHentaiGallery>(url, getRequestConfig());
                    await cacheService.set(this.CACHE_NS, `nhentai:gallery_${code}`, response.data, this.CACHE_TTL);
                    return { success: true, data: response.data };
                }
            );
        });
    }

    /**
     * Fetch random gallery with circuit breaker
     */
    async fetchRandomGallery(): Promise<GalleryResult> {
        const maxAttempts = 3;

        for (let i = 0; i < maxAttempts; i++) {
            // Generate random ID between 1 and current max (~500000)
            const randomCode = Math.floor(Math.random() * 500000) + 1;
            const result = await this.fetchGallery(randomCode);

            if (result.success) {
                return result;
            }

            // Proper delay between retries to avoid rate limiting (exponential backoff)
            await new Promise(r => setTimeout(r, 500 * (i + 1)));
        }

        // Fallback to known popular galleries
        return this.fetchPopularGallery();
    }

    /**
     * Fetch a popular gallery - tries actual popular API first, falls back to curated list
     */
    async fetchPopularGallery(): Promise<GalleryResult> {
        // First, try to fetch from actual popular/homepage API
        try {
            const response = await axios.get(`${API_BASE}/galleries/popular`, getRequestConfig({ timeout: 10000 }));
            
            if (response.data?.result && Array.isArray(response.data.result) && response.data.result.length > 0) {
                // Pick a random gallery from popular results
                const randomIndex = Math.floor(Math.random() * response.data.result.length);
                const gallery = response.data.result[randomIndex] as NHentaiGallery;
                if (gallery?.id) {
                    await cacheService.set(this.CACHE_NS, `nhentai:gallery_${gallery.id}`, gallery, this.CACHE_TTL);
                    return { success: true, data: gallery };
                }
            }
        } catch {
            // API failed, try homepage
        }

        // Try homepage galleries
        try {
            const response = await axios.get(`${API_BASE}/galleries/all`, getRequestConfig({
                params: { page: 1 },
                timeout: 10000
            }));
            
            if (response.data?.result && Array.isArray(response.data.result) && response.data.result.length > 0) {
                const randomIndex = Math.floor(Math.random() * Math.min(25, response.data.result.length));
                const gallery = response.data.result[randomIndex] as NHentaiGallery;
                if (gallery?.id) {
                    await cacheService.set(this.CACHE_NS, `nhentai:gallery_${gallery.id}`, gallery, this.CACHE_TTL);
                    return { success: true, data: gallery };
                }
            }
        } catch {
            // Homepage API also failed, fall back to curated list
        }

        // Fallback: try curated popular galleries list
        const shuffled = [...POPULAR_GALLERIES].sort(() => Math.random() - 0.5);
        
        for (let i = 0; i < Math.min(5, shuffled.length); i++) {
            const galleryId = shuffled[i];
            if (galleryId === undefined) continue;
            
            try {
                const result = await this.fetchGallery(galleryId);
                if (result.success && result.data) {
                    return result;
                }
            } catch {
                // Try next gallery
            }
            
            // Small delay between attempts
            if (i < 4) await new Promise(r => setTimeout(r, 300));
        }
        
        return { success: false, error: 'Could not fetch any popular gallery. The service may be temporarily unavailable.' };
    }

    /**
     * Search galleries by query with circuit breaker
     */
    async searchGalleries(
        query: string,
        page: number = 1,
        sort: 'popular' | 'recent' = 'popular'
    ): Promise<SearchResult> {
        const cacheKey = `nhentai:search_${query}_${page}_${sort}`;
        const cached = await cacheService.get<SearchData>(this.CACHE_NS, cacheKey);
        if (cached) return { success: true, data: cached, fromCache: true };

        return circuitBreakerRegistry.execute('nsfw', async () => {
            try {
                const encodedQuery = encodeURIComponent(query);
                const sortParam = sort === 'recent' ? 'date' : 'popular';

                const response = await axios.get<NHentaiSearchResponse>(
                    `${API_BASE}/galleries/search?query=${encodedQuery}&page=${page}&sort=${sortParam}`,
                    getRequestConfig()
                );

                const data: SearchData = {
                    results: response.data.result || [],
                    numPages: response.data.num_pages || 1,
                    perPage: response.data.per_page || 25,
                    totalResults: (response.data.num_pages || 1) * (response.data.per_page || 25)
                };

                await cacheService.set(this.CACHE_NS, cacheKey, data, this.CACHE_TTL);

                return { success: true, data };
            } catch (error) {
                return this._handleError(error);
            }
        });
    }

    /**
     * Get autocomplete suggestions for search with circuit breaker
     */
    async getSearchSuggestions(query: string): Promise<string[]> {
        if (!query || query.length < 2) return [];

        const cacheKey = `nhentai:suggest_${query.toLowerCase()}`;
        const cached = await cacheService.get<string[]>(this.CACHE_NS, cacheKey);
        if (cached) return cached;

        return circuitBreakerRegistry.execute('nsfw', async () => {
            try {
                const response = await axios.get<NHentaiSearchResponse>(
                    `${API_BASE}/galleries/search?query=${encodeURIComponent(query)}&page=1`,
                    getRequestConfig({ timeout: 3000 })
                );

                const results = response.data.result || [];

                // Extract unique tags from results
                const tagSet = new Set<string>();
                results.forEach(gallery => {
                    gallery.tags?.forEach(tag => {
                        if (tag.type === 'tag' || tag.type === 'character' || tag.type === 'parody') {
                            if (tag.name.toLowerCase().includes(query.toLowerCase())) {
                                tagSet.add(tag.name);
                            }
                        }
                    });
                });

                // Also add titles that match
                const titleMatches = results
                    .filter(g => g.title?.english?.toLowerCase().includes(query.toLowerCase()) ||
                        g.title?.japanese?.toLowerCase().includes(query.toLowerCase()))
                    .slice(0, 5)
                    .map(g => g.title.english || g.title.japanese || '');

                const suggestions = [...new Set([...tagSet, ...titleMatches])].slice(0, 15);
                await cacheService.set(this.CACHE_NS, cacheKey, suggestions, this.CACHE_TTL);

                return suggestions;
            } catch (error) {
                logger.error('NHentai', `Autocomplete error: ${(error as Error).message}`);
                return [];
            }
        });
    }

    /**
     * Get page image URLs for a gallery
     */
    getPageUrls(gallery: NHentaiGallery, startPage: number = 1, endPage: number | null = null): PageUrl[] {
        const { media_id, images } = gallery;
        const pages = images?.pages || [];

        if (pages.length === 0) {
            return [];
        }

        const end = endPage ? Math.min(endPage, pages.length) : pages.length;
        const urls: PageUrl[] = [];

        for (let i = startPage - 1; i < end; i++) {
            const page = pages[i];
            if (page) {
                const ext = IMAGE_TYPES[page.t] || 'jpg';
                urls.push({
                    pageNum: i + 1,
                    url: `${IMAGE_BASE}/${media_id}/${i + 1}.${ext}`,
                    width: page.w,
                    height: page.h
                });
            }
        }

        return urls;
    }

    /**
     * Get thumbnail URL for gallery cover
     */
    getThumbnailUrl(mediaId: string, coverType: string): string {
        const ext = IMAGE_TYPES[coverType] || 'jpg';
        return `${THUMBNAIL_BASE}/${mediaId}/cover.${ext}`;
    }

    /**
     * Get page thumbnail URL (smaller size for preview)
     */
    getPageThumbnailUrl(mediaId: string, pageNum: number, pageType: string): string {
        const ext = IMAGE_TYPES[pageType] || 'jpg';
        return `${THUMBNAIL_BASE}/${mediaId}/${pageNum}t.${ext}`;
    }

    /**
     * Parse tags by type
     */
    getTagsByType(tags: NHentaiTag[] | undefined, type: NHentaiTag['type']): string[] {
        if (!tags || !Array.isArray(tags)) return [];
        return tags
            .filter(tag => tag.type === type)
            .map(tag => tag.name)
            .slice(0, 15);
    }

    /**
     * Get all tag types from gallery
     */
    parseAllTags(tags: NHentaiTag[] | undefined): ParsedTags {
        return {
            artists: this.getTagsByType(tags, 'artist'),
            characters: this.getTagsByType(tags, 'character'),
            parodies: this.getTagsByType(tags, 'parody'),
            groups: this.getTagsByType(tags, 'group'),
            tags: this.getTagsByType(tags, 'tag'),
            languages: this.getTagsByType(tags, 'language'),
            categories: this.getTagsByType(tags, 'category')
        };
    }

    /**
     * Retry wrapper for requests that may get 403'd by Cloudflare.
     * Retries up to 2 times with exponential backoff + jitter and slightly
     * varied headers on each attempt. Also tries alternative mirrors.
     */
    private async _fetchWithRetry(
        url: string,
        fetchFn: (url: string) => Promise<GalleryResult>,
        maxRetries: number = 2
    ): Promise<GalleryResult> {
        let lastError: unknown;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                // On retry, try using a mirror URL
                let targetUrl = url;
                if (attempt > 0 && API_MIRRORS.length > attempt) {
                    targetUrl = url.replace(API_BASE, API_MIRRORS[attempt] || API_BASE);
                    logger.info('NHentai', `Trying mirror: ${API_MIRRORS[attempt]}`);
                }
                return await fetchFn(targetUrl);
            } catch (error) {
                lastError = error;
                const err = error as { response?: { status: number } };

                // Only retry on 403 (Cloudflare block) or 503 (Cloudflare challenge)
                if (err.response?.status === 403 || err.response?.status === 503) {
                    if (attempt < maxRetries) {
                        // Exponential backoff with jitter: 1-2s, 2-4s
                        const delay = (1000 * Math.pow(2, attempt)) + Math.random() * 1000;
                        logger.warn('NHentai', `${err.response.status} on attempt ${attempt + 1}, retrying in ${Math.round(delay)}ms...`);
                        await new Promise(r => setTimeout(r, delay));
                        continue;
                    }
                }

                // Non-retryable error, bail out
                break;
            }
        }

        return this._handleError(lastError);
    }

    /**
     * Handle API errors
     */
    private _handleError(error: unknown): { success: false; error: string; code: string } {
        const err = error as { response?: { status: number }; code?: string; message?: string };

        if (err.response?.status === 404) {
            return { success: false, error: 'Gallery not found. Please check the code.', code: 'NOT_FOUND' };
        }
        if (err.response?.status === 403) {
            return { success: false, error: 'Access denied by Cloudflare protection. To fix:\n1. Open nhentai.net in your browser\n2. Complete the Cloudflare challenge\n3. Copy `cf_clearance` cookie from DevTools (F12 → Application → Cookies)\n4. Set `NHENTAI_CF_CLEARANCE=<value>` in .env\n5. Restart the bot\n\nNote: cf_clearance expires after ~30 minutes.', code: 'FORBIDDEN' };
        }
        if (err.response?.status === 503) {
            return { success: false, error: 'Cloudflare challenge active. Set NHENTAI_CF_CLEARANCE env var to bypass.', code: 'CF_CHALLENGE' };
        }
        if (err.response?.status === 429) {
            return { success: false, error: 'Rate limited. Please wait a moment.', code: 'RATE_LIMITED' };
        }
        if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
            return { success: false, error: 'Request timed out. Please try again.', code: 'TIMEOUT' };
        }

        logger.error('NHentai', `Service error: ${err.message}`);
        return { success: false, error: 'Failed to fetch gallery. Please try again later.', code: 'UNKNOWN' };
    }

    /**
     * Clear all nhentai cache entries
     */
    async clearCache(): Promise<void> {
        await cacheService.clearNamespace(this.CACHE_NS);
    }

    /**
     * Cleanup resources
     */
    destroy(): void {
        // No local resources to clean up
    }
}

// Export singleton instance
const nhentaiService = new NHentaiService();

export { nhentaiService, NHentaiService };
export default nhentaiService;
