/**
 * Voice Connection Service
 * Handles voice channel connection and monitoring
 * Extracted from MusicService for single responsibility
 * @module services/music/voice/VoiceConnectionService
 */

import type { ChatInputCommandInteraction, Guild, GuildMember, VoiceBasedChannel, Collection, Snowflake } from 'discord.js';
import lavalinkService from '../core/LavalinkService.js';
import { queueService } from '../queue/index.js';
import logger from '../../../core/Logger.js';
import { Result } from '../../../core/Result.js';
import { ErrorCodes } from '../../../core/ErrorCodes.js';
import { INACTIVITY_TIMEOUT, VC_CHECK_INTERVAL } from '../../../config/features/music.js';
import cacheService from '../../../cache/CacheService.js';
// TYPES
interface PlayerLike {
    removeAllListeners(): void;
    on(event: string, listener: (...args: unknown[]) => void): void;
    connection?: {
        channelId?: string;
    };
}

interface EventBusLike {
    emitEvent(event: string, data: Record<string, unknown>): void;
    emitTrackStart(guildId: string, track: unknown, data: unknown): void;
    emitTrackEnd(guildId: string, track: unknown, reason?: string): void;
    emitTrackError(guildId: string, track: unknown, error: string): void;
}

interface EventsModule {
    musicEventBus: EventBusLike;
    MusicEvents: Record<string, string>;
}

interface ConnectionState {
    isConnected: boolean;
    voiceChannelId: string | null;
    eventsBound: boolean;
    hasInactivityTimer: boolean;
    hasVCMonitor: boolean;
}

interface PlayerEventHandlers {
    onStart?: (data: unknown) => void;
    onEnd?: (data: unknown) => void;
    onException?: (data: unknown) => void;
    onStuck?: (data: unknown) => void;
    onClosed?: (data: unknown) => void;
}

// Lazy-load to avoid circular dependency
let musicEventBus: EventBusLike | null = null;
let MusicEvents: Record<string, string> | null = null;

const getEventBus = (): EventsModule => {
    if (!musicEventBus) {
        // Dynamic import for lazy loading
        const events = require('../events/index.js');
        musicEventBus = events.musicEventBus;
        MusicEvents = events.MusicEvents;
    }
    return { musicEventBus: musicEventBus!, MusicEvents: MusicEvents! };
};
// VOICE CONNECTION SERVICE CLASS
class VoiceConnectionService {
    private boundGuilds: Set<string> = new Set();
    // Local timers for callback execution (Redis stores deadlines, local timers execute)
    private localInactivityTimers: Map<string, NodeJS.Timeout> = new Map();
    private localVCMonitorIntervals: Map<string, NodeJS.Timeout> = new Map();
    // Global inactivity checker interval
    private inactivityCheckerInterval: NodeJS.Timeout | null = null;

    constructor() {
        // Start global inactivity checker (checks Redis deadlines every 10 seconds)
        this._startInactivityChecker();
    }

    /**
     * Start global inactivity checker
     * Polls Redis for expired inactivity deadlines
     */
    private _startInactivityChecker(): void {
        if (this.inactivityCheckerInterval) return;
        
        this.inactivityCheckerInterval = setInterval(async () => {
            try {
                const expiredGuildIds = await cacheService.checkInactivityDeadlines();
                const { musicEventBus, MusicEvents } = getEventBus();
                
                for (const guildId of expiredGuildIds) {
                    logger.info('VoiceConnectionService', `Inactivity timeout for guild ${guildId}`);
                    musicEventBus.emitEvent(MusicEvents.INACTIVITY_TIMEOUT, { guildId });
                    
                    // Clear local timer if exists
                    const localTimer = this.localInactivityTimers.get(guildId);
                    if (localTimer) {
                        clearTimeout(localTimer);
                        this.localInactivityTimers.delete(guildId);
                    }
                }
            } catch (error) {
                logger.error('VoiceConnectionService', `Inactivity checker error: ${(error as Error).message}`);
            }
        }, 10000); // Check every 10 seconds
    }

