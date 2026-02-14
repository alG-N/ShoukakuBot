/**
 * Guild Delete Event - Presentation Layer
 * Fired when bot leaves a server
 * @module presentation/events/guildDelete
 */

import { Events, Client, Guild } from 'discord.js';
import { BaseEvent } from './BaseEvent.js';
import logger from '../core/Logger.js';
import cacheService from '../cache/CacheService.js';

/** Guild-scoped cache namespaces to clean up when the bot leaves a server */
const GUILD_NAMESPACES = ['guild', 'automod', 'snipe', 'lockdown', 'antiraid', 'voice', 'music'] as const;

// GUILD DELETE EVENT
class GuildDeleteEvent extends BaseEvent {
    constructor() {
        super({
            name: Events.GuildDelete,
            once: false
        });
    }

    async execute(_client: Client, guild: Guild): Promise<void> {
        logger.info('GuildDelete', `Left server: ${guild.name} (${guild.id}) - Had ${guild.memberCount} members`);
        
        // Log detailed embed
        await logger.logGuildEventDetailed('leave', guild);

        // Clean up guild-scoped cache entries to prevent stale Redis keys from accumulating
        try {
            let totalDeleted = 0;
            await Promise.all(
                GUILD_NAMESPACES.map(async (ns) => {
                    const deleted = await cacheService.deleteByPrefix(ns, guild.id);
                    totalDeleted += deleted;
                })
            );
            if (totalDeleted > 0) {
                logger.debug('GuildDelete', `Cleaned up ${totalDeleted} cached entries for guild ${guild.id}`);
            }
        } catch (error) {
            logger.warn('GuildDelete', `Cache cleanup failed for guild ${guild.id}: ${(error as Error).message}`);
        }
    }
}

export default new GuildDeleteEvent();
