/**
 * Anti-Raid Service
 * Detects and responds to raid attacks
 * Shard-safe: Uses Redis via CacheService for all state
 * @module services/moderation/AntiRaidService
 */

import { type GuildMember, type Snowflake } from 'discord.js';
import cacheService from '../../cache/CacheService.js';
import logger from '../../core/Logger.js';
import automodConfig from '../../config/features/moderation/automod.js';

// Cache namespace and TTLs
const CACHE_NAMESPACE = 'antiraid';
const JOIN_TRACKER_TTL = 300;      // 5 minutes
const RAID_MODE_TTL = 1800;        // 30 minutes (auto-disable)
const FLAGGED_ACCOUNTS_TTL = 3600; // 1 hour
// TYPES
interface JoinEntry {
    userId: Snowflake;
    timestamp: number;
    accountAge: number;
    username: string;
}

interface RaidModeState {
    active: boolean;
    activatedAt: number;
    activatedBy: Snowflake;
    reason: string;
    stats?: {
        kickedCount: number;
        bannedCount: number;
    };
}

interface DeactivateResult {
    duration: number;
    flaggedAccounts: number;
    stats?: {
        kickedCount?: number;
        bannedCount?: number;
    };
}

export interface JoinAnalysis {
    isRaid: boolean;
    isSuspicious: boolean;
    triggers: string[];
    recommendation: string | null;
    stats: {
        joinCount: number;
        newAccounts: number;
        similarNames: number;
    };
}

interface SimilarNameResult {
    count: number;
    isSuspicious: boolean;
}
// ANTI-RAID SERVICE CLASS
class AntiRaidService {
    private cleanupInterval: NodeJS.Timeout | null = null;

    constructor() {
        // Register cache namespace with appropriate settings
        cacheService.registerNamespace(CACHE_NAMESPACE, {
            ttl: JOIN_TRACKER_TTL,
            maxSize: 10000,
            useRedis: true
        });
        
        this._startCleanup();
    }

    /**
     * Build cache key for join tracker
     */
    private _joinKey(guildId: Snowflake): string {
        return `joins:${guildId}`;
    }

    /**
     * Build cache key for raid mode state
     */
    private _raidModeKey(guildId: Snowflake): string {
        return `raidmode:${guildId}`;
    }

    /**
     * Build cache key for flagged accounts
     */
    private _flaggedKey(guildId: Snowflake): string {
        return `flagged:${guildId}`;
    }

    /**
     * Track a member join event
     */
    async trackJoin(member: GuildMember): Promise<JoinAnalysis> {
        const guildId = member.guild.id;
        const now = Date.now();

        // Get current joins from Redis (may not exist — not a real miss)
        const joins = await cacheService.peek<JoinEntry[]>(CACHE_NAMESPACE, this._joinKey(guildId)) || [];

        // Add this join
        joins.push({
            userId: member.id,
            timestamp: now,
            accountAge: now - member.user.createdTimestamp,
            username: member.user.username
        });

        // Clean old entries
        const raidConfig = automodConfig.raid;
        const windowStart = now - (raidConfig.windowMs || 30000);
        const recentJoins = joins.filter(j => j.timestamp > windowStart);
        
        // Save back to Redis
        await cacheService.set(CACHE_NAMESPACE, this._joinKey(guildId), recentJoins, JOIN_TRACKER_TTL);

        return this._analyzeJoins(guildId, recentJoins, member);
    }

