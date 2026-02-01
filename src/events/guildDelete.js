/**
 * Guild Delete Event - Presentation Layer
 * Fired when bot leaves a server
 * @module presentation/events/guildDelete
 */

const { Events } = require('discord.js');
const { BaseEvent } = require('./BaseEvent');
const logger = require('../core/Logger');

class GuildDeleteEvent extends BaseEvent {
    constructor() {
        super({
            name: Events.GuildDelete,
            once: false
        });
    }

    async execute(client, guild) {
        logger.info('GuildDelete', `Left server: ${guild.name} (${guild.id})`);
        await logger.logGuildEvent('leave', guild);
    }
}

module.exports = new GuildDeleteEvent();



