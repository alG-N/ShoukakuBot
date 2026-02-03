/**
 * Auto-Mod Service
 * Handles automatic moderation (spam, links, mentions, etc.)
 * @module services/moderation/AutoModService
 */

import type { Message, GuildMember, Snowflake } from 'discord.js';
import * as FilterService from './FilterService.js';
import * as InfractionService from './InfractionService.js';
import logger from '../../core/Logger.js';
import redisCache from '../guild/RedisCache.js';

// Use require for CommonJS modules
const AutoModRepository = require('../../repositories/moderation/AutoModRepository.js') as {
    get: (guildId: string) => Promise<unknown>;
    create: (guildId: string) => Promise<unknown>;
    getOrCreate: (guildId: string) => Promise<unknown>;
    update: (guildId: string, updates: Record<string, unknown>) => Promise<unknown>;
    toggleFeature: (guildId: string, feature: string, enabled: boolean) => Promise<unknown>;
};

const automodConfigModule = require('../../config/features/moderation/automod.js') as {
    default?: {
        SPAM?: Record<string, unknown>;
        DUPLICATE?: Record<string, unknown>;
        LINKS?: Record<string, unknown>;
        INVITES?: Record<string, unknown>;
        MENTIONS?: Record<string, unknown>;
        CAPS?: Record<string, unknown>;
        PATTERNS?: Record<string, unknown>;
        links?: {
            allowMedia?: boolean;
            mediaExtensions?: string[];
            blacklist?: string[];
            whitelistMode?: boolean;
        };
    };
    SPAM?: Record<string, unknown>;
    DUPLICATE?: Record<string, unknown>;
    LINKS?: Record<string, unknown>;
    INVITES?: Record<string, unknown>;
    MENTIONS?: Record<string, unknown>;
    CAPS?: Record<string, unknown>;
    PATTERNS?: Record<string, unknown>;
    links?: {
        allowMedia?: boolean;
        mediaExtensions?: string[];
        blacklist?: string[];
        whitelistMode?: boolean;
    };
};

// Handle both ESM default export and direct export
const automodConfig = automodConfigModule.default || automodConfigModule;
// TYPES
export interface AutoModSettings {
    enabled: boolean;
    filter_enabled: boolean;
    invites_enabled: boolean;
    invites_action: string;
    invites_whitelist: string[];
    links_enabled: boolean;
    links_action: string;
    links_whitelist: string[];
    spam_enabled: boolean;
    spam_threshold: number;
    spam_window_ms: number;
    spam_action: string;
    spam_mute_duration_ms: number;
    duplicate_enabled: boolean;
    duplicate_threshold: number;
    duplicate_window_ms: number;
    duplicate_action: string;
    mention_enabled: boolean;
    mention_limit: number;
    mention_action: string;
    caps_enabled: boolean;
    caps_percent: number;
    caps_min_length: number;
    caps_action: string;
    ignored_channels: Snowflake[];
    ignored_roles: Snowflake[];
    warn_threshold: number;
    warn_reset_hours: number;
    warn_action: string;
    mute_duration: number;
}

export interface Violation {
    type: string;
    trigger: string;
    action: string;
    severity: number;
    muteDuration?: number;
    details?: unknown;
}

interface CacheEntry {
    settings: AutoModSettings;
    timestamp: number;
}
// CACHE
const settingsCache: Map<string, CacheEntry> = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
// SETTINGS MANAGEMENT
/**
 * Get auto-mod settings for a guild (with caching)
 */
export async function getSettings(guildId: string): Promise<AutoModSettings> {
    const cached = settingsCache.get(guildId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.settings;
    }

    const settings = await AutoModRepository.getOrCreate(guildId) as AutoModSettings;
    settingsCache.set(guildId, { settings, timestamp: Date.now() });
    return settings;
}

/**
 * Invalidate settings cache
 */
export function invalidateCache(guildId: string): void {
    settingsCache.delete(guildId);
}

/**
 * Update auto-mod settings
 */
export async function updateSettings(
    guildId: string,
    updates: Partial<AutoModSettings>
): Promise<AutoModSettings> {
    const settings = await AutoModRepository.update(guildId, updates as Record<string, unknown>) as AutoModSettings;
    invalidateCache(guildId);
    return settings;
}

