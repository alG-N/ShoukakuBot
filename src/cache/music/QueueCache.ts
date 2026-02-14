/**
 * Queue Cache
 * Manages music queue state per guild
 * @module modules/music/repository/QueueCache
 */

import { CACHE_LIMITS } from '../../constants.js';
import logger from '../../core/Logger.js';

/**
 * Lightweight reference to a Discord message.
 * Avoids holding full Message objects (which retain Client → Guild → Channel chains).
 * Resolve to a real Message via channel.messages.fetch(messageId) when needed.
 */
export interface MessageRef {
    messageId: string;
    channelId: string;
}
// Types
export interface MusicTrack {
    url?: string;
    title?: string;
    author?: string;
    thumbnail?: string | null;
    lengthSeconds?: number;
    track?: {
        encoded?: string;
        info?: any;
    };
    info?: {
        title?: string;
        author?: string;
        uri?: string;
    };
    requestedBy?: any;
}

export interface MusicQueue {
    guildId: string;
    tracks: MusicTrack[];
    originalTracks: MusicTrack[];
    currentTrack: MusicTrack | null;
    position: number;
    
    // Playback state
    isPaused: boolean;
    loopMode: 'off' | 'track' | 'queue';
    loopCount: number;
    isShuffled: boolean;
    volume: number;
    
    // Messages (lightweight refs — resolve via channel.messages.fetch() when needed)
    nowPlayingMessage: MessageRef | null;
    controlsMessage: MessageRef | null;
    
    // Priority queue
    priorityQueue: MusicTrack[];
    
    // Timers
    inactivityTimer: NodeJS.Timeout | null;
    vcMonitorInterval: NodeJS.Timeout | null;
    
    // State flags
    eventsBound: boolean;
    isTransitioning: boolean;
    isReplacing: boolean; // Flag to indicate a track is being replaced (prevents error handling)
    
    // Auto-play feature
    autoPlay: boolean;
    lastPlayedTracks: string[];
    
    // Metadata
    createdAt: number;
    updatedAt: number;
    lastAccessed: number;
    textChannelId: string | null;
    textChannel: any; // TextBasedChannel reference for runtime
    voiceChannelId: string | null;
    requesterId: string | null;
}

export interface AddTrackResult {
    success: boolean;
    position: number;
    reason?: string;
    maxSize?: number;
}

export interface AddTracksResult {
    success: boolean;
    added: number;
    skipped: number;
    totalLength: number;
}

export interface QueueStats {
    totalQueues: number;
    activeQueues: number;
    totalTracks: number;
    maxGuilds: number;
    maxQueueSize: number;
}
// QueueCache Class
class QueueCache {
    private guildQueues: Map<string, MusicQueue>;
    private readonly MAX_GUILDS: number;
    private readonly MAX_QUEUE_SIZE: number;

    constructor() {
        this.guildQueues = new Map();
        this.MAX_GUILDS = CACHE_LIMITS.MAX_GUILDS;
        this.MAX_QUEUE_SIZE = CACHE_LIMITS.MAX_QUEUE_SIZE;
    }

    /**
     * Get or create guild queue
     */
    getOrCreate(guildId: string): MusicQueue {
        if (!this.guildQueues.has(guildId)) {
            // Check guild limit
            if (this.guildQueues.size >= this.MAX_GUILDS) {
                this._evictOldestInactive();
            }
            this.guildQueues.set(guildId, this._createDefault(guildId));
        }
        const queue = this.guildQueues.get(guildId)!;
        queue.lastAccessed = Date.now();
        return queue;
    }

    /**
     * Create default queue structure
     */
    private _createDefault(guildId: string): MusicQueue {
        return {
            guildId,
            tracks: [],
            originalTracks: [],
            currentTrack: null,
            position: 0,
            
            // Playback state
            isPaused: false,
            loopMode: 'off',
            loopCount: 0,
            isShuffled: false,
            volume: 100,
            
            // Messages
            nowPlayingMessage: null,
            controlsMessage: null,
            
            // Priority queue
            priorityQueue: [],
            
            // Timers
            inactivityTimer: null,
            vcMonitorInterval: null,
            
            // State flags
            eventsBound: false,
            isTransitioning: false,
            isReplacing: false,
            
            // Auto-play feature
            autoPlay: false,
            lastPlayedTracks: [],
            
            // Metadata
            createdAt: Date.now(),
            updatedAt: Date.now(),
            lastAccessed: Date.now(),
            textChannelId: null,
            textChannel: null,
            voiceChannelId: null,
            requesterId: null
        };
    }

    /**
     * Get queue
     */
    get(guildId: string): MusicQueue | null {
        const queue = this.guildQueues.get(guildId);
        if (queue) {
            queue.lastAccessed = Date.now();
        }
        return queue || null;
    }

