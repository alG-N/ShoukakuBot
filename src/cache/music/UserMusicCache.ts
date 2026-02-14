/**
 * User Music Cache
 * Manages user preferences, favorites, and listening history
 * Persisted to PostgreSQL, cached in CacheService (shard-safe)
 * @module modules/music/repository/UserMusicCache
 */

import postgres from '../../database/postgres.js';
import cacheService from '../CacheService.js';
import logger from '../../core/Logger.js';
// Types
export interface UserPreferences {
    defaultVolume: number;
    autoPlay: boolean;
    announceTrack: boolean;
    compactMode: boolean;
    djMode: boolean;
    maxTrackDuration: number;
    maxQueueSize: number;
    preferredSource: string;
    showThumbnails: boolean;
    autoLeaveEmpty: boolean;
    voteSkipEnabled: boolean;
    updatedAt: number;
    lastAccessed?: number;
}

export interface FavoriteTrack {
    url: string;
    title: string;
    author?: string;
    duration?: number;
    thumbnail?: string;
    addedAt: number;
}

export interface HistoryTrack {
    url: string;
    title: string;
    author?: string;
    duration?: number;
    thumbnail?: string;
    playedAt: number;
}

export interface FavoritesEntry {
    tracks: FavoriteTrack[];
    _lastAccessed: number;
}

export interface HistoryEntry {
    tracks: HistoryTrack[];
    _lastAccessed: number;
}

export interface AddFavoriteResult {
    success: boolean;
    message?: string;
    count?: number;
}

export interface UserMusicStats {
    preferences: number;
    favorites: number;
    history: number;
    maxUsers: number;
}
// UserMusicCache Class — PostgreSQL-backed, CacheService-cached
class UserMusicCache {
    private readonly CACHE_NS = 'music';
    private readonly PREFS_TTL = 600; // 10 minutes
    private readonly FAVS_TTL = 300; // 5 minutes
    private readonly HISTORY_TTL = 300; // 5 minutes
    private readonly HISTORY_MAX_SIZE = 100;
    private readonly FAVORITES_MAX_SIZE = 200;

    constructor() {
        // All state managed by PostgreSQL + CacheService — no local intervals needed
    }
    /**
     * Default preferences
     */
    getDefaultPreferences(): UserPreferences {
        return {
            defaultVolume: 100,
            autoPlay: false,
            announceTrack: true,
            compactMode: false,
            djMode: false,
            maxTrackDuration: 600,     // 10 minutes
            maxQueueSize: 100,
            preferredSource: 'youtube',
            showThumbnails: true,
            autoLeaveEmpty: true,
            voteSkipEnabled: true,
            updatedAt: Date.now()
        };
    }

    /**
     * Get user preferences (cache → DB → defaults)
     */
    async getPreferences(userId: string): Promise<UserPreferences> {
        const cacheKey = `user_prefs:${userId}`;

        // Check cache first
        const cached = await cacheService.get<UserPreferences>(this.CACHE_NS, cacheKey);
        if (cached) return cached;

        // Load from DB
        try {
            const result = await postgres.query(
                'SELECT * FROM user_music_preferences WHERE user_id = $1',
                [userId]
            );

            if (result.rows.length > 0) {
                const row = result.rows[0] as any;
                const prefs: UserPreferences = {
                    defaultVolume: row.default_volume,
                    autoPlay: row.auto_play,
                    announceTrack: row.announce_track,
                    compactMode: row.compact_mode,
                    djMode: row.dj_mode,
                    maxTrackDuration: row.max_track_duration,
                    maxQueueSize: row.max_queue_size,
                    preferredSource: row.preferred_source,
                    showThumbnails: row.show_thumbnails,
                    autoLeaveEmpty: row.auto_leave_empty,
                    voteSkipEnabled: row.vote_skip_enabled,
                    updatedAt: new Date(row.updated_at).getTime(),
                    lastAccessed: Date.now()
                };
                await cacheService.set(this.CACHE_NS, cacheKey, prefs, this.PREFS_TTL);
                return prefs;
            }
        } catch (error) {
            logger.error('UserMusicCache', `Failed to load preferences from DB: ${(error as Error).message}`);
        }

        return this.getDefaultPreferences();
    }

