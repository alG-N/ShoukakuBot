/**
 * Anti-Raid Service
 * Detects and responds to raid attacks
 * @module services/moderation/AntiRaidService
 */

const { Collection } = require('discord.js');
const antiRaidConfig = require('../../config/features/moderation/automod').ANTI_RAID;

class AntiRaidService {
    constructor() {
        // Track joins per guild: guildId -> [{ userId, timestamp }]
        this.joinTracker = new Collection();
        
        // Track raid mode state: guildId -> { active, activatedAt, activatedBy, reason }
        this.raidModeState = new Collection();
        
        // Accounts flagged during raid: guildId -> Set<userId>
        this.flaggedAccounts = new Collection();
        
        // Cleanup interval
        this._startCleanup();
    }
    
    /**
     * Track a member join event
     * @param {GuildMember} member 
     * @returns {Object} Analysis result
     */
    trackJoin(member) {
        const guildId = member.guild.id;
        const now = Date.now();
        
        // Initialize tracking
        if (!this.joinTracker.has(guildId)) {
            this.joinTracker.set(guildId, []);
        }
        
        const joins = this.joinTracker.get(guildId);
        
        // Add this join
        joins.push({
            userId: member.id,
            timestamp: now,
            accountAge: now - member.user.createdTimestamp,
            username: member.user.username
        });
        
        // Clean old entries (outside window)
        const windowStart = now - antiRaidConfig.JOIN_RATE.WINDOW_SECONDS * 1000;
        const recentJoins = joins.filter(j => j.timestamp > windowStart);
        this.joinTracker.set(guildId, recentJoins);
        
        // Analyze
        return this._analyzeJoins(guildId, recentJoins, member);
    }
    
