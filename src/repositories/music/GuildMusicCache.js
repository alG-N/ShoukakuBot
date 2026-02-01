/**
 * Guild Music Settings Cache
 * Manages per-guild music settings
 * @module modules/music/repository/GuildMusicCache
 */

const { CACHE_LIMITS } = require('../../constants');

class GuildMusicCache {
    constructor() {
        // Guild settings
        this.guildSettings = new Map();
        // Recently played per guild
        this.recentlyPlayed = new Map();
        // DJ lock state
        this.djLockState = new Map();
        // Playlist cache
        this.playlistCache = new Map();
        
        // Limits
        this.MAX_GUILDS = CACHE_LIMITS.MAX_GUILDS;
        this.RECENTLY_PLAYED_MAX = CACHE_LIMITS.MAX_RECENTLY_PLAYED;
        this.PLAYLIST_CACHE_TTL = CACHE_LIMITS.PLAYLIST_CACHE_TTL;
        
        // Cleanup
        this._cleanupInterval = setInterval(() => this.cleanup(), 30 * 60 * 1000);
    }

    // ========== GUILD SETTINGS ==========

    /**
     * Get default guild settings
     */
    getDefaultSettings() {
        return {
            defaultVolume: 100,
            autoPlay: false,
            announceNowPlaying: true,
            twentyFourSeven: false,
            djRole: null,
            textChannelLock: null,
            maxQueueSize: 500,
            voteSkipEnabled: true,
            voteSkipThreshold: 0.6,
            updatedAt: Date.now()
        };
    }

    /**
     * Get guild settings
     */
    getSettings(guildId) {
        const settings = this.guildSettings.get(guildId);
        if (settings) {
            settings._lastAccessed = Date.now();
        }
        return { ...this.getDefaultSettings(), ...settings };
    }

    /**
     * Set guild settings
     */
    setSettings(guildId, settings) {
        if (!this.guildSettings.has(guildId) && this.guildSettings.size >= this.MAX_GUILDS) {
            this._evictOldest(this.guildSettings);
        }
        
        const current = this.getSettings(guildId);
        const updated = { 
            ...current, 
            ...settings, 
            updatedAt: Date.now(),
            _lastAccessed: Date.now()
        };
        this.guildSettings.set(guildId, updated);
        return updated;
    }

    /**
     * Reset guild settings
     */
    resetSettings(guildId) {
        this.guildSettings.delete(guildId);
        return this.getDefaultSettings();
    }

    // ========== RECENTLY PLAYED ==========

    /**
     * Add to recently played
     */
    addToRecentlyPlayed(guildId, track) {
        let recent = this.recentlyPlayed.get(guildId);
        
        if (!recent) {
            if (this.recentlyPlayed.size >= this.MAX_GUILDS) {
                this._evictOldest(this.recentlyPlayed);
            }
            recent = { tracks: [], _lastAccessed: Date.now() };
            this.recentlyPlayed.set(guildId, recent);
        }
        
        // Remove duplicate
        recent.tracks = recent.tracks.filter(r => r.url !== track.url);
        
        recent.tracks.unshift({
            url: track.url,
            title: track.title,
            author: track.author,
            thumbnail: track.thumbnail,
            requestedBy: track.requestedBy?.id || 'Unknown',
            playedAt: Date.now()
        });
        
        if (recent.tracks.length > this.RECENTLY_PLAYED_MAX) {
            recent.tracks = recent.tracks.slice(0, this.RECENTLY_PLAYED_MAX);
        }
        
        recent._lastAccessed = Date.now();
        return recent.tracks;
    }

    /**
     * Get recently played
     */
    getRecentlyPlayed(guildId, limit = 10) {
        const recent = this.recentlyPlayed.get(guildId);
        if (recent) {
            recent._lastAccessed = Date.now();
            return recent.tracks.slice(0, limit);
        }
        return [];
    }

