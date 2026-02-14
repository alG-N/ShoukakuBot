/**
 * Rule34 Cache Manager
 * Handles caching for search results, user sessions, blacklists, and preferences.
 *
 * Architecture:
 *   - In-memory Maps provide fast synchronous reads (unchanged public API).
 *   - CacheService (Redis-backed) is used as a write-through backing store
 *     so data survives restarts and is shared across shards.
 *   - On read miss, data is lazily hydrated from CacheService.
 *   - Ephemeral data (sessions, searchCache, autocomplete) has short TTLs.
 *   - User data (blacklists, preferences, favorites, history) has long TTLs.
 *
 * @module repositories/api/rule34Cache
 */

import cacheService from '../../cache/CacheService.js';

// ── CacheService namespace constants ─────────────────────────────────
const NS = {
    SESSION:      'r34:session',
    SEARCH:       'r34:search',
    AUTOCOMPLETE: 'r34:autocomplete',
    BLACKLIST:    'r34:blacklist',
    PREFERENCES:  'r34:preferences',
    FAVORITES:    'r34:favorites',
    HISTORY:      'r34:history',
} as const;

// ── TTLs (seconds) ───────────────────────────────────────────────────
const TTL = {
    SESSION:      2 * 60 * 60,   // 2 hours
    SEARCH:       10 * 60,       // 10 minutes
    AUTOCOMPLETE: 5 * 60,        // 5 minutes
    BLACKLIST:    7 * 24 * 3600, // 7 days
    PREFERENCES:  7 * 24 * 3600, // 7 days
    FAVORITES:    7 * 24 * 3600, // 7 days
    HISTORY:      24 * 3600,     // 24 hours
} as const;

// ── Register namespaces with CacheService ────────────────────────────
function registerNamespaces(): void {
    cacheService.registerNamespace(NS.SESSION,      { ttl: TTL.SESSION,      maxSize: 1000, useRedis: true });
    cacheService.registerNamespace(NS.SEARCH,       { ttl: TTL.SEARCH,       maxSize: 500,  useRedis: true });
    cacheService.registerNamespace(NS.AUTOCOMPLETE, { ttl: TTL.AUTOCOMPLETE, maxSize: 500,  useRedis: true });
    cacheService.registerNamespace(NS.BLACKLIST,    { ttl: TTL.BLACKLIST,    maxSize: 5000, useRedis: true });
    cacheService.registerNamespace(NS.PREFERENCES,  { ttl: TTL.PREFERENCES,  maxSize: 5000, useRedis: true });
    cacheService.registerNamespace(NS.FAVORITES,    { ttl: TTL.FAVORITES,    maxSize: 5000, useRedis: true });
    cacheService.registerNamespace(NS.HISTORY,      { ttl: TTL.HISTORY,      maxSize: 5000, useRedis: true });
}

// ── Interfaces ───────────────────────────────────────────────────────
interface Rule34Session {
    userId: string;
    createdAt: number;
    updatedAt: number;
    pagination?: PaginationState;
    query?: string;
    results?: any[];
    currentIndex?: number;
    [key: string]: any;
}

interface PaginationState {
    currentIndex: number;
    currentPage: number;
    totalResults: number;
    hasMore: boolean;
}

interface SearchCacheEntry {
    timestamp: number;
    results?: any[];
    totalCount?: number;
    [key: string]: any;
}

interface AutocompleteEntry {
    suggestions: string[];
    timestamp: number;
}

interface Rule34Favorite {
    id: number | string;
    addedAt: number;
    url?: string;
    tags?: string[];
    score?: number;
    [key: string]: any;
}

interface HistoryEntry {
    id: number | string;
    viewedAt: number;
    url?: string;
    tags?: string[];
    [key: string]: any;
}

interface UserPreferences {
    aiFilter: boolean;
    defaultRating: string | null;
    minScore: number;
    excludeLowQuality: boolean;
    highQualityOnly: boolean;
    showAnimatedOnly: boolean;
    resultsPerPage: number;
    autoplay: boolean;
    compactMode: boolean;
    sortMode: string;
    safeMode: boolean;
}

interface CacheStats {
    sessions: number;
    searchCache: number;
    blacklists: number;
    preferences: number;
    favorites: number;
    history: number;
    autocomplete: number;
}