    /**
     * Set user preferences (write-through: DB + cache)
     */
    async setPreferences(userId: string, preferences: Partial<UserPreferences>): Promise<UserPreferences> {
        const current = await this.getPreferences(userId);
        const updated: UserPreferences = {
            ...current,
            ...preferences,
            updatedAt: Date.now(),
            lastAccessed: Date.now()
        };

        try {
            await postgres.query(
                `INSERT INTO user_music_preferences (
                    user_id, default_volume, auto_play, announce_track, compact_mode,
                    dj_mode, max_track_duration, max_queue_size, preferred_source,
                    show_thumbnails, auto_leave_empty, vote_skip_enabled
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                ON CONFLICT (user_id) DO UPDATE SET
                    default_volume = EXCLUDED.default_volume,
                    auto_play = EXCLUDED.auto_play,
                    announce_track = EXCLUDED.announce_track,
                    compact_mode = EXCLUDED.compact_mode,
                    dj_mode = EXCLUDED.dj_mode,
                    max_track_duration = EXCLUDED.max_track_duration,
                    max_queue_size = EXCLUDED.max_queue_size,
                    preferred_source = EXCLUDED.preferred_source,
                    show_thumbnails = EXCLUDED.show_thumbnails,
                    auto_leave_empty = EXCLUDED.auto_leave_empty,
                    vote_skip_enabled = EXCLUDED.vote_skip_enabled`,
                [
                    userId, updated.defaultVolume, updated.autoPlay, updated.announceTrack,
                    updated.compactMode, updated.djMode, updated.maxTrackDuration,
                    updated.maxQueueSize, updated.preferredSource, updated.showThumbnails,
                    updated.autoLeaveEmpty, updated.voteSkipEnabled
                ]
            );
        } catch (error) {
            logger.error('UserMusicCache', `Failed to save preferences to DB: ${(error as Error).message}`);
        }

        const cacheKey = `user_prefs:${userId}`;
        await cacheService.set(this.CACHE_NS, cacheKey, updated, this.PREFS_TTL);
        return updated;
    }

    /**
     * Reset user preferences
     */
    async resetPreferences(userId: string): Promise<UserPreferences> {
        try {
            await postgres.query('DELETE FROM user_music_preferences WHERE user_id = $1', [userId]);
        } catch (error) {
            logger.error('UserMusicCache', `Failed to delete preferences from DB: ${(error as Error).message}`);
        }
        await cacheService.delete(this.CACHE_NS, `user_prefs:${userId}`);
        return this.getDefaultPreferences();
    }
    /**
     * Get user favorites (cache → DB)
     */
    async getFavorites(userId: string): Promise<FavoriteTrack[]> {
        const cacheKey = `user_favs:${userId}`;

        const cached = await cacheService.get<FavoriteTrack[]>(this.CACHE_NS, cacheKey);
        if (cached) return cached;

        try {
            const result = await postgres.query(
                'SELECT url, title, author, duration, thumbnail, added_at FROM user_music_favorites WHERE user_id = $1 ORDER BY added_at DESC LIMIT $2',
                [userId, this.FAVORITES_MAX_SIZE]
            );

            const tracks: FavoriteTrack[] = (result.rows as any[]).map((row) => ({
                url: row.url,
                title: row.title,
                author: row.author || undefined,
                duration: row.duration || undefined,
                thumbnail: row.thumbnail || undefined,
                addedAt: new Date(row.added_at).getTime()
            }));

            await cacheService.set(this.CACHE_NS, cacheKey, tracks, this.FAVS_TTL);
            return tracks;
        } catch (error) {
            logger.error('UserMusicCache', `Failed to load favorites from DB: ${(error as Error).message}`);
            return [];
        }
    }

    /**
     * Add to favorites (write-through: DB + invalidate cache)
     */
    async addFavorite(userId: string, track: any): Promise<AddFavoriteResult> {
        try {
            // Check count first
            const countResult = await postgres.query(
                'SELECT COUNT(*) as cnt FROM user_music_favorites WHERE user_id = $1',
                [userId]
            );
            const currentCount = parseInt((countResult.rows[0] as any).cnt, 10);

            if (currentCount >= this.FAVORITES_MAX_SIZE) {
                // Remove oldest to make room
                await postgres.query(
                    `DELETE FROM user_music_favorites WHERE id IN (
                        SELECT id FROM user_music_favorites WHERE user_id = $1
                        ORDER BY added_at ASC LIMIT 1
                    )`,
                    [userId]
                );
            }

            // Insert (UPSERT — ignore if already exists)
            const result = await postgres.query(
                `INSERT INTO user_music_favorites (user_id, url, title, author, duration, thumbnail)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT (user_id, url) DO NOTHING
                 RETURNING id`,
                [userId, track.url, track.title, track.author || null, track.lengthSeconds || track.duration || null, track.thumbnail || null]
            );

            if (result.rows.length === 0) {
                return { success: false, message: 'Already in favorites' };
            }

            // Invalidate cache
            await cacheService.delete(this.CACHE_NS, `user_favs:${userId}`);
            return { success: true, count: currentCount + 1 };
        } catch (error) {
            logger.error('UserMusicCache', `Failed to add favorite: ${(error as Error).message}`);
            return { success: false, message: 'Database error' };
        }
    }

