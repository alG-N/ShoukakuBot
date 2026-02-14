/**
 * Music Event Bus
 * Central event emitter for the music system
 * Enables decoupled communication between music services
 * @module services/music/events/MusicEventBus
 */

import { EventEmitter } from 'events';
import { MusicEvents, type MusicTrack } from './MusicEvents.js';
import logger from '../../../core/Logger.js';
// TYPES
interface EventStats {
    totalEvents: number;
    activeGuilds: number;
    listenerCount: number;
    eventCounts: Record<string, number>;
}

interface EventData {
    guildId?: string;
    track?: MusicTrack | null;
    tracks?: MusicTrack[];
    reason?: string;
    error?: Error | string;
    lastTrack?: MusicTrack | null;
    [key: string]: unknown;
}
// MUSIC EVENT BUS CLASS
class MusicEventBus extends EventEmitter {
    /** Guild-specific listeners */
    private guildListeners: Map<string, Map<string, ((data: EventData) => void)[]>> = new Map();
    
    /** Event emission counts for metrics */
    private eventCounts: Map<string, number> = new Map();
    
    /** Debug mode flag */
    private debugMode: boolean;
    
    /** Stats reset interval (1 hour) */
    private statsResetInterval: ReturnType<typeof setInterval> | null = null;
    private readonly STATS_RESET_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

    constructor() {
        super();
        this.setMaxListeners(50); // Allow many listeners for music system
        this.debugMode = process.env.MUSIC_EVENT_DEBUG === 'true';
        
        // Schedule periodic stats reset to prevent unbounded growth
        this.statsResetInterval = setInterval(() => {
            const stats = this.getStats();
            if (this.debugMode) {
                logger.info('MusicEventBus', `Hourly stats reset: ${JSON.stringify(stats)}`);
            }
            this.eventCounts.clear();
        }, this.STATS_RESET_INTERVAL_MS);
    }

    /**
     * Emit an event with optional guild context
     */
    emitEvent(event: string, data: EventData = {}): void {
        // Track event counts
        const count = this.eventCounts.get(event) || 0;
        this.eventCounts.set(event, count + 1);

        // Debug logging
        if (this.debugMode) {
            logger.debug('MusicEventBus', `Emitting: ${event} guildId=${data.guildId}`);
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
    subscribeGuild(guildId: string, event: string, handler: (data: EventData) => void): () => void {
        const eventKey = `${event}:${guildId}`;
        
        // Track guild listeners for cleanup
        if (!this.guildListeners.has(guildId)) {
            this.guildListeners.set(guildId, new Map());
        }
        
        const guildEvents = this.guildListeners.get(guildId)!;
        if (!guildEvents.has(event)) {
            guildEvents.set(event, []);
        }
        guildEvents.get(event)!.push(handler);

        // Add listener - cast handler for EventEmitter compatibility
        this.on(eventKey, handler as (...args: unknown[]) => void);

        // Return unsubscribe function
        return () => {
            this.off(eventKey, handler as (...args: unknown[]) => void);
            const handlers = guildEvents.get(event);
            if (handlers) {
                const idx = handlers.indexOf(handler);
                if (idx > -1) handlers.splice(idx, 1);
            }
        };
    }

    /**
     * Subscribe to global event (all guilds)
     */
    subscribe(event: string, handler: (data: EventData) => void): () => void {
        this.on(event, handler as (...args: unknown[]) => void);
        return () => this.off(event, handler as (...args: unknown[]) => void);
    }

    /**
     * Subscribe once to an event
     */
    subscribeOnce(event: string, handler: (data: EventData) => void): void {
        this.once(event, handler as (...args: unknown[]) => void);
    }

    /**
     * Remove all listeners for a specific guild
     * Call this when cleaning up a guild's music session
     */
    removeGuildListeners(guildId: string): void {
        const guildEvents = this.guildListeners.get(guildId);
        if (!guildEvents) return;

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
            logger.debug('MusicEventBus', `Removed all listeners for guild ${guildId}`);
        }
    }

    /**
     * Remove all listeners and reset
     * Call this on bot shutdown
     */
    shutdown(): void {
        // Clear stats reset interval
        if (this.statsResetInterval) {
            clearInterval(this.statsResetInterval);
            this.statsResetInterval = null;
        }
        
        this.removeAllListeners();
        this.guildListeners.clear();
        this.eventCounts.clear();
        logger.info('MusicEventBus', 'Shutdown complete');
    }
    // CONVENIENCE EMITTERS
    /**
     * Emit track start event
     */
    emitTrackStart(guildId: string, track: MusicTrack | null, options: Record<string, unknown> = {}): void {
        this.emitEvent(MusicEvents.TRACK_START, {
            guildId,
            track,
            ...options
        });
    }

    /**
     * Emit track end event
     */
    emitTrackEnd(guildId: string, track: MusicTrack | null, reason?: string): void {
        this.emitEvent(MusicEvents.TRACK_END, {
            guildId,
            track,
            reason
        });
    }

    /**
     * Emit track error event
     */
    emitTrackError(guildId: string, track: MusicTrack | null, error: Error | string): void {
        this.emitEvent(MusicEvents.TRACK_ERROR, {
            guildId,
            track,
            error: error instanceof Error ? error.message : error
        });
    }

    /**
     * Emit queue end event
     */
    emitQueueEnd(guildId: string, lastTrack: MusicTrack | null): void {
        this.emitEvent(MusicEvents.QUEUE_END, {
            guildId,
            lastTrack
        });
    }

    /**
     * Emit voice disconnect event
     */
    emitVoiceDisconnect(guildId: string, reason: string): void {
        this.emitEvent(MusicEvents.VOICE_DISCONNECT, {
            guildId,
            reason
        });
    }

    /**
     * Emit cleanup event
     */
    emitCleanup(guildId: string, reason: string): void {
        this.emitEvent(MusicEvents.CLEANUP_START, {
            guildId,
            reason
        });
    }

    /**
     * Emit now playing send event
     */
    emitNowPlayingSend(guildId: string, track: MusicTrack | null, options: Record<string, unknown> = {}): void {
        this.emitEvent(MusicEvents.NOWPLAYING_SEND, {
            guildId,
            track,
            ...options
        });
    }

    /**
     * Emit now playing update event (for loop count, etc.)
     */
    emitNowPlayingUpdate(guildId: string, updates: Record<string, unknown>): void {
        this.emitEvent(MusicEvents.NOWPLAYING_UPDATE, {
            guildId,
            ...updates
        });
    }
    // METRICS
    /**
     * Get event emission statistics
     */
    getStats(): EventStats {
        const stats: EventStats = {
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
    getTotalListenerCount(): number {
        let total = 0;
        for (const event of this.eventNames()) {
            total += this.listenerCount(event);
        }
        return total;
    }

    /**
     * Reset event counts
     */
    resetStats(): void {
        this.eventCounts.clear();
    }
}

// Export singleton instance and class
const musicEventBus = new MusicEventBus();

export { MusicEventBus };
export default musicEventBus;
