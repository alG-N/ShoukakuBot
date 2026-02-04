"use strict";
/**
 * Music Event Bus
 * Central event emitter for the music system
 * Enables decoupled communication between music services
 * @module services/music/events/MusicEventBus
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MusicEventBus = void 0;
const events_1 = require("events");
const MusicEvents_js_1 = require("./MusicEvents.js");
// MUSIC EVENT BUS CLASS
class MusicEventBus extends events_1.EventEmitter {
    /** Guild-specific listeners */
    guildListeners = new Map();
    /** Event emission counts for metrics */
    eventCounts = new Map();
    /** Debug mode flag */
    debugMode;
    /** Stats reset interval (1 hour) */
    statsResetInterval = null;
    STATS_RESET_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
    constructor() {
        super();
        this.setMaxListeners(50); // Allow many listeners for music system
        this.debugMode = process.env.MUSIC_EVENT_DEBUG === 'true';
        // Schedule periodic stats reset to prevent unbounded growth
        this.statsResetInterval = setInterval(() => {
            const stats = this.getStats();
            if (this.debugMode) {
                console.log('[MusicEventBus] Hourly stats reset:', stats);
            }
            this.eventCounts.clear();
        }, this.STATS_RESET_INTERVAL_MS);
    }
    /**
     * Emit an event with optional guild context
     */
    emitEvent(event, data = {}) {
        // Track event counts
        const count = this.eventCounts.get(event) || 0;
        this.eventCounts.set(event, count + 1);
        // Debug logging
        if (this.debugMode) {
            console.log(`[MusicEventBus] Emitting: ${event}`, {
                guildId: data.guildId,
                timestamp: new Date().toISOString()
            });
        }
        // Emit global event
        this.emit(event, data);
        // Emit guild-specific event if guildId provided
        if (data.guildId) {
            this.emit(`${event}:${data.guildId}`, data);
        }
    }
    /**
     * Subscribe to a guild-specific event
     */
    subscribeGuild(guildId, event, handler) {
        const eventKey = `${event}:${guildId}`;
        // Track guild listeners for cleanup
        if (!this.guildListeners.has(guildId)) {
            this.guildListeners.set(guildId, new Map());
        }
        const guildEvents = this.guildListeners.get(guildId);
        if (!guildEvents.has(event)) {
            guildEvents.set(event, []);
        }
        guildEvents.get(event).push(handler);
        // Add listener - cast handler for EventEmitter compatibility
        this.on(eventKey, handler);
        // Return unsubscribe function
        return () => {
            this.off(eventKey, handler);
            const handlers = guildEvents.get(event);
            if (handlers) {
                const idx = handlers.indexOf(handler);
                if (idx > -1)
                    handlers.splice(idx, 1);
            }
        };
    }
    /**
     * Subscribe to global event (all guilds)
     */
    subscribe(event, handler) {
        this.on(event, handler);
        return () => this.off(event, handler);
    }
    /**
     * Subscribe once to an event
     */
    subscribeOnce(event, handler) {
        this.once(event, handler);
    }
    /**
     * Remove all listeners for a specific guild
     * Call this when cleaning up a guild's music session
     */
    removeGuildListeners(guildId) {
        const guildEvents = this.guildListeners.get(guildId);
        if (!guildEvents)
            return;
        // Remove all listeners
        for (const [event, handlers] of guildEvents) {
            const eventKey = `${event}:${guildId}`;
            for (const handler of handlers) {
                this.off(eventKey, handler);
            }
        }
        // Clear tracking
        this.guildListeners.delete(guildId);
        if (this.debugMode) {
            console.log(`[MusicEventBus] Removed all listeners for guild ${guildId}`);
        }
    }
    /**
     * Remove all listeners and reset
     * Call this on bot shutdown
     */
    shutdown() {
        // Clear stats reset interval
        if (this.statsResetInterval) {
            clearInterval(this.statsResetInterval);
            this.statsResetInterval = null;
        }
        this.removeAllListeners();
        this.guildListeners.clear();
        this.eventCounts.clear();
        console.log('[MusicEventBus] Shutdown complete');
    }
    // CONVENIENCE EMITTERS
    /**
     * Emit track start event
     */
    emitTrackStart(guildId, track, options = {}) {
        this.emitEvent(MusicEvents_js_1.MusicEvents.TRACK_START, {
            guildId,
            track,
            ...options
        });
    }
    /**
     * Emit track end event
     */
    emitTrackEnd(guildId, track, reason) {
        this.emitEvent(MusicEvents_js_1.MusicEvents.TRACK_END, {
            guildId,
            track,
            reason
        });
    }
    /**
     * Emit track error event
     */
    emitTrackError(guildId, track, error) {
        this.emitEvent(MusicEvents_js_1.MusicEvents.TRACK_ERROR, {
            guildId,
            track,
            error: error instanceof Error ? error.message : error
        });
    }
    /**
     * Emit queue end event
     */
    emitQueueEnd(guildId, lastTrack) {
        this.emitEvent(MusicEvents_js_1.MusicEvents.QUEUE_END, {
            guildId,
            lastTrack
        });
    }
    /**
     * Emit voice disconnect event
     */
    emitVoiceDisconnect(guildId, reason) {
        this.emitEvent(MusicEvents_js_1.MusicEvents.VOICE_DISCONNECT, {
            guildId,
            reason
        });
    }
    /**
     * Emit cleanup event
     */
    emitCleanup(guildId, reason) {
        this.emitEvent(MusicEvents_js_1.MusicEvents.CLEANUP_START, {
            guildId,
            reason
        });
    }
    /**
     * Emit now playing send event
     */
    emitNowPlayingSend(guildId, track, options = {}) {
        this.emitEvent(MusicEvents_js_1.MusicEvents.NOWPLAYING_SEND, {
            guildId,
            track,
            ...options
        });
    }
    /**
     * Emit now playing update event (for loop count, etc.)
     */
    emitNowPlayingUpdate(guildId, updates) {
        this.emitEvent(MusicEvents_js_1.MusicEvents.NOWPLAYING_UPDATE, {
            guildId,
            ...updates
        });
    }
    // METRICS
    /**
     * Get event emission statistics
     */
    getStats() {
        const stats = {
            totalEvents: 0,
            activeGuilds: this.guildListeners.size,
            listenerCount: this.getTotalListenerCount(),
            eventCounts: {}
        };
        for (const [event, count] of this.eventCounts) {
            stats.eventCounts[event] = count;
            stats.totalEvents += count;
        }
        return stats;
    }
    /**
     * Get total listener count
     */
    getTotalListenerCount() {
        let total = 0;
        for (const event of this.eventNames()) {
            total += this.listenerCount(event);
        }
        return total;
    }
    /**
     * Reset event counts
     */
    resetStats() {
        this.eventCounts.clear();
    }
}
exports.MusicEventBus = MusicEventBus;
// Export singleton instance and class
const musicEventBus = new MusicEventBus();
exports.default = musicEventBus;
//# sourceMappingURL=MusicEventBus.js.map