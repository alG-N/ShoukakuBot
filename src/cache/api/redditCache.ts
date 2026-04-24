/**
 * Reddit Cache — CacheService-backed user session state
 *
 * Architecture:
 *   - In-memory Maps for fast synchronous reads (unchanged public API)
 *   - CacheService (Redis-backed) write-through for cross-shard sharing
 *   - Lazy hydration on miss from CacheService
 *   - Session data auto-expires via CacheService TTL (1 hour)
 *
 * @module cache/api/redditCache
 */

import cacheService from '../CacheService.js';
import type { RedditPost } from '../../types/api/models/reddit.js';
import type { SortType, RedditSession } from '../../types/api/repositories/reddit-cache.js';
export { type RedditPost } from '../../types/api/models/reddit.js';
export { type SortType, type RedditSession } from '../../types/api/repositories/reddit-cache.js';

// ── CacheService namespace ───────────────────────────────────────────
const NS = 'reddit:session';
const SESSION_TTL = 60 * 60;   // 1 hour
const MAX_SESSIONS = 1000;

function buildSessionKey(userId: string, sessionId: string = 'latest'): string {
    return `${userId}:${sessionId}`;
}

function registerNamespaces(): void {
    cacheService.registerNamespace(NS, { ttl: SESSION_TTL, maxSize: MAX_SESSIONS, useRedis: true });
}

// ── Helpers ──────────────────────────────────────────────────────────
function persist(sessionKey: string, session: RedditSession): void {
    cacheService.set(NS, sessionKey, session, SESSION_TTL).catch(() => {});
}

function unpersist(sessionKey: string): void {
    cacheService.delete(NS, sessionKey).catch(() => {});
}

// ── RedditCache Class ────────────────────────────────────────────────
class RedditCache {
    /** Local sync surface — keyed by userId */
    private sessions: Map<string, RedditSession> = new Map();
    private pendingHydrations: Map<string, Promise<void>> = new Map();
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

    async ensureHydrated(userId: string, sessionId: string = 'latest'): Promise<void> {
        const sessionKey = buildSessionKey(userId, sessionId);
        if (this.sessions.has(sessionKey)) {
            return;
        }

        const existing = this.pendingHydrations.get(sessionKey);
        if (existing) {
            await this._withTimeout(existing, this.HYDRATE_WAIT_MS);
            return;
        }

        const hydration = cacheService.peek<RedditSession>(NS, sessionKey).then(val => {
            if (val && !this.sessions.has(sessionKey)) {
                if (this.sessions.size >= MAX_SESSIONS) this._evictOldest();
                this.sessions.set(sessionKey, val);
            }
        }).catch(() => {});

        this.pendingHydrations.set(sessionKey, hydration);

        try {
            await this._withTimeout(hydration, this.HYDRATE_WAIT_MS);
        } finally {
            if (this.pendingHydrations.get(sessionKey) === hydration) {
                this.pendingHydrations.delete(sessionKey);
            }
        }
    }

    // ── Internal session access ──────────────────────────────────────

    private _getSession(userId: string, sessionId: string = 'latest'): RedditSession | undefined {
        const sessionKey = buildSessionKey(userId, sessionId);
        const s = this.sessions.get(sessionKey);
        if (s) return s;

        // Lazy hydrate from CacheService (async, won't help this call)
        this._hydrate(userId, sessionId);
        return undefined;
    }

    private _ensureSession(userId: string, sessionId: string = 'latest'): RedditSession {
        const sessionKey = buildSessionKey(userId, sessionId);
        let s = this.sessions.get(sessionKey);
        if (!s) {
            s = { posts: [], page: 0, sort: 'top', nsfw: false, galleryPages: {}, updatedAt: Date.now() };
            if (this.sessions.size >= MAX_SESSIONS) this._evictOldest();
            this.sessions.set(sessionKey, s);
        }
        return s;
    }

    private _touch(userId: string, session: RedditSession, sessionId: string = 'latest'): void {
        const sessionKey = buildSessionKey(userId, sessionId);
        session.updatedAt = Date.now();
        persist(sessionKey, session);
    }

    // ── Post management ──────────────────────────────────────────────

