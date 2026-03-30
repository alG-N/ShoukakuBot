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
import type {
    NHentaiGallery,
    NHentaiTag,
    GalleryResult,
    SearchData,
    NHentaiSearchResult,
    PageUrl,
    ParsedTags
} from '../../types/api/models/nhentai.js';
import type { NHentaiSearchResponse } from '../../types/api/services/nhentai-service.js';
export { type NHentaiGallery, type NHentaiTag, type NHentaiPage, type NHentaiImages, type NHentaiTitle, type GalleryResult, type SearchData, type NHentaiSearchResult, type PageUrl, type ParsedTags } from '../../types/api/models/nhentai.js';
// API Configuration — nhentai v2 API
const API_BASE = nhentaiConfig.baseUrl; // https://nhentai.net/api/v2
const GALLERY_ENDPOINT = '/galleries';  // v2: /galleries/{id}  (was /gallery/{id})
const THUMBNAIL_BASE = 'https://t.nhentai.net/galleries';
const IMAGE_BASE = 'https://i.nhentai.net/galleries';

// Alternative API mirrors to try when main API is Cloudflare-blocked
const API_MIRRORS = [
    'https://nhentai.net/api/v2',     // Primary
    'https://nhentai.to/api/v2',      // Mirror 1
];

// Image type mapping (includes webp — nhentai now uses 'w' for many covers)
const IMAGE_TYPES: Record<string, string> = {
    'j': 'jpg',
    'p': 'png',
    'g': 'gif',
    'w': 'webp'
};

