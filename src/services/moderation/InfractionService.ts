/**
 * Infraction Service
 * Handles creation and management of mod cases/infractions
 * @module services/moderation/InfractionService
 */

import { EmbedBuilder, type Guild, type User, type Snowflake } from 'discord.js';
import * as ModLogService from './ModLogService.js';
import { formatDuration } from '../../utils/common/time.js';
import InfractionRepository from '../../repositories/moderation/InfractionRepository.js';
import moderationConfig from '../../config/features/moderation/index.js';
import db from '../../database/index.js';
// TYPES
export interface Infraction {
    id: number;
    case_id: number;
    guild_id: Snowflake;
    user_id: Snowflake;
    moderator_id: Snowflake;
    type: string;
    reason: string;
    duration_ms?: number;
    expires_at?: Date;
    active: boolean;
    created_at: Date;
    metadata?: Record<string, unknown>;
}

interface CreateInfractionOptions {
    guild: Guild;
    user: User | { id: string; tag?: string; username?: string };
    moderator: User | { id: string; tag?: string; username?: string };
    type: string;
    reason: string;
    durationMs?: number;
    expiryDays?: number;
    metadata?: Record<string, unknown>;
}

interface EscalationResult {
    action: string;
    durationMs?: number;
    reason: string;
}

// Re-export config values
export const INFRACTION_TYPES = moderationConfig.INFRACTION_TYPES as Record<string, string>;
export const COLORS = moderationConfig.COLORS as Record<string, number>;
export const EMOJIS = moderationConfig.EMOJIS as Record<string, string>;
// CORE FUNCTIONS
/**
 * Create a new infraction (case)
 */
export async function createInfraction(options: CreateInfractionOptions): Promise<Infraction> {
    const {
        guild,
        user,
        moderator,
        type,
        reason,
        durationMs,
        expiryDays,
        metadata = {}
    } = options;

    let expiresAt: Date | undefined;
    if (type === INFRACTION_TYPES.WARN && expiryDays) {
        expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);
    } else if (durationMs && type === INFRACTION_TYPES.MUTE) {
        expiresAt = new Date(Date.now() + durationMs);
    }

    const infraction = await InfractionRepository.create({
        guildId: guild.id,
        userId: user.id,
        moderatorId: moderator.id,
        type: type as any,
        reason: reason || (moderationConfig.punishments?.defaultReasons as Record<string, string> | undefined)?.[type] || 'No reason provided',
        durationMs,
        expiresAt,
        metadata: {
            ...metadata,
            userTag: ('tag' in user ? user.tag : user.username) || 'Unknown',
            moderatorTag: ('tag' in moderator ? moderator.tag : moderator.username) || 'Unknown'
        }
    }) as Infraction;

    await ModLogService.logInfraction(guild, infraction, user as User, moderator as User);

    return infraction;
}

/**
 * Create a warning
 */
export async function createWarning(
    guild: Guild,
    user: User,
    moderator: User,
    reason: string,
    options: { expiryDays?: number; metadata?: Record<string, unknown> } = {}
): Promise<{ infraction: Infraction; warnCount: number; escalation: EscalationResult | null }> {
    const expiryDays = options.expiryDays || moderationConfig.punishments?.warnings?.defaultExpiryDays || 7;

    const infraction = await createInfraction({
        guild,
        user,
        moderator,
        type: INFRACTION_TYPES.WARN,
        reason,
        expiryDays,
        metadata: options.metadata || {}
    });

    const warnCount = await InfractionRepository.countActiveWarnings(guild.id, user.id);
    const escalation = await checkEscalation(guild, user, warnCount);

    return { infraction, warnCount, escalation };
}

/**
 * Log a mute action
 */
export async function logMute(
    guild: Guild,
    user: User | { id: string; tag?: string },
    moderator: User | { id: string; tag?: string },
    reason: string,
    durationMs: number
): Promise<Infraction> {
    return createInfraction({
        guild,
        user,
        moderator,
        type: INFRACTION_TYPES.MUTE,
        reason,
        durationMs
    });
}