    // ========== DJ LOCK ==========

    /**
     * Set DJ lock
     */
    setDJLock(guildId, enabled, djUserId = null) {
        this.djLockState.set(guildId, {
            enabled,
            djUserId,
            lockedAt: Date.now()
        });
    }

    /**
     * Get DJ lock state
     */
    getDJLock(guildId) {
        return this.djLockState.get(guildId) || { enabled: false, djUserId: null };
    }

    /**
     * Check if user is DJ or lock disabled
     */
    isDJ(guildId, userId) {
        const lock = this.getDJLock(guildId);
        if (!lock.enabled) return true;
        return lock.djUserId === userId;
    }

    /**
     * Clear DJ lock
     */
    clearDJLock(guildId) {
        this.djLockState.delete(guildId);
    }

    // ========== PLAYLIST CACHE ==========

    /**
     * Cache playlist
     */
    cachePlaylist(playlistUrl, playlistData) {
        if (this.playlistCache.size >= CACHE_LIMITS.MAX_PLAYLIST_CACHE) {
            this._evictOldestPlaylist();
        }
        
        this.playlistCache.set(playlistUrl, {
            ...playlistData,
            cachedAt: Date.now()
        });
    }

    /**
     * Get cached playlist
     */
    getCachedPlaylist(playlistUrl) {
        const cached = this.playlistCache.get(playlistUrl);
        if (!cached) return null;
        
        if (Date.now() - cached.cachedAt > this.PLAYLIST_CACHE_TTL) {
            this.playlistCache.delete(playlistUrl);
            return null;
        }
        
        return cached;
    }

    _evictOldestPlaylist() {
        let oldestKey = null;
        let oldestTime = Infinity;
        
        for (const [key, value] of this.playlistCache) {
            if (value.cachedAt < oldestTime) {
                oldestTime = value.cachedAt;
                oldestKey = key;
            }
        }
        
        if (oldestKey) {
            this.playlistCache.delete(oldestKey);
        }
    }

    // ========== CLEANUP ==========

    _evictOldest(map) {
        let oldestKey = null;
        let oldestTime = Infinity;
        
        for (const [key, value] of map) {
            const time = value._lastAccessed || value.updatedAt || 0;
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
        const staleThreshold = 24 * 60 * 60 * 1000; // 24 hours
        let cleaned = 0;
        
        // Clean playlist cache
        for (const [url, cached] of this.playlistCache) {
            if (now - cached.cachedAt > this.PLAYLIST_CACHE_TTL) {
                this.playlistCache.delete(url);
                cleaned++;
            }
        }
        
        // Clean recently played (keep for longer)
        for (const [guildId, entry] of this.recentlyPlayed) {
            if (now - (entry._lastAccessed || 0) > staleThreshold * 7) { // 7 days
                this.recentlyPlayed.delete(guildId);
                cleaned++;
            }
        }
        
        if (cleaned > 0) {
            console.log(`[GuildMusicCache] Cleaned ${cleaned} stale entries`);
        }
    }

    /**
     * Cleanup for specific guild
     */
    cleanupGuild(guildId) {
        this.guildSettings.delete(guildId);
        this.recentlyPlayed.delete(guildId);
        this.djLockState.delete(guildId);
    }

    /**
     * Get statistics
     */
    getStats() {
        return {
            guildSettings: this.guildSettings.size,
            recentlyPlayed: this.recentlyPlayed.size,
            djLocks: this.djLockState.size,
            playlistCache: this.playlistCache.size,
            maxGuilds: this.MAX_GUILDS,
        };
    }

    /**
     * Shutdown
     */
    shutdown() {
        if (this._cleanupInterval) {
            clearInterval(this._cleanupInterval);
        }
        this.guildSettings.clear();
        this.recentlyPlayed.clear();
        this.djLockState.clear();
        this.playlistCache.clear();
    }
}

module.exports = new GuildMusicCache();