    /**
     * Connect to voice channel
     */
    async connect(interaction: ChatInputCommandInteraction): Promise<Result<{ player: unknown; voiceChannelId: string; textChannelId: string }>> {
        try {
            const guildId = interaction.guild!.id;
            const voiceChannel = (interaction.member as GuildMember).voice?.channel;

            if (!voiceChannel) {
                return Result.err(ErrorCodes.VOICE_REQUIRED, 'You must be in a voice channel.');
            }

            let player = lavalinkService.getPlayer(guildId);

            if (!player) {
                player = await lavalinkService.createPlayer(
                    guildId,
                    voiceChannel.id,
                    interaction.channel!.id
                );
            }

            // Update queue with channel info
            const queue = queueService.getOrCreate(guildId);
            queue.voiceChannelId = voiceChannel.id;
            queue.textChannelId = interaction.channel!.id;
            queue.textChannel = interaction.channel;

            // Emit event
            const { musicEventBus, MusicEvents } = getEventBus();
            musicEventBus.emitEvent(MusicEvents.VOICE_CONNECT, {
                guildId,
                voiceChannelId: voiceChannel.id,
                textChannelId: interaction.channel!.id
            });

            return Result.ok({ 
                player, 
                voiceChannelId: voiceChannel.id,
                textChannelId: interaction.channel!.id 
            });
        } catch (error) {
            logger.error('VoiceConnectionService', `Connect error: ${(error as Error).message}`);
            return Result.fromError(error as Error, ErrorCodes.LAVALINK_ERROR);
        }
    }

    /**
     * Disconnect from voice channel
     */
    disconnect(guildId: string): Result<{ disconnected: boolean }> {
        try {
            this.unbindPlayerEvents(guildId);
            this.clearInactivityTimer(guildId);
            this.stopVCMonitor(guildId);
            lavalinkService.destroyPlayer(guildId);

            // Emit event
            const { musicEventBus, MusicEvents } = getEventBus();
            musicEventBus.emitEvent(MusicEvents.VOICE_DISCONNECT, {
                guildId,
                reason: 'manual'
            });
            
            return Result.ok({ disconnected: true });
        } catch (error) {
            logger.error('VoiceConnectionService', `Disconnect error: ${(error as Error).message}`);
            return Result.fromError(error as Error);
        }
    }

    /**
     * Check if connected to voice
     */
    isConnected(guildId: string): boolean {
        return !!lavalinkService.getPlayer(guildId);
    }

    /**
     * Get voice channel ID
     */
    getVoiceChannelId(guildId: string): string | null {
        const player = lavalinkService.getPlayer(guildId) as PlayerLike | null;
        return player?.connection?.channelId || null;
    }

    /**
     * Get text channel from queue
     */
    getTextChannel(guildId: string): unknown | null {
        const queue = queueService.get(guildId);
        return queue?.textChannel || null;
    }
    // PLAYER EVENTS (Event Bus Integration)
    /**
     * Bind player events using Event Bus
     */
    bindPlayerEvents(guildId: string, handlers: PlayerEventHandlers = {}): void {
        if (this.boundGuilds.has(guildId)) return;

        const player = lavalinkService.getPlayer(guildId) as PlayerLike | null;
        if (!player) return;

        this.boundGuilds.add(guildId);

        const queue = queueService.get(guildId);
        if (queue) {
            queue.eventsBound = true;
        }

        const { musicEventBus, MusicEvents } = getEventBus();

        // Track start
        player.on('start', (data: unknown) => {
            musicEventBus.emitTrackStart(guildId, queueService.getCurrentTrack(guildId), data);
            if (handlers.onStart) handlers.onStart(data);
        });

        // Track end
        player.on('end', ((data: { reason?: string }) => {
            musicEventBus.emitTrackEnd(guildId, queueService.getCurrentTrack(guildId), data?.reason);
            if (handlers.onEnd) handlers.onEnd(data);
        }) as (...args: unknown[]) => void);

        // Track exception
        player.on('exception', ((data: { message?: string }) => {
            musicEventBus.emitTrackError(guildId, queueService.getCurrentTrack(guildId), data?.message || 'Unknown error');
            if (handlers.onException) handlers.onException(data);
        }) as (...args: unknown[]) => void);

        // Track stuck
        player.on('stuck', ((data: { threshold?: number }) => {
            musicEventBus.emitEvent(MusicEvents.TRACK_STUCK, {
                guildId,
                track: queueService.getCurrentTrack(guildId),
                threshold: data?.threshold
            });
            if (handlers.onStuck) handlers.onStuck(data);
        }) as (...args: unknown[]) => void);

        // Connection closed
        player.on('closed', ((data: { code?: number; reason?: string }) => {
            musicEventBus.emitEvent(MusicEvents.VOICE_CLOSED, {
                guildId,
                code: data?.code,
                reason: data?.reason
            });
            if (handlers.onClosed) handlers.onClosed(data);
        }) as (...args: unknown[]) => void);
    }

