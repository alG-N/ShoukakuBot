/**
 * Guild Create Event - Presentation Layer
 * Fired when bot joins a new server
 * @module presentation/events/guildCreate
 */

const { Events } = require('discord.js');
const { BaseEvent } = require('./BaseEvent');
const logger = require('../core/Logger');

class GuildCreateEvent extends BaseEvent {
    constructor() {
        super({
            name: Events.GuildCreate,
            once: false
        });
    }

    async execute(client, guild) {
        logger.info('GuildCreate', `Joined server: ${guild.name} (${guild.id})`);
        await logger.logGuildEvent('join', guild);
    }
}

module.exports = new GuildCreateEvent();



