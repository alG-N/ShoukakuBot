/**
 * Moderation Service
 * Handles kick, mute, and ban operations with logging
 * @module services/moderation/ModerationService
 */

const { EmbedBuilder } = require('discord.js');
const GuildSettingsService = require('../guild/GuildSettingsService');
const { formatDuration } = require('../../utils/common/time');

// Configuration
const CONFIG = {
    COLORS: {
        SUCCESS: 0x00FF00,
        ERROR: 0xFF0000,
        WARNING: 0xFFAA00,
        MODERATION: 0xFF5555
    },
    DEFAULT_REASONS: {
        KICK: 'No reason provided',
        MUTE: 'No reason provided',
        BAN: 'No reason provided'
    },
    LOG_ACTIONS: {
        KICK: 'KICK',
        MUTE: 'MUTE',
        UNMUTE: 'UNMUTE',
        BAN: 'BAN',
        UNBAN: 'UNBAN',
        DELETE: 'DELETE'
    },
    MAX_MUTE_DURATION_MS: 28 * 24 * 60 * 60 * 1000, // 28 days
    DURATION_PRESETS: {
        '1m': 60 * 1000,
        '5m': 5 * 60 * 1000,
        '10m': 10 * 60 * 1000,
        '30m': 30 * 60 * 1000,
        '1h': 60 * 60 * 1000,
        '6h': 6 * 60 * 60 * 1000,
        '12h': 12 * 60 * 60 * 1000,
        '1d': 24 * 60 * 60 * 1000,
        '7d': 7 * 24 * 60 * 60 * 1000,
        '14d': 14 * 24 * 60 * 60 * 1000,
        '28d': 28 * 24 * 60 * 60 * 1000
    }
};

// ============================================================================
// MODERATION ACTIONS
// ============================================================================

/**
 * Kick a user from the server
 */
async function kickUser(target, moderator, reason = CONFIG.DEFAULT_REASONS.KICK) {
    try {
        if (!target.kickable) {
            return { success: false, error: 'I cannot kick this user. They may have higher permissions than me.' };
        }

        if (target.roles.highest.position >= moderator.roles.highest.position && 
            moderator.id !== moderator.guild.ownerId) {
            return { success: false, error: 'You cannot kick someone with equal or higher role than you.' };
        }

        // Try to DM the user
        try {
            const dmEmbed = new EmbedBuilder()
                .setColor(CONFIG.COLORS.MODERATION)
                .setTitle('🚪 You have been kicked')
                .setDescription(`You have been kicked from **${target.guild.name}**`)
                .addFields(
                    { name: 'Reason', value: reason },
                    { name: 'Moderator', value: moderator.user.tag }
                )
                .setTimestamp();
            await target.send({ embeds: [dmEmbed] });
        } catch {}

        await target.kick(reason);
        await logModAction(target.guild, { type: CONFIG.LOG_ACTIONS.KICK, target, moderator, reason });

        return { success: true, message: `Successfully kicked ${target.user.tag}` };
    } catch (error) {
        console.error('[ModerationService] Kick error:', error);
        return { success: false, error: `Failed to kick user: ${error.message}` };
    }
}

/**
 * Mute (timeout) a user
 */
async function muteUser(target, moderator, durationMs, reason = CONFIG.DEFAULT_REASONS.MUTE) {
    try {
        if (!target.moderatable) {
            return { success: false, error: 'I cannot mute this user. They may have higher permissions than me.' };
        }

        if (target.roles.highest.position >= moderator.roles.highest.position && 
            moderator.id !== moderator.guild.ownerId) {
            return { success: false, error: 'You cannot mute someone with equal or higher role than you.' };
        }

        // Discord timeout max is 28 days (2419200000 ms)
        // But we need to account for timezone issues, so use 27 days 23 hours to be safe
        const MAX_SAFE_TIMEOUT = 27 * 24 * 60 * 60 * 1000 + 23 * 60 * 60 * 1000; // 27d 23h
        const clampedDuration = Math.min(durationMs, MAX_SAFE_TIMEOUT);
        
        // If user requested longer than max, notify
        const wasClampedMessage = durationMs > MAX_SAFE_TIMEOUT 
            ? ` (clamped from ${formatDuration(durationMs)} to ${formatDuration(clampedDuration)})`
            : '';

        try {
            const dmEmbed = new EmbedBuilder()
                .setColor(CONFIG.COLORS.MODERATION)
                .setTitle('🔇 You have been muted')
                .setDescription(`You have been muted in **${target.guild.name}**`)
                .addFields(
                    { name: 'Duration', value: formatDuration(clampedDuration) },
                    { name: 'Reason', value: reason },
                    { name: 'Moderator', value: moderator.user.tag }
                )
                .setTimestamp();
            await target.send({ embeds: [dmEmbed] });
        } catch {}

        await target.timeout(clampedDuration, reason);
        await logModAction(target.guild, { type: CONFIG.LOG_ACTIONS.MUTE, target, moderator, reason, duration: clampedDuration });

        return { success: true, message: `Successfully muted ${target.user.tag} for ${formatDuration(clampedDuration)}${wasClampedMessage}` };
    } catch (error) {
        console.error('[ModerationService] Mute error:', error);
        return { success: false, error: `Failed to mute user: ${error.message}` };
    }
}

