"use strict";
/**
 * Auto-Mod Service
 * Handles automatic moderation (spam, links, mentions, etc.)
 * @module services/moderation/AutoModService
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSettings = getSettings;
exports.invalidateCache = invalidateCache;
exports.updateSettings = updateSettings;
exports.toggleFeature = toggleFeature;
exports.shouldBypass = shouldBypass;
exports.shouldIgnoreChannel = shouldIgnoreChannel;
exports.processMessage = processMessage;
exports.checkWordFilter = checkWordFilter;
exports.checkInvites = checkInvites;
exports.checkLinks = checkLinks;
exports.checkSpam = checkSpam;
exports.checkDuplicates = checkDuplicates;
exports.checkMentions = checkMentions;
exports.checkCaps = checkCaps;
exports.executeAction = executeAction;
exports.addIgnoredChannel = addIgnoredChannel;
exports.removeIgnoredChannel = removeIgnoredChannel;
exports.addIgnoredRole = addIgnoredRole;
exports.removeIgnoredRole = removeIgnoredRole;
const FilterService = __importStar(require("./FilterService.js"));
const InfractionService = __importStar(require("./InfractionService.js"));
const Logger_js_1 = __importDefault(require("../../core/Logger.js"));
const RedisCache_js_1 = __importDefault(require("../guild/RedisCache.js"));
// Use require for CommonJS modules
const AutoModRepository = require('../../repositories/moderation/AutoModRepository.js');
const automodConfigModule = require('../../config/features/moderation/automod.js');
// Handle both ESM default export and direct export
const automodConfig = automodConfigModule.default || automodConfigModule;
// CACHE
const settingsCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
// SETTINGS MANAGEMENT
/**
 * Get auto-mod settings for a guild (with caching)
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
 */
function invalidateCache(guildId) {
    settingsCache.delete(guildId);
}
/**
 * Update auto-mod settings
 */
async function updateSettings(guildId, updates) {
    const settings = await AutoModRepository.update(guildId, updates);
    invalidateCache(guildId);
    return settings;
}
/**
 * Toggle a feature
 */
async function toggleFeature(guildId, feature, enabled) {
    const settings = await AutoModRepository.toggleFeature(guildId, feature, enabled);
    invalidateCache(guildId);
    return settings;
}
// BYPASS CHECKS
/**
 * Check if a member should bypass auto-mod
 */
function shouldBypass(member, settings) {
    if (member.user.bot)
        return true;
    if (member.id === member.guild.ownerId)
        return true;
    if (member.permissions.has('Administrator'))
        return true;
    if (settings.ignored_roles?.length > 0) {
        const hasIgnoredRole = member.roles.cache.some(r => settings.ignored_roles.includes(r.id));
        if (hasIgnoredRole)
            return true;
    }
    return false;
}
/**
 * Check if channel should be ignored
 */
function shouldIgnoreChannel(channelId, settings) {
    return settings.ignored_channels?.includes(channelId) || false;
}
// MESSAGE PROCESSING
/**
 * Process a message through auto-mod
 */
async function processMessage(message) {
    if (!message.guild)
        return null;
    if (message.author.bot)
        return null;
    try {
        const settings = await getSettings(message.guild.id);
        if (!settings.enabled)
            return null;
        if (!message.member || shouldBypass(message.member, settings))
            return null;
        if (shouldIgnoreChannel(message.channelId, settings))
            return null;
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
            if (result)
                return result;
        }
        return null;
    }
    catch (error) {
        Logger_js_1.default.error('AutoMod', `Error processing message: ${error.message}`);
        return null;
    }
}
// INDIVIDUAL CHECKS
/**
 * Check word filter
 */
