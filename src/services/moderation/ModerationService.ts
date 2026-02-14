/**
 * Moderation Service
 * Handles kick, mute, and ban operations with logging
 * @module services/moderation/ModerationService
 */

import { EmbedBuilder, type Guild, type GuildMember, type User } from 'discord.js';
import GuildSettingsService from '../guild/GuildSettingsService.js';
import { formatDuration } from '../../utils/common/time.js';
import { Result } from '../../core/Result.js';
import { ErrorCodes } from '../../core/ErrorCodes.js';
import logger from '../../core/Logger.js';
// TYPES
interface ModAction {
    type: string;
    target: GuildMember | User | { user?: User; id: string };
    moderator: GuildMember;
    reason: string;
    duration?: number;
    deleteMessageDays?: number;
    count?: number;
    channel?: string;
    filters?: string;
}

interface ModerationConfig {
    COLORS: {
        SUCCESS: number;
        ERROR: number;
        WARNING: number;
        MODERATION: number;
    };
    DEFAULT_REASONS: {
        KICK: string;
        MUTE: string;
        BAN: string;
    };
    LOG_ACTIONS: {
        KICK: string;
        MUTE: string;
        UNMUTE: string;
        BAN: string;
        UNBAN: string;
        DELETE: string;
    };
    MAX_MUTE_DURATION_MS: number;
    DURATION_PRESETS: Record<string, number>;
}
// CONFIG
export const CONFIG: ModerationConfig = {
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
// MODERATION ACTIONS
/**
 * Kick a user from the server
 */
export async function kickUser(
    target: GuildMember,
    moderator: GuildMember,
    reason: string = CONFIG.DEFAULT_REASONS.KICK
): Promise<Result<{ userId: string; userTag: string; action: string }>> {
    try {
        if (!target.kickable) {
            return Result.err(ErrorCodes.CANNOT_KICK, 'Cannot kick this user. They may have higher permissions than the bot.');
        }

        if (target.roles.highest.position >= moderator.roles.highest.position &&
            moderator.id !== moderator.guild.ownerId) {
            return Result.err(ErrorCodes.USER_HIGHER_ROLE, 'You cannot kick someone with equal or higher role than you.');
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
        } catch { /* DM failed, continue */ }

        await target.kick(reason);
        await logModAction(target.guild, { type: CONFIG.LOG_ACTIONS.KICK, target, moderator, reason });

        return Result.ok({ userId: target.id, userTag: target.user.tag, action: 'kick' });
    } catch (error) {
        logger.error('ModerationService', `Kick error: ${(error as Error).message}`);
        return Result.fromError(error as Error, ErrorCodes.CANNOT_KICK);
    }
}

/**
 * Mute (timeout) a user
 */
export async function muteUser(
    target: GuildMember,
    moderator: GuildMember,
    durationMs: number,
    reason: string = CONFIG.DEFAULT_REASONS.MUTE
): Promise<Result<{ userId: string; userTag: string; action: string; duration: number; wasClamped: boolean }>> {
    try {
        if (!target.moderatable) {
            return Result.err(ErrorCodes.CANNOT_MUTE, 'Cannot mute this user. They may have higher permissions than the bot.');
        }

        if (target.roles.highest.position >= moderator.roles.highest.position &&
            moderator.id !== moderator.guild.ownerId) {
            return Result.err(ErrorCodes.USER_HIGHER_ROLE, 'You cannot mute someone with equal or higher role than you.');
        }

        // Discord timeout max is 28 days, use 27d 23h to be safe
        const MAX_SAFE_TIMEOUT = 27 * 24 * 60 * 60 * 1000 + 23 * 60 * 60 * 1000;
        const clampedDuration = Math.min(durationMs, MAX_SAFE_TIMEOUT);

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
        } catch { /* DM failed, continue */ }

        await target.timeout(clampedDuration, reason);
        await logModAction(target.guild, { type: CONFIG.LOG_ACTIONS.MUTE, target, moderator, reason, duration: clampedDuration });

        return Result.ok({
            userId: target.id,
            userTag: target.user.tag,
            action: 'mute',
            duration: clampedDuration,
            wasClamped: durationMs > MAX_SAFE_TIMEOUT
        });
    } catch (error) {
        logger.error('ModerationService', `Mute error: ${(error as Error).message}`);
        return Result.fromError(error as Error, ErrorCodes.CANNOT_MUTE);
    }
}

/**
 * Unmute a user
 */
export async function unmuteUser(
    target: GuildMember,
    moderator: GuildMember,
    reason: string = 'Unmuted by moderator'
): Promise<Result<{ userId: string; userTag: string; action: string }>> {
    try {
        if (!target.isCommunicationDisabled()) {
            return Result.err(ErrorCodes.USER_NOT_MUTED, 'This user is not muted.');
        }

        await target.timeout(null, reason);
        await logModAction(target.guild, { type: CONFIG.LOG_ACTIONS.UNMUTE, target, moderator, reason });

        return Result.ok({ userId: target.id, userTag: target.user.tag, action: 'unmute' });
    } catch (error) {
        logger.error('ModerationService', `Unmute error: ${(error as Error).message}`);
        return Result.fromError(error as Error, ErrorCodes.CANNOT_MUTE);
    }
}

