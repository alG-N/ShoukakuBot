/**
 * Message Create Event - Presentation Layer
 * Handles AFK mentions, auto-moderation, and other message-based features
 * @module presentation/events/messageCreate
 */

const { Events } = require('discord.js');
const { BaseEvent } = require('./BaseEvent');
const { AutoModHandler } = require('../handlers/moderation');

class MessageCreateEvent extends BaseEvent {
    constructor() {
        super({
            name: Events.MessageCreate,
            once: false
        });
    }

    async execute(client, message) {
        // Ignore bots and DMs
        if (message.author.bot || !message.guild) return;
        
        // Run auto-moderation first - if message is deleted, stop processing
        const automodResult = await this._handleAutoMod(client, message);
        if (automodResult?.deleted) return;
        
        // Handle AFK system
        await this._handleAfk(client, message);
    }
    
    /**
     * Handle auto-moderation
     * @param {Client} client 
     * @param {Message} message 
     * @returns {Object|null}
     */
    async _handleAutoMod(client, message) {
        try {
            return await AutoModHandler.handleMessage(client, message);
        } catch (error) {
            console.error('[AutoMod] Error:', error.message);
            return null;
        }
    }

    async _handleAfk(client, message) {
        try {
            // Try presentation layer first
            const afkCommand = require('../commands/general/afk');
            if (afkCommand?.onMessage) {
                await afkCommand.onMessage(message, client);
                return;
            }
        } catch {
            // Fallback to old location
            try {
                const afkCommand = client.commands?.get('afk');
                if (afkCommand?.onMessage) {
                    await afkCommand.onMessage(message, client);
                }
            } catch {
                // Silent fail for AFK
            }
        }
    }
}

module.exports = new MessageCreateEvent();



