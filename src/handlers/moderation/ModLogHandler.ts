/**
 * Mod Log Handler
 * Formats and sends mod log messages
 * @module handlers/moderation/ModLogHandler
 */

import { 
    EmbedBuilder, 
    AuditLogEvent, 
    Message, 
    GuildMember,
    User,
    TextBasedChannel,
    SendableChannels,
    Guild,
    APIEmbed,
    PartialUser
} from 'discord.js';
import { logger } from '../../core/Logger.js';
import { formatDuration } from '../../utils/common/time.js';
import ModLogService from '../../services/moderation/ModLogService.js';
/**
 * Moderation action types
 */
export type ModActionType = 'warn' | 'mute' | 'kick' | 'ban' | 'unmute' | 'unban';

/**
 * Quick embed options
 */
export interface QuickEmbedOptions {
    type: ModActionType;
    user: User | GuildMember | { id: string; displayAvatarURL?: () => string };
    moderator: User | GuildMember | { id: string };
    reason?: string;
    duration?: number;
    caseId?: number | string;
    color?: number;
}

/**
 * Type colors mapping
 */
export const TYPE_COLORS: Record<ModActionType, number> = {
    warn: 0xFFCC00,
    mute: 0xFF9900,
    kick: 0xFF6600,
    ban: 0xFF0000,
    unmute: 0x00CC00,
    unban: 0x00FF00
};

/**
 * Type emojis mapping
 */
export const TYPE_EMOJIS: Record<ModActionType, string> = {
    warn: '⚠️',
    mute: '🔇',
    kick: '👢',
    ban: '🔨',
    unmute: '🔊',
    unban: '🔓'
};
/**
 * Handle message delete event for logging
 * @param message - Deleted message
 */
export async function handleMessageDelete(message: Message): Promise<void> {
    if (!message.guild) return;
    if (message.partial) return; // Can't log partial messages
    if (message.author?.bot) return;
    
    try {
        // Try to get executor from audit log
        let executor: User | null = null;
        
        const auditLogs = await message.guild.fetchAuditLogs({
            type: AuditLogEvent.MessageDelete,
            limit: 1
        }).catch(() => null);
        
        if (auditLogs?.entries.first()) {
            const entry = auditLogs.entries.first()!;
            // Check if this is the right message (within 5 seconds)
            if (Date.now() - entry.createdTimestamp < 5000 &&
                entry.target?.id === message.author.id) {
                executor = entry.executor as User | null;
            }
        }
        
        await ModLogService.logMessageDelete(message.guild, message, executor);
        
    } catch (error: unknown) {
        logger.error('[ModLogHandler] Error handling message delete:', String(error));
    }
}

/**
 * Handle message update event for logging
 * @param oldMessage - Old message
 * @param newMessage - New message
 */
export async function handleMessageUpdate(
    oldMessage: Message, 
    newMessage: Message
): Promise<void> {
    if (!newMessage.guild) return;
    if (oldMessage.partial || newMessage.partial) return;
    if (newMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return;
    
    try {
        await ModLogService.logMessageEdit(newMessage.guild, oldMessage, newMessage);
    } catch (error: unknown) {
        logger.error('[ModLogHandler] Error handling message update:', String(error));
    }
}

/**
 * Handle member join event for logging
 * @param member - Guild member
 */
export async function handleMemberJoin(member: GuildMember): Promise<void> {
    try {
        await ModLogService.logMemberJoin(member);
    } catch (error: unknown) {
        logger.error('[ModLogHandler] Error handling member join:', String(error));
    }
}

/**
 * Handle member leave event for logging
 * @param member - Guild member
 */
export async function handleMemberLeave(member: GuildMember): Promise<void> {
    try {
        await ModLogService.logMemberLeave(member);
    } catch (error: unknown) {
        logger.error('[ModLogHandler] Error handling member leave:', String(error));
    }
}

// formatDuration imported from utils/common/time.ts (canonical source)

/**
 * Build a quick mod action embed
 * @param options - Embed options
 * @returns Embed builder
 */
export function buildQuickEmbed(options: QuickEmbedOptions): EmbedBuilder {
    const { 
        type, 
        user, 
        moderator, 
        reason, 
        duration, 
        caseId,
        color 
    } = options;
    
    const typeColor = TYPE_COLORS[type] || 0x5865F2;
    const typeEmoji = TYPE_EMOJIS[type] || '📋';
    const capitalizedType = type.charAt(0).toUpperCase() + type.slice(1);
    
    const authorName = `${typeEmoji} ${capitalizedType}${caseId ? ` | Case #${caseId}` : ''}`;
    const avatarUrl = 'displayAvatarURL' in user && typeof user.displayAvatarURL === 'function' 
        ? user.displayAvatarURL() 
        : undefined;
    
    const embed = new EmbedBuilder()
        .setColor(color || typeColor)
        .setAuthor({
            name: authorName,
            iconURL: avatarUrl
        })
        .addFields(
            { name: 'User', value: `<@${user.id}>`, inline: true },
            { name: 'Moderator', value: `<@${moderator.id}>`, inline: true }
        )
        .setTimestamp();
    
    if (duration) {
        embed.addFields({ name: 'Duration', value: formatDuration(duration), inline: true });
    }
    
    if (reason) {
        embed.addFields({ name: 'Reason', value: reason, inline: false });
    }
    
    return embed;
}

/**
 * Send a confirmation embed to a channel
 * @param channel - Text channel
 * @param options - Embed options
 * @returns Sent message
 */
export async function sendConfirmation(
    channel: SendableChannels, 
    options: QuickEmbedOptions
): Promise<Message> {
    const embed = buildQuickEmbed(options);
    return channel.send({ embeds: [embed] });
}

// Default export for backward compatibility
export default {
    handleMessageDelete,
    handleMessageUpdate,
    handleMemberJoin,
    handleMemberLeave,
    buildQuickEmbed,
    sendConfirmation,
    formatDuration
};
