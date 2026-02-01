/**
 * Queue Cache
 * Manages music queue state per guild
 * @module modules/music/repository/QueueCache
 */

const { CACHE_LIMITS } = require('../../constants');

class QueueCache {
    constructor() {
        this.guildQueues = new Map();
        this.MAX_GUILDS = CACHE_LIMITS.MAX_GUILDS;
        this.MAX_QUEUE_SIZE = CACHE_LIMITS.MAX_QUEUE_SIZE;
    }

    /**
     * Get or create guild queue
     */
    getOrCreate(guildId) {
        if (!this.guildQueues.has(guildId)) {
            // Check guild limit
            if (this.guildQueues.size >= this.MAX_GUILDS) {
                this._evictOldestInactive();
            }
            this.guildQueues.set(guildId, this._createDefault(guildId));
        }
        const queue = this.guildQueues.get(guildId);
        queue.lastAccessed = Date.now();
        return queue;
    }

    /**
     * Create default queue structure
     */
    _createDefault(guildId) {
        return {
            guildId,
            tracks: [],
            originalTracks: [],
            currentTrack: null,
            position: 0,
            
            // Playback state
            isPaused: false,
            isLooping: false,
            loopMode: 'off',
            loopCount: 0,
            isShuffled: false,
            volume: 100,
            
            // Messages
            nowPlayingMessage: null,
            controlsMessage: null,
            
            // Voting
            skipVotes: new Set(),
            skipVoteActive: false,
            skipVoteTimeout: null,
            skipVoteMessage: null,
            skipVoteListenerCount: null,
            
            // Priority queue
            priorityQueue: [],
            priorityVotes: new Set(),
            priorityVoteActive: false,
            
            // Timers
            inactivityTimer: null,
            vcMonitorInterval: null,
            
            // State flags
            eventsBound: false,
            isTransitioning: false,
            
            // Auto-play feature
            autoPlay: false,
            lastPlayedTracks: [],
            
            // Metadata
            createdAt: Date.now(),
            updatedAt: Date.now(),
            lastAccessed: Date.now(),
            textChannelId: null,
            voiceChannelId: null,
            requesterId: null
        };
    }

    /**
     * Get queue
     */
    get(guildId) {
        const queue = this.guildQueues.get(guildId);
        if (queue) {
            queue.lastAccessed = Date.now();
        }
        return queue;
    }

    /**
     * Update queue property
     */
    update(guildId, updates) {
        const queue = this.get(guildId);
        if (!queue) return null;
        
        Object.assign(queue, updates, { updatedAt: Date.now() });
        return queue;
    }

    /**
     * Delete queue with cleanup
     */
    delete(guildId) {
        const queue = this.guildQueues.get(guildId);
        if (queue) {
            // Clear all timers
            if (queue.inactivityTimer) clearTimeout(queue.inactivityTimer);
            if (queue.vcMonitorInterval) clearInterval(queue.vcMonitorInterval);
            if (queue.skipVoteTimeout) clearTimeout(queue.skipVoteTimeout);
            
            // Clear message references to avoid memory leaks
            queue.nowPlayingMessage = null;
            queue.controlsMessage = null;
            queue.skipVoteMessage = null;
            
            // Clear sets
            queue.skipVotes.clear();
            queue.priorityVotes.clear();
        }
        return this.guildQueues.delete(guildId);
    }

    /**
     * Check if queue exists
     */
    has(guildId) {
        return this.guildQueues.has(guildId);
    }

    /**
     * Get all active queue guild IDs
     */
    getActiveGuildIds() {
        return Array.from(this.guildQueues.keys());
    }

    // ========== TRACK OPERATIONS ==========

    /**
     * Add track to queue
     */
    addTrack(guildId, track) {
        const queue = this.getOrCreate(guildId);
        
        // Check queue size limit
        if (queue.tracks.length >= this.MAX_QUEUE_SIZE) {
            return { success: false, reason: 'QUEUE_FULL', maxSize: this.MAX_QUEUE_SIZE };
        }
        
        queue.tracks.push(track);
        queue.originalTracks.push(track);
        queue.updatedAt = Date.now();
        
        return { success: true, position: queue.tracks.length };
    }

