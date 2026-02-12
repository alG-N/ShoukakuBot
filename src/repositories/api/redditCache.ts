/**
 * Reddit Cache — CacheService-backed user session state
 *
 * Architecture:
 *   - In-memory Maps for fast synchronous reads (unchanged public API)
 *   - CacheService (Redis-backed) write-through for cross-shard sharing
 *   - Lazy hydration on miss from CacheService
 *   - Session data auto-expires via CacheService TTL (1 hour)
 *
 * @module repositories/api/redditCache
 */

import cacheService from '../../cache/CacheService.js';

// ── Interfaces ───────────────────────────────────────────────────────
interface RedditPost {
    id: string;
    title: string;
    url: string;
    permalink: string;
    author: string;
    subreddit: string;
    score: number;
    num_comments: number;
    created_utc: number;
    is_video: boolean;
    is_gallery?: boolean;
    gallery_data?: any;
    media_metadata?: any;
    post_hint?: string;
    thumbnail?: string;
    preview?: any;
    selftext?: string;
    over_18: boolean;
    [key: string]: any;
}

type SortType = 'top' | 'new' | 'hot' | 'rising' | 'controversial';

/** Bundled user session stored in CacheService */
interface RedditSession {
    posts: RedditPost[];
    page: number;
    sort: SortType;
    nsfw: boolean;
    galleryPages: Record<string, number>;  // `${postIndex}` → page
    updatedAt: number;
}

// ── CacheService namespace ───────────────────────────────────────────
const NS = 'reddit:session';
const SESSION_TTL = 60 * 60;   // 1 hour
const MAX_SESSIONS = 1000;

function registerNamespaces(): void {
    cacheService.registerNamespace(NS, { ttl: SESSION_TTL, maxSize: MAX_SESSIONS, useRedis: true });
}

// ── Helpers ──────────────────────────────────────────────────────────
function persist(userId: string, session: RedditSession): void {
    cacheService.set(NS, userId, session, SESSION_TTL).catch(() => {});
}

function unpersist(userId: string): void {
    cacheService.delete(NS, userId).catch(() => {});
}

// ── RedditCache Class ────────────────────────────────────────────────
class RedditCache {
    /** Local sync surface — keyed by userId */
    private sessions: Map<string, RedditSession> = new Map();

    constructor() {
        registerNamespaces();
    }

    // ── Internal session access ──────────────────────────────────────

    private _getSession(userId: string): RedditSession | undefined {
        const s = this.sessions.get(userId);
        if (s) return s;

        // Lazy hydrate from CacheService (async, won't help this call)
        this._hydrate(userId);
        return undefined;
    }

    private _ensureSession(userId: string): RedditSession {
        let s = this.sessions.get(userId);
        if (!s) {
            s = { posts: [], page: 0, sort: 'top', nsfw: false, galleryPages: {}, updatedAt: Date.now() };
            if (this.sessions.size >= MAX_SESSIONS) this._evictOldest();
            this.sessions.set(userId, s);
        }
        return s;
    }

    private _touch(userId: string, session: RedditSession): void {
        session.updatedAt = Date.now();
        persist(userId, session);
    }

    // ── Post management ──────────────────────────────────────────────

    setPosts(userId: string, posts: RedditPost[]): void {
        const s = this._ensureSession(userId);
        s.posts = posts;
        this._touch(userId, s);
    }

    getPosts(userId: string): RedditPost[] | undefined {
        return this._getSession(userId)?.posts;
    }

    clearPosts(userId: string): void {
        const s = this.sessions.get(userId);
        if (s) {
            s.posts = [];
            this._touch(userId, s);
        }
    }

    // ── Page state management ────────────────────────────────────────

    setPage(userId: string, page: number): void {
        const s = this._ensureSession(userId);
        s.page = page;
        this._touch(userId, s);
    }

    getPage(userId: string): number {
        return this._getSession(userId)?.page ?? 0;
    }

    // ── Sort state management ────────────────────────────────────────

    setSort(userId: string, sortBy: SortType): void {
        const s = this._ensureSession(userId);
        s.sort = sortBy;
        this._touch(userId, s);
    }

    getSort(userId: string): SortType {
        return this._getSession(userId)?.sort ?? 'top';
    }

    // ── NSFW channel state management ────────────────────────────────

    setNsfwChannel(userId: string, isNsfw: boolean): void {
        const s = this._ensureSession(userId);
        s.nsfw = isNsfw;
        this._touch(userId, s);
    }

    getNsfwChannel(userId: string): boolean {
        return this._getSession(userId)?.nsfw ?? false;
    }

    // ── Gallery state management ─────────────────────────────────────

    setGalleryPage(userId: string, postIndex: number, page: number): void {
        const s = this._ensureSession(userId);
        s.galleryPages[String(postIndex)] = page;
        this._touch(userId, s);
    }

    getGalleryPage(userId: string, postIndex: number): number {
        return this._getSession(userId)?.galleryPages[String(postIndex)] ?? 0;
    }

    clearGalleryStates(userId: string): void {
        const s = this.sessions.get(userId);
        if (s) {
            s.galleryPages = {};
            this._touch(userId, s);
        }
    }

    // ── Clear all user data ──────────────────────────────────────────

    clearAll(userId: string): void {
        this.sessions.delete(userId);
        unpersist(userId);
    }

    // ── Lifecycle ────────────────────────────────────────────────────

    destroy(): void {
        this.sessions.clear();
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

    private _hydrate(userId: string): void {
        cacheService.peek<RedditSession>(NS, userId).then(val => {
            if (val && !this.sessions.has(userId)) {
                if (this.sessions.size >= MAX_SESSIONS) this._evictOldest();
                this.sessions.set(userId, val);
            }
        }).catch(() => {});
    }
}

// Export singleton instance
const redditCache = new RedditCache();

export { redditCache, RedditCache };
export type { RedditPost, SortType };
export default redditCache;