/**
 * Toggle a feature
 */
export async function toggleFeature(
    guildId: string,
    feature: string,
    enabled: boolean
): Promise<AutoModSettings> {
    const settings = await AutoModRepository.toggleFeature(guildId, feature, enabled) as AutoModSettings;
    invalidateCache(guildId);
    return settings;
}
// BYPASS CHECKS
/**
 * Check if a member should bypass auto-mod
 */
export function shouldBypass(member: GuildMember, settings: AutoModSettings): boolean {
    if (member.user.bot) return true;
    if (member.id === member.guild.ownerId) return true;
    if (member.permissions.has('Administrator')) return true;

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
 */
export function shouldIgnoreChannel(channelId: string, settings: AutoModSettings): boolean {
    return settings.ignored_channels?.includes(channelId) || false;
}
// MESSAGE PROCESSING
/**
 * Process a message through auto-mod
 */
export async function processMessage(message: Message): Promise<Violation | null> {
    if (!message.guild) return null;
    if (message.author.bot) return null;

    try {
        const settings = await getSettings(message.guild.id);

        if (!settings.enabled) return null;
        if (!message.member || shouldBypass(message.member, settings)) return null;
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
        logger.error('AutoMod', `Error processing message: ${(error as Error).message}`);
        return null;
    }
}
// INDIVIDUAL CHECKS
/**
 * Check word filter
 */
export async function checkWordFilter(message: Message, settings: AutoModSettings): Promise<Violation | null> {
    if (!settings.filter_enabled) return null;

    const result = await FilterService.checkMessage(message.guild!.id, message.content);

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
export function checkInvites(message: Message, settings: AutoModSettings): Violation | null {
    if (!settings.invites_enabled) return null;

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
export function checkLinks(message: Message, settings: AutoModSettings): Violation | null {
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

        } catch {
            // Invalid URL, skip
        }
    }

    return null;
}

/**
 * Check for spam
 */
export async function checkSpam(message: Message, settings: AutoModSettings): Promise<Violation | null> {
    if (!settings.spam_enabled) return null;

    const windowSeconds = Math.ceil((settings.spam_window_ms || 5000) / 1000);
    const threshold = settings.spam_threshold || 5;

    const count = await redisCache.trackSpamMessage(
        message.guild!.id,
        message.author.id,
        windowSeconds
    );

    if (count >= threshold) {
        await redisCache.resetSpamTracker(message.guild!.id, message.author.id);

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
export async function checkDuplicates(message: Message, settings: AutoModSettings): Promise<Violation | null> {
    if (!settings.duplicate_enabled) return null;

    const windowSeconds = Math.ceil((settings.duplicate_window_ms || 30000) / 1000);
    const threshold = settings.duplicate_threshold || 3;
    const content = message.content.toLowerCase().trim();

    if (content.length < 5) return null;

    const { count } = await redisCache.trackDuplicateMessage(
        message.guild!.id,
        message.author.id,
        content,
        windowSeconds
    );

    if (count >= threshold) {
        await redisCache.resetDuplicateTracker(message.guild!.id, message.author.id);

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
export function checkMentions(message: Message, settings: AutoModSettings): Violation | null {
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
 */
export function checkCaps(message: Message, settings: AutoModSettings): Violation | null {
    if (!settings.caps_enabled) return null;

    const minLength = settings.caps_min_length || 10;
    const percent = settings.caps_percent || 70;

    let text = message.content.replace(/<a?:[^:]+:\d+>/g, '');
    text = text.replace(/[\p{Emoji}]/gu, '');

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
// ACTION EXECUTION

export interface ExecuteActionResult {
    deleted: boolean;
    warned: boolean;
    muted: boolean;
    escalated: boolean;
    warnCount: number;
    warnThreshold: number;
    muteDuration: number;
    error: string | null;
}

/**
 * Execute auto-mod action with warn tracking and escalation
 */
export async function executeAction(
    message: Message,
    violation: Violation
): Promise<ExecuteActionResult> {
    const results: ExecuteActionResult = {
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
        const settings = await getSettings(message.guild!.id);
        
        // Get warn settings from guild settings
        results.warnThreshold = settings.warn_threshold || 3;
        results.muteDuration = settings.mute_duration || 15; // minutes
        const warnResetHours = settings.warn_reset_hours || 1;

        // Delete message if action includes delete
        if (action.includes('delete')) {
            try {
                await message.delete();
                results.deleted = true;
            } catch (e) {
                logger.warn('[AutoModService] Could not delete message:', (e as Error).message);
            }
        }

        // Track warn in Redis if action includes warn
        if (action.includes('warn')) {
            results.warned = true;
            
            // Track warn count in Redis
            results.warnCount = await redisCache.trackAutomodWarn(
                message.guild!.id,
                message.author.id,
                warnResetHours
            );

            // Check if threshold reached -> escalate to mute
            if (results.warnCount >= results.warnThreshold && message.member) {
                try {
                    const muteDurationMs = results.muteDuration * 60 * 1000; // Convert minutes to ms
                    await message.member.timeout(
                        muteDurationMs,
                        `[Auto-Mod] Exceeded warn threshold (${results.warnCount}/${results.warnThreshold})`
                    );
                    results.muted = true;
                    results.escalated = true;
                    
                    // Reset warn count after mute
                    await redisCache.resetAutomodWarn(message.guild!.id, message.author.id);
                    
                    logger.info('AutoMod', `Escalated to mute: ${message.author.tag} (${results.warnCount} warns)`);
                } catch (e) {
                    logger.warn('[AutoModService] Could not escalate mute:', (e as Error).message);
                }
            }
        }

        // Direct mute action (not from escalation)
        if (action === 'mute' && violation.muteDuration && message.member && !results.muted) {
            try {
                await message.member.timeout(
                    violation.muteDuration,
                    `[Auto-Mod] ${violation.trigger}`
                );
                results.muted = true;
            } catch (e) {
                logger.warn('[AutoModService] Could not mute member:', (e as Error).message);
            }
        }

        await InfractionService.logAutoMod(
            message.guild!,
            message.author,
            violation.trigger,
            results.escalated ? 'mute' : action,
            {
                channelId: message.channelId,
                messageContent: message.content.slice(0, 100),
                type: violation.type,
                warnCount: results.warnCount,
                escalated: results.escalated
            }
        );

    } catch (error) {
        logger.error('[AutoModService]', `Error executing action: ${(error as Error).message}`);
        results.error = (error as Error).message;
    }

    return results;
}
// IGNORED MANAGEMENT
/**
 * Add ignored channel
 */
export async function addIgnoredChannel(guildId: string, channelId: string): Promise<void> {
    const settings = await getSettings(guildId);
    const channels = settings.ignored_channels || [];
    if (!channels.includes(channelId as never)) {
        channels.push(channelId as never);
        await updateSettings(guildId, { ignored_channels: channels });
    }
    invalidateCache(guildId);
}

/**
 * Remove ignored channel
 */
export async function removeIgnoredChannel(guildId: string, channelId: string): Promise<void> {
    const settings = await getSettings(guildId);
    const channels = (settings.ignored_channels || []).filter((c: string) => c !== channelId);
    await updateSettings(guildId, { ignored_channels: channels });
    invalidateCache(guildId);
}

/**
 * Add ignored role
 */
export async function addIgnoredRole(guildId: string, roleId: string): Promise<void> {
    const settings = await getSettings(guildId);
    const roles = settings.ignored_roles || [];
    if (!roles.includes(roleId as never)) {
        roles.push(roleId as never);
        await updateSettings(guildId, { ignored_roles: roles });
    }
    invalidateCache(guildId);
}

/**
 * Remove ignored role
 */
export async function removeIgnoredRole(guildId: string, roleId: string): Promise<void> {
    const settings = await getSettings(guildId);
    const roles = (settings.ignored_roles || []).filter((r: string) => r !== roleId);
    await updateSettings(guildId, { ignored_roles: roles });
    invalidateCache(guildId);
}
// EXPORTS
export default {
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
