/**
 * Message Create Event - Presentation Layer
 * Handles AFK mentions, auto-moderation, and other message-based features
 * @module presentation/events/messageCreate
 */

import { Events, Client, Message } from 'discord.js';
import { BaseEvent } from './BaseEvent.js';
import { handleAutoModMessage } from '../handlers/moderation/index.js';
import { handleAfkMessage } from '../handlers/general/index.js';
// TYPES
interface AutoModResult {
    deleted?: boolean;
}
// MESSAGE CREATE EVENT
class MessageCreateEvent extends BaseEvent {
    constructor() {
        super({
            name: Events.MessageCreate,
            once: false
        });
    }

    async execute(client: Client, message: Message): Promise<void> {
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
     */
    private async _handleAutoMod(client: Client, message: Message): Promise<AutoModResult | null> {
        try {
            const result = await handleAutoModMessage(client, message);
            if (typeof result === 'boolean') {
                return result ? { deleted: true } : null;
            }
            return result as AutoModResult | null;
        } catch (error: unknown) {
            const err = error as { message?: string };
            console.error('[AutoMod] Error:', err.message);
            return null;
        }
    }

    /**
     * Handle AFK system
     */
    private async _handleAfk(_client: Client, message: Message): Promise<void> {
        try {
            await handleAfkMessage(message, message.client);
        } catch {
            // Silent fail for AFK
        }
    }
}

export default new MessageCreateEvent();
