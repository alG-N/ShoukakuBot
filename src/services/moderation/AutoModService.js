/**
 * Auto-Mod Service
 * Handles automatic moderation (spam, links, mentions, etc.)
 * @module services/moderation/AutoModService
 */

const AutoModRepository = require('../../repositories/moderation/AutoModRepository');
const FilterService = require('./FilterService');
const InfractionService = require('./InfractionService');
const automodConfig = require('../../config/features/moderation/automod');
const moderationConfig = require('../../config/features/moderation');
const logger = require('../../core/Logger');
const redisCache = require('../guild/RedisCache');

// Settings cache
const settingsCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get auto-mod settings for a guild (with caching)
 * @param {string} guildId - Guild ID
 * @returns {Promise<Object>} Settings
 */
async function getSettings(guildId) {
    const cached = settingsCache.get(guildId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.settings;
    }

    const settings = await AutoModRepository.getOrCreate(guildId);
    settingsCache.set(guildId, { settings, timestamp: Date.now() });
    return settings;
}

/**
 * Invalidate settings cache
 * @param {string} guildId - Guild ID
 */
function invalidateCache(guildId) {
    settingsCache.delete(guildId);
}

/**
 * Update auto-mod settings
 * @param {string} guildId - Guild ID
 * @param {Object} updates - Settings to update
 * @returns {Promise<Object>} Updated settings
 */
async function updateSettings(guildId, updates) {
    const settings = await AutoModRepository.update(guildId, updates);
    invalidateCache(guildId);
    return settings;
}

/**
 * Toggle a feature
 * @param {string} guildId - Guild ID
 * @param {string} feature - Feature name
 * @param {boolean} enabled - Enable or disable
 * @returns {Promise<Object>} Updated settings
 */
async function toggleFeature(guildId, feature, enabled) {
    const settings = await AutoModRepository.toggleFeature(guildId, feature, enabled);
    invalidateCache(guildId);
    return settings;
}

/**
 * Check if a member should bypass auto-mod
 * @param {Object} member - Guild member
 * @param {Object} settings - Auto-mod settings
 * @returns {boolean} Should bypass
 */
function shouldBypass(member, settings) {
    // Bots bypass
    if (member.user.bot) return true;

    // Server owner bypasses
    if (member.id === member.guild.ownerId) return true;

    // Admin permission bypasses
    if (member.permissions.has('Administrator')) return true;

    // Check ignored roles
    if (settings.ignored_roles?.length > 0) {
        const hasIgnoredRole = member.roles.cache.some(r => 
            settings.ignored_roles.includes(r.id)
        );
        if (hasIgnoredRole) return true;
    }

    return false;
}

/**
 * Check if channel should be ignored
 * @param {string} channelId - Channel ID
 * @param {Object} settings - Auto-mod settings
 * @returns {boolean} Should ignore
 */
function shouldIgnoreChannel(channelId, settings) {
    return settings.ignored_channels?.includes(channelId) || false;
}

/**
 * Process a message through auto-mod
 * @param {Object} message - Discord message
 * @returns {Promise<Object|null>} Violation result or null
 */
async function processMessage(message) {
    if (!message.guild) return null;
    if (message.author.bot) return null;

    try {
        const settings = await getSettings(message.guild.id);
        
        // Check if auto-mod is enabled
        if (!settings.enabled) return null;

        // Check bypass
        if (shouldBypass(message.member, settings)) return null;

        // Check ignored channel
        if (shouldIgnoreChannel(message.channelId, settings)) return null;

        // Run checks in order of severity
        const checks = [
            () => checkWordFilter(message, settings),
            () => checkInvites(message, settings),
            () => checkLinks(message, settings),
            () => checkSpam(message, settings),
            () => checkDuplicates(message, settings),
            () => checkMentions(message, settings),
            () => checkCaps(message, settings)
        ];

        for (const check of checks) {
            const result = await check();
            if (result) return result;
        }

        return null;

    } catch (error) {
        logger.error('AutoMod', `Error processing message: ${error.message}`);
        return null;
    }
}

/**
 * Check word filter
 * @param {Object} message - Discord message
 * @param {Object} settings - Auto-mod settings
 * @returns {Promise<Object|null>} Violation or null
 */
