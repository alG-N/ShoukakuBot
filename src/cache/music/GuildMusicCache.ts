/**
 * Guild Music Settings Cache
 * Manages per-guild music settings
 * @module modules/music/repository/GuildMusicCache
 */

import { CACHE_LIMITS } from '../../constants.js';
import { MusicTrack } from './QueueCache.js';
import logger from '../../core/Logger.js';
// Types
export interface GuildMusicSettings {
    defaultVolume: number;
    autoPlay: boolean;
    announceNowPlaying: boolean;
    twentyFourSeven: boolean;
    djRole: string | null;
    textChannelLock: string | null;
    maxQueueSize: number;
    voteSkipEnabled: boolean;
    voteSkipThreshold: number;
    updatedAt: number;
    _lastAccessed?: number;
}

export interface RecentlyPlayedTrack {
    url: string;
    title: string;
    author?: string | null;
    thumbnail?: string | null;
    requestedBy: string;
    playedAt: number;
}

export interface RecentlyPlayedEntry {
    tracks: RecentlyPlayedTrack[];
    _lastAccessed: number;
}

export interface DJLockState {
    enabled: boolean;
    djUserId: string | null;
    lockedAt?: number;
}

export interface CachedPlaylist {
    cachedAt: number;
    [key: string]: any;
}

export interface GuildMusicCacheStats {
    guildSettings: number;
    recentlyPlayed: number;
    djLocks: number;
    playlistCache: number;
    maxGuilds: number;
}
// GuildMusicCache Class
class GuildMusicCache {
    // Guild settings
    private guildSettings: Map<string, GuildMusicSettings>;
    // Recently played per guild
    private recentlyPlayed: Map<string, RecentlyPlayedEntry>;
    // DJ lock state
    private djLockState: Map<string, DJLockState>;
    // Playlist cache
    private playlistCache: Map<string, CachedPlaylist>;
    
    // Limits
    private readonly MAX_GUILDS: number;
    private readonly RECENTLY_PLAYED_MAX: number;
    private readonly PLAYLIST_CACHE_TTL: number;
    
    // Cleanup
    private _cleanupInterval: NodeJS.Timeout;

    constructor() {
        this.guildSettings = new Map();
        this.recentlyPlayed = new Map();
        this.djLockState = new Map();
        this.playlistCache = new Map();
        
        this.MAX_GUILDS = CACHE_LIMITS.MAX_GUILDS;
        this.RECENTLY_PLAYED_MAX = CACHE_LIMITS.MAX_RECENTLY_PLAYED;
        this.PLAYLIST_CACHE_TTL = CACHE_LIMITS.PLAYLIST_CACHE_TTL;
        
        this._cleanupInterval = setInterval(() => this.cleanup(), 30 * 60 * 1000);
    }
    /**
     * Get default guild settings
     */
    getDefaultSettings(): GuildMusicSettings {
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
    getSettings(guildId: string): GuildMusicSettings {
        const settings = this.guildSettings.get(guildId);
        if (settings) {
            settings._lastAccessed = Date.now();
        }
        return { ...this.getDefaultSettings(), ...settings };
    }

    /**
     * Set guild settings
     */
    setSettings(guildId: string, settings: Partial<GuildMusicSettings>): GuildMusicSettings {
        if (!this.guildSettings.has(guildId) && this.guildSettings.size >= this.MAX_GUILDS) {
            this._evictOldest(this.guildSettings);
        }
        
        const current = this.getSettings(guildId);
        const updated: GuildMusicSettings = { 
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
    resetSettings(guildId: string): GuildMusicSettings {
        this.guildSettings.delete(guildId);
        return this.getDefaultSettings();
    }
    /**
     * Add to recently played
     */
    addToRecentlyPlayed(guildId: string, track: MusicTrack): RecentlyPlayedTrack[] {
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
            url: track.url || '',
            title: track.title || track.info?.title || 'Unknown',
            author: track.author || track.info?.author,
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
    getRecentlyPlayed(guildId: string, limit: number = 10): RecentlyPlayedTrack[] {
        const recent = this.recentlyPlayed.get(guildId);
        if (recent) {
            recent._lastAccessed = Date.now();
            return recent.tracks.slice(0, limit);
        }
        return [];
    }
    /**
     * Set DJ lock
     */
    setDJLock(guildId: string, enabled: boolean, djUserId: string | null = null): void {
        this.djLockState.set(guildId, {
            enabled,
            djUserId,
            lockedAt: Date.now()
        });
    }

    /**
     * Get DJ lock state
     */
    getDJLock(guildId: string): DJLockState {
        return this.djLockState.get(guildId) || { enabled: false, djUserId: null };
    }

    /**
     * Check if user is DJ or lock disabled
     */
    isDJ(guildId: string, userId: string): boolean {
        const lock = this.getDJLock(guildId);
        if (!lock.enabled) return true;
        return lock.djUserId === userId;
    }

    /**
     * Clear DJ lock
     */
    clearDJLock(guildId: string): void {
        this.djLockState.delete(guildId);
    }
    /**
     * Cache playlist
     */
    cachePlaylist(playlistUrl: string, playlistData: any): void {
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
    getCachedPlaylist(playlistUrl: string): CachedPlaylist | null {
        const cached = this.playlistCache.get(playlistUrl);
        if (!cached) return null;
        
        if (Date.now() - cached.cachedAt > this.PLAYLIST_CACHE_TTL) {
            this.playlistCache.delete(playlistUrl);
            return null;
        }
        
        return cached;
    }

    private _evictOldestPlaylist(): void {
        let oldestKey: string | null = null;
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
    private _evictOldest(map: Map<string, any>): void {
        let oldestKey: string | null = null;
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
    cleanup(): void {
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
            logger.info('GuildMusicCache', `Cleaned ${cleaned} stale entries`);
        }
    }

    /**
     * Cleanup for specific guild
     */
    cleanupGuild(guildId: string): void {
        this.guildSettings.delete(guildId);
        this.recentlyPlayed.delete(guildId);
        this.djLockState.delete(guildId);
    }

    /**
     * Get statistics
     */
    getStats(): GuildMusicCacheStats {
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
    shutdown(): void {
        if (this._cleanupInterval) {
            clearInterval(this._cleanupInterval);
        }
        this.guildSettings.clear();
        this.recentlyPlayed.clear();
        this.djLockState.clear();
        this.playlistCache.clear();
    }
}

export const guildMusicCache = new GuildMusicCache();
export default guildMusicCache;
