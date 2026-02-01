/**
 * Cooldown Manager
 * Shared cooldown tracking for commands and features
 * @module shared/utils/cooldown
 */

/**
 * Cooldown entry structure
 * @typedef {Object} CooldownEntry
 * @property {number} timestamp - When the cooldown was set
 * @property {number} duration - Cooldown duration in ms
 */

class CooldownManager {
    /**
     * @param {Object} options - Configuration options
     * @param {number} options.defaultCooldown - Default cooldown in ms
     * @param {number} options.cleanupInterval - Cleanup interval in ms
     */
    constructor(options = {}) {
        this.cooldowns = new Map();
        this.defaultCooldown = options.defaultCooldown || 3000;
        
        // Auto cleanup every 5 minutes
        this.cleanupInterval = setInterval(
            () => this._cleanup(), 
            options.cleanupInterval || 300000
        );
    }

    /**
     * Generate cache key
     * @private
     */
    _getKey(userId, commandName) {
        return `${userId}:${commandName}`;
    }

    /**
     * Check if user is on cooldown
     * @param {string} userId - User ID
     * @param {string} commandName - Command name
     * @param {number} cooldownMs - Cooldown duration (uses default if not provided)
     * @returns {Object} { onCooldown: boolean, remaining: number }
     */
    check(userId, commandName, cooldownMs = this.defaultCooldown) {
        const key = this._getKey(userId, commandName);
        const entry = this.cooldowns.get(key);
        
        if (!entry) {
            return { onCooldown: false, remaining: 0 };
        }
        
        const elapsed = Date.now() - entry.timestamp;
        const remaining = entry.duration - elapsed;
        
        if (remaining <= 0) {
            this.cooldowns.delete(key);
            return { onCooldown: false, remaining: 0 };
        }
        
        return { onCooldown: true, remaining };
    }

    /**
     * Set cooldown for user
     * @param {string} userId - User ID
     * @param {string} commandName - Command name
     * @param {number} cooldownMs - Cooldown duration
     */
    set(userId, commandName, cooldownMs = this.defaultCooldown) {
        const key = this._getKey(userId, commandName);
        this.cooldowns.set(key, {
            timestamp: Date.now(),
            duration: cooldownMs
        });
    }

    /**
     * Check and set cooldown in one operation
     * @param {string} userId - User ID
     * @param {string} commandName - Command name
     * @param {number} cooldownMs - Cooldown duration
     * @returns {Object} { passed: boolean, remaining: number }
     */
    checkAndSet(userId, commandName, cooldownMs = this.defaultCooldown) {
        const result = this.check(userId, commandName, cooldownMs);
        
        if (!result.onCooldown) {
            this.set(userId, commandName, cooldownMs);
            return { passed: true, remaining: 0 };
        }
        
        return { passed: false, remaining: result.remaining };
    }

    /**
     * Clear cooldown for user
     * @param {string} userId - User ID
     * @param {string} commandName - Command name
     */
    clear(userId, commandName) {
        const key = this._getKey(userId, commandName);
        this.cooldowns.delete(key);
    }

    /**
     * Clear all cooldowns for a user
     * @param {string} userId - User ID
     */
    clearUser(userId) {
        for (const key of this.cooldowns.keys()) {
            if (key.startsWith(`${userId}:`)) {
                this.cooldowns.delete(key);
            }
        }
    }

    /**
     * Get remaining cooldown time
     * @param {string} userId - User ID
     * @param {string} commandName - Command name
     * @returns {number} Remaining time in ms (0 if not on cooldown)
     */
    getRemaining(userId, commandName) {
        const result = this.check(userId, commandName);
        return result.remaining;
    }

    /**
     * Cleanup expired cooldowns
     * @private
     */
    _cleanup() {
        const now = Date.now();
        for (const [key, entry] of this.cooldowns) {
            if (now - entry.timestamp > entry.duration) {
                this.cooldowns.delete(key);
            }
        }
    }

    /**
     * Get stats for monitoring
     * @returns {Object} Cooldown stats
     */
    getStats() {
        return {
            totalEntries: this.cooldowns.size,
            memoryEstimate: this.cooldowns.size * 100 // rough estimate in bytes
        };
    }

    /**
     * Destroy the cooldown manager
     */
    destroy() {
        clearInterval(this.cleanupInterval);
        this.cooldowns.clear();
    }
}

// Global cooldown manager instance
const globalCooldownManager = new CooldownManager();

module.exports = {
    CooldownManager,
    globalCooldownManager,
    
    // Convenience functions using global manager
    checkCooldown: (userId, commandName, cooldownMs) => 
        globalCooldownManager.checkAndSet(userId, commandName, cooldownMs),
    
    clearCooldown: (userId, commandName) => 
        globalCooldownManager.clear(userId, commandName)
};
