/**
 * User Music Cache
 * Manages user preferences, favorites, and listening history
 * @module modules/music/repository/UserMusicCache
 */

import { CACHE_LIMITS } from '../../constants';
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
// UserMusicCache Class
class UserMusicCache {
    // User preferences
    private userPreferences: Map<string, UserPreferences>;
    // Listening history
    private listeningHistory: Map<string, HistoryEntry>;
    // Favorite tracks
    private userFavorites: Map<string, FavoritesEntry>;
    
    // Limits
    private readonly MAX_USERS: number;
    private readonly HISTORY_MAX_SIZE: number;
    private readonly FAVORITES_MAX_SIZE: number;
    
    // Cleanup interval
    private _cleanupInterval: NodeJS.Timeout;

    constructor() {
        this.userPreferences = new Map();
        this.listeningHistory = new Map();
        this.userFavorites = new Map();
        
        this.MAX_USERS = CACHE_LIMITS.MAX_USER_SESSIONS;
        this.HISTORY_MAX_SIZE = CACHE_LIMITS.MAX_USER_HISTORY;
        this.FAVORITES_MAX_SIZE = CACHE_LIMITS.MAX_USER_FAVORITES;
        
        this._cleanupInterval = setInterval(() => this.cleanup(), 30 * 60 * 1000);
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
     * Get user preferences
     */
    getPreferences(userId: string): UserPreferences {
        const prefs = this.userPreferences.get(userId);
        if (prefs) {
            prefs.lastAccessed = Date.now();
        }
        return { ...this.getDefaultPreferences(), ...prefs };
    }

    /**
     * Set user preferences
     */
    setPreferences(userId: string, preferences: Partial<UserPreferences>): UserPreferences {
        // Check limit
        if (!this.userPreferences.has(userId) && this.userPreferences.size >= this.MAX_USERS) {
            this._evictOldestPreferences();
        }
        
        const current = this.getPreferences(userId);
        const updated: UserPreferences = { 
            ...current, 
            ...preferences, 
            updatedAt: Date.now(),
            lastAccessed: Date.now()
        };
        this.userPreferences.set(userId, updated);
        return updated;
    }

    /**
     * Reset user preferences
     */
    resetPreferences(userId: string): UserPreferences {
        this.userPreferences.delete(userId);
        return this.getDefaultPreferences();
    }
    /**
     * Get user favorites
     */
    getFavorites(userId: string): FavoriteTrack[] {
        const favorites = this.userFavorites.get(userId);
        if (favorites) {
            favorites._lastAccessed = Date.now();
        }
        return favorites?.tracks || [];
    }

    /**
     * Add to favorites
     */
    addFavorite(userId: string, track: any): AddFavoriteResult {
        let entry = this.userFavorites.get(userId);
        
        if (!entry) {
            // Check limit
            if (this.userFavorites.size >= this.MAX_USERS) {
                this._evictOldestFavorites();
            }
            entry = { tracks: [], _lastAccessed: Date.now() };
            this.userFavorites.set(userId, entry);
        }
        
        // Check if already exists
        if (entry.tracks.some(f => f.url === track.url)) {
            return { success: false, message: 'Already in favorites' };
        }
        
        entry.tracks.unshift({
            url: track.url,
            title: track.title,
            author: track.author,
            duration: track.lengthSeconds,
            thumbnail: track.thumbnail,
            addedAt: Date.now()
        });
        
        // Limit size
        if (entry.tracks.length > this.FAVORITES_MAX_SIZE) {
            entry.tracks.pop();
        }
        
        entry._lastAccessed = Date.now();
        return { success: true, count: entry.tracks.length };
    }

    /**
     * Remove from favorites
     */
    removeFavorite(userId: string, trackUrl: string): FavoriteTrack[] {
        const entry = this.userFavorites.get(userId);
        if (!entry) return [];
        
        entry.tracks = entry.tracks.filter(f => f.url !== trackUrl);
        entry._lastAccessed = Date.now();
        return entry.tracks;
    }

    /**
     * Check if favorited
     */
    isFavorited(userId: string, trackUrl: string): boolean {
        return this.getFavorites(userId).some(f => f.url === trackUrl);
    }
    /**
     * Add to listening history
     */
    addToHistory(userId: string, track: any): HistoryTrack[] {
        let entry = this.listeningHistory.get(userId);
        
        if (!entry) {
            // Check limit
            if (this.listeningHistory.size >= this.MAX_USERS) {
                this._evictOldestHistory();
            }
            entry = { tracks: [], _lastAccessed: Date.now() };
            this.listeningHistory.set(userId, entry);
        }
        
        // Remove if exists (to move to front)
        entry.tracks = entry.tracks.filter(h => h.url !== track.url);
        
        entry.tracks.unshift({
            url: track.url,
            title: track.title,
            author: track.author,
            duration: track.lengthSeconds,
            thumbnail: track.thumbnail,
            playedAt: Date.now()
        });
        
        // Limit size
        if (entry.tracks.length > this.HISTORY_MAX_SIZE) {
            entry.tracks = entry.tracks.slice(0, this.HISTORY_MAX_SIZE);
        }
        
        entry._lastAccessed = Date.now();
        return entry.tracks;
    }

    /**
     * Get listening history
     */
    getHistory(userId: string, limit: number = 20): HistoryTrack[] {
        const entry = this.listeningHistory.get(userId);
        if (entry) {
            entry._lastAccessed = Date.now();
            return entry.tracks.slice(0, limit);
        }
        return [];
    }

    /**
     * Clear listening history
     */
    clearHistory(userId: string): void {
        this.listeningHistory.delete(userId);
    }
    private _evictOldestPreferences(): void {
        this._evictOldest(this.userPreferences, 'lastAccessed');
    }

    private _evictOldestFavorites(): void {
        this._evictOldest(this.userFavorites, '_lastAccessed');
    }

    private _evictOldestHistory(): void {
        this._evictOldest(this.listeningHistory, '_lastAccessed');
    }

    private _evictOldest(map: Map<string, any>, timeField: string): void {
        let oldestKey: string | null = null;
        let oldestTime = Infinity;
        
        for (const [key, value] of map) {
            const time = value[timeField] || 0;
            if (time < oldestTime) {
                oldestTime = time;
                oldestKey = key;
            }
        }
        
        if (oldestKey) {
            map.delete(oldestKey);
        }
    }

    /**
     * Cleanup stale entries
     */
    cleanup(): void {
        const now = Date.now();
        const staleThreshold = 7 * 24 * 60 * 60 * 1000; // 7 days
        let cleaned = 0;
        
        // Clean preferences
        for (const [userId, prefs] of this.userPreferences) {
            if (now - (prefs.lastAccessed || 0) > staleThreshold) {
                this.userPreferences.delete(userId);
                cleaned++;
            }
        }
        
        // Clean favorites
        for (const [userId, entry] of this.userFavorites) {
            if (now - (entry._lastAccessed || 0) > staleThreshold) {
                this.userFavorites.delete(userId);
                cleaned++;
            }
        }
        
        // Clean history
        for (const [userId, entry] of this.listeningHistory) {
            if (now - (entry._lastAccessed || 0) > staleThreshold) {
                this.listeningHistory.delete(userId);
                cleaned++;
            }
        }
        
        if (cleaned > 0) {
            console.log(`[UserMusicCache] Cleaned ${cleaned} stale entries`);
        }
    }

    /**
     * Get statistics
     */
    getStats(): UserMusicStats {
        return {
            preferences: this.userPreferences.size,
            favorites: this.userFavorites.size,
            history: this.listeningHistory.size,
            maxUsers: this.MAX_USERS,
        };
    }

    /**
     * Shutdown
     */
    shutdown(): void {
        if (this._cleanupInterval) {
            clearInterval(this._cleanupInterval);
        }
        this.userPreferences.clear();
        this.userFavorites.clear();
        this.listeningHistory.clear();
    }
}

export const userMusicCache = new UserMusicCache();
export default userMusicCache;
