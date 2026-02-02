/**
 * Mod Log Handler
 * Formats and sends mod log messages
 * @module handlers/moderation/ModLogHandler
 */

const { EmbedBuilder, AuditLogEvent } = require('discord.js');
const ModLogService = require('../../services/moderation/ModLogService');
const logger = require('../../core/Logger');

/**
 * Handle message delete event for logging
 * @param {Object} message - Deleted message
 */
async function handleMessageDelete(message) {
    if (!message.guild) return;
    if (message.partial) return; // Can't log partial messages
    if (message.author?.bot) return;
    
    try {
        // Try to get executor from audit log
        let executor = null;
        
        const auditLogs = await message.guild.fetchAuditLogs({
            type: AuditLogEvent.MessageDelete,
            limit: 1
        }).catch(() => null);
        
        if (auditLogs?.entries.first()) {
            const entry = auditLogs.entries.first();
            // Check if this is the right message (within 5 seconds)
            if (Date.now() - entry.createdTimestamp < 5000 &&
                entry.target.id === message.author.id) {
                executor = entry.executor;
            }
        }
        
        await ModLogService.logMessageDelete(message.guild, message, executor);
        
    } catch (error) {
        logger.error('[ModLogHandler] Error handling message delete:', error);
    }
}

/**
 * Handle message update event for logging
 * @param {Object} oldMessage - Old message
 * @param {Object} newMessage - New message
 */
async function handleMessageUpdate(oldMessage, newMessage) {
    if (!newMessage.guild) return;
    if (oldMessage.partial || newMessage.partial) return;
    if (newMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return;
    
    try {
        await ModLogService.logMessageEdit(newMessage.guild, oldMessage, newMessage);
    } catch (error) {
        logger.error('[ModLogHandler] Error handling message update:', error);
    }
}

/**
 * Handle member join event for logging
 * @param {Object} member - Guild member
 */
async function handleMemberJoin(member) {
    try {
        await ModLogService.logMemberJoin(member);
    } catch (error) {
        logger.error('[ModLogHandler] Error handling member join:', error);
    }
}

/**
 * Handle member leave event for logging
 * @param {Object} member - Guild member
 */
async function handleMemberLeave(member) {
    try {
        await ModLogService.logMemberLeave(member);
    } catch (error) {
        logger.error('[ModLogHandler] Error handling member leave:', error);
    }
}

/**
 * Format duration for display
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration
 */
function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

/**
 * Build a quick mod action embed
 * @param {Object} options - Embed options
 * @returns {EmbedBuilder} Embed
 */
function buildQuickEmbed(options) {
    const { 
        type, 
        user, 
        moderator, 
        reason, 
        duration, 
        caseId,
        color 
    } = options;
    
    const typeColors = {
        warn: 0xFFCC00,
        mute: 0xFF9900,
        kick: 0xFF6600,
        ban: 0xFF0000,
        unmute: 0x00CC00,
        unban: 0x00FF00
    };
    
    const typeEmojis = {
        warn: '⚠️',
        mute: '🔇',
        kick: '👢',
        ban: '🔨',
        unmute: '🔊',
        unban: '🔓'
    };
    
    const embed = new EmbedBuilder()
        .setColor(color || typeColors[type] || 0x5865F2)
        .setAuthor({
            name: `${typeEmojis[type] || '📋'} ${type.charAt(0).toUpperCase() + type.slice(1)}${caseId ? ` | Case #${caseId}` : ''}`,
            iconURL: user.displayAvatarURL?.()
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
 * @param {Object} channel - Text channel
 * @param {Object} options - Embed options
 */
async function sendConfirmation(channel, options) {
    const embed = buildQuickEmbed(options);
    return channel.send({ embeds: [embed] });
}

module.exports = {
    handleMessageDelete,
    handleMessageUpdate,
    handleMemberJoin,
    handleMemberLeave,
    buildQuickEmbed,
    sendConfirmation,
    formatDuration
};
