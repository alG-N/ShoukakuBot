/**
 * Cooldown Manager
 * Shared cooldown tracking for commands and features
 * Uses Redis via CacheService for shard-safe distributed cooldowns
 * @module utils/common/cooldown
 */

import cacheService from '../../cache/CacheService.js';
// TYPES
interface CooldownCheckResult {
    onCooldown: boolean;
    remaining: number;
}

interface CooldownCheckAndSetResult {
    passed: boolean;
    remaining: number;
}

interface CooldownManagerOptions {
    defaultCooldown?: number;
    prefix?: string;
}
// COOLDOWN MANAGER CLASS
/**
 * Shard-safe cooldown manager using Redis-backed CacheService
 */
export class CooldownManager {
    private defaultCooldown: number;
    private prefix: string;

    /**
     * @param options - Configuration options
     */
    constructor(options: CooldownManagerOptions = {}) {
        this.defaultCooldown = options.defaultCooldown || 3000;
        this.prefix = options.prefix || '';
    }

    /**
     * Generate cache key
     * @private
     */
    private _getKey(userId: string, commandName: string): string {
        return this.prefix ? `${this.prefix}:${commandName}` : commandName;
    }

    /**
     * Check if user is on cooldown
     * @param userId - User ID
     * @param commandName - Command name
     * @param cooldownMs - Cooldown duration (uses default if not provided)
     */
    async check(userId: string, commandName: string, _cooldownMs: number = this.defaultCooldown): Promise<CooldownCheckResult> {
        const key = this._getKey(userId, commandName);
        const remaining = await cacheService.getCooldown(key, userId);
        
        if (remaining === null || remaining <= 0) {
            return { onCooldown: false, remaining: 0 };
        }
        
        return { onCooldown: true, remaining };
    }

    /**
     * Set cooldown for user
     * @param userId - User ID
     * @param commandName - Command name
     * @param cooldownMs - Cooldown duration
     */
    async set(userId: string, commandName: string, cooldownMs: number = this.defaultCooldown): Promise<void> {
        const key = this._getKey(userId, commandName);
        await cacheService.setCooldown(key, userId, cooldownMs);
    }

    /**
     * Check and set cooldown in one operation (atomic, shard-safe)
     * @param userId - User ID
     * @param commandName - Command name
     * @param cooldownMs - Cooldown duration
     */
    async checkAndSet(userId: string, commandName: string, cooldownMs: number = this.defaultCooldown): Promise<CooldownCheckAndSetResult> {
        const key = this._getKey(userId, commandName);
        return cacheService.checkAndSetCooldown(key, userId, cooldownMs);
    }

    /**
     * Clear cooldown for user
     * @param userId - User ID
     * @param commandName - Command name
     */
    async clear(userId: string, commandName: string): Promise<void> {
        const key = this._getKey(userId, commandName);
        await cacheService.clearCooldown(key, userId);
    }

    /**
     * Clear all cooldowns for a user
     * @param userId - User ID
     */
    async clearUser(userId: string): Promise<void> {
        await cacheService.clearUserCooldowns(userId);
    }

    /**
     * Get remaining cooldown time
     * @param userId - User ID
     * @param commandName - Command name
     * @returns Remaining time in ms (0 if not on cooldown)
     */
    async getRemaining(userId: string, commandName: string): Promise<number> {
        const result = await this.check(userId, commandName);
        return result.remaining;
    }

}
// GLOBAL INSTANCE & EXPORTS
// Global cooldown manager instance
export const globalCooldownManager = new CooldownManager();

// Convenience functions using global manager (now async)
export async function checkCooldown(userId: string, commandName: string, cooldownMs?: number): Promise<CooldownCheckAndSetResult> {
    return globalCooldownManager.checkAndSet(userId, commandName, cooldownMs);
}

export async function clearCooldown(userId: string, commandName: string): Promise<void> {
    return globalCooldownManager.clear(userId, commandName);
}