async function checkWordFilter(message, settings) {
    // Check if filter is enabled in automod settings
    if (!settings.filter_enabled) return null;
    
    const result = await FilterService.checkMessage(message.guild.id, message.content);
    
    if (result) {
        return {
            type: 'filter',
            trigger: `Matched filter: "${result.pattern}"`,
            action: result.action,
            severity: result.severity,
            details: result
        };
    }

    return null;
}

/**
 * Check for Discord invites
 * @param {Object} message - Discord message
 * @param {Object} settings - Auto-mod settings
 * @returns {Object|null} Violation or null
 */
function checkInvites(message, settings) {
    if (!settings.invites_enabled) return null;

    const invitePatterns = [
        /discord(?:\.gg|app\.com\/invite|\.com\/invite)\/[\w-]+/gi,
        /discordapp\.com\/invite\/[\w-]+/gi
    ];

    for (const pattern of invitePatterns) {
        if (pattern.test(message.content)) {
            // Check whitelist
            const matches = message.content.match(pattern);
            if (matches && settings.invites_whitelist?.length > 0) {
                // Would need to resolve invite to check - for now just trigger
            }

            return {
                type: 'invites',
                trigger: 'Discord invite link detected',
                action: settings.invites_action || 'delete_warn',
                severity: 3
            };
        }
    }

    return null;
}

/**
 * Check for links
 * @param {Object} message - Discord message
 * @param {Object} settings - Auto-mod settings
 * @returns {Object|null} Violation or null
 */
function checkLinks(message, settings) {
    if (!settings.links_enabled) return null;

    const urlPattern = /https?:\/\/[^\s]+/gi;
    const matches = message.content.match(urlPattern);

    if (!matches) return null;

    for (const url of matches) {
        try {
            const urlObj = new URL(url);
            const hostname = urlObj.hostname.toLowerCase();

            // Check whitelist
            if (settings.links_whitelist?.some(w => hostname.includes(w.toLowerCase()))) {
                continue;
            }

            // Check for media (if allowed)
            if (automodConfig.links.allowMedia) {
                const path = urlObj.pathname.toLowerCase();
                if (automodConfig.links.mediaExtensions.some(ext => path.endsWith(ext))) {
                    continue;
                }
            }

            // Check blacklist
            if (automodConfig.links.blacklist.some(b => hostname.includes(b.toLowerCase()))) {
                return {
                    type: 'links',
                    trigger: `Blacklisted link: ${hostname}`,
                    action: settings.links_action || 'delete_warn',
                    severity: 4
                };
            }

            // If whitelist mode, block all non-whitelisted
            if (automodConfig.links.whitelistMode) {
                return {
                    type: 'links',
                    trigger: 'Link not in whitelist',
                    action: settings.links_action || 'delete_warn',
                    severity: 2
                };
            }

        } catch {
            // Invalid URL, skip
        }
    }

    return null;
}

/**
 * Check for spam (uses Redis for distributed tracking)
 * @param {Object} message - Discord message
 * @param {Object} settings - Auto-mod settings
 * @returns {Promise<Object|null>} Violation or null
 */
async function checkSpam(message, settings) {
    if (!settings.spam_enabled) return null;

    const windowSeconds = Math.ceil((settings.spam_window_ms || 5000) / 1000);
    const threshold = settings.spam_threshold || 5;

    // Use Redis for distributed tracking
    const count = await redisCache.trackSpamMessage(
        message.guild.id,
        message.author.id,
        windowSeconds
    );

    if (count >= threshold) {
        // Reset tracker after violation
        await redisCache.resetSpamTracker(message.guild.id, message.author.id);
        
        return {
            type: 'spam',
            trigger: `${threshold}+ messages in ${windowSeconds}s`,
            action: settings.spam_action || 'delete_warn',
            severity: 3,
            muteDuration: settings.spam_mute_duration_ms
        };
    }

    return null;
}

/**
 * Check for duplicate messages (uses Redis for distributed tracking)
 * @param {Object} message - Discord message
 * @param {Object} settings - Auto-mod settings
 * @returns {Promise<Object|null>} Violation or null
 */
async function checkDuplicates(message, settings) {
    if (!settings.duplicate_enabled) return null;

    const windowSeconds = Math.ceil((settings.duplicate_window_ms || 30000) / 1000);
    const threshold = settings.duplicate_threshold || 3;
    const content = message.content.toLowerCase().trim();

    if (content.length < 5) return null; // Too short to be meaningful spam

    // Use Redis for distributed tracking
    const { count } = await redisCache.trackDuplicateMessage(
        message.guild.id,
        message.author.id,
        content,
        windowSeconds
    );

    if (count >= threshold) {
        // Reset tracker after violation
        await redisCache.resetDuplicateTracker(message.guild.id, message.author.id);
        
        return {
            type: 'duplicate',
            trigger: `Same message sent ${threshold}+ times`,
            action: settings.duplicate_action || 'delete_warn',
            severity: 2
        };
    }

    return null;
}