    /**
     * Add track to front of queue
     */
    addTrackToFront(guildId, track) {
        const queue = this.getOrCreate(guildId);
        
        if (queue.tracks.length >= this.MAX_QUEUE_SIZE) {
            return { success: false, reason: 'QUEUE_FULL' };
        }
        
        queue.tracks.unshift(track);
        queue.originalTracks.unshift(track);
        queue.updatedAt = Date.now();
        
        return { success: true, position: 1 };
    }

    /**
     * Add multiple tracks
     */
    addTracks(guildId, tracks) {
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
    removeTrack(guildId, index) {
        const queue = this.get(guildId);
        if (!queue || index < 0 || index >= queue.tracks.length) return null;
        
        const removed = queue.tracks.splice(index, 1)[0];
        queue.updatedAt = Date.now();
        return removed;
    }

    /**
     * Clear all tracks
     */
    clearTracks(guildId) {
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
    getNextTrack(guildId) {
        const queue = this.get(guildId);
        if (!queue || queue.tracks.length === 0) return null;
        
        return queue.tracks.shift();
    }

    /**
     * Shuffle queue
     */
    shuffle(guildId) {
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
    unshuffle(guildId) {
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

    // ========== PLAYBACK STATE ==========

    setCurrentTrack(guildId, track) {
        const queue = this.get(guildId);
        if (!queue) return;
        queue.currentTrack = track;
        queue.updatedAt = Date.now();
    }

    getCurrentTrack(guildId) {
        return this.get(guildId)?.currentTrack || null;
    }

    togglePause(guildId) {
        const queue = this.get(guildId);
        if (!queue) return false;
        queue.isPaused = !queue.isPaused;
        queue.updatedAt = Date.now();
        return queue.isPaused;
    }

    setLoopMode(guildId, mode) {
        const queue = this.get(guildId);
        if (!queue) return;
        queue.loopMode = mode;
        queue.isLooping = mode !== 'off';
        queue.loopCount = 0;
        queue.updatedAt = Date.now();
    }

    cycleLoopMode(guildId) {
        const queue = this.get(guildId);
        if (!queue) return 'off';
        
        const modes = ['off', 'track', 'queue'];
        const currentIndex = modes.indexOf(queue.loopMode);
        queue.loopMode = modes[(currentIndex + 1) % modes.length];
        queue.isLooping = queue.loopMode !== 'off';
        queue.loopCount = 0;
        queue.updatedAt = Date.now();
        
        return queue.loopMode;
    }

    setVolume(guildId, volume) {
        const queue = this.get(guildId);
        if (!queue) return;
        queue.volume = Math.max(0, Math.min(200, volume));
        queue.updatedAt = Date.now();
        return queue.volume;
    }

    // ========== MESSAGES ==========

    setNowPlayingMessage(guildId, message) {
        const queue = this.get(guildId);
        if (!queue) return;
        queue.nowPlayingMessage = message;
    }

    getNowPlayingMessage(guildId) {
        return this.get(guildId)?.nowPlayingMessage || null;
    }

    async clearNowPlayingMessage(guildId) {
        const queue = this.get(guildId);
        if (!queue || !queue.nowPlayingMessage) return;
        
        try {
            await queue.nowPlayingMessage.delete().catch(() => {});
        } catch {}
        
        queue.nowPlayingMessage = null;
    }

    // ========== CLEANUP ==========

    /**
     * Evict oldest inactive queue
     */
    _evictOldestInactive() {
        let oldestKey = null;
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
            console.log(`[QueueCache] Evicting inactive guild: ${oldestKey}`);
            this.delete(oldestKey);
        }
    }

    /**
     * Cleanup stale queues (no activity for 1 hour)
     */
    cleanup() {
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
            console.log(`[QueueCache] Cleaned ${cleaned} stale queues`);
        }
    }

    /**
     * Get statistics
     */
    getStats() {
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
    shutdown() {
        for (const guildId of this.guildQueues.keys()) {
            this.delete(guildId);
        }
        console.log('[QueueCache] Shutdown complete');
    }
}

module.exports = new QueueCache();
