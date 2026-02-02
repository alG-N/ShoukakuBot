/**
 * Infraction Service
 * Handles creation and management of mod cases/infractions
 * @module services/moderation/InfractionService
 */

const { EmbedBuilder } = require('discord.js');
const InfractionRepository = require('../../repositories/moderation/InfractionRepository');
const ModLogService = require('./ModLogService');
const moderationConfig = require('../../config/features/moderation');
const db = require('../../database');

const { INFRACTION_TYPES, COLORS, EMOJIS } = moderationConfig;

/**
 * Create a new infraction (case)
 * @param {Object} options - Infraction options
 * @param {Object} options.guild - Discord guild
 * @param {Object} options.user - Target user
 * @param {Object} options.moderator - Moderator user
 * @param {string} options.type - Infraction type
 * @param {string} options.reason - Reason
 * @param {number} [options.durationMs] - Duration for timed punishments
 * @param {number} [options.expiryDays] - Days until warning expires
 * @param {Object} [options.metadata] - Additional data
 * @returns {Promise<Object>} Created infraction with case details
 */
async function createInfraction(options) {
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
    
    // Calculate expiry for warnings
    let expiresAt = null;
    if (type === INFRACTION_TYPES.WARN && expiryDays) {
        expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);
    } else if (durationMs && type === INFRACTION_TYPES.MUTE) {
        // For mutes, track when the mute expires
        expiresAt = new Date(Date.now() + durationMs);
    }
    
    // Create infraction in database
    const infraction = await InfractionRepository.create({
        guildId: guild.id,
        userId: user.id,
        moderatorId: moderator.id,
        type,
        reason: reason || moderationConfig.punishments.defaultReasons[type] || 'No reason provided',
        durationMs,
        expiresAt,
        metadata: {
            ...metadata,
            userTag: user.tag || user.username,
            moderatorTag: moderator.tag || moderator.username
        }
    });
    
    // Log to mod log channel
    await ModLogService.logInfraction(guild, infraction, user, moderator);
    
    return infraction;
}

/**
 * Create a warning
 * @param {Object} guild - Discord guild
 * @param {Object} user - Target user
 * @param {Object} moderator - Moderator user
 * @param {string} reason - Warning reason
 * @param {Object} [options] - Additional options
 * @returns {Promise<Object>} Created warning with count
 */
async function createWarning(guild, user, moderator, reason, options = {}) {
    const expiryDays = options.expiryDays || moderationConfig.punishments.warnings.defaultExpiryDays;
    
    const infraction = await createInfraction({
        guild,
        user,
        moderator,
        type: INFRACTION_TYPES.WARN,
        reason,
        expiryDays,
        metadata: options.metadata || {}
    });
    
    // Get current warning count
    const warnCount = await InfractionRepository.countActiveWarnings(guild.id, user.id);
    
    // Check for escalation thresholds
    const escalation = await checkEscalation(guild, user, warnCount);
    
    return {
        infraction,
        warnCount,
        escalation
    };
}

/**
 * Log a mute action
 * @param {Object} guild - Discord guild
 * @param {Object} user - Target user
 * @param {Object} moderator - Moderator user
 * @param {string} reason - Reason
 * @param {number} durationMs - Mute duration
 * @returns {Promise<Object>} Created infraction
 */
