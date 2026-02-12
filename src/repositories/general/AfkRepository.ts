/**
 * AFK Repository
 * Database operations for AFK status management
 * Replaces legacy file-based storage with PostgreSQL
 * @module repositories/general/AfkRepository
 */

import db from '../../database/postgres.js';

// ============================================================================
// TYPES
// ============================================================================

export type AfkType = 'guild' | 'global';

export interface AfkRecord {
    [key: string]: unknown;
    user_id: string;
    guild_id: string | null;
    reason: string;
    timestamp: number;
    type: AfkType;
    created_at?: Date;
    updated_at?: Date;
}

export interface AfkInfo {
    reason: string;
    timestamp: number;
    type: AfkType;
}

export interface SetAfkData {
    userId: string;
    guildId: string | null;
    reason: string;
    type: AfkType;
}

// ============================================================================
// REPOSITORY CLASS
// ============================================================================

class AfkRepository {
    /**
     * Get AFK status for a user
     * Checks both global and guild-specific AFK
     */
    async getAfk(userId: string, guildId: string | null = null): Promise<AfkInfo | null> {
        try {
            // First check for global AFK
            const globalAfk = await db.query<AfkRecord>(
                `SELECT * FROM user_afk WHERE user_id = $1 AND guild_id IS NULL`,
                [userId]
            );

            if (globalAfk.rows.length > 0) {
                const record = globalAfk.rows[0];
                return {
                    reason: record.reason,
                    timestamp: Number(record.timestamp),
                    type: 'global'
                };
            }

            // Then check for guild-specific AFK
            if (guildId) {
                const guildAfk = await db.query<AfkRecord>(
                    `SELECT * FROM user_afk WHERE user_id = $1 AND guild_id = $2`,
                    [userId, guildId]
                );

                if (guildAfk.rows.length > 0) {
                    const record = guildAfk.rows[0];
                    return {
                        reason: record.reason,
                        timestamp: Number(record.timestamp),
                        type: 'guild'
                    };
                }
            }

            return null;
        } catch (error) {
            console.error('[AfkRepository] getAfk error:', error);
            return null;
        }
    }

    /**
     * Set AFK status for a user
     * Uses upsert to handle both insert and update
     */
    async setAfk(data: SetAfkData): Promise<boolean> {
        try {
            const { userId, guildId, reason, type } = data;
            const timestamp = Date.now();

            if (type === 'global') {
                // For global AFK, first remove any existing guild-specific AFKs
                await db.query(
                    `DELETE FROM user_afk WHERE user_id = $1 AND guild_id IS NOT NULL`,
                    [userId]
                );

                // Then upsert the global AFK
                await db.query(
                    `INSERT INTO user_afk (user_id, guild_id, reason, timestamp, type)
                     VALUES ($1, NULL, $2, $3, 'global')
                     ON CONFLICT (user_id, guild_id) 
                     DO UPDATE SET reason = $2, timestamp = $3, type = 'global', updated_at = NOW()`,
                    [userId, reason, timestamp]
                );
            } else {
                // For guild AFK, first check if user has global AFK
                const hasGlobal = await db.query(
                    `SELECT 1 FROM user_afk WHERE user_id = $1 AND guild_id IS NULL`,
                    [userId]
                );

                // If user has global AFK, remove it first
                if (hasGlobal.rows.length > 0) {
                    await db.query(
                        `DELETE FROM user_afk WHERE user_id = $1 AND guild_id IS NULL`,
                        [userId]
                    );
                }

                // Upsert guild-specific AFK
                await db.query(
                    `INSERT INTO user_afk (user_id, guild_id, reason, timestamp, type)
                     VALUES ($1, $2, $3, $4, 'guild')
                     ON CONFLICT (user_id, guild_id) 
                     DO UPDATE SET reason = $3, timestamp = $4, type = 'guild', updated_at = NOW()`,
                    [userId, guildId, reason, timestamp]
                );
            }

            return true;
        } catch (error) {
            console.error('[AfkRepository] setAfk error:', error);
            return false;
        }
    }

    /**
     * Remove AFK status for a user
     * Returns the removed AFK info if found
     */
    async removeAfk(userId: string, guildId: string | null = null): Promise<AfkInfo | null> {
        try {
            // First get the current AFK to return it
            const currentAfk = await this.getAfk(userId, guildId);
            if (!currentAfk) return null;

            if (currentAfk.type === 'global') {
                // Remove global AFK
                await db.query(
                    `DELETE FROM user_afk WHERE user_id = $1 AND guild_id IS NULL`,
                    [userId]
                );
            } else if (guildId) {
                // Remove guild-specific AFK
                await db.query(
                    `DELETE FROM user_afk WHERE user_id = $1 AND guild_id = $2`,
                    [userId, guildId]
                );
            }

            return currentAfk;
        } catch (error) {
            console.error('[AfkRepository] removeAfk error:', error);
            return null;
        }
    }

    /**
     * Get all AFK users in a guild (for bulk operations)
     */
    async getGuildAfkUsers(guildId: string): Promise<AfkRecord[]> {
        try {
            const result = await db.query<AfkRecord>(
                `SELECT * FROM user_afk WHERE guild_id = $1 OR guild_id IS NULL`,
                [guildId]
            );
            return result.rows;
        } catch (error) {
            console.error('[AfkRepository] getGuildAfkUsers error:', error);
            return [];
        }
    }

    /**
     * Get multiple users' AFK status at once (for mention checks)
     */
    async getMultipleAfk(userIds: string[], guildId: string): Promise<Map<string, AfkInfo>> {
        try {
            if (userIds.length === 0) return new Map();

            const result = await db.query<AfkRecord>(
                `SELECT * FROM user_afk 
                 WHERE user_id = ANY($1) 
                 AND (guild_id = $2 OR guild_id IS NULL)`,
                [userIds, guildId]
            );

            const afkMap = new Map<string, AfkInfo>();
            
            for (const record of result.rows) {
                // Global AFK takes precedence
                if (record.type === 'global' || !afkMap.has(record.user_id)) {
                    afkMap.set(record.user_id, {
                        reason: record.reason,
                        timestamp: Number(record.timestamp),
                        type: record.type
                    });
                }
            }

            return afkMap;
        } catch (error) {
            console.error('[AfkRepository] getMultipleAfk error:', error);
            return new Map();
        }
    }

    /**
     * Clean up old AFK entries (optional maintenance)
     * @param maxAgeDays Maximum age in days before cleanup
     */
    async cleanupOldAfk(maxAgeDays: number = 30): Promise<number> {
        try {
            const cutoffTimestamp = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);
            
            const result = await db.query(
                `DELETE FROM user_afk WHERE timestamp < $1`,
                [cutoffTimestamp]
            );

            return result.rowCount || 0;
        } catch (error) {
            console.error('[AfkRepository] cleanupOldAfk error:', error);
            return 0;
        }
    }
}

// Export singleton instance
const afkRepository = new AfkRepository();
export { AfkRepository };
export default afkRepository;