/**
 * Check for mention spam
 * @param {Object} message - Discord message
 * @param {Object} settings - Auto-mod settings
 * @returns {Object|null} Violation or null
 */
function checkMentions(message, settings) {
    if (!settings.mention_enabled) return null;

    const limit = settings.mention_limit || 5;
    const userMentions = message.mentions.users.size;
    const roleMentions = message.mentions.roles.size;
    const everyoneMention = message.mentions.everyone ? 1 : 0;

    const totalMentions = userMentions + roleMentions + everyoneMention;

    if (totalMentions > limit) {
        return {
            type: 'mentions',
            trigger: `${totalMentions} mentions (limit: ${limit})`,
            action: settings.mention_action || 'delete_warn',
            severity: 3
        };
    }

    return null;
}

/**
 * Check for caps spam
 * @param {Object} message - Discord message
 * @param {Object} settings - Auto-mod settings
 * @returns {Object|null} Violation or null
 */
function checkCaps(message, settings) {
    if (!settings.caps_enabled) return null;

    const minLength = settings.caps_min_length || 10;
    const percent = settings.caps_percent || 70;

    // Remove emojis and non-letters for caps check
    let text = message.content.replace(/<a?:[^:]+:\d+>/g, ''); // Custom emojis
    text = text.replace(/[\p{Emoji}]/gu, ''); // Unicode emojis
    
    const letters = text.match(/[a-zA-Z]/g);
    if (!letters || letters.length < minLength) return null;

    const capsCount = letters.filter(c => c === c.toUpperCase()).length;
    const capsPercent = (capsCount / letters.length) * 100;

    if (capsPercent >= percent) {
        return {
            type: 'caps',
            trigger: `${Math.round(capsPercent)}% caps (limit: ${percent}%)`,
            action: settings.caps_action || 'delete',
            severity: 1
        };
    }

    return null;
}

/**
 * Execute auto-mod action
 * @param {Object} message - Discord message
 * @param {Object} violation - Violation details
 * @returns {Promise<Object>} Action result
 */
async function executeAction(message, violation) {
    const results = {
        deleted: false,
        warned: false,
        muted: false,
        error: null
    };

    try {
        const action = violation.action || 'delete';

        // Delete message
        if (action.includes('delete')) {
            try {
                await message.delete();
                results.deleted = true;
            } catch (e) {
                logger.warn('[AutoModService] Could not delete message:', e.message);
            }
        }

        // Warn user (soft warn - internal tracking)
        if (action.includes('warn')) {
            const warnResult = await trackAutomodWarn(message, violation);
            results.warned = true;
            results.warnCount = warnResult.count;
            results.warnThreshold = warnResult.threshold;
            results.escalated = warnResult.escalated;
        }

        // Mute user
        if (action === 'mute' && violation.muteDuration) {
            try {
                await message.member.timeout(
                    violation.muteDuration,
                    `[Auto-Mod] ${violation.trigger}`
                );
                results.muted = true;
            } catch (e) {
                logger.warn('[AutoModService] Could not mute member:', e.message);
            }
        }

        // Log to infraction system
        await InfractionService.logAutoMod(
            message.guild,
            message.author,
            violation.trigger,
            action,
            {
                channelId: message.channelId,
                messageContent: message.content.slice(0, 100),
                type: violation.type
            }
        );

    } catch (error) {
        logger.error('[AutoModService] Error executing action:', error);
        results.error = error.message;
    }

    return results;
}

/**
 * Track auto-mod warnings and escalate if needed (uses Redis for distributed tracking)
 * @param {Object} message - Discord message
 * @param {Object} violation - Violation details
 * @returns {Promise<Object>} Warn result with count and threshold
 */
