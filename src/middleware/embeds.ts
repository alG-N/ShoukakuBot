/**
 * Embed Helpers Middleware
 * Reusable embed constructors for common UI patterns
 * @module middleware/embeds
 */

import { EmbedBuilder } from 'discord.js';
import { COLORS, EMOJIS } from '../constants.js';

/**
 * Create error embed
 */
export function createErrorEmbed(title: string, description: string): EmbedBuilder {
    return new EmbedBuilder()
        .setColor(COLORS.ERROR)
        .setTitle(`${(EMOJIS as any)?.ERROR || '\u274C'} ${title}`)
        .setDescription(description);
}

/**
 * Create warning embed
 */
export function createWarningEmbed(title: string, description: string): EmbedBuilder {
    return new EmbedBuilder()
        .setColor(COLORS.WARNING)
        .setTitle(`${(EMOJIS as any)?.WARNING || '\u26A0\uFE0F'} ${title}`)
        .setDescription(description);
}

/**
 * Create success embed
 */
export function createSuccessEmbed(title: string, description: string): EmbedBuilder {
    return new EmbedBuilder()
        .setColor(COLORS.SUCCESS)
        .setTitle(`${(EMOJIS as any)?.SUCCESS || '\u2705'} ${title}`)
        .setDescription(description);
}

/**
 * Create info embed
 */
export function createInfoEmbed(title: string, description: string): EmbedBuilder {
    return new EmbedBuilder()
        .setColor((COLORS as any).INFO || COLORS.PRIMARY)
        .setTitle(`${(EMOJIS as any)?.INFO || '\u2139\uFE0F'} ${title}`)
        .setDescription(description);
}

/**
 * Create cooldown embed
 */
export function createCooldownEmbed(remainingSeconds: number): EmbedBuilder {
    return new EmbedBuilder()
        .setColor(COLORS.WARNING)
        .setTitle('\u23F3 Cooldown Active')
        .setDescription(`Please wait **${remainingSeconds} seconds** before using this command again.`)
        .setFooter({ text: 'This helps prevent server overload' });
}