/**
 * Ban a user from the server
 */
export async function banUser(
    target: GuildMember | User,
    moderator: GuildMember,
    reason: string = CONFIG.DEFAULT_REASONS.BAN,
    deleteMessageDays: number = 0
): Promise<Result<{ userId: string; userTag: string | undefined; action: string; deleteMessageDays: number }>> {
    try {
        const guild = moderator.guild;
        const isMember = 'roles' in target;

        if (isMember) {
            const member = target as GuildMember;
            if (!member.bannable) {
                return Result.err(ErrorCodes.CANNOT_BAN, 'Cannot ban this user. They may have higher permissions than the bot.');
            }

            if (member.roles.highest.position >= moderator.roles.highest.position &&
                moderator.id !== guild.ownerId) {
                return Result.err(ErrorCodes.USER_HIGHER_ROLE, 'You cannot ban someone with equal or higher role than you.');
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
                await member.send({ embeds: [dmEmbed] });
            } catch { /* DM failed, continue */ }
        }

        const userId = target.id;
        await guild.members.ban(userId, {
            reason,
            deleteMessageSeconds: deleteMessageDays * 24 * 60 * 60
        });

        await logModAction(guild, {
            type: CONFIG.LOG_ACTIONS.BAN,
            target: isMember ? target as GuildMember : { user: target as User, id: target.id },
            moderator,
            reason,
            deleteMessageDays
        });

        const targetTag = isMember ? (target as GuildMember).user.tag : (target as User).tag;
        return Result.ok({ userId: target.id, userTag: targetTag, action: 'ban', deleteMessageDays });
    } catch (error) {
        logger.error('ModerationService', `Ban error: ${(error as Error).message}`);
        return Result.fromError(error as Error, ErrorCodes.CANNOT_BAN);
    }
}

/**
 * Unban a user from the server
 */
export async function unbanUser(
    guild: Guild,
    userId: string,
    moderator: GuildMember,
    reason: string = 'Unbanned by moderator'
): Promise<Result<{ userId: string; action: string }>> {
    try {
        try {
            await guild.bans.fetch(userId);
        } catch {
            return Result.err(ErrorCodes.USER_NOT_BANNED, 'This user is not banned.');
        }

        await guild.members.unban(userId, reason);
        await logModAction(guild, { type: CONFIG.LOG_ACTIONS.UNBAN, target: { id: userId }, moderator, reason });

        return Result.ok({ userId, action: 'unban' });
    } catch (error) {
        logger.error('ModerationService', `Unban error: ${(error as Error).message}`);
        return Result.fromError(error as Error, ErrorCodes.CANNOT_BAN);
    }
}
// LOGGING
/**
 * Log a moderation action to the guild's log channel
 */
export async function logModAction(guild: Guild, action: ModAction): Promise<void> {
    try {
        const logChannelId = await GuildSettingsService.getLogChannel(guild.id);
        if (!logChannelId) return;

        const logChannel = guild.channels.cache.get(logChannelId);
        if (!logChannel || !('send' in logChannel)) return;

        const embed = createLogEmbed(action);
        await logChannel.send({ embeds: [embed] });
    } catch (error) {
        logger.error('ModerationService', `Logging error: ${(error as Error).message}`);
    }
}

/**
 * Create a log embed for a moderation action
 */
export function createLogEmbed(action: ModAction): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setColor(CONFIG.COLORS.MODERATION)
        .setTimestamp();

    const target = action.target as GuildMember | { user?: User; id: string };
    const targetUser = 'user' in target ? target.user : (target as unknown as User);
    const targetTag = targetUser?.tag || `ID: ${target?.id || 'Unknown'}`;
    const targetId = target?.id || 'Unknown';

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
                    { name: 'Duration', value: formatDuration(action.duration || 0), inline: true },
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
            if (action.deleteMessageDays && action.deleteMessageDays > 0) {
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
                    { name: 'Moderator', value: action.moderator?.user?.tag || 'Unknown', inline: true },
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

    if (targetUser && 'displayAvatarURL' in targetUser) {
        embed.setThumbnail(targetUser.displayAvatarURL());
    }

    return embed;
}
// UTILITY
/**
 * Parse duration string into milliseconds
 */
export function parseDuration(durationStr: string | null | undefined): number | null {
    if (!durationStr) return null;

    const preset = CONFIG.DURATION_PRESETS[durationStr.toLowerCase()];
    if (preset) return preset;

    const match = durationStr.match(/^(\d+)(s|m|h|d|w)?$/i);
    if (!match || !match[1]) return null;

    const value = parseInt(match[1], 10);
    const unit = (match[2] ?? 'm').toLowerCase();

    const multipliers: Record<string, number> = {
        's': 1000,
        'm': 60 * 1000,
        'h': 60 * 60 * 1000,
        'd': 24 * 60 * 60 * 1000,
        'w': 7 * 24 * 60 * 60 * 1000
    };

    return value * (multipliers[unit] ?? multipliers['m']!);
}
// EXPORTS
export { formatDuration };

export default {
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