// Reverse map: file extension → nhentai type letter (for adapting v2 API paths)
const EXT_TO_TYPE: Record<string, string> = {
    'jpg': 'j', 'jpeg': 'j',
    'png': 'p',
    'gif': 'g',
    'webp': 'w'
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
// NHENTAI SERVICE CLASS
class NHentaiService {
    private readonly CACHE_NS = 'api:nhentai';
    private readonly CACHE_TTL = 300; // 5 minutes in seconds
    private readonly TRANSLATE_CACHE_NS = 'api:translate';

    constructor() {
        // No local cache setup needed — uses centralized cacheService
    }

    /**
     * Extract nhentai type letter ('j','p','g','w') from a v2 API path string.
     * v2 API returns full paths like "galleries/123456/1.webp" instead of type letters.
     */
    private _extractTypeFromPath(path: string): string {
        const ext = (path || '').split('.').pop()?.toLowerCase() || 'jpg';
        return EXT_TO_TYPE[ext] || 'j';
    }

    /**
     * Adapt a v2 GalleryDetailResponse into the legacy NHentaiGallery shape
     * so all existing handlers continue to work without modification.
     */
    private _adaptGalleryDetailV2(v2: any): NHentaiGallery {
        const pages = (v2.pages || []).map((p: any) => ({
            t: this._extractTypeFromPath(p.path || ''),
            w: p.width || 0,
            h: p.height || 0
        }));
        const coverType = this._extractTypeFromPath(v2.cover?.path || '');
        const thumbType = this._extractTypeFromPath(v2.thumbnail?.path || v2.cover?.path || '');
        return {
            id: v2.id,
            media_id: v2.media_id,
            title: v2.title || {},
            images: {
                pages,
                cover: { t: coverType, w: v2.cover?.width || 0, h: v2.cover?.height || 0 },
                thumbnail: { t: thumbType, w: v2.thumbnail?.width || 0, h: v2.thumbnail?.height || 0 }
            },
            scanlator: v2.scanlator || '',
            upload_date: v2.upload_date || 0,
            tags: (v2.tags || []).map((t: any) => ({
                id: t.id, type: t.type, name: t.name, url: t.url, count: t.count
            })),
            num_pages: v2.num_pages || 0,
            num_favorites: v2.num_favorites || 0
        };
    }

    /**
     * Adapt a v2 GalleryListItem (lightweight search/list result) into NHentaiGallery.
     * List items lack page data, tags, and upload_date — those will be empty/zero.
     */
    private _adaptGalleryListItemV2(item: any): NHentaiGallery {
        const thumbType = this._extractTypeFromPath(item.thumbnail || '');
        return {
            id: item.id,
            media_id: item.media_id,
            title: {
                english: item.english_title || '',
                japanese: item.japanese_title || undefined,
                pretty: item.english_title || ''
            },
            images: {
                pages: [],
                cover: { t: thumbType, w: item.thumbnail_width || 0, h: item.thumbnail_height || 0 },
                thumbnail: { t: thumbType, w: item.thumbnail_width || 0, h: item.thumbnail_height || 0 }
            },
            scanlator: '',
            upload_date: 0,
            tags: [],
            num_pages: 0,
            num_favorites: 0
        };
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
                    const response = await axios.get<any>(url, getRequestConfig());
                    const gallery = this._adaptGalleryDetailV2(response.data);
                    await cacheService.set(this.CACHE_NS, `nhentai:gallery_${code}`, gallery, this.CACHE_TTL);
                    return { success: true, data: gallery };
                }
            );
        });
    }

    /**
     * Fetch random gallery with circuit breaker.
     * Uses v2 /galleries/random endpoint first, falls back to ID-guessing + curated list.
     */
    async fetchRandomGallery(): Promise<GalleryResult> {
        // v2 API has a dedicated random endpoint — use it first
        try {
            const response = await axios.get<{ id: number }>(
                `${API_BASE}/galleries/random`,
                getRequestConfig({ timeout: 8000 })
            );
            if (response.data?.id) {
                return this.fetchGallery(response.data.id);
            }
        } catch {
            // Fall through to ID-based random
        }

        const maxAttempts = 3;
        for (let i = 0; i < maxAttempts; i++) {
            // Generate random ID between 1 and current max (~640000)
            const randomCode = Math.floor(Math.random() * 640000) + 1;
            const result = await this.fetchGallery(randomCode);

            if (result.success) {
                return result;
            }

            // Proper delay between retries to avoid rate limiting (exponential backoff)
            await new Promise(r => setTimeout(r, 500 * (i + 1)));
        }

        // Fallback to recent feed random if ID-based random misses repeatedly.
        const recentFallback = await this._fetchRandomFromRecentPages('all');
        if (recentFallback.success) {
            return recentFallback;
        }

        // Last resort: curated IDs to avoid complete failure.
        return this._fetchFromCuratedFallbackIds();
    }

    /**
     * Fetch random gallery from a specific period bucket.
     */
    async fetchRandomGalleryByPeriod(period: 'today' | 'week' | 'month' | 'all' = 'all'): Promise<GalleryResult> {
        if (period === 'all') {
            return this.fetchRandomGallery();
        }

        const periodResult = await this._fetchRandomFromRecentPages(period);
        if (periodResult.success) {
            return periodResult;
        }

        // Graceful fallback for strict buckets: broaden to fully-random.
        return this.fetchRandomGallery();
    }

    /**
     * Fetch a popular gallery using v2 API.
     * Primary: /galleries/popular endpoint (today's popular).
     * Fallback: /search with sort-by-period for week/month/all.
     */
    async fetchPopularGallery(period: 'today' | 'week' | 'month' | 'all' = 'all'): Promise<GalleryResult> {
        // v2 dedicated popular endpoint — returns an array of GalleryListItem
        try {
            const response = await axios.get<any[]>(
                `${API_BASE}/galleries/popular`,
                getRequestConfig({ timeout: 10000 })
            );
            if (Array.isArray(response.data) && response.data.length > 0) {
                const idx = Math.floor(Math.random() * response.data.length);
                const id = response.data[idx]?.id;
                if (id) return this.fetchGallery(id);
            }
        } catch {
            // Fall through to search-based approach
        }

        // Fallback: v2 search endpoint with period-based sort
        // Use a broad language filter instead of query=* (v2 requires minLength:1 query)
        try {
            const sortMap: Record<string, string> = {
                today: 'popular-today',
                week: 'popular-week',
                month: 'popular-month',
                all: 'popular'
            };
            const sort = sortMap[period] || 'popular';
            const response = await axios.get<any>(
                `${API_BASE}/search?query=language:english&sort=${sort}&page=1`,
                getRequestConfig({ timeout: 10000 })
            );
            if (response.data?.result && Array.isArray(response.data.result) && response.data.result.length > 0) {
                const idx = Math.floor(Math.random() * Math.min(10, response.data.result.length));
                const id = response.data.result[idx]?.id;
                if (id) return this.fetchGallery(id);
            }
        } catch {
            // Fall through to curated list
        }

        // Last resort: curated popular galleries list
        const curatedFallback = await this._fetchFromCuratedFallbackIds();
        if (curatedFallback.success) {
            return curatedFallback;
        }

        return { success: false, error: 'Could not fetch any popular gallery. The service may be temporarily unavailable.' };
    }

    private getPeriodWindowSeconds(period: 'today' | 'week' | 'month' | 'all'): number {
        switch (period) {
            case 'today':
                return 24 * 60 * 60;
            case 'week':
                return 7 * 24 * 60 * 60;
            case 'month':
                return 30 * 24 * 60 * 60;
            default:
                return Number.POSITIVE_INFINITY;
        }
    }

    private getMaxRecentPageWindow(period: 'today' | 'week' | 'month' | 'all'): number {
        switch (period) {
            case 'today':
                return 12;
            case 'week':
                return 80;
            case 'month':
                return 300;
            default:
                return 800;
        }
    }

    /**
     * Fetch a random gallery by sampling recent feed pages and filtering by upload date.
     * This keeps random independent from popular ranking endpoints.
     */
    private async _fetchRandomFromRecentPages(period: 'today' | 'week' | 'month' | 'all'): Promise<GalleryResult> {
        const maxAttempts = 6;

        // v2: /galleries endpoint (ordered newest first, no upload_date in list items)
        // Period filtering is approximated by page range (newer galleries = lower pages)
        let totalPages = 1;
        try {
            const firstPage = await axios.get<NHentaiSearchResponse>(
                `${API_BASE}/galleries?page=1`,
                getRequestConfig({ timeout: 10000 })
            );
            totalPages = Math.max(1, firstPage.data?.num_pages || 1);

            const firstPageResults = firstPage.data?.result || [];
            if (firstPageResults.length > 0) {
                const pick = firstPageResults[Math.floor(Math.random() * firstPageResults.length)] as any;
                if (pick?.id) {
                    return this.fetchGallery(pick.id);
                }
            }
        } catch {
            // Continue with best-effort sampling fallback.
        }

        const pageWindow = Math.min(this.getMaxRecentPageWindow(period), totalPages);
        for (let i = 0; i < maxAttempts; i++) {
            const randomPage = Math.floor(Math.random() * pageWindow) + 1;

            try {
                const response = await axios.get<NHentaiSearchResponse>(
                    `${API_BASE}/galleries?page=${randomPage}`,
                    getRequestConfig({ timeout: 10000 })
                );

                const galleries = response.data?.result || [];
                if (galleries.length === 0) continue;

                const pick = galleries[Math.floor(Math.random() * galleries.length)] as any;
                if (pick?.id) {
                    return this.fetchGallery(pick.id);
                }
            } catch {
                // Try another random page.
            }

            // Back off slightly between attempts.
            await new Promise(r => setTimeout(r, 250 + (i * 100)));
        }

        return {
            success: false,
            error: `Could not find a random gallery in the selected timeframe (${period}).`
        };
    }

    private async _fetchFromCuratedFallbackIds(): Promise<GalleryResult> {
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
                // Try next gallery.
            }

            if (i < 4) await new Promise(r => setTimeout(r, 300));
        }

        return { success: false, error: 'Could not fetch any fallback gallery.' };
    }

    /**
     * Search galleries by query with circuit breaker
     * @param sort - Sort parameter: 'date', 'popular-today', 'popular-week', 'popular-month', 'popular'
     */
    async searchGalleries(
        query: string,
        page: number = 1,
        sort: string = 'popular'
    ): Promise<NHentaiSearchResult> {
        const cacheKey = `nhentai:search_${query}_${page}_${sort}`;
        const cached = await cacheService.get<SearchData>(this.CACHE_NS, cacheKey);
        if (cached) return { success: true, data: cached, fromCache: true };

        return circuitBreakerRegistry.execute('nsfw', async () => {
            try {
                const encodedQuery = encodeURIComponent(query);
                // v2 search endpoint: /api/v2/search?query=...&page=...&sort=...
                // Valid sort values: date, popular-today, popular-week, popular-month, popular
                const response = await axios.get<NHentaiSearchResponse>(
                    `${API_BASE}/search?query=${encodedQuery}&page=${page}&sort=${sort}`,
                    getRequestConfig()
                );

                const results = (response.data.result || []).map(item => this._adaptGalleryListItemV2(item));

                const data: SearchData = {
                    results,
                    numPages: response.data.num_pages || 1,
                    perPage: response.data.per_page || 25,
                    totalResults: response.data.total ?? ((response.data.num_pages || 1) * (response.data.per_page || 25))
                };

                await cacheService.set(this.CACHE_NS, cacheKey, data, this.CACHE_TTL);

                return { success: true, data };
            } catch (error) {
                return this._handleError(error);
            }
        });
    }

    /**
     * Get autocomplete suggestions for search using v2 POST /tags/autocomplete.
     * Returns tag names that match the query.
     */
    async getSearchSuggestions(query: string): Promise<string[]> {
        if (!query || query.length < 2) return [];

        const cacheKey = `nhentai:suggest_${query.toLowerCase()}`;
        const cached = await cacheService.get<string[]>(this.CACHE_NS, cacheKey);
        if (cached) return cached;

        return circuitBreakerRegistry.execute('nsfw', async () => {
            try {
                // v2 provides a proper autocomplete endpoint for tags
                const response = await axios.post<Array<{ id: number; type: string; name: string; slug: string; url: string; count: number }>>(
                    `${API_BASE}/tags/autocomplete`,
                    { type: 'tag', query, limit: 15 },
                    getRequestConfig({ timeout: 3000 })
                );

                const results = Array.isArray(response.data) ? response.data : [];
                const suggestions = results
                    .filter(t => t?.name)
                    .map(t => t.name)
                    .slice(0, 15);

                await cacheService.set(this.CACHE_NS, cacheKey, suggestions, this.CACHE_TTL);
                return suggestions;
            } catch (error) {
                logger.error('NHentai', `Autocomplete error: ${(error as Error).message}`);
                return [];
            }
        });
    }

    async translateToEnglish(text: string): Promise<string | null> {
        const normalized = (text || '').trim();
        if (!normalized) return null;

        const cacheKey = `translate:nhentai:auto_en:${normalized}`;
        const cached = await cacheService.get<string>(this.TRANSLATE_CACHE_NS, cacheKey);
        if (cached) return cached;

        try {
            const response = await axios.get(
                `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(normalized)}`,
                getRequestConfig({ timeout: 5000 })
            );

            const translated = response?.data?.[0]?.map((item: any) => item?.[0] || '').join('')?.trim();
            if (translated) {
                await cacheService.set(this.TRANSLATE_CACHE_NS, cacheKey, translated, 3600);
                return translated;
            }
            return null;
        } catch {
            return null;
        }
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




