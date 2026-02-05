/**
 * Guild Delete Event - Presentation Layer
 * Fired when bot leaves a server
 * @module presentation/events/guildDelete
 */

import { Events, Client, Guild } from 'discord.js';
import { BaseEvent } from './BaseEvent.js';
import logger from '../core/Logger.js';
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
    }
}

export default new GuildDeleteEvent();
