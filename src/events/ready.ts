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
        
        // Set presence from config
        const presenceConfig = bot.presence;
        setPresence(
            client, 
            (presenceConfig.status || 'online') as PresenceStatusData, 
            presenceConfig.activity || '/help | alterGolden', 
            ActivityType.Playing
        );
        
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
        setInterval(collectMetrics, 15000); // Update every 15s
        
        // Log startup to Discord
        await logger.logSystemEvent(
            'Bot Started', 
            `alterGolden is now online with ${client.guilds.cache.size} guilds`
        );
        
        logger.success('Ready', '🚀 alterGolden is fully operational!');
    }
}

export default new ReadyEvent();
