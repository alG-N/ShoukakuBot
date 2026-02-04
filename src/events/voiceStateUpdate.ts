/**
 * Voice State Update Event - Presentation Layer
 * Handles voice channel updates for auto-disconnect
 * Uses Redis for shard-safe disconnect scheduling
 * @module presentation/events/voiceStateUpdate
 */

import { Events, Client, VoiceState, VoiceBasedChannel } from 'discord.js';
import { BaseEvent } from './BaseEvent.js';
import cacheService from '../cache/CacheService.js';

// Cache namespace for voice disconnect deadlines
const CACHE_NAMESPACE = 'voice';
const DISCONNECT_DELAY_SEC = 30;
const POLL_INTERVAL_MS = 5000; // Check every 5 seconds

// VOICE STATE UPDATE EVENT
class VoiceStateUpdateEvent extends BaseEvent {
    /** Local timers for executing disconnects (immediate action) */
    private _localTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
    /** Global polling interval for checking Redis deadlines */
    private _pollInterval: ReturnType<typeof setInterval> | null = null;
    /** Reference to client for polling */
    private _client: Client | null = null;
    
    constructor() {
        super({
            name: Events.VoiceStateUpdate,
            once: false
        });
    }

    async execute(client: Client, oldState: VoiceState, newState: VoiceState): Promise<void> {
        // Store client reference for polling
        if (!this._client) {
            this._client = client;
            this._startPolling();
        }
        
        // Only handle when someone leaves a channel
        if (!oldState.channel) return;
        
        // Check if bot was in the old channel
        const botMember = oldState.guild.members.cache.get(client.user?.id || '');
        if (!botMember?.voice.channel) return;
        
        // Check if bot is in the same channel that was left
        if (botMember.voice.channel.id !== oldState.channel.id) return;
        
        // Check if channel is now empty (only bot left)
        await this._checkEmptyChannel(client, oldState.channel, oldState.guild.id);
    }
    
    /**
     * Start polling Redis for disconnect deadlines
     */
    private _startPolling(): void {
        if (this._pollInterval) return;
        
        this._pollInterval = setInterval(async () => {
            await this._checkExpiredDeadlines();
        }, POLL_INTERVAL_MS);
    }
    
    /**
     * Check Redis for any expired disconnect deadlines
     */
    private async _checkExpiredDeadlines(): Promise<void> {
        if (!this._client) return;
        
        try {
            // Check all guilds the bot is in
            for (const [guildId, guild] of this._client.guilds.cache) {
                const deadline = await cacheService.get<number>(CACHE_NAMESPACE, `disconnect:${guildId}`);
                
                if (deadline && Date.now() >= deadline) {
                    // Deadline expired, disconnect
                    await cacheService.delete(CACHE_NAMESPACE, `disconnect:${guildId}`);
                    await this._handleDisconnect(this._client, guildId);
                }
            }
        } catch (error) {
            // Silent fail - polling will retry
        }
    }
    
    /**
     * Check if voice channel is empty and schedule disconnect
     */
    private async _checkEmptyChannel(
        client: Client, 
        channel: VoiceBasedChannel, 
        guildId: string
    ): Promise<void> {
        // Count human members (exclude bots)
        const humanMembers = channel.members.filter(m => !m.user.bot);
        
        if (humanMembers.size === 0) {
            // Channel is empty, schedule disconnect
            await this._scheduleDisconnect(client, guildId);
        } else {
            // Someone rejoined, cancel scheduled disconnect
            await this._cancelDisconnect(guildId);
        }
    }
    
    /**
     * Schedule auto-disconnect after delay (Redis-backed)
     */
    private async _scheduleDisconnect(client: Client, guildId: string): Promise<void> {
        // Cancel existing deadline if any
        await this._cancelDisconnect(guildId);
        
        // Set deadline in Redis (TTL slightly longer than delay for safety)
        const deadline = Date.now() + (DISCONNECT_DELAY_SEC * 1000);
        await cacheService.set(CACHE_NAMESPACE, `disconnect:${guildId}`, deadline, DISCONNECT_DELAY_SEC + 10);
        
        // Also set a local timer for immediate action on this shard
        const timer = setTimeout(async () => {
            // Double-check Redis in case another shard handled it
            const currentDeadline = await cacheService.get<number>(CACHE_NAMESPACE, `disconnect:${guildId}`);
            if (currentDeadline && Date.now() >= currentDeadline) {
                await cacheService.delete(CACHE_NAMESPACE, `disconnect:${guildId}`);
                await this._handleDisconnect(client, guildId);
            }
            this._localTimers.delete(guildId);
        }, DISCONNECT_DELAY_SEC * 1000);
        
        this._localTimers.set(guildId, timer);
    }
    
    /**
     * Cancel scheduled disconnect
     */
    private async _cancelDisconnect(guildId: string): Promise<void> {
        // Clear Redis deadline
        await cacheService.delete(CACHE_NAMESPACE, `disconnect:${guildId}`);
        
        // Clear local timer
        const timer = this._localTimers.get(guildId);
        if (timer) {
            clearTimeout(timer);
            this._localTimers.delete(guildId);
        }
    }
    
    /**
     * Handle disconnect via music service
     */
    private async _handleDisconnect(client: Client, guildId: string): Promise<void> {
        try {
            // Use MusicFacade - the refactored music service
            const getDefault = <T>(mod: { default?: T } | T): T => (mod as { default?: T }).default || mod as T;
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const musicFacadeModule = getDefault(require('../services/music/MusicFacade'));
            const musicFacade = musicFacadeModule?.musicFacade || musicFacadeModule;
            
            if (musicFacade?.cleanup) {
                await musicFacade.cleanup(guildId);
            }
            
            const clientWithLogger = client as Client & { logger?: { debug: (msg: string) => void } };
            clientWithLogger.logger?.debug(`Auto-disconnected from empty channel in guild ${guildId}`);
            
        } catch (error: unknown) {
            const clientWithLogger = client as Client & { logger?: { error: (msg: string, err: unknown) => void } };
            clientWithLogger.logger?.error('Voice disconnect error:', error);
        }
    }
}

export default new VoiceStateUpdateEvent();