/**
 * Unmute a user
 */
async function unmuteUser(target, moderator, reason = 'Unmuted by moderator') {
    try {
        if (!target.isCommunicationDisabled()) {
            return { success: false, error: 'This user is not muted.' };
        }

        await target.timeout(null, reason);
        await logModAction(target.guild, { type: CONFIG.LOG_ACTIONS.UNMUTE, target, moderator, reason });

        return { success: true, message: `Successfully unmuted ${target.user.tag}` };
    } catch (error) {
        console.error('[ModerationService] Unmute error:', error);
        return { success: false, error: `Failed to unmute user: ${error.message}` };
    }
}

/**
 * Ban a user from the server
 */
async function banUser(target, moderator, reason = CONFIG.DEFAULT_REASONS.BAN, deleteMessageDays = 0) {
    try {
        const guild = moderator.guild;
        const isMember = target.roles !== undefined;
        
        if (isMember) {
            if (!target.bannable) {
                return { success: false, error: 'I cannot ban this user. They may have higher permissions than me.' };
            }

            if (target.roles.highest.position >= moderator.roles.highest.position && 
                moderator.id !== guild.ownerId) {
                return { success: false, error: 'You cannot ban someone with equal or higher role than you.' };
            }

            try {
                const dmEmbed = new EmbedBuilder()
                    .setColor(CONFIG.COLORS.MODERATION)
                    .setTitle('🔨 You have been banned')
                    .setDescription(`You have been banned from **${guild.name}**`)
                    .addFields(
                        { name: 'Reason', value: reason },
                        { name: 'Moderator', value: moderator.user.tag }
                    )
                    .setTimestamp();
                await target.send({ embeds: [dmEmbed] });
            } catch {}
        }

        const userId = isMember ? target.id : target.id;
        await guild.members.ban(userId, {
            reason: reason,
            deleteMessageSeconds: deleteMessageDays * 24 * 60 * 60
        });

        await logModAction(guild, {
            type: CONFIG.LOG_ACTIONS.BAN,
            target: isMember ? target : { user: target, id: target.id },
            moderator,
            reason,
            deleteMessageDays
        });

        const targetTag = isMember ? target.user.tag : target.tag;
        return { success: true, message: `Successfully banned ${targetTag}` };
    } catch (error) {
        console.error('[ModerationService] Ban error:', error);
        return { success: false, error: `Failed to ban user: ${error.message}` };
    }
}

/**
 * Unban a user from the server
 */
async function unbanUser(guild, userId, moderator, reason = 'Unbanned by moderator') {
    try {
        try {
            await guild.bans.fetch(userId);
        } catch {
            return { success: false, error: 'This user is not banned.' };
        }

        await guild.members.unban(userId, reason);
        await logModAction(guild, { type: CONFIG.LOG_ACTIONS.UNBAN, target: { id: userId }, moderator, reason });

        return { success: true, message: `Successfully unbanned user ID: ${userId}` };
    } catch (error) {
        console.error('[ModerationService] Unban error:', error);
        return { success: false, error: `Failed to unban user: ${error.message}` };
    }
}

// ============================================================================
// LOGGING
// ============================================================================

/**
 * Log a moderation action to the guild's log channel
 */
async function logModAction(guild, action) {
    try {
        const logChannelId = await GuildSettingsService.getLogChannel(guild.id);
        if (!logChannelId) return;

        const logChannel = guild.channels.cache.get(logChannelId);
        if (!logChannel) return;

        const embed = createLogEmbed(action);
        await logChannel.send({ embeds: [embed] });
    } catch (error) {
        console.error('[ModerationService] Logging error:', error);
    }
}

/**
 * Create a log embed for a moderation action
 */