    /**
     * Unbind player events
     */
    unbindPlayerEvents(guildId: string): void {
        const player = lavalinkService.getPlayer(guildId) as PlayerLike | null;
        if (player) {
            player.removeAllListeners();
        }

        this.boundGuilds.delete(guildId);

        const queue = queueService.get(guildId);
        if (queue) {
            queue.eventsBound = false;
        }
    }

    /**
     * Check if events are bound
     */
    areEventsBound(guildId: string): boolean {
        return this.boundGuilds.has(guildId);
    }
    // INACTIVITY TIMER (Redis-backed for shard safety)
    /**
     * Set inactivity timer
     * Now uses Redis to store deadline for shard-safety
     * Local timer is kept for immediate callback execution on this shard
     */
    async setInactivityTimer(guildId: string, callback?: () => void, timeout: number = INACTIVITY_TIMEOUT): Promise<void> {
        await this.clearInactivityTimer(guildId);

        // Store deadline in Redis (shard-safe)
        await cacheService.setInactivityDeadline(guildId, timeout);

        // Also set local timer for immediate callback on this shard
        if (callback) {
            const timer = setTimeout(() => {
                callback();
                this.localInactivityTimers.delete(guildId);
            }, timeout);
            this.localInactivityTimers.set(guildId, timer);
        }
    }

    /**
     * Clear inactivity timer
     * Clears both Redis deadline and local timer
     */
    async clearInactivityTimer(guildId: string): Promise<void> {
        // Clear Redis deadline
        await cacheService.clearInactivityDeadline(guildId);
        
        // Clear local timer
        const timer = this.localInactivityTimers.get(guildId);
        if (timer) {
            clearTimeout(timer);
            this.localInactivityTimers.delete(guildId);
        }
    }
    // VOICE CHANNEL MONITORING (Redis-backed for shard safety)
    /**
     * Start voice channel monitoring
     * Uses Redis flag for coordination, local interval for execution
     */
    async startVCMonitor(guildId: string, guild: Guild, onEmpty?: () => void): Promise<void> {
        // Check if already monitoring (either locally or another shard)
        if (this.localVCMonitorIntervals.has(guildId)) return;
        const isActive = await cacheService.isVCMonitorActive(guildId);
        if (isActive) return;

        // Set Redis flag
        await cacheService.setVCMonitorActive(guildId, true);

        const { musicEventBus, MusicEvents } = getEventBus();

        const interval = setInterval(async () => {
            const vcId = this.getVoiceChannelId(guildId);
            if (!vcId) {
                await this.stopVCMonitor(guildId);
                return;
            }

            const channel = guild.channels.cache.get(vcId) as VoiceBasedChannel | undefined;
            if (!channel) {
                musicEventBus.emitEvent(MusicEvents.VOICE_EMPTY, { guildId, reason: 'channel_not_found' });
                if (onEmpty) onEmpty();
                return;
            }

            // Count non-bot members
            const listeners = channel.members.filter(m => !m.user.bot).size;

            if (listeners === 0) {
                musicEventBus.emitEvent(MusicEvents.VOICE_EMPTY, { guildId, reason: 'no_listeners' });
                if (onEmpty) onEmpty();
            }
        }, VC_CHECK_INTERVAL);

        this.localVCMonitorIntervals.set(guildId, interval);
    }