/**
 * Log an unmute action
 */
export async function logUnmute(
    guild: Guild,
    user: User,
    moderator: User,
    reason: string
): Promise<Infraction> {
    return createInfraction({
        guild,
        user,
        moderator,
        type: INFRACTION_TYPES.UNMUTE,
        reason
    });
}

/**
 * Log a kick action
 */
export async function logKick(
    guild: Guild,
    user: User | { id: string; tag?: string },
    moderator: User | { id: string; tag?: string },
    reason: string
): Promise<Infraction> {
    return createInfraction({
        guild,
        user,
        moderator,
        type: INFRACTION_TYPES.KICK,
        reason
    });
}

/**
 * Log a ban action
 */
export async function logBan(
    guild: Guild,
    user: User,
    moderator: User,
    reason: string,
    metadata: Record<string, unknown> = {}
): Promise<Infraction> {
    return createInfraction({
        guild,
        user,
        moderator,
        type: INFRACTION_TYPES.BAN,
        reason,
        metadata
    });
}

/**
 * Log an unban action
 */
export async function logUnban(
    guild: Guild,
    user: User,
    moderator: User,
    reason: string
): Promise<Infraction> {
    return createInfraction({
        guild,
        user,
        moderator,
        type: INFRACTION_TYPES.UNBAN,
        reason
    });
}

/**
 * Log an auto-mod action
 */
export async function logAutoMod(
    guild: Guild,
    user: User,
    trigger: string,
    action: string,
    metadata: Record<string, unknown> = {}
): Promise<Infraction> {
    return createInfraction({
        guild,
        user,
        moderator: { id: guild.client.user!.id, tag: 'Auto-Mod', username: 'Auto-Mod' },
        type: INFRACTION_TYPES.AUTOMOD,
        reason: `[Auto-Mod] ${trigger}: ${action}`,
        metadata: { ...metadata, trigger, action }
    });
}

/**
 * Log a filter trigger
 */
export async function logFilter(
    guild: Guild,
    user: User,
    pattern: string,
    action: string,
    metadata: Record<string, unknown> = {}
): Promise<Infraction> {
    return createInfraction({
        guild,
        user,
        moderator: { id: guild.client.user!.id, tag: 'Word Filter', username: 'Word Filter' },
        type: INFRACTION_TYPES.FILTER,
        reason: `[Filter] Matched: "${pattern}" - Action: ${action}`,
        metadata: { ...metadata, pattern, action }
    });
}
// QUERY FUNCTIONS
/**
 * Get infraction by case ID
 */
export async function getCase(guildId: string, caseId: number): Promise<Infraction | null> {
    return InfractionRepository.getByCaseId(guildId, caseId) as Promise<Infraction | null>;
}

/**
 * Get user's infractions
 */
export async function getUserHistory(
    guildId: string,
    userId: string,
    options: { limit?: number; type?: string } = {}
): Promise<Infraction[]> {
    return InfractionRepository.getByUser(guildId, userId) as Promise<Infraction[]>;
}

/**
 * Get active warning count
 */
export async function getWarningCount(guildId: string, userId: string): Promise<number> {
    return InfractionRepository.countActiveWarnings(guildId, userId);
}

/**
 * Clear all warnings for a user
 */
export async function clearWarnings(guildId: string, userId: string): Promise<number> {
    const result = await db.query(
        'UPDATE mod_cases SET active = FALSE WHERE guild_id = $1 AND user_id = $2 AND type = $3 AND active = TRUE',
        [guildId, userId, INFRACTION_TYPES.WARN]
    );
    return (result as { rowCount?: number }).rowCount || 0;
}

/**
 * Update a case reason
 */
export async function updateReason(
    guildId: string,
    caseId: number,
    newReason: string
): Promise<Infraction | null> {
    return InfractionRepository.update(guildId, caseId, { reason: newReason }) as Promise<Infraction | null>;
}

