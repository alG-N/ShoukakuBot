/**
 * User Music Cache
 * Manages user preferences, favorites, and listening history
 * @module modules/music/repository/UserMusicCache
 */

const { CACHE_LIMITS } = require('../../constants');

class UserMusicCache {
    constructor() {
        // User preferences
        this.userPreferences = new Map();
        // Listening history
        this.listeningHistory = new Map();
        // Favorite tracks
        this.userFavorites = new Map();
        
        // Limits
        this.MAX_USERS = CACHE_LIMITS.MAX_USER_SESSIONS;
        this.HISTORY_MAX_SIZE = CACHE_LIMITS.MAX_USER_HISTORY;
        this.FAVORITES_MAX_SIZE = CACHE_LIMITS.MAX_USER_FAVORITES;
        
        // Cleanup interval
        this._cleanupInterval = setInterval(() => this.cleanup(), 30 * 60 * 1000);
    }

    // ========== PREFERENCES ==========

    /**
     * Default preferences
     */
    getDefaultPreferences() {
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
    getPreferences(userId) {
        const prefs = this.userPreferences.get(userId);
        if (prefs) {
            prefs.lastAccessed = Date.now();
        }
        return { ...this.getDefaultPreferences(), ...prefs };
    }

    /**
     * Set user preferences
     */
    setPreferences(userId, preferences) {
        // Check limit
        if (!this.userPreferences.has(userId) && this.userPreferences.size >= this.MAX_USERS) {
            this._evictOldestPreferences();
        }
        
        const current = this.getPreferences(userId);
        const updated = { 
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
    resetPreferences(userId) {
        this.userPreferences.delete(userId);
        return this.getDefaultPreferences();
    }

    // ========== FAVORITES ==========

    /**
     * Get user favorites
     */
    getFavorites(userId) {
        const favorites = this.userFavorites.get(userId);
        if (favorites) {
            favorites._lastAccessed = Date.now();
        }
        return favorites?.tracks || [];
    }

    /**
     * Add to favorites
     */
    addFavorite(userId, track) {
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
    removeFavorite(userId, trackUrl) {
        const entry = this.userFavorites.get(userId);
        if (!entry) return [];
        
        entry.tracks = entry.tracks.filter(f => f.url !== trackUrl);
        entry._lastAccessed = Date.now();
        return entry.tracks;
    }

    /**
     * Check if favorited
     */
    isFavorited(userId, trackUrl) {
        return this.getFavorites(userId).some(f => f.url === trackUrl);
    }

    // ========== LISTENING HISTORY ==========

    /**
     * Add to listening history
     */
    addToHistory(userId, track) {
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
    getHistory(userId, limit = 20) {
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
    clearHistory(userId) {
        this.listeningHistory.delete(userId);
    }

    // ========== CLEANUP ==========

    _evictOldestPreferences() {
        this._evictOldest(this.userPreferences, 'lastAccessed');
    }

    _evictOldestFavorites() {
        this._evictOldest(this.userFavorites, '_lastAccessed');
    }

    _evictOldestHistory() {
        this._evictOldest(this.listeningHistory, '_lastAccessed');
    }

    _evictOldest(map, timeField) {
        let oldestKey = null;
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
    cleanup() {
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
    getStats() {
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
    shutdown() {
        if (this._cleanupInterval) {
            clearInterval(this._cleanupInterval);
        }
        this.userPreferences.clear();
        this.userFavorites.clear();
        this.listeningHistory.clear();
    }
}

module.exports = new UserMusicCache();