    /**
     * Analyze joins for raid patterns
     */
    private async _analyzeJoins(guildId: Snowflake, recentJoins: JoinEntry[], newMember: GuildMember): Promise<JoinAnalysis> {
        const raidConfig = automodConfig.raid;
        
        const result: JoinAnalysis = {
            isRaid: false,
            isSuspicious: false,
            triggers: [],
            recommendation: null,
            stats: {
                joinCount: recentJoins.length,
                newAccounts: 0,
                similarNames: 0
            }
        };

        // Check if raid mode already active
        if (await this.isRaidModeActive(guildId)) {
            result.isSuspicious = true;
            result.triggers.push('raid_mode_active');
            await this._flagAccount(guildId, newMember.id);
            return result;
        }

        // Count new accounts
        const newAccountThreshold = (raidConfig.minAccountAgeDays || 7) * 24 * 60 * 60 * 1000;
        result.stats.newAccounts = recentJoins.filter(j =>
            j.accountAge < newAccountThreshold
        ).length;

        // Check similar usernames
        const usernamePatterns = this._detectSimilarUsernames(recentJoins);
        result.stats.similarNames = usernamePatterns.count;

        // Trigger 1: Too many joins in window
        if (recentJoins.length >= (raidConfig.joinThreshold || 10)) {
            result.triggers.push('high_join_rate');
            result.isRaid = true;
        }

        // Trigger 2: Many new accounts joining
        const newAccountRatio = result.stats.newAccounts / recentJoins.length;
        if (recentJoins.length >= 5 && newAccountRatio >= 0.7) {
            result.triggers.push('mass_new_accounts');
            result.isRaid = true;
        }

        // Trigger 3: Similar username pattern
        if (usernamePatterns.isSuspicious) {
            result.triggers.push('similar_usernames');
            result.isRaid = true;
        }

        // Suspicious checks
        if (!result.isRaid) {
            const isNewAccount = (Date.now() - newMember.user.createdTimestamp) < newAccountThreshold;
            if (isNewAccount && recentJoins.length >= 3) {
                result.isSuspicious = true;
                result.triggers.push('new_account_high_activity');
            }
        }

        // Set recommendation
        if (result.isRaid) {
            result.recommendation = raidConfig.action || 'lockdown';
        } else if (result.isSuspicious) {
            result.recommendation = 'monitor';
        }

        return result;
    }

    /**
     * Detect similar username patterns
     */
    private _detectSimilarUsernames(joins: JoinEntry[]): SimilarNameResult {
        if (joins.length < 4) {
            return { count: 0, isSuspicious: false };
        }

        const usernames = joins.map(j => j.username.toLowerCase());

        const prefixMap = new Map<string, number>();
        const suffixMap = new Map<string, number>();

        for (const name of usernames) {
            if (name.length >= 4) {
                const prefix = name.slice(0, 4);
                const suffix = name.slice(-4);

                prefixMap.set(prefix, (prefixMap.get(prefix) || 0) + 1);
                suffixMap.set(suffix, (suffixMap.get(suffix) || 0) + 1);
            }

            const match = name.match(/^([a-z]+)(\d+)$/);
            if (match) {
                const base = match[1];
                prefixMap.set(`num_${base}`, (prefixMap.get(`num_${base}`) || 0) + 1);
            }
        }

        const maxPrefix = Math.max(...prefixMap.values(), 0);
        const maxSuffix = Math.max(...suffixMap.values(), 0);
        const maxSimilar = Math.max(maxPrefix, maxSuffix);

        return {
            count: maxSimilar,
            isSuspicious: maxSimilar >= 3 && maxSimilar >= joins.length * 0.5
        };
    }

    /**
     * Flag an account during raid (stored in Redis)
     */
    private async _flagAccount(guildId: Snowflake, userId: Snowflake): Promise<void> {
        const flagged = await cacheService.peek<Snowflake[]>(CACHE_NAMESPACE, this._flaggedKey(guildId)) || [];
        if (!flagged.includes(userId)) {
            flagged.push(userId);
            await cacheService.set(CACHE_NAMESPACE, this._flaggedKey(guildId), flagged, FLAGGED_ACCOUNTS_TTL);
        }
    }

    /**
     * Activate raid mode (stored in Redis)
     */
    async activateRaidMode(guildId: Snowflake, activatedBy: Snowflake, reason: string): Promise<void> {
        const state: RaidModeState = {
            active: true,
            activatedAt: Date.now(),
            activatedBy,
            reason
        };
        await cacheService.set(CACHE_NAMESPACE, this._raidModeKey(guildId), state, RAID_MODE_TTL);
        logger.info('AntiRaidService', `Raid mode activated for guild ${guildId}: ${reason}`);
    }