interface FavoriteResult {
    success: boolean;
    message?: string;
    favorites?: Rule34Favorite[];
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Fire-and-forget write to CacheService (best-effort persistence). */
function persist<T>(ns: string, key: string, value: T, ttl?: number): void {
    cacheService.set(ns, key, value, ttl).catch(() => {});
}

/** Fire-and-forget delete from CacheService. */
function unpersist(ns: string, key: string): void {
    cacheService.delete(ns, key).catch(() => {});
}

/**
 * Background hydrate from CacheService on local cache miss.
 * Does not block — fills the local Map so the *next* read hits.
 */
function hydrateInBackground<T>(
    map: Map<string, T>,
    ns: string,
    key: string,
): void {
    cacheService.peek<T>(ns, key).then(value => {
        if (value !== null && !map.has(key)) {
            map.set(key, value);
        }
    }).catch(() => {});
}

// ── Rule34Cache Class ────────────────────────────────────────────────
class Rule34Cache {
    // In-memory Maps (synchronous read surface)
    private searchCache = new Map<string, SearchCacheEntry>();
    private userSessions = new Map<string, Rule34Session>();
    private userBlacklists = new Map<string, string[]>();
    private userPreferences = new Map<string, Partial<UserPreferences>>();
    private autocompleteCache = new Map<string, AutocompleteEntry>();
    private userFavorites = new Map<string, Rule34Favorite[]>();
    private viewHistory = new Map<string, HistoryEntry[]>();

    // Cache durations (ms) — used for local TTL checks
    private readonly SEARCH_CACHE_DURATION = 10 * 60 * 1000;      // 10 minutes
    private readonly SESSION_DURATION      = 2 * 60 * 60 * 1000;  // 2 hours
    private readonly AUTOCOMPLETE_DURATION = 5 * 60 * 1000;       // 5 minutes
    private readonly HISTORY_MAX_SIZE      = 50;

    // Map size caps (prevent OOM)
    private readonly MAX_SEARCH_CACHE      = 500;
    private readonly MAX_SESSIONS          = 1000;
    private readonly MAX_AUTOCOMPLETE      = 500;
    private readonly MAX_USER_BLACKLISTS   = 5000;
    private readonly MAX_USER_PREFERENCES  = 5000;
    private readonly MAX_USER_FAVORITES    = 5000;
    private readonly MAX_USER_HISTORY      = 5000;

    private cleanupInterval: NodeJS.Timeout | null;

    constructor() {
        registerNamespaces();

        // Periodic cleanup of expired local entries
        this.cleanupInterval = setInterval(() => this._cleanup(), 5 * 60 * 1000);
        if (this.cleanupInterval.unref) this.cleanupInterval.unref();
    }

    /** FIFO eviction — removes the first inserted keys when map exceeds maxSize. */
    private _evictFifo<K, V>(map: Map<K, V>, maxSize: number): void {
        if (map.size <= maxSize) return;
        const excess = map.size - maxSize;
        const iter = map.keys();
        for (let i = 0; i < excess; i++) {
            const { value, done } = iter.next();
            if (done) break;
            map.delete(value);
        }
    }

    // ══════════════════════════════════════════════════════════════════
    // SESSIONS (ephemeral — 2h TTL)
    // ══════════════════════════════════════════════════════════════════