    /**
     * Analyze joins for raid patterns
     * @param {string} guildId 
     * @param {Array} recentJoins 
     * @param {GuildMember} newMember
     * @returns {Object}
     */
    _analyzeJoins(guildId, recentJoins, newMember) {
        const result = {
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
        if (this.isRaidModeActive(guildId)) {
            result.isSuspicious = true;
            result.triggers.push('raid_mode_active');
            
            // Flag new account during raid
            this._flagAccount(guildId, newMember.id);
            
            return result;
        }
        
        // Count new accounts (under threshold)
        const newAccountThreshold = antiRaidConfig.ACCOUNT_AGE.MIN_DAYS * 24 * 60 * 60 * 1000;
        result.stats.newAccounts = recentJoins.filter(j => 
            j.accountAge < newAccountThreshold
        ).length;
        
        // Check similar usernames (potential bot raid)
        const usernamePatterns = this._detectSimilarUsernames(recentJoins);
        result.stats.similarNames = usernamePatterns.count;
        
        // RAID DETECTION LOGIC
        
        // Trigger 1: Too many joins in window
        if (recentJoins.length >= antiRaidConfig.JOIN_RATE.THRESHOLD) {
            result.triggers.push('high_join_rate');
            result.isRaid = true;
        }
        
        // Trigger 2: Many new accounts joining
        const newAccountRatio = result.stats.newAccounts / recentJoins.length;
        if (recentJoins.length >= 5 && newAccountRatio >= 0.7) {
            result.triggers.push('mass_new_accounts');
            result.isRaid = true;
        }
        
        // Trigger 3: Similar username pattern (bot raid)
        if (usernamePatterns.isSuspicious) {
            result.triggers.push('similar_usernames');
            result.isRaid = true;
        }
        
        // Suspicious (not full raid) checks
        if (!result.isRaid) {
            // New account during high activity
            const isNewAccount = (Date.now() - newMember.user.createdTimestamp) < newAccountThreshold;
            if (isNewAccount && recentJoins.length >= 3) {
                result.isSuspicious = true;
                result.triggers.push('new_account_high_activity');
            }
        }
        
        // Set recommendation
        if (result.isRaid) {
            result.recommendation = antiRaidConfig.ACTIONS.ON_RAID;
        } else if (result.isSuspicious) {
            result.recommendation = 'monitor';
        }
        
        return result;
    }
    
    /**
     * Detect similar username patterns (bot naming convention)
     * @param {Array} joins 
     * @returns {Object}
     */
    _detectSimilarUsernames(joins) {
        if (joins.length < 4) {
            return { count: 0, isSuspicious: false };
        }
        
        const usernames = joins.map(j => j.username.toLowerCase());
        
        // Check for common patterns:
        // 1. Same prefix (e.g., "user1234", "user5678")
        // 2. Same suffix (e.g., "john_bot", "mike_bot")
        // 3. Numeric sequence (e.g., "name001", "name002")
        
        const prefixMap = new Map();
        const suffixMap = new Map();
        
        for (const name of usernames) {
            // Extract first 4 chars and last 4 chars
            if (name.length >= 4) {
                const prefix = name.slice(0, 4);
                const suffix = name.slice(-4);
                
                prefixMap.set(prefix, (prefixMap.get(prefix) || 0) + 1);
                suffixMap.set(suffix, (suffixMap.get(suffix) || 0) + 1);
            }
            
            // Check for "word + numbers" pattern
            const match = name.match(/^([a-z]+)(\d+)$/);
            if (match) {
                const base = match[1];
                prefixMap.set(`num_${base}`, (prefixMap.get(`num_${base}`) || 0) + 1);
            }
        }
        
        // Find max occurrences
        const maxPrefix = Math.max(...prefixMap.values(), 0);
        const maxSuffix = Math.max(...suffixMap.values(), 0);
        const maxSimilar = Math.max(maxPrefix, maxSuffix);
        
        // Suspicious if 3+ similar patterns out of recent joins
        return {
            count: maxSimilar,
            isSuspicious: maxSimilar >= 3 && maxSimilar >= joins.length * 0.5
        };
    }
    
    /**
     * Flag an account during raid
     * @param {string} guildId 
     * @param {string} userId 
     */
    _flagAccount(guildId, userId) {
        if (!this.flaggedAccounts.has(guildId)) {
            this.flaggedAccounts.set(guildId, new Set());
        }
        this.flaggedAccounts.get(guildId).add(userId);
    }
    
    /**
     * Activate raid mode for a guild
     * @param {string} guildId 
     * @param {string} activatedBy - User ID who activated (or 'system')
     * @param {string} reason 
     */
    activateRaidMode(guildId, activatedBy, reason) {
        this.raidModeState.set(guildId, {
            active: true,
            activatedAt: Date.now(),
            activatedBy,
            reason,
            stats: {
                kickedCount: 0,
                bannedCount: 0,
                flaggedCount: 0
            }
        });
        
        // Initialize flagged accounts
        if (!this.flaggedAccounts.has(guildId)) {
            this.flaggedAccounts.set(guildId, new Set());
        }
    }
    
    /**
     * Deactivate raid mode
     * @param {string} guildId 
     * @returns {Object} Final stats
     */
    deactivateRaidMode(guildId) {
        const state = this.raidModeState.get(guildId);
        
        const result = {
            wasActive: state?.active ?? false,
            duration: state ? Date.now() - state.activatedAt : 0,
            stats: state?.stats ?? {},
            flaggedAccounts: this.flaggedAccounts.get(guildId)?.size ?? 0
        };
        
        this.raidModeState.delete(guildId);
        this.flaggedAccounts.delete(guildId);
        this.joinTracker.delete(guildId);
        
        return result;
    }
    
    /**
     * Check if raid mode is active
     * @param {string} guildId 
     * @returns {boolean}
     */
    isRaidModeActive(guildId) {
        return this.raidModeState.get(guildId)?.active ?? false;
    }
    
    /**
     * Get raid mode state
     * @param {string} guildId 
     * @returns {Object|null}
     */
    getRaidModeState(guildId) {
        return this.raidModeState.get(guildId) ?? null;
    }
    
    /**
     * Get flagged accounts
     * @param {string} guildId 
     * @returns {Set<string>}
     */
    getFlaggedAccounts(guildId) {
        return this.flaggedAccounts.get(guildId) ?? new Set();
    }
    
    /**
     * Update raid mode stats
     * @param {string} guildId 
     * @param {string} action - 'kick' | 'ban' | 'flag'
     */
    updateStats(guildId, action) {
        const state = this.raidModeState.get(guildId);
        if (!state) return;
        
        switch (action) {
            case 'kick':
                state.stats.kickedCount++;
                break;
            case 'ban':
                state.stats.bannedCount++;
                break;
            case 'flag':
                state.stats.flaggedCount++;
                break;
        }
    }
    
    /**
     * Check if account is suspicious (new account)
     * @param {GuildMember} member 
     * @returns {Object}
     */
    checkAccountAge(member) {
        const accountAge = Date.now() - member.user.createdTimestamp;
        const minAge = antiRaidConfig.ACCOUNT_AGE.MIN_DAYS * 24 * 60 * 60 * 1000;
        
        return {
            isSuspicious: accountAge < minAge,
            accountAgeDays: Math.floor(accountAge / (24 * 60 * 60 * 1000)),
            minRequired: antiRaidConfig.ACCOUNT_AGE.MIN_DAYS,
            action: antiRaidConfig.ACCOUNT_AGE.ACTION
        };
    }
    
    /**
     * Cleanup old data periodically
     */
    _startCleanup() {
        setInterval(() => {
            const now = Date.now();
            const maxAge = 10 * 60 * 1000; // 10 minutes
            
            for (const [guildId, joins] of this.joinTracker.entries()) {
                const filtered = joins.filter(j => now - j.timestamp < maxAge);
                if (filtered.length === 0) {
                    this.joinTracker.delete(guildId);
                } else {
                    this.joinTracker.set(guildId, filtered);
                }
            }
            
            // Auto-deactivate raid mode after 30 minutes
            for (const [guildId, state] of this.raidModeState.entries()) {
                if (state.active && now - state.activatedAt > 30 * 60 * 1000) {
                    this.deactivateRaidMode(guildId);
                }
            }
        }, 60 * 1000); // Run every minute
    }
}

module.exports = new AntiRaidService();