async function logMute(guild, user, moderator, reason, durationMs) {
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
 * @param {Object} guild - Discord guild
 * @param {Object} user - Target user
 * @param {Object} moderator - Moderator user
 * @param {string} reason - Reason
 * @returns {Promise<Object>} Created infraction
 */
async function logUnmute(guild, user, moderator, reason) {
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
 * @param {Object} guild - Discord guild
 * @param {Object} user - Target user
 * @param {Object} moderator - Moderator user
 * @param {string} reason - Reason
 * @returns {Promise<Object>} Created infraction
 */
async function logKick(guild, user, moderator, reason) {
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
 * @param {Object} guild - Discord guild
 * @param {Object} user - Target user
 * @param {Object} moderator - Moderator user
 * @param {string} reason - Reason
 * @param {Object} [metadata] - Additional data (delete days, etc.)
 * @returns {Promise<Object>} Created infraction
 */
async function logBan(guild, user, moderator, reason, metadata = {}) {
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
 * @param {Object} guild - Discord guild
 * @param {Object} user - Target user
 * @param {Object} moderator - Moderator user
 * @param {string} reason - Reason
 * @returns {Promise<Object>} Created infraction
 */
async function logUnban(guild, user, moderator, reason) {
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
 * @param {Object} guild - Discord guild
 * @param {Object} user - Target user
 * @param {string} trigger - What triggered auto-mod
 * @param {string} action - Action taken
 * @param {Object} [metadata] - Additional data
 * @returns {Promise<Object>} Created infraction
 */
async function logAutoMod(guild, user, trigger, action, metadata = {}) {
    return createInfraction({
        guild,
        user,
        moderator: { id: guild.client.user.id, tag: 'Auto-Mod', username: 'Auto-Mod' },
        type: INFRACTION_TYPES.AUTOMOD,
        reason: `[Auto-Mod] ${trigger}: ${action}`,
        metadata: {
            ...metadata,
            trigger,
            action
        }
    });
}

/**
 * Log a filter trigger
 * @param {Object} guild - Discord guild
 * @param {Object} user - Target user
 * @param {string} pattern - Matched pattern
 * @param {string} action - Action taken
 * @param {Object} [metadata] - Additional data
 * @returns {Promise<Object>} Created infraction
 */
async function logFilter(guild, user, pattern, action, metadata = {}) {
    return createInfraction({
        guild,
        user,
        moderator: { id: guild.client.user.id, tag: 'Word Filter', username: 'Word Filter' },
        type: INFRACTION_TYPES.FILTER,
        reason: `[Filter] Matched: "${pattern}" - Action: ${action}`,
        metadata: {
            ...metadata,
            pattern,
            action
        }
    });
}

/**
 * Get infraction by case ID
 * @param {string} guildId - Guild ID
 * @param {number} caseId - Case ID
 * @returns {Promise<Object|null>} Infraction
 */
async function getCase(guildId, caseId) {
    return InfractionRepository.getByCaseId(guildId, caseId);
}

/**
 * Get user's infractions
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @param {Object} [options] - Query options
 * @returns {Promise<Object[]>} List of infractions
 */
async function getUserHistory(guildId, userId, options = {}) {
    return InfractionRepository.getByUser(guildId, userId, options);
}

/**
 * Get active warning count
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @returns {Promise<number>} Warning count
 */
async function getWarningCount(guildId, userId) {
    return InfractionRepository.countActiveWarnings(guildId, userId);
}

/**
 * Clear all warnings for a user
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @returns {Promise<number>} Number of warnings cleared
 */
async function clearWarnings(guildId, userId) {
    return InfractionRepository.clearWarnings(guildId, userId);
}

/**
 * Update a case reason
 * @param {string} guildId - Guild ID
 * @param {number} caseId - Case ID
 * @param {string} newReason - New reason
 * @returns {Promise<Object|null>} Updated infraction
 */
async function updateReason(guildId, caseId, newReason) {
    return InfractionRepository.update(guildId, caseId, { reason: newReason });
}

/**
 * Delete (deactivate) a case
 * @param {string} guildId - Guild ID
 * @param {number} caseId - Case ID
 * @returns {Promise<boolean>} Success
 */
async function deleteCase(guildId, caseId) {
    return InfractionRepository.deactivate(guildId, caseId);
}

/**
 * Check if warning count triggers escalation
 * @param {Object} guild - Discord guild
 * @param {Object} user - User
 * @param {number} warnCount - Current warning count
 * @returns {Promise<Object|null>} Escalation action or null
 */
async function checkEscalation(guild, user, warnCount) {
    // Get thresholds from database
    const result = await db.query(
        'SELECT * FROM warn_thresholds WHERE guild_id = $1 ORDER BY warn_count ASC',
        [guild.id]
    );
    
    let thresholds = result.rows;
    
    // If no custom thresholds, use defaults
    if (thresholds.length === 0) {
        thresholds = moderationConfig.punishments.defaultThresholds.map(t => ({
            warn_count: t.warnCount,
            action: t.action,
            duration_ms: t.durationMs,
            reason: t.reason
        }));
    }
    
    // Find matching threshold (exact match)
    const threshold = thresholds.find(t => t.warn_count === warnCount);
    
    if (!threshold) return null;
    
    return {
        action: threshold.action,
        durationMs: threshold.duration_ms,
        reason: threshold.reason || `Automatic ${threshold.action}: ${warnCount} warnings reached`
    };
}

/**
 * Get recent cases for a guild
 * @param {string} guildId - Guild ID
 * @param {number} limit - Max results
 * @returns {Promise<Object[]>} List of infractions
 */
async function getRecentCases(guildId, limit = 20) {
    return InfractionRepository.getRecent(guildId, limit);
}

/**
 * Get guild statistics
 * @param {string} guildId - Guild ID
 * @returns {Promise<Object>} Statistics
 */
async function getStats(guildId) {
    return InfractionRepository.getStats(guildId);
}

/**
 * Build an embed for displaying a case
 * @param {Object} infraction - Infraction data
 * @param {Object} [user] - User object (for avatar)
 * @returns {EmbedBuilder} Case embed
 */
function buildCaseEmbed(infraction, user = null) {
    const type = infraction.type.toUpperCase();
    const color = COLORS[type] || COLORS.DEFAULT;
    const emoji = EMOJIS[type] || EMOJIS.CASE;
    
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
        const { formatDuration } = require('../../utils/common/time');
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
 * Expire old infractions (cron job)
 * @returns {Promise<number>} Number of expired
 */
async function expireOldInfractions() {
    return InfractionRepository.expireOld();
}

module.exports = {
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
    
    // Re-export types for convenience
    INFRACTION_TYPES,
    COLORS,
    EMOJIS
};
