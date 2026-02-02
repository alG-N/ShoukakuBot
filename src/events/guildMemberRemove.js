/**
 * Guild Member Remove Event - Presentation Layer
 * Handles member leaves/kicks/bans for mod logging
 * @module presentation/events/guildMemberRemove
 */

const { Events } = require('discord.js');
const { BaseEvent } = require('./BaseEvent');
const { ModLogHandler } = require('../handlers/moderation');

class GuildMemberRemoveEvent extends BaseEvent {
    constructor() {
        super({
            name: Events.GuildMemberRemove,
            once: false
        });
    }

    async execute(client, member) {
        // Log member leave
        await this._handleModLog(client, member);
    }
    
    /**
     * Handle mod log for member leave
     * @param {Client} client 
     * @param {GuildMember} member 
     */
    async _handleModLog(client, member) {
        try {
            await ModLogHandler.handleMemberLeave(client, member);
        } catch (error) {
            client.logger?.error('Mod log (leave) error:', error);
        }
    }
}

module.exports = new GuildMemberRemoveEvent();
