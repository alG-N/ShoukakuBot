/**
 * Message Update Event - Presentation Layer
 * Handles edited messages for auto-moderation and mod logging
 * @module presentation/events/messageUpdate
 */

const { Events } = require('discord.js');
const { BaseEvent } = require('./BaseEvent');
const { AutoModHandler, ModLogHandler } = require('../handlers/moderation');

class MessageUpdateEvent extends BaseEvent {
    constructor() {
        super({
            name: Events.MessageUpdate,
            once: false
        });
    }

    async execute(client, oldMessage, newMessage) {
        // Ignore bots, DMs, and unchanged content
        if (newMessage.author?.bot || !newMessage.guild) return;
        if (oldMessage.content === newMessage.content) return;
        
        // Fetch partials if needed
        if (oldMessage.partial) {
            try {
                await oldMessage.fetch();
            } catch {
                // Message too old to fetch, continue with what we have
            }
        }
        
        // Run auto-moderation on edited content
        await this._handleAutoMod(client, newMessage);
        
        // Log message edit
        await this._handleModLog(client, oldMessage, newMessage);
    }
    
    /**
     * Handle auto-moderation for edited messages
     * @param {Client} client 
     * @param {Message} message 
     */
    async _handleAutoMod(client, message) {
        try {
            await AutoModHandler.handleMessageUpdate(client, message);
        } catch (error) {
            client.logger?.error('Auto-mod (edit) error:', error);
        }
    }
    
    /**
     * Handle mod log for message edits
     * @param {Client} client 
     * @param {Message} oldMessage 
     * @param {Message} newMessage 
     */
    async _handleModLog(client, oldMessage, newMessage) {
        try {
            await ModLogHandler.handleMessageUpdate(client, oldMessage, newMessage);
        } catch (error) {
            client.logger?.error('Mod log (edit) error:', error);
        }
    }
}

module.exports = new MessageUpdateEvent();