async function trackAutomodWarn(message, violation) {
    const guild = message.guild;
    const member = message.member;
    
    // Get settings from database
    const settings = await getSettings(guild.id);
    const maxWarns = settings.warn_threshold || 3;
    const resetHours = settings.warn_reset_hours || 1;
    const warnAction = settings.warn_action || 'mute';
    const muteDurationMinutes = settings.mute_duration || 10;

    // Use Redis for distributed tracking
    const warnCount = await redisCache.trackAutomodWarn(guild.id, member.id, resetHours);

    // Log the warning count
    logger.info('[AutoModService]', `${member.user.tag} has ${warnCount}/${maxWarns} auto-mod warnings`);

    const result = {
        count: warnCount,
        threshold: maxWarns,
        escalated: false
    };

    // Send simple warning message to user (auto-delete after 10s)
    try {
        const warningText = warnCount >= maxWarns
            ? `⚠️ <@${member.id}> **Violation:** ${violation.trigger} | **Warnings:** ${warnCount}/${maxWarns} | 🚨 Threshold reached! You will be ${warnAction === 'mute' ? `muted for ${muteDurationMinutes} minutes` : 'kicked'}.`
            : `⚠️ <@${member.id}> **Violation:** ${violation.trigger} | **Warnings:** ${warnCount}/${maxWarns} | ${maxWarns - warnCount} more violation(s) will result in a ${warnAction}.`;

        const warningMsg = await message.channel.send(warningText);

        // Auto-delete after 10 seconds
        setTimeout(() => {
            warningMsg.delete().catch(() => {});
        }, 10000);
    } catch (e) {
        logger.debug('[AutoModService] Could not send warning message:', e.message);
    }

    // Escalate when threshold reached
    if (warnCount >= maxWarns) {
        const muteDuration = muteDurationMinutes * 60 * 1000;
        result.escalated = true;
        
        try {
            if (warnAction === 'mute') {
                await member.timeout(muteDuration, `[Auto-Mod] ${maxWarns} violations in ${resetHours}h`);
                
                await InfractionService.logMute(
                    guild,
                    member.user,
                    { id: guild.client.user.id, tag: 'Auto-Mod' },
                    `Auto-escalation: ${warnCount} violations`,
                    muteDuration
                );
                
                logger.info('[AutoModService]', `Muted ${member.user.tag} for ${muteDurationMinutes} minutes (${warnCount} violations)`);
            } else if (warnAction === 'kick') {
                await member.kick(`[Auto-Mod] ${maxWarns} violations in ${resetHours}h`);
                
                await InfractionService.logKick(
                    guild,
                    member.user,
                    { id: guild.client.user.id, tag: 'Auto-Mod' },
                    `Auto-escalation: ${warnCount} violations`
                );
                
                logger.info('[AutoModService]', `Kicked ${member.user.tag} (${warnCount} violations)`);
            }
            
            // Reset warning count in Redis after escalation
            await redisCache.resetAutomodWarn(guild.id, member.id);
        } catch (e) {
            logger.warn('[AutoModService] Could not escalate:', e.message);
        }
    }

    return result;
}

/**
 * Add ignored channel
 * @param {string} guildId - Guild ID
 * @param {string} channelId - Channel ID
 */
async function addIgnoredChannel(guildId, channelId) {
    await AutoModRepository.addIgnoredChannel(guildId, channelId);
    invalidateCache(guildId);
}

/**
 * Remove ignored channel
 * @param {string} guildId - Guild ID
 * @param {string} channelId - Channel ID
 */
async function removeIgnoredChannel(guildId, channelId) {
    await AutoModRepository.removeIgnoredChannel(guildId, channelId);
    invalidateCache(guildId);
}

/**
 * Add ignored role
 * @param {string} guildId - Guild ID
 * @param {string} roleId - Role ID
 */
async function addIgnoredRole(guildId, roleId) {
    await AutoModRepository.addIgnoredRole(guildId, roleId);
    invalidateCache(guildId);
}

/**
 * Remove ignored role
 * @param {string} guildId - Guild ID
 * @param {string} roleId - Role ID
 */
async function removeIgnoredRole(guildId, roleId) {
    await AutoModRepository.removeIgnoredRole(guildId, roleId);
    invalidateCache(guildId);
}

module.exports = {
    getSettings,
    updateSettings,
    toggleFeature,
    invalidateCache,
    processMessage,
    executeAction,
    shouldBypass,
    shouldIgnoreChannel,
    addIgnoredChannel,
    removeIgnoredChannel,
    addIgnoredRole,
    removeIgnoredRole,
    
    // Individual checks (for testing)
    checkWordFilter,
    checkInvites,
    checkLinks,
    checkSpam,
    checkDuplicates,
    checkMentions,
    checkCaps
};