function createLogEmbed(action) {
    const embed = new EmbedBuilder()
        .setColor(CONFIG.COLORS.MODERATION)
        .setTimestamp();

    const targetUser = action.target?.user || action.target;
    const targetTag = targetUser?.tag || `ID: ${action.target?.id || 'Unknown'}`;
    const targetId = action.target?.id || 'Unknown';

    switch (action.type) {
        case CONFIG.LOG_ACTIONS.KICK:
            embed.setTitle('👢 Member Kicked')
                .setDescription(`**${targetTag}** was kicked from the server`)
                .addFields(
                    { name: 'User ID', value: targetId, inline: true },
                    { name: 'Moderator', value: action.moderator.user.tag, inline: true },
                    { name: 'Reason', value: action.reason }
                );
            break;

        case CONFIG.LOG_ACTIONS.MUTE:
            embed.setTitle('🔇 Member Muted')
                .setDescription(`**${targetTag}** was muted`)
                .addFields(
                    { name: 'User ID', value: targetId, inline: true },
                    { name: 'Moderator', value: action.moderator.user.tag, inline: true },
                    { name: 'Duration', value: formatDuration(action.duration), inline: true },
                    { name: 'Reason', value: action.reason }
                );
            break;

        case CONFIG.LOG_ACTIONS.UNMUTE:
            embed.setTitle('🔊 Member Unmuted')
                .setColor(CONFIG.COLORS.SUCCESS)
                .setDescription(`**${targetTag}** was unmuted`)
                .addFields(
                    { name: 'User ID', value: targetId, inline: true },
                    { name: 'Moderator', value: action.moderator.user.tag, inline: true },
                    { name: 'Reason', value: action.reason }
                );
            break;

        case CONFIG.LOG_ACTIONS.BAN:
            embed.setTitle('🔨 Member Banned')
                .setDescription(`**${targetTag}** was banned from the server`)
                .addFields(
                    { name: 'User ID', value: targetId, inline: true },
                    { name: 'Moderator', value: action.moderator.user.tag, inline: true },
                    { name: 'Reason', value: action.reason }
                );
            if (action.deleteMessageDays > 0) {
                embed.addFields({ name: 'Messages Deleted', value: `${action.deleteMessageDays} day(s)`, inline: true });
            }
            break;

        case CONFIG.LOG_ACTIONS.UNBAN:
            embed.setTitle('🔓 Member Unbanned')
                .setColor(CONFIG.COLORS.SUCCESS)
                .setDescription(`User ID **${targetId}** was unbanned`)
                .addFields(
                    { name: 'Moderator', value: action.moderator.user.tag, inline: true },
                    { name: 'Reason', value: action.reason }
                );
            break;

        case CONFIG.LOG_ACTIONS.DELETE:
            embed.setTitle('🗑️ Messages Deleted')
                .setColor(CONFIG.COLORS.WARNING)
                .setDescription(`${action.count} message(s) deleted in ${action.channel}`)
                .addFields(
                    { name: 'Moderator', value: action.moderator?.tag || 'Unknown', inline: true },
                    { name: 'Count', value: String(action.count), inline: true }
                );
            if (action.filters) {
                embed.addFields({ name: 'Filters', value: action.filters, inline: false });
            }
            break;

        default:
            embed.setTitle('📋 Moderation Action')
                .setDescription(`Action: ${action.type}`)
                .addFields({ name: 'Details', value: JSON.stringify(action, null, 2).slice(0, 1000) });
    }

    if (targetUser?.displayAvatarURL) {
        embed.setThumbnail(targetUser.displayAvatarURL({ dynamic: true }));
    }

    return embed;
}

// ============================================================================
// UTILITY
// ============================================================================

/**
 * Parse duration string into milliseconds
 */
function parseDuration(durationStr) {
    if (!durationStr) return null;

    const preset = CONFIG.DURATION_PRESETS[durationStr.toLowerCase()];
    if (preset) return preset;

    const match = durationStr.match(/^(\d+)(s|m|h|d|w)?$/i);
    if (!match) return null;

    const value = parseInt(match[1]);
    const unit = (match[2] || 'm').toLowerCase();

    const multipliers = {
        's': 1000,
        'm': 60 * 1000,
        'h': 60 * 60 * 1000,
        'd': 24 * 60 * 60 * 1000,
        'w': 7 * 24 * 60 * 60 * 1000
    };

    return value * (multipliers[unit] || multipliers['m']);
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    CONFIG,
    kickUser,
    muteUser,
    unmuteUser,
    banUser,
    unbanUser,
    logModAction,
    createLogEmbed,
    parseDuration,
    formatDuration
};