/**
 * Delete (deactivate) a case
 */
export async function deleteCase(guildId: string, caseId: number): Promise<boolean> {
    const result = await InfractionRepository.deactivate(guildId, caseId);
    return !!result;
}

/**
 * Check if warning count triggers escalation
 */
export async function checkEscalation(
    guild: Guild,
    _user: User,
    warnCount: number
): Promise<EscalationResult | null> {
    const result = await db.query(
        'SELECT * FROM warn_thresholds WHERE guild_id = $1 ORDER BY warn_count ASC',
        [guild.id]
    );

    interface ThresholdRow {
        warn_count: number;
        action: string;
        duration_ms?: number;
        reason?: string;
    }

    let thresholds = result.rows as unknown as ThresholdRow[];

    if (thresholds.length === 0) {
        // Use default thresholds from warnings escalation config
        const defaultThresholds = (moderationConfig.punishments as any)?.defaultThresholds || [];
        thresholds = defaultThresholds.map((t: { warnCount: number; action: string; durationMs?: number }) => ({
            warn_count: t.warnCount,
            action: t.action,
            duration_ms: t.durationMs,
            reason: undefined
        }));
    }

    const threshold = thresholds.find((t: ThresholdRow) => t.warn_count === warnCount);

    if (!threshold) return null;

    return {
        action: threshold.action,
        durationMs: threshold.duration_ms,
        reason: threshold.reason || `Automatic ${threshold.action}: ${warnCount} warnings reached`
    };
}

/**
 * Get recent cases for a guild
 */
export async function getRecentCases(guildId: string, limit: number = 20): Promise<Infraction[]> {
    return InfractionRepository.getRecent(guildId, limit) as Promise<Infraction[]>;
}

/**
 * Get guild statistics
 */
export async function getStats(guildId: string): Promise<Record<string, number>> {
    return InfractionRepository.getStats(guildId) as unknown as Promise<Record<string, number>>;
}

/**
 * Build an embed for displaying a case
 */
export function buildCaseEmbed(infraction: Infraction, user: User | null = null): EmbedBuilder {
    const type = infraction.type.toUpperCase();
    const color = (COLORS as Record<string, number>)[type] || COLORS.DEFAULT;
    const emoji = (EMOJIS as Record<string, string>)[type] || EMOJIS.CASE;

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`${emoji} Case #${infraction.case_id}`)
        .addFields(
            { name: 'Type', value: type, inline: true },
            { name: 'User', value: `<@${infraction.user_id}>`, inline: true },
            { name: 'Moderator', value: `<@${infraction.moderator_id}>`, inline: true },
            { name: 'Reason', value: infraction.reason || 'No reason provided' }
        )
        .setTimestamp(new Date(infraction.created_at));

    if (infraction.duration_ms) {
        embed.addFields({ name: 'Duration', value: formatDuration(infraction.duration_ms), inline: true });
    }

    if (infraction.expires_at) {
        embed.addFields({
            name: 'Expires',
            value: `<t:${Math.floor(new Date(infraction.expires_at).getTime() / 1000)}:R>`,
            inline: true
        });
    }

    if (!infraction.active) {
        embed.setFooter({ text: '⚠️ This case has been deactivated' });
    }

    if (user?.displayAvatarURL) {
        embed.setThumbnail(user.displayAvatarURL());
    }

    return embed;
}

/**
 * Expire old infractions
 */
export async function expireOldInfractions(): Promise<number> {
    return InfractionRepository.expireOld();
}
// EXPORTS
export default {
    createInfraction,
    createWarning,
    logMute,
    logUnmute,
    logKick,
    logBan,
    logUnban,
    logAutoMod,
    logFilter,
    getCase,
    getUserHistory,
    getWarningCount,
    clearWarnings,
    updateReason,
    deleteCase,
    checkEscalation,
    getRecentCases,
    getStats,
    buildCaseEmbed,
    expireOldInfractions,
    INFRACTION_TYPES,
    COLORS,
    EMOJIS
};
