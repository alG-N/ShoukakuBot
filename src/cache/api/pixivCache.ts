/**
 * Pixiv Cache — CacheService-backed search & result caching
 *
 * Architecture (same as rule34Cache):
 *   - In-memory Maps for fast synchronous reads
 *   - CacheService (Redis-backed) write-through for cross-shard sharing + persistence
 *   - Lazy hydration on miss from CacheService
 *
 * @module cache/api/pixivCache
 */

import cacheService from '../CacheService.js';
import type { PixivCacheSearchResult, PixivResultData } from '../../types/api/pixiv/cache.js';

// ── CacheService namespace constants ─────────────────────────────────
const NS = {
    SEARCH:  'pixiv:search',
    RESULTS: 'pixiv:results',
} as const;

const TTL = {
    SEARCH:  5 * 60,      // 5 minutes (autocomplete suggestions)
    RESULTS: 30 * 60,     // 30 minutes (paginated results)
} as const;

const MAX = {
    SEARCH:  200,
    RESULTS: 100,
} as const;

// ── Register namespaces ──────────────────────────────────────────────
function registerNamespaces(): void {
    cacheService.registerNamespace(NS.SEARCH,  { ttl: TTL.SEARCH,  maxSize: MAX.SEARCH,  useRedis: true });
    cacheService.registerNamespace(NS.RESULTS, { ttl: TTL.RESULTS, maxSize: MAX.RESULTS, useRedis: true });
}

// ── Helpers ──────────────────────────────────────────────────────────
/** Fire-and-forget write to CacheService */
function persist(ns: string, key: string, value: unknown, ttl?: number): void {
    cacheService.set(ns, key, value, ttl).catch(() => {});
}

/** Fire-and-forget delete from CacheService */
function unpersist(ns: string, key: string): void {
    cacheService.delete(ns, key).catch(() => {});
}

// ── PixivCache Class ─────────────────────────────────────────────────
class PixivCache {
    private searchMap: Map<string, any[]> = new Map();
    private resultMap: Map<string, PixivResultData> = new Map();
    private pendingResultHydrations: Map<string, Promise<void>> = new Map();
    private readonly HYDRATE_WAIT_MS = 250;

    constructor() {
        registerNamespaces();
    }

    private _withTimeout(promise: Promise<void>, timeoutMs: number): Promise<void> {
        let timer: NodeJS.Timeout | null = null;
        const timeoutPromise = new Promise<void>(resolve => {
            timer = setTimeout(resolve, timeoutMs);
        });

        return Promise.race([promise, timeoutPromise]).finally(() => {
            if (timer) clearTimeout(timer);
        }) as Promise<void>;
    }

    async ensureSearchResultsHydrated(cacheKey: string): Promise<void> {
        if (this.resultMap.has(cacheKey)) {
            return;
        }

        const existing = this.pendingResultHydrations.get(cacheKey);
        if (existing) {
            await this._withTimeout(existing, this.HYDRATE_WAIT_MS);
            return;
        }

        const hydration = cacheService.peek<PixivResultData>(NS.RESULTS, cacheKey).then(val => {
            if (val && !this.resultMap.has(cacheKey)) {
                if (this.resultMap.size >= MAX.RESULTS) this._evictFifo(this.resultMap);
                this.resultMap.set(cacheKey, val);
            }
        }).catch(() => {});

        this.pendingResultHydrations.set(cacheKey, hydration);

        try {
            await this._withTimeout(hydration, this.HYDRATE_WAIT_MS);
        } finally {
            if (this.pendingResultHydrations.get(cacheKey) === hydration) {
                this.pendingResultHydrations.delete(cacheKey);
            }
        }
    }

    // ── Search autocomplete cache ────────────────────────────────────

    getSearchSuggestions(query: string): any[] | null {
        const key = query.toLowerCase();
        const local = this.searchMap.get(key);
        if (local) return local;

        // Lazy hydrate from CacheService
        this._hydrateSearch(key);
        return null;
    }

    setSearchSuggestions(query: string, results: any[]): void {
        const key = query.toLowerCase();
        if (this.searchMap.size >= MAX.SEARCH) this._evictFifo(this.searchMap);
        this.searchMap.set(key, results);
        persist(NS.SEARCH, key, results, TTL.SEARCH);
    }

    // ── Result cache for pagination ──────────────────────────────────

    getResults(cacheKey: string): PixivResultData | null {
        const local = this.resultMap.get(cacheKey);
        if (local) return local;

        // Lazy hydrate
        this._hydrateResult(cacheKey);
        return null;
    }

    setResults(cacheKey: string, data: PixivResultData): void {
        if (this.resultMap.size >= MAX.RESULTS) this._evictFifo(this.resultMap);
        this.resultMap.set(cacheKey, data);
        persist(NS.RESULTS, cacheKey, data, TTL.RESULTS);
    }

    deleteResults(cacheKey: string): void {
        this.resultMap.delete(cacheKey);
        unpersist(NS.RESULTS, cacheKey);
    }

    // ── Alias methods for button handler compatibility ───────────────

    getSearchResults(cacheKey: string): PixivResultData | null {
        return this.getResults(cacheKey);
    }

    setSearchResults(cacheKey: string, data: Partial<PixivResultData> & { results: any[] }): void {
        this.setResults(cacheKey, {
            ...data,
            currentIndex: data.currentIndex || 0,
            mangaPageIndex: data.mangaPageIndex || 0,
            results: data.results
        });
    }

    updateSearchResults(cacheKey: string, updates: Partial<PixivResultData>): void {
        const existing = this.getResults(cacheKey);
        if (existing) {
            this.setResults(cacheKey, { ...existing, ...updates });
        }
    }

    // ── Lifecycle ────────────────────────────────────────────────────

    destroy(): void {
        this.searchMap.clear();
        this.resultMap.clear();
        this.pendingResultHydrations.clear();
    }

    // ── Internal helpers ─────────────────────────────────────────────

    /** FIFO eviction — removes the first inserted key, not the least recently used. */
    private _evictFifo(map: Map<string, unknown>): void {
        const firstKey = map.keys().next().value;
        if (firstKey !== undefined) map.delete(firstKey);
    }

    private _hydrateSearch(key: string): void {
        cacheService.peek<any[]>(NS.SEARCH, key).then(val => {
            if (val && !this.searchMap.has(key)) {
                if (this.searchMap.size >= MAX.SEARCH) this._evictFifo(this.searchMap);
                this.searchMap.set(key, val);
            }
        }).catch(() => {});
    }

    private _hydrateResult(key: string): void {
        cacheService.peek<PixivResultData>(NS.RESULTS, key).then(val => {
            if (val && !this.resultMap.has(key)) {
                if (this.resultMap.size >= MAX.RESULTS) this._evictFifo(this.resultMap);
                this.resultMap.set(key, val);
            }
        }).catch(() => {});
    }
}

// Export singleton instance
const pixivCache = new PixivCache();

export { pixivCache, PixivCache };
export { type PixivCacheSearchResult, type PixivResultData };
export default pixivCache;