    /**
     * Update queue property
     */
    update(guildId: string, updates: Partial<MusicQueue>): MusicQueue | null {
        const queue = this.get(guildId);
        if (!queue) return null;
        
        Object.assign(queue, updates, { updatedAt: Date.now() });
        return queue;
    }

    /**
     * Delete queue with cleanup
     */
    delete(guildId: string): boolean {
        const queue = this.guildQueues.get(guildId);
        if (queue) {
            // Clear all timers
            if (queue.inactivityTimer) clearTimeout(queue.inactivityTimer);
            if (queue.vcMonitorInterval) clearInterval(queue.vcMonitorInterval);
            
            // Clear message references to avoid memory leaks
            queue.nowPlayingMessage = null;
            queue.controlsMessage = null;
        }
        return this.guildQueues.delete(guildId);
    }

    /**
     * Check if queue exists
     */
    has(guildId: string): boolean {
        return this.guildQueues.has(guildId);
    }

    /**
     * Get all active queue guild IDs
     */
    getActiveGuildIds(): string[] {
        return Array.from(this.guildQueues.keys());
    }
    /**
     * Add track to queue
     */
    addTrack(guildId: string, track: MusicTrack): AddTrackResult {
        const queue = this.getOrCreate(guildId);
        
        // Check queue size limit
        if (queue.tracks.length >= this.MAX_QUEUE_SIZE) {
            return { success: false, position: 0, reason: 'QUEUE_FULL', maxSize: this.MAX_QUEUE_SIZE };
        }
        
        queue.tracks.push(track);
        queue.originalTracks.push(track);
        queue.updatedAt = Date.now();
        
        return { success: true, position: queue.tracks.length };
    }

    /**
     * Add track to front of queue
     */
    addTrackToFront(guildId: string, track: MusicTrack): AddTrackResult {
        const queue = this.getOrCreate(guildId);
        
        if (queue.tracks.length >= this.MAX_QUEUE_SIZE) {
            return { success: false, position: 0, reason: 'QUEUE_FULL' };
        }
        
        queue.tracks.unshift(track);
        queue.originalTracks.unshift(track);
        queue.updatedAt = Date.now();
        
        return { success: true, position: 1 };
    }

    /**
     * Add multiple tracks
     */
    addTracks(guildId: string, tracks: MusicTrack[]): AddTracksResult {
        const queue = this.getOrCreate(guildId);
        const available = this.MAX_QUEUE_SIZE - queue.tracks.length;
        const toAdd = tracks.slice(0, available);
        
        queue.tracks.push(...toAdd);
        queue.originalTracks.push(...toAdd);
        queue.updatedAt = Date.now();
        
        return {
            success: true,
            added: toAdd.length,
            skipped: tracks.length - toAdd.length,
            totalLength: queue.tracks.length
        };
    }

    /**
     * Remove track at index
     */
    removeTrack(guildId: string, index: number): MusicTrack | null {
        const queue = this.get(guildId);
        if (!queue || index < 0 || index >= queue.tracks.length) return null;
        
        const removed = queue.tracks.splice(index, 1)[0];
        queue.updatedAt = Date.now();
        return removed;
    }

    /**
     * Clear all tracks
     */
    clearTracks(guildId: string): void {
        const queue = this.get(guildId);
        if (!queue) return;
        
        queue.tracks = [];
        queue.originalTracks = [];
        queue.currentTrack = null;
        queue.position = 0;
        queue.updatedAt = Date.now();
    }

    /**
     * Get next track from queue
     */
    getNextTrack(guildId: string): MusicTrack | null {
        const queue = this.get(guildId);
        if (!queue || queue.tracks.length === 0) return null;
        
        return queue.tracks.shift() || null;
    }

    /**
     * Shuffle queue
     */
    shuffle(guildId: string): void {
        const queue = this.get(guildId);
        if (!queue) return;
        
        // Fisher-Yates shuffle
        for (let i = queue.tracks.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [queue.tracks[i], queue.tracks[j]] = [queue.tracks[j], queue.tracks[i]];
        }
        queue.isShuffled = true;
        queue.updatedAt = Date.now();
    }

    /**
     * Unshuffle queue (restore original order)
     */
    unshuffle(guildId: string): void {
        const queue = this.get(guildId);
        if (!queue) return;
        
        const currentIds = new Set(queue.tracks.map(t => t.url || t.track?.encoded).filter(Boolean));
        queue.tracks = queue.originalTracks.filter(t => {
            const id = t.url || t.track?.encoded;
            return id && currentIds.has(id);
        });
        queue.isShuffled = false;
        queue.updatedAt = Date.now();
    }
    setCurrentTrack(guildId: string, track: MusicTrack | null): void {
        const queue = this.get(guildId);
        if (!queue) return;
        queue.currentTrack = track;
        queue.updatedAt = Date.now();
    }