    /**
     * Stop voice channel monitoring
     */
    async stopVCMonitor(guildId: string): Promise<void> {
        // Clear Redis flag
        await cacheService.setVCMonitorActive(guildId, false);
        
        // Clear local interval
        const interval = this.localVCMonitorIntervals.get(guildId);
        if (interval) {
            clearInterval(interval);
            this.localVCMonitorIntervals.delete(guildId);
        }
    }
    // LISTENERS
    /**
     * Get listener count in voice channel
     */
    getListenerCount(guildId: string, guild: Guild): number {
        const vcId = this.getVoiceChannelId(guildId);
        if (!vcId) return 0;

        const channel = guild.channels.cache.get(vcId) as VoiceBasedChannel | undefined;
        if (!channel) return 0;

        return channel.members.filter(m => !m.user.bot).size;
    }

    /**
     * Get listeners in voice channel
     */
    getListeners(guildId: string, guild: Guild): GuildMember[] {
        const vcId = this.getVoiceChannelId(guildId);
        if (!vcId) return [];

        const channel = guild.channels.cache.get(vcId) as VoiceBasedChannel | undefined;
        if (!channel) return [];

        return Array.from(channel.members.filter(m => !m.user.bot).values());
    }

    /**
     * Check if user is in same voice channel as bot
     */
    checkUserInVoice(guildId: string, member: GuildMember): Result<{ voiceChannelId: string }> {
        const userVcId = member.voice?.channel?.id;
        
        if (!userVcId) {
            return Result.err(ErrorCodes.VOICE_REQUIRED, 'You must be in a voice channel.');
        }

        const botVcId = this.getVoiceChannelId(guildId);
        
        if (botVcId && userVcId !== botVcId) {
            return Result.err(ErrorCodes.DIFFERENT_VOICE, 'You must be in the same voice channel as the bot.');
        }

        return Result.ok({ voiceChannelId: userVcId });
    }
    // CLEANUP
    /**
     * Full cleanup for a guild
     */
    async cleanup(guildId: string): Promise<void> {
        await this.clearInactivityTimer(guildId);
        await this.stopVCMonitor(guildId);
        this.unbindPlayerEvents(guildId);
        queueService.destroy(guildId);
        lavalinkService.destroyPlayer(guildId);
    }

    /**
     * Shutdown all connections
     */
    shutdownAll(): void {
        // Stop global inactivity checker
        if (this.inactivityCheckerInterval) {
            clearInterval(this.inactivityCheckerInterval);
            this.inactivityCheckerInterval = null;
        }
        
        // Clear all local timers
        for (const [, timer] of this.localInactivityTimers) {
            clearTimeout(timer);
        }
        this.localInactivityTimers.clear();

        // Clear all local monitors
        for (const [, interval] of this.localVCMonitorIntervals) {
            clearInterval(interval);
        }
        this.localVCMonitorIntervals.clear();

        // Clear bound guilds
        this.boundGuilds.clear();
    }

    /**
     * Get connection state
     */
    getState(guildId: string): ConnectionState {
        return {
            isConnected: this.isConnected(guildId),
            voiceChannelId: this.getVoiceChannelId(guildId),
            eventsBound: this.areEventsBound(guildId),
            hasInactivityTimer: this.localInactivityTimers.has(guildId),
            hasVCMonitor: this.localVCMonitorIntervals.has(guildId)
        };
    }
}

// Export singleton instance and class
const voiceConnectionService = new VoiceConnectionService();

export { VoiceConnectionService };
export type { ConnectionState, PlayerEventHandlers };
export default voiceConnectionService;