    /**
     * Remove from favorites
     */
    async removeFavorite(userId: string, trackUrl: string): Promise<FavoriteTrack[]> {
        let dbSuccess = false;
        try {
            await postgres.query(
                'DELETE FROM user_music_favorites WHERE user_id = $1 AND url = $2',
                [userId, trackUrl]
            );
            dbSuccess = true;
        } catch (error) {
            logger.error('UserMusicCache', `Failed to remove favorite: ${(error as Error).message}`);
        }

        if (dbSuccess) {
            // Update cache directly: read current cached list, remove the track, and re-cache
            // Use peek() — null is expected on cold cache, shouldn't count as a miss
            const cacheKey = `user_favs:${userId}`;
            const cached = await cacheService.peek<FavoriteTrack[]>(this.CACHE_NS, cacheKey);
            if (cached) {
                const updated = cached.filter(t => t.url !== trackUrl);
                await cacheService.set(this.CACHE_NS, cacheKey, updated, this.FAVS_TTL);
                return updated;
            }
            // Cache was cold — fetch from DB directly (skip getFavorites to avoid double miss)
            return this._fetchFavoritesFromDB(userId);
        } else {
            // DB failed — invalidate cache to force fresh read next time
            await cacheService.delete(this.CACHE_NS, `user_favs:${userId}`);
        }

        // DB failed — fetch from DB as last resort
        return this._fetchFavoritesFromDB(userId);
    }