    getCurrentTrack(guildId: string): MusicTrack | null {
        return this.get(guildId)?.currentTrack || null;
    }

    togglePause(guildId: string): boolean {
        const queue = this.get(guildId);
        if (!queue) return false;
        queue.isPaused = !queue.isPaused;
        queue.updatedAt = Date.now();
        return queue.isPaused;
    }

    setLoopMode(guildId: string, mode: 'off' | 'track' | 'queue'): void {
        const queue = this.get(guildId);
        if (!queue) return;
        queue.loopMode = mode;
        queue.loopCount = 0;
        queue.updatedAt = Date.now();
    }

    cycleLoopMode(guildId: string): 'off' | 'track' | 'queue' {
        const queue = this.get(guildId);
        if (!queue) return 'off';
        
        const modes: Array<'off' | 'track' | 'queue'> = ['off', 'track', 'queue'];
        const currentIndex = modes.indexOf(queue.loopMode);
        queue.loopMode = modes[(currentIndex + 1) % modes.length];
        queue.loopCount = 0;
        queue.updatedAt = Date.now();
        
        return queue.loopMode;
    }

    setVolume(guildId: string, volume: number): number {
        const queue = this.get(guildId);
        if (!queue) return 100;
        queue.volume = Math.max(0, Math.min(200, volume));
        queue.updatedAt = Date.now();
        return queue.volume;
    }
    /**
     * Store a now-playing message reference.
     * Accepts a full Discord Message (extracts id+channelId) or a MessageRef or null.
     */
    setNowPlayingMessage(guildId: string, message: { id: string; channelId: string } | MessageRef | null): void {
        const queue = this.get(guildId);
        if (!queue) return;
        if (!message) {
            queue.nowPlayingMessage = null;
            return;
        }
        // Accept both Message (has .id) and MessageRef (has .messageId)
        queue.nowPlayingMessage = {
            messageId: 'messageId' in message ? message.messageId : message.id,
            channelId: message.channelId
        };
    }

    getNowPlayingMessage(guildId: string): MessageRef | null {
        return this.get(guildId)?.nowPlayingMessage || null;
    }

    /**
     * Clear the now-playing message reference.
     * Caller is responsible for deleting the Discord message if needed.
     */
    clearNowPlayingMessage(guildId: string): void {
        const queue = this.get(guildId);
        if (!queue) return;
        queue.nowPlayingMessage = null;
    }
    /**
     * Evict oldest inactive queue
     */
    private _evictOldestInactive(): void {
        let oldestKey: string | null = null;
        let oldestTime = Infinity;
        
        for (const [guildId, queue] of this.guildQueues) {
            // Don't evict active queues (with current track)
            if (queue.currentTrack) continue;
            
            if (queue.lastAccessed < oldestTime) {
                oldestTime = queue.lastAccessed;
                oldestKey = guildId;
            }
        }
        
        if (oldestKey) {
            logger.info('QueueCache', `Evicting inactive guild: ${oldestKey}`);
            this.delete(oldestKey);
        }
    }

    /**
     * Cleanup stale queues (no activity for 1 hour)
     */
    cleanup(): void {
        const now = Date.now();
        const staleThreshold = 60 * 60 * 1000; // 1 hour
        let cleaned = 0;
        
        for (const [guildId, queue] of this.guildQueues) {
            // Don't clean active queues
            if (queue.currentTrack) continue;
            
            if (now - queue.lastAccessed > staleThreshold) {
                this.delete(guildId);
                cleaned++;
            }
        }
        
        if (cleaned > 0) {
            logger.info('QueueCache', `Cleaned ${cleaned} stale queues`);
        }
    }

    /**
     * Get statistics
     */
    getStats(): QueueStats {
        let activeQueues = 0;
        let totalTracks = 0;
        
        for (const queue of this.guildQueues.values()) {
            if (queue.currentTrack) activeQueues++;
            totalTracks += queue.tracks.length;
        }
        
        return {
            totalQueues: this.guildQueues.size,
            activeQueues,
            totalTracks,
            maxGuilds: this.MAX_GUILDS,
            maxQueueSize: this.MAX_QUEUE_SIZE,
        };
    }

    /**
     * Shutdown - cleanup all
     */
    shutdown(): void {
        for (const guildId of this.guildQueues.keys()) {
            this.delete(guildId);
        }
        logger.info('QueueCache', 'Shutdown complete');
    }
}

export const queueCache = new QueueCache();
export default queueCache;
