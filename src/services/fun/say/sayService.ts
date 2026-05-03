/**
 * Say Service
 * Handles the say command functionality
 * @module services/fun/say/sayService
 */

import { EmbedBuilder, TextBasedChannel } from 'discord.js';
import { TYPE_COLORS, OWNER_ID } from '../../../config/say/index.js';
import type { SayType } from '../../../types/fun/say.js';
// SAY SERVICE CLASS
class SayService {
    /**
     * Sanitize message to prevent mass pings
     */
    sanitizeMessage(message: string): string {
        return message
            .replace(/@everyone/g, '[everyone]')
            .replace(/@here/g, '[here]');
    }

    /**
     * Build credit text for the message footer
     */
    buildCreditText(userId: string, userTag: string, showCredit: boolean): string {
        if (userId === OWNER_ID) {
            return showCredit ? `Requested by Owner (${userTag})` : '';
        }
        return `Requested by ${userTag}`;
    }

    /**
     * Build an embed for the say message
     */
    buildEmbed(message: string, type: SayType, creditText: string): EmbedBuilder {
        const embed = new EmbedBuilder()
            .setDescription(message)
            .setColor(TYPE_COLORS[type] ?? TYPE_COLORS.normal ?? 0x5865F2)
            .setTimestamp();

        if (creditText) {
            embed.setFooter({ text: creditText });
        }

        return embed;
    }

    /**
     * Build a plain text message with credit
     */
    buildPlainMessage(message: string, creditText: string): string {
        return message + (creditText ? `\n\n— ${creditText}` : '');
    }

    /**
     * Send a message to a channel
     */
    async sendMessage(
        channel: TextBasedChannel,
        _content: string,
        useEmbed: boolean,
        message: string,
        type: SayType,
        creditText: string
    ): Promise<unknown> {
        if (!('send' in channel)) {
            throw new Error('Channel does not support sending messages');
        }

        if (useEmbed) {
            const embed = this.buildEmbed(message, type, creditText);
            return await channel.send({ embeds: [embed] });
        } else {
            const plainMessage = this.buildPlainMessage(message, creditText);
            return await channel.send({ content: plainMessage });
        }
    }

    /**
     * Validate that a channel can receive messages
     */
    validateChannel(channel: TextBasedChannel): boolean {
        return channel.isTextBased();
    }
}

// Create singleton instance
const sayService = new SayService();

export { SayService };
export { type SayType };
export default sayService;