    /**
     * Deactivate raid mode
     */
    async deactivateRaidMode(guildId: Snowflake): Promise<DeactivateResult> {
        const state = await this.getRaidModeState(guildId);
        const flagged = await this.getFlaggedAccounts(guildId);

        const result: DeactivateResult = {
            duration: state ? Date.now() - state.activatedAt : 0,
            flaggedAccounts: flagged.length,
            stats: state?.stats
        };

        await cacheService.delete(CACHE_NAMESPACE, this._raidModeKey(guildId));
        await cacheService.delete(CACHE_NAMESPACE, this._flaggedKey(guildId));
        logger.info('AntiRaidService', `Raid mode deactivated for guild ${guildId}`);

        return result;
    }

    /**
     * Check if raid mode is active
     */
    async isRaidModeActive(guildId: Snowflake): Promise<boolean> {
        const state = await cacheService.peek<RaidModeState>(CACHE_NAMESPACE, this._raidModeKey(guildId));
        return state?.active || false;
    }

    /**
     * Get raid mode state
     */
    async getRaidModeState(guildId: Snowflake): Promise<RaidModeState | null> {
        return cacheService.peek<RaidModeState>(CACHE_NAMESPACE, this._raidModeKey(guildId));
    }

    /**
     * Get flagged accounts
     */
    async getFlaggedAccounts(guildId: Snowflake): Promise<Snowflake[]> {
        return await cacheService.peek<Snowflake[]>(CACHE_NAMESPACE, this._flaggedKey(guildId)) || [];
    }

    /**
     * Clear flagged accounts
     */
    async clearFlaggedAccounts(guildId: Snowflake): Promise<void> {
        await cacheService.delete(CACHE_NAMESPACE, this._flaggedKey(guildId));
    }

    /**
     * Check if a member's account is suspiciously new
     * @returns Whether the account is suspicious and what action to take
     */
    checkAccountAge(member: GuildMember): { isSuspicious: boolean; action: string; accountAgeDays: number } {
        const ANTI_RAID_CONFIG = automodConfig.raid;
        const accountAge = Date.now() - member.user.createdTimestamp;
        const minAgeDays = ANTI_RAID_CONFIG?.minAccountAgeDays || 7;
        const accountAgeDays = Math.floor(accountAge / (24 * 60 * 60 * 1000));
        const isSuspicious = accountAgeDays < minAgeDays;
        const action = isSuspicious ? 'flag' : 'none';
        return { isSuspicious, action, accountAgeDays };
    }

    /**
     * Update raid mode stats (kick/ban counts)
     */
    async updateStats(guildId: Snowflake, action: 'kick' | 'ban' | 'flag'): Promise<void> {
        const state = await this.getRaidModeState(guildId);
        if (!state) return;

        if (!state.stats) {
            state.stats = { kickedCount: 0, bannedCount: 0 };
        }

        if (action === 'kick') {
            state.stats.kickedCount++;
        } else if (action === 'ban') {
            state.stats.bannedCount++;
        }
        // 'flag' action doesn't increment counters — already tracked in flagged accounts list

        await cacheService.set(CACHE_NAMESPACE, this._raidModeKey(guildId), state, RAID_MODE_TTL);
    }

    /**
     * Start cleanup interval
     * Note: With Redis TTL, this is mainly for monitoring/logging
     */
    private _startCleanup(): void {
        this.cleanupInterval = setInterval(async () => {
            // Redis handles TTL automatically
            // This interval is kept for potential monitoring/logging needs
            logger.debug('AntiRaidService', 'Cleanup cycle (Redis TTL handles expiration)');
        }, 5 * 60 * 1000); // Every 5 minutes
        
        // Allow process to exit even if interval is running
        this.cleanupInterval.unref();
    }

    /**
     * Shutdown service
     */
    shutdown(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        logger.info('AntiRaidService', 'Shutdown complete');
    }
}

// Create singleton instance
const antiRaidService = new AntiRaidService();

export { AntiRaidService };
export default antiRaidService;