    setSession(userId: string, sessionData: Partial<Rule34Session>): Rule34Session {
        const session: Rule34Session = {
            ...sessionData,
            userId,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        this.userSessions.set(userId, session);
        this._evictFifo(this.userSessions, this.MAX_SESSIONS);
        persist(NS.SESSION, userId, session, TTL.SESSION);
        return session;
    }

    getSession(userId: string): Rule34Session | null {
        const session = this.userSessions.get(userId);
        if (!session) {
            hydrateInBackground(this.userSessions, NS.SESSION, userId);
            return null;
        }
        if (Date.now() - session.updatedAt > this.SESSION_DURATION) {
            this.userSessions.delete(userId);
            unpersist(NS.SESSION, userId);
            return null;
        }
        return session;
    }

    updateSession(userId: string, updates: Partial<Rule34Session>): Rule34Session | null {
        const session = this.getSession(userId);
        if (!session) return null;
        const updated: Rule34Session = { ...session, ...updates, updatedAt: Date.now() };
        this.userSessions.set(userId, updated);
        persist(NS.SESSION, userId, updated, TTL.SESSION);
        return updated;
    }

    clearSession(userId: string): void {
        this.userSessions.delete(userId);
        unpersist(NS.SESSION, userId);
    }

    // ══════════════════════════════════════════════════════════════════
    // SEARCH CACHE (ephemeral — 10min TTL)
    // ══════════════════════════════════════════════════════════════════

    setSearchResults(cacheKey: string, data: Partial<SearchCacheEntry>): void {
        const entry: SearchCacheEntry = { ...data, timestamp: Date.now() };
        this.searchCache.set(cacheKey, entry);
        this._evictFifo(this.searchCache, this.MAX_SEARCH_CACHE);
        persist(NS.SEARCH, cacheKey, entry, TTL.SEARCH);
    }

    getSearchResults(cacheKey: string): SearchCacheEntry | null {
        const cached = this.searchCache.get(cacheKey);
        if (!cached) return null;
        if (Date.now() - cached.timestamp > this.SEARCH_CACHE_DURATION) {
            this.searchCache.delete(cacheKey);
            unpersist(NS.SEARCH, cacheKey);
            return null;
        }
        return cached;
    }

    generateSearchKey(userId: string, query: string, options: Record<string, any> = {}): string {
        const optStr = JSON.stringify(options);
        return `${userId}_${query}_${optStr}`;
    }

    // ══════════════════════════════════════════════════════════════════
    // BLACKLISTS (persistent — 7d TTL, user-critical)
    // ══════════════════════════════════════════════════════════════════

    getBlacklist(userId: string): string[] {
        const local = this.userBlacklists.get(userId);
        if (local !== undefined) return local;
        hydrateInBackground(this.userBlacklists, NS.BLACKLIST, userId);
        return [];
    }

    addToBlacklist(userId: string, tags: string | string[]): string[] {
        const current = this.getBlacklist(userId);
        const newTags = Array.isArray(tags) ? tags : [tags];
        const updated = [...new Set([...current, ...newTags])];
        this.userBlacklists.set(userId, updated);
        this._evictFifo(this.userBlacklists, this.MAX_USER_BLACKLISTS);
        persist(NS.BLACKLIST, userId, updated, TTL.BLACKLIST);
        return updated;
    }

    removeFromBlacklist(userId: string, tags: string | string[]): string[] {
        const current = this.getBlacklist(userId);
        const toRemove = Array.isArray(tags) ? tags : [tags];
        const updated = current.filter(t => !toRemove.includes(t));
        this.userBlacklists.set(userId, updated);
        persist(NS.BLACKLIST, userId, updated, TTL.BLACKLIST);
        return updated;
    }

    clearBlacklist(userId: string): void {
        this.userBlacklists.set(userId, []);
        persist(NS.BLACKLIST, userId, [] as string[], TTL.BLACKLIST);
    }

    isBlacklisted(userId: string, tag: string): boolean {
        return this.getBlacklist(userId).includes(tag);
    }

    // ══════════════════════════════════════════════════════════════════
    // PREFERENCES (persistent — 7d TTL, user-critical)
    // ══════════════════════════════════════════════════════════════════

    getDefaultPreferences(): UserPreferences {
        return {
            aiFilter: true,
            defaultRating: null,
            minScore: 0,
            excludeLowQuality: true,
            highQualityOnly: false,
            showAnimatedOnly: false,
            resultsPerPage: 10,
            autoplay: false,
            compactMode: false,
            sortMode: 'score:desc',
            safeMode: false,
        };
    }

    getPreferences(userId: string): UserPreferences {
        const local = this.userPreferences.get(userId);
        if (local !== undefined) {
            return { ...this.getDefaultPreferences(), ...local };
        }
        hydrateInBackground(this.userPreferences, NS.PREFERENCES, userId);
        return this.getDefaultPreferences();
    }

    setPreferences(userId: string, preferences: Partial<UserPreferences>): UserPreferences {
        const current = this.getPreferences(userId);
        const updated = { ...current, ...preferences };
        this.userPreferences.set(userId, updated);
        this._evictFifo(this.userPreferences, this.MAX_USER_PREFERENCES);
        persist(NS.PREFERENCES, userId, updated, TTL.PREFERENCES);
        return updated;
    }

    resetPreferences(userId: string): UserPreferences {
        this.userPreferences.delete(userId);
        unpersist(NS.PREFERENCES, userId);
        return this.getDefaultPreferences();
    }

    // ══════════════════════════════════════════════════════════════════
    // AUTOCOMPLETE (ephemeral — 5min TTL)
    // ══════════════════════════════════════════════════════════════════

    setAutocompleteSuggestions(query: string, suggestions: string[]): void {
        const key = query.toLowerCase();
        const entry: AutocompleteEntry = { suggestions, timestamp: Date.now() };
        this.autocompleteCache.set(key, entry);
        this._evictFifo(this.autocompleteCache, this.MAX_AUTOCOMPLETE);
        persist(NS.AUTOCOMPLETE, key, entry, TTL.AUTOCOMPLETE);
    }

    getAutocompleteSuggestions(query: string): string[] | null {
        const key = query.toLowerCase();
        const cached = this.autocompleteCache.get(key);
        if (!cached) return null;
        if (Date.now() - cached.timestamp > this.AUTOCOMPLETE_DURATION) {
            this.autocompleteCache.delete(key);
            unpersist(NS.AUTOCOMPLETE, key);
            return null;
        }
        return cached.suggestions;
    }

    // ══════════════════════════════════════════════════════════════════
    // FAVORITES (persistent — 7d TTL, user-critical)
    // ══════════════════════════════════════════════════════════════════

    getFavorites(userId: string): Rule34Favorite[] {
        const local = this.userFavorites.get(userId);
        if (local !== undefined) return local;
        hydrateInBackground(this.userFavorites, NS.FAVORITES, userId);
        return [];
    }

    addFavorite(userId: string, postId: number | string, postInfo: Record<string, any> = {}): FavoriteResult {
        const favorites = this.getFavorites(userId);
        if (favorites.some(f => f.id === postId)) {
            return { success: false, message: 'Already favorited' };
        }
        favorites.unshift({ id: postId, ...postInfo, addedAt: Date.now() });
        if (favorites.length > 100) favorites.pop();
        this.userFavorites.set(userId, favorites);
        this._evictFifo(this.userFavorites, this.MAX_USER_FAVORITES);
        persist(NS.FAVORITES, userId, favorites, TTL.FAVORITES);
        return { success: true, favorites };
    }

    removeFavorite(userId: string, postId: number | string): Rule34Favorite[] {
        const favorites = this.getFavorites(userId);
        const updated = favorites.filter(f => f.id !== postId);
        this.userFavorites.set(userId, updated);
        persist(NS.FAVORITES, userId, updated, TTL.FAVORITES);
        return updated;
    }

    isFavorited(userId: string, postId: number | string): boolean {
        return this.getFavorites(userId).some(f => f.id === postId);
    }

    // ══════════════════════════════════════════════════════════════════
    // VIEW HISTORY (semi-persistent — 24h TTL)
    // ══════════════════════════════════════════════════════════════════

    addToHistory(userId: string, postId: number | string, postInfo: Record<string, any> = {}): HistoryEntry[] {
        let history = this.viewHistory.get(userId) || [];
        history = history.filter(h => h.id !== postId);
        history.unshift({ id: postId, ...postInfo, viewedAt: Date.now() });
        if (history.length > this.HISTORY_MAX_SIZE) {
            history = history.slice(0, this.HISTORY_MAX_SIZE);
        }
        this.viewHistory.set(userId, history);
        this._evictFifo(this.viewHistory, this.MAX_USER_HISTORY);
        persist(NS.HISTORY, userId, history, TTL.HISTORY);
        return history;
    }

    getHistory(userId: string, limit: number = 20): HistoryEntry[] {
        const history = this.viewHistory.get(userId) || [];
        return history.slice(0, limit);
    }

    clearHistory(userId: string): void {
        this.viewHistory.delete(userId);
        unpersist(NS.HISTORY, userId);
    }

    // ══════════════════════════════════════════════════════════════════
    // PAGINATION (delegates to session)
    // ══════════════════════════════════════════════════════════════════

    setPagination(userId: string, state: Partial<PaginationState>): Rule34Session | null {
        return this.updateSession(userId, {
            pagination: {
                currentIndex: state.currentIndex || 0,
                currentPage: state.currentPage || 0,
                totalResults: state.totalResults || 0,
                hasMore: state.hasMore || false,
            },
        });
    }

    getPagination(userId: string): PaginationState | null {
        const session = this.getSession(userId);
        return session?.pagination || null;
    }

    // ══════════════════════════════════════════════════════════════════
    // STATS & LIFECYCLE
    // ══════════════════════════════════════════════════════════════════

    getStats(): CacheStats {
        return {
            sessions: this.userSessions.size,
            searchCache: this.searchCache.size,
            blacklists: this.userBlacklists.size,
            preferences: this.userPreferences.size,
            favorites: this.userFavorites.size,
            history: this.viewHistory.size,
            autocomplete: this.autocompleteCache.size,
        };
    }

    private _cleanup(): void {
        const now = Date.now();
        for (const [key, value] of this.searchCache.entries()) {
            if (now - value.timestamp > this.SEARCH_CACHE_DURATION) {
                this.searchCache.delete(key);
            }
        }
        for (const [key, value] of this.userSessions.entries()) {
            if (now - value.updatedAt > this.SESSION_DURATION) {
                this.userSessions.delete(key);
            }
        }
        for (const [key, value] of this.autocompleteCache.entries()) {
            if (now - value.timestamp > this.AUTOCOMPLETE_DURATION) {
                this.autocompleteCache.delete(key);
            }
        }
    }

    destroy(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }
}

// Export singleton instance
const rule34Cache = new Rule34Cache();

export { rule34Cache, Rule34Cache };
export type {
    Rule34Session,
    PaginationState,
    SearchCacheEntry,
    AutocompleteEntry,
    Rule34Favorite,
    HistoryEntry,
    UserPreferences,
    CacheStats,
    FavoriteResult,
};
export default rule34Cache;
