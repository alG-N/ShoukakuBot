/**
 * Ready Event - Presentation Layer
 * Fired when the bot successfully connects to Discord
 * @module presentation/events/ready
 */

import { Events, Client, ActivityType, PresenceStatusData } from 'discord.js';
import { BaseEvent } from './BaseEvent.js';
import logger from '../core/Logger.js';
import { setPresence } from '../core/Client.js';
import { bot } from '../config/index.js';
import { updateDiscordMetrics, redisConnectionStatus, musicPlayersActive, musicQueueSize, musicVoiceConnections, commandsActive } from '../core/metrics.js';
import cacheService from '../cache/CacheService.js';
// READY EVENT
class ReadyEvent extends BaseEvent {
    private _metricsInterval: ReturnType<typeof setInterval> | null = null;

    constructor() {
        super({
            name: Events.ClientReady,
            once: true
        });
    }

    async execute(client: Client): Promise<void> {
        if (!client.user) return;
        
        logger.success('Ready', `Logged in as ${client.user.tag}`);
        
        // Initialize logger with client
        logger.initialize(client);
        
        // Set presence with member count
        this._updatePresence(client);
        
        // Log statistics
        logger.info('Ready', `Serving ${client.guilds.cache.size} guilds`);
        
        // Initialize metrics with default values immediately
        const cacheStats = cacheService.getStats();
        redisConnectionStatus.set(cacheStats.redisConnected ? 1 : 0);
        musicPlayersActive.set(0);
        musicQueueSize.set(0);
        musicVoiceConnections.set(0);
        commandsActive.reset();
        
        // Start metrics collection
        const collectMetrics = () => {
            const totalUsers = client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0);
            updateDiscordMetrics({
                shardId: client.shard?.ids[0] ?? 0,
                ping: client.ws.ping,
                guilds: client.guilds.cache.size,
                users: totalUsers,
                channels: client.channels.cache.size,
                uptime: client.uptime ?? 0
            });
            // Update Redis status
            const stats = cacheService.getStats();
            redisConnectionStatus.set(stats.redisConnected ? 1 : 0);
        };
        collectMetrics();
        this._metricsInterval = setInterval(() => {
            collectMetrics();
            this._updatePresence(client);
        }, 15000); // Update every 15s
        
        // NOTE: Detailed startup embed is sent from index.ts (ClientReady handler)
        // to avoid duplicate "Bot Started" messages in Discord.
        
        logger.success('Ready', '🚀 alterGolden is fully operational!');
    }

    /**
     * Update presence with dynamic member count
     */
    private _updatePresence(client: Client): void {
        const totalMembers = client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0);
        const presenceConfig = bot.presence;
        const activity = (presenceConfig.activity || 'Teasing {members} shikkans with /help')
            .replace('{members}', totalMembers.toLocaleString());
        setPresence(
            client,
            (presenceConfig.status || 'online') as PresenceStatusData,
            activity,
            ActivityType.Custom
        );
    }

    /**
     * Destroy - clear metrics interval for clean shutdown
     */
    destroy(): void {
        if (this._metricsInterval) {
            clearInterval(this._metricsInterval);
            this._metricsInterval = null;
        }
    }
}

export default new ReadyEvent();