    /**
     * Check if favorited
     */
    async isFavorited(userId: string, trackUrl: string): Promise<boolean> {
        const favorites = await this.getFavorites(userId);
        return favorites.some(f => f.url === trackUrl);
    }
    /**
     * Add to listening history (write-through: DB + update cache directly)
     */
    async addToHistory(userId: string, track: any): Promise<HistoryTrack[]> {
        let dbSuccess = false;
        try {
            // Remove existing entry for same URL (move to top)
            await postgres.query(
                'DELETE FROM user_music_history WHERE user_id = $1 AND url = $2',
                [userId, track.url]
            );

            // Insert new entry
            await postgres.query(
                `INSERT INTO user_music_history (user_id, url, title, author, duration, thumbnail)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [userId, track.url, track.title, track.author || null, track.lengthSeconds || track.duration || null, track.thumbnail || null]
            );
            dbSuccess = true;
            // Trim trigger handles size limit in DB
        } catch (error) {
            logger.error('UserMusicCache', `Failed to add to history: ${(error as Error).message}`);
        }

        if (dbSuccess) {
            // Update cache directly: prepend new track to cached list
            // Use peek() — null is expected on cold cache, shouldn't count as a miss
            const cacheKey = `user_history:${userId}`;
            const newTrack: HistoryTrack = {
                url: track.url,
                title: track.title,
                author: track.author || undefined,
                duration: track.lengthSeconds || track.duration || undefined,
                thumbnail: track.thumbnail || undefined,
                playedAt: Date.now()
            };

            const cached = await cacheService.peek<HistoryTrack[]>(this.CACHE_NS, cacheKey);
            if (cached) {
                // Remove duplicate, prepend new entry, trim to max size
                const updated = [newTrack, ...cached.filter(t => t.url !== track.url)].slice(0, this.HISTORY_MAX_SIZE);
                await cacheService.set(this.CACHE_NS, cacheKey, updated, this.HISTORY_TTL);
                return updated;
            }
            // Cache was cold — fetch from DB directly and prepend (skip getHistory to avoid double miss)
            const history = await this._fetchHistoryFromDB(userId);
            const merged = [newTrack, ...history.filter(t => t.url !== track.url)].slice(0, this.HISTORY_MAX_SIZE);
            await cacheService.set(this.CACHE_NS, cacheKey, merged, this.HISTORY_TTL);
            return merged;
        } else {
            // DB failed — invalidate cache to force fresh read next time
            await cacheService.delete(this.CACHE_NS, `user_history:${userId}`);
        }

        // DB failed — fetch from DB as last resort
        return this._fetchHistoryFromDB(userId);
    }

    /**
     * Get listening history (cache → DB)
     */
    async getHistory(userId: string, limit: number = 20): Promise<HistoryTrack[]> {
        const cacheKey = `user_history:${userId}`;

        // For default limit, try cache
        if (limit <= this.HISTORY_MAX_SIZE) {
            const cached = await cacheService.get<HistoryTrack[]>(this.CACHE_NS, cacheKey);
            if (cached) return cached.slice(0, limit);
        }

        try {
            const result = await postgres.query(
                'SELECT url, title, author, duration, thumbnail, played_at FROM user_music_history WHERE user_id = $1 ORDER BY played_at DESC LIMIT $2',
                [userId, Math.min(limit, this.HISTORY_MAX_SIZE)]
            );

            const tracks: HistoryTrack[] = (result.rows as any[]).map((row) => ({
                url: row.url,
                title: row.title,
                author: row.author || undefined,
                duration: row.duration || undefined,
                thumbnail: row.thumbnail || undefined,
                playedAt: new Date(row.played_at).getTime()
            }));

            // Cache full history for future reads
            await cacheService.set(this.CACHE_NS, cacheKey, tracks, this.HISTORY_TTL);
            return tracks.slice(0, limit);
        } catch (error) {
            logger.error('UserMusicCache', `Failed to load history from DB: ${(error as Error).message}`);
            return [];
        }
    }

    /**
     * Clear listening history
     */
    async clearHistory(userId: string): Promise<void> {
        try {
            await postgres.query('DELETE FROM user_music_history WHERE user_id = $1', [userId]);
        } catch (error) {
            logger.error('UserMusicCache', `Failed to clear history: ${(error as Error).message}`);
        }
        await cacheService.delete(this.CACHE_NS, `user_history:${userId}`);
    }

    /**
     * Cleanup — no-op, PostgreSQL manages data lifecycle
     */
    cleanup(): void {
        // No local state to clean — PostgreSQL + CacheService handle everything
    }

    /**
     * Get statistics
     */
    async getStats(): Promise<UserMusicStats> {
        try {
            const [prefsResult, favsResult, histResult] = await Promise.all([
                postgres.query('SELECT COUNT(*) as cnt FROM user_music_preferences'),
                postgres.query('SELECT COUNT(DISTINCT user_id) as cnt FROM user_music_favorites'),
                postgres.query('SELECT COUNT(DISTINCT user_id) as cnt FROM user_music_history')
            ]);
            return {
                preferences: parseInt((prefsResult.rows[0] as any).cnt, 10),
                favorites: parseInt((favsResult.rows[0] as any).cnt, 10),
                history: parseInt((histResult.rows[0] as any).cnt, 10),
                maxUsers: 0 // No longer limited by memory
            };
        } catch {
            return { preferences: 0, favorites: 0, history: 0, maxUsers: 0 };
        }
    }

    /**
     * Shutdown — no local state to clear
     */
    shutdown(): void {
        // No intervals or local state to clean up
    }

    /**
     * Fetch favorites directly from DB and cache the result.
     * Used internally to avoid the get() miss in getFavorites() when called as a fallback.
     */
    private async _fetchFavoritesFromDB(userId: string): Promise<FavoriteTrack[]> {
        try {
            const result = await postgres.query(
                'SELECT url, title, author, duration, thumbnail, added_at FROM user_music_favorites WHERE user_id = $1 ORDER BY added_at DESC LIMIT $2',
                [userId, this.FAVORITES_MAX_SIZE]
            );

            const tracks: FavoriteTrack[] = (result.rows as any[]).map((row) => ({
                url: row.url,
                title: row.title,
                author: row.author || undefined,
                duration: row.duration || undefined,
                thumbnail: row.thumbnail || undefined,
                addedAt: new Date(row.added_at).getTime()
            }));

            await cacheService.set(this.CACHE_NS, `user_favs:${userId}`, tracks, this.FAVS_TTL);
            return tracks;
        } catch (error) {
            logger.error('UserMusicCache', `Failed to load favorites from DB: ${(error as Error).message}`);
            return [];
        }
    }

    /**
     * Fetch history directly from DB and cache the result.
     * Used internally to avoid the get() miss in getHistory() when called as a fallback.
     */
    private async _fetchHistoryFromDB(userId: string): Promise<HistoryTrack[]> {
        try {
            const result = await postgres.query(
                'SELECT url, title, author, duration, thumbnail, played_at FROM user_music_history WHERE user_id = $1 ORDER BY played_at DESC LIMIT $2',
                [userId, this.HISTORY_MAX_SIZE]
            );

            const tracks: HistoryTrack[] = (result.rows as any[]).map((row) => ({
                url: row.url,
                title: row.title,
                author: row.author || undefined,
                duration: row.duration || undefined,
                thumbnail: row.thumbnail || undefined,
                playedAt: new Date(row.played_at).getTime()
            }));

            await cacheService.set(this.CACHE_NS, `user_history:${userId}`, tracks, this.HISTORY_TTL);
            return tracks;
        } catch (error) {
            logger.error('UserMusicCache', `Failed to load history from DB: ${(error as Error).message}`);
            return [];
        }
    }
}

export const userMusicCache = new UserMusicCache();
export default userMusicCache;