    setPosts(userId: string, posts: RedditPost[], sessionId: string = 'latest'): void {
        const s = this._ensureSession(userId, sessionId);
        s.posts = posts;
        this._touch(userId, s, sessionId);
    }

    getPosts(userId: string, sessionId: string = 'latest'): RedditPost[] | undefined {
        return this._getSession(userId, sessionId)?.posts;
    }

    clearPosts(userId: string, sessionId: string = 'latest'): void {
        const sessionKey = buildSessionKey(userId, sessionId);
        const s = this.sessions.get(sessionKey);
        if (s) {
            s.posts = [];
            this._touch(userId, s, sessionId);
        }
    }

    // ── Page state management ────────────────────────────────────────

    setPage(userId: string, page: number, sessionId: string = 'latest'): void {
        const s = this._ensureSession(userId, sessionId);
        s.page = page;
        this._touch(userId, s, sessionId);
    }

    getPage(userId: string, sessionId: string = 'latest'): number {
        return this._getSession(userId, sessionId)?.page ?? 0;
    }

    // ── Sort state management ────────────────────────────────────────

    setSort(userId: string, sortBy: SortType, sessionId: string = 'latest'): void {
        const s = this._ensureSession(userId, sessionId);
        s.sort = sortBy;
        this._touch(userId, s, sessionId);
    }

    getSort(userId: string, sessionId: string = 'latest'): SortType {
        return this._getSession(userId, sessionId)?.sort ?? 'top';
    }

    // ── NSFW channel state management ────────────────────────────────

    setNsfwChannel(userId: string, isNsfw: boolean, sessionId: string = 'latest'): void {
        const s = this._ensureSession(userId, sessionId);
        s.nsfw = isNsfw;
        this._touch(userId, s, sessionId);
    }

    getNsfwChannel(userId: string, sessionId: string = 'latest'): boolean {
        return this._getSession(userId, sessionId)?.nsfw ?? false;
    }

    // ── Gallery state management ─────────────────────────────────────

    setGalleryPage(userId: string, postIndex: number, page: number, sessionId: string = 'latest'): void {
        const s = this._ensureSession(userId, sessionId);
        s.galleryPages[String(postIndex)] = page;
        this._touch(userId, s, sessionId);
    }

    getGalleryPage(userId: string, postIndex: number, sessionId: string = 'latest'): number {
        return this._getSession(userId, sessionId)?.galleryPages[String(postIndex)] ?? 0;
    }

    clearGalleryStates(userId: string, sessionId: string = 'latest'): void {
        const sessionKey = buildSessionKey(userId, sessionId);
        const s = this.sessions.get(sessionKey);
        if (s) {
            s.galleryPages = {};
            this._touch(userId, s, sessionId);
        }
    }

    // ── Clear all user data ──────────────────────────────────────────

    clearAll(userId: string, sessionId: string = 'latest'): void {
        const sessionKey = buildSessionKey(userId, sessionId);
        this.sessions.delete(sessionKey);
        unpersist(sessionKey);
    }

    // ── Lifecycle ────────────────────────────────────────────────────

    destroy(): void {
        this.sessions.clear();
        this.pendingHydrations.clear();
    }

    // ── Internal helpers ─────────────────────────────────────────────

    private _evictOldest(): void {
        let oldestKey: string | null = null;
        let oldestTime = Infinity;
        for (const [key, session] of this.sessions) {
            if (session.updatedAt < oldestTime) {
                oldestTime = session.updatedAt;
                oldestKey = key;
            }
        }
        if (oldestKey) this.sessions.delete(oldestKey);
    }

    private _hydrate(userId: string, sessionId: string = 'latest'): void {
        const sessionKey = buildSessionKey(userId, sessionId);
        cacheService.peek<RedditSession>(NS, sessionKey).then(val => {
            if (val && !this.sessions.has(sessionKey)) {
                if (this.sessions.size >= MAX_SESSIONS) this._evictOldest();
                this.sessions.set(sessionKey, val);
            }
        }).catch(() => {});
    }
}

// Export singleton instance
const redditCache = new RedditCache();

export { redditCache, RedditCache };
export default redditCache;