async function checkWordFilter(message, settings) {
    if (!settings.filter_enabled)
        return null;
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
 */
function checkInvites(message, settings) {
    if (!settings.invites_enabled)
        return null;
    const invitePatterns = [
        /discord(?:\.gg|app\.com\/invite|\.com\/invite)\/[\w-]+/gi,
        /discordapp\.com\/invite\/[\w-]+/gi
    ];
    for (const pattern of invitePatterns) {
        if (pattern.test(message.content)) {
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
 */
function checkLinks(message, settings) {
    if (!settings.links_enabled)
        return null;
    const urlPattern = /https?:\/\/[^\s]+/gi;
    const matches = message.content.match(urlPattern);
    if (!matches)
        return null;
    for (const url of matches) {
        try {
            const urlObj = new URL(url);
            const hostname = urlObj.hostname.toLowerCase();
            // Check whitelist
            if (settings.links_whitelist?.some(w => hostname.includes(w.toLowerCase()))) {
                continue;
            }
            // Check for media
            if (automodConfig.links?.allowMedia) {
                const path = urlObj.pathname.toLowerCase();
                if (automodConfig.links.mediaExtensions?.some(ext => path.endsWith(ext))) {
                    continue;
                }
            }
            // Check blacklist
            if (automodConfig.links?.blacklist?.some(b => hostname.includes(b.toLowerCase()))) {
                return {
                    type: 'links',
                    trigger: `Blacklisted link: ${hostname}`,
                    action: settings.links_action || 'delete_warn',
                    severity: 4
                };
            }
            // Whitelist mode
            if (automodConfig.links?.whitelistMode) {
                return {
                    type: 'links',
                    trigger: 'Link not in whitelist',
                    action: settings.links_action || 'delete_warn',
                    severity: 2
                };
            }
        }
        catch {
            // Invalid URL, skip
        }
    }
    return null;
}
/**
 * Check for spam
 */
async function checkSpam(message, settings) {
    if (!settings.spam_enabled)
        return null;
    const windowSeconds = Math.ceil((settings.spam_window_ms || 5000) / 1000);
    const threshold = settings.spam_threshold || 5;
    const count = await RedisCache_js_1.default.trackSpamMessage(message.guild.id, message.author.id, windowSeconds);
    if (count >= threshold) {
        await RedisCache_js_1.default.resetSpamTracker(message.guild.id, message.author.id);
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
 * Check for duplicate messages
 */
async function checkDuplicates(message, settings) {
    if (!settings.duplicate_enabled)
        return null;
    const windowSeconds = Math.ceil((settings.duplicate_window_ms || 30000) / 1000);
    const threshold = settings.duplicate_threshold || 3;
    const content = message.content.toLowerCase().trim();
    if (content.length < 5)
        return null;
    const { count } = await RedisCache_js_1.default.trackDuplicateMessage(message.guild.id, message.author.id, content, windowSeconds);
    if (count >= threshold) {
        await RedisCache_js_1.default.resetDuplicateTracker(message.guild.id, message.author.id);
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
 */
function checkMentions(message, settings) {
    if (!settings.mention_enabled)
        return null;
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
 */
function checkCaps(message, settings) {
    if (!settings.caps_enabled)
        return null;
    const minLength = settings.caps_min_length || 10;
    const percent = settings.caps_percent || 70;
    let text = message.content.replace(/<a?:[^:]+:\d+>/g, '');
    text = text.replace(/[\p{Emoji}]/gu, '');
    const letters = text.match(/[a-zA-Z]/g);
    if (!letters || letters.length < minLength)
        return null;
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
 * Execute auto-mod action with warn tracking and escalation
 */
async function executeAction(message, violation) {
    const results = {
        deleted: false,
        warned: false,
        muted: false,
        escalated: false,
        warnCount: 0,
        warnThreshold: 3,
        muteDuration: 15,
        error: null
    };
    try {
        const action = violation.action || 'delete';
        const settings = await getSettings(message.guild.id);
        // Get warn settings from guild settings
        results.warnThreshold = settings.warn_threshold || 3;
        results.muteDuration = settings.mute_duration || 15; // minutes
        const warnResetHours = settings.warn_reset_hours || 1;
        // Delete message if action includes delete
        if (action.includes('delete')) {
            try {
                await message.delete();
                results.deleted = true;
            }
            catch (e) {
                Logger_js_1.default.warn('[AutoModService] Could not delete message:', e.message);
            }
        }
        // Track warn in Redis if action includes warn
        if (action.includes('warn')) {
            results.warned = true;
            // Track warn count in Redis
            results.warnCount = await RedisCache_js_1.default.trackAutomodWarn(message.guild.id, message.author.id, warnResetHours);
            // Check if threshold reached -> escalate to mute
            if (results.warnCount >= results.warnThreshold && message.member) {
                try {
                    const muteDurationMs = results.muteDuration * 60 * 1000; // Convert minutes to ms
                    await message.member.timeout(muteDurationMs, `[Auto-Mod] Exceeded warn threshold (${results.warnCount}/${results.warnThreshold})`);
                    results.muted = true;
                    results.escalated = true;
                    // Reset warn count after mute
                    await RedisCache_js_1.default.resetAutomodWarn(message.guild.id, message.author.id);
                    Logger_js_1.default.info('AutoMod', `Escalated to mute: ${message.author.tag} (${results.warnCount} warns)`);
                }
                catch (e) {
                    Logger_js_1.default.warn('[AutoModService] Could not escalate mute:', e.message);
                }
            }
        }
        // Direct mute action (not from escalation)
        if (action === 'mute' && violation.muteDuration && message.member && !results.muted) {
            try {
                await message.member.timeout(violation.muteDuration, `[Auto-Mod] ${violation.trigger}`);
                results.muted = true;
            }
            catch (e) {
                Logger_js_1.default.warn('[AutoModService] Could not mute member:', e.message);
            }
        }
        await InfractionService.logAutoMod(message.guild, message.author, violation.trigger, results.escalated ? 'mute' : action, {
            channelId: message.channelId,
            messageContent: message.content.slice(0, 100),
            type: violation.type,
            warnCount: results.warnCount,
            escalated: results.escalated
        });
    }
    catch (error) {
        Logger_js_1.default.error('[AutoModService]', `Error executing action: ${error.message}`);
        results.error = error.message;
    }
    return results;
}
// IGNORED MANAGEMENT
/**
 * Add ignored channel
 */
async function addIgnoredChannel(guildId, channelId) {
    const settings = await getSettings(guildId);
    const channels = settings.ignored_channels || [];
    if (!channels.includes(channelId)) {
        channels.push(channelId);
        await updateSettings(guildId, { ignored_channels: channels });
    }
    invalidateCache(guildId);
}
/**
 * Remove ignored channel
 */
async function removeIgnoredChannel(guildId, channelId) {
    const settings = await getSettings(guildId);
    const channels = (settings.ignored_channels || []).filter((c) => c !== channelId);
    await updateSettings(guildId, { ignored_channels: channels });
    invalidateCache(guildId);
}
/**
 * Add ignored role
 */
async function addIgnoredRole(guildId, roleId) {
    const settings = await getSettings(guildId);
    const roles = settings.ignored_roles || [];
    if (!roles.includes(roleId)) {
        roles.push(roleId);
        await updateSettings(guildId, { ignored_roles: roles });
    }
    invalidateCache(guildId);
}
/**
 * Remove ignored role
 */
async function removeIgnoredRole(guildId, roleId) {
    const settings = await getSettings(guildId);
    const roles = (settings.ignored_roles || []).filter((r) => r !== roleId);
    await updateSettings(guildId, { ignored_roles: roles });
    invalidateCache(guildId);
}
// EXPORTS
exports.default = {
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
    checkWordFilter,
    checkInvites,
    checkLinks,
    checkSpam,
    checkDuplicates,
    checkMentions,
    checkCaps
};
//# sourceMappingURL=AutoModService.js.map