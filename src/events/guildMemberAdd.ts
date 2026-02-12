/**
 * Guild Member Add Event - Presentation Layer
 * Handles new member joins for anti-raid and mod logging
 * @module presentation/events/guildMemberAdd
 */

import { Events, Client, GuildMember } from 'discord.js';
import { BaseEvent } from './BaseEvent.js';
import { handleMemberJoin, handleAntiRaid } from '../handlers/moderation/index.js';
import { logger } from '../core/Logger.js';

// GUILD MEMBER ADD EVENT
class GuildMemberAddEvent extends BaseEvent {
    constructor() {
        super({
            name: Events.GuildMemberAdd,
            once: false
        });
    }

    async execute(client: Client, member: GuildMember): Promise<void> {
        // Handle anti-raid tracking (delegated to handler)
        await handleAntiRaid(client, member);
        
        // Log member join
        await this._handleModLog(client, member);
    }
    
    /**
     * Handle mod log for member join
     */
    private async _handleModLog(_client: Client, member: GuildMember): Promise<void> {
        try {
            await handleMemberJoin(member);
        } catch (error: unknown) {
            logger.error('GuildMemberAdd', `Mod log (join) error: ${(error as Error).message}`);
        }
    }
}

export default new GuildMemberAddEvent();
