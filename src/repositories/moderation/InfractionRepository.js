/**
 * Infraction Repository
 * Database operations for mod infractions/cases
 * @module repositories/moderation/InfractionRepository
 */

const db = require('../../database/postgres');

/**
 * Get next case ID for a guild
 * @param {string} guildId - Guild ID
 * @returns {Promise<number>} Next case ID
 */
async function getNextCaseId(guildId) {
    const result = await db.query(
        `SELECT COALESCE(MAX(case_id), 0) + 1 as next_id 
         FROM mod_infractions 
         WHERE guild_id = $1`,
        [guildId]
    );
    return result.rows[0]?.next_id || 1;
}

/**
 * Create a new infraction
 * @param {Object} data - Infraction data
 * @returns {Promise<Object>} Created infraction
 */
async function create(data) {
    const {
        guildId,
        userId,
        moderatorId,
        type,
        reason,
        durationMs,
        expiresAt,
        referenceId,
        metadata
    } = data;
    
    const caseId = await getNextCaseId(guildId);
    
    const result = await db.query(
        `INSERT INTO mod_infractions 
         (case_id, guild_id, user_id, moderator_id, type, reason, duration_ms, expires_at, reference_id, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [caseId, guildId, userId, moderatorId, type, reason, durationMs, expiresAt, referenceId, metadata || {}]
    );
    
    return result.rows[0];
}

/**
 * Get infraction by case ID
 * @param {string} guildId - Guild ID
 * @param {number} caseId - Case ID
 * @returns {Promise<Object|null>} Infraction or null
 */
async function getByCaseId(guildId, caseId) {
    const result = await db.query(
        `SELECT * FROM mod_infractions 
         WHERE guild_id = $1 AND case_id = $2`,
        [guildId, caseId]
    );
    return result.rows[0] || null;
}

/**
 * Get infractions for a user
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @param {Object} options - Query options
 * @returns {Promise<Object[]>} List of infractions
 */
async function getByUser(guildId, userId, options = {}) {
    const { type, activeOnly = false, limit = 50, offset = 0 } = options;
    
    let sql = `SELECT * FROM mod_infractions WHERE guild_id = $1 AND user_id = $2`;
    const params = [guildId, userId];
    let paramIndex = 3;
    
    if (type) {
        sql += ` AND type = $${paramIndex++}`;
        params.push(type);
    }
    
    if (activeOnly) {
        sql += ` AND active = true AND (expires_at IS NULL OR expires_at > NOW())`;
    }
    
    sql += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(limit, offset);
    
    const result = await db.query(sql, params);
    return result.rows;
}

/**
 * Count active warnings for a user
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @returns {Promise<number>} Warning count
 */
async function countActiveWarnings(guildId, userId) {
    const result = await db.query(
        `SELECT COUNT(*) as count FROM mod_infractions 
         WHERE guild_id = $1 AND user_id = $2 
           AND type = 'warn' AND active = true
           AND (expires_at IS NULL OR expires_at > NOW())`,
        [guildId, userId]
    );
    return parseInt(result.rows[0]?.count || 0, 10);
}

/**
 * Get recent infractions for a guild
 * @param {string} guildId - Guild ID
 * @param {number} limit - Max results
 * @returns {Promise<Object[]>} List of infractions
 */
async function getRecent(guildId, limit = 20) {
    const result = await db.query(
        `SELECT * FROM mod_infractions 
         WHERE guild_id = $1 
         ORDER BY created_at DESC 
         LIMIT $2`,
        [guildId, limit]
    );
    return result.rows;
}

/**
 * Get infractions by moderator
 * @param {string} guildId - Guild ID
 * @param {string} moderatorId - Moderator ID
 * @param {number} limit - Max results
 * @returns {Promise<Object[]>} List of infractions
 */
async function getByModerator(guildId, moderatorId, limit = 50) {
    const result = await db.query(
        `SELECT * FROM mod_infractions 
         WHERE guild_id = $1 AND moderator_id = $2 
         ORDER BY created_at DESC 
         LIMIT $3`,
        [guildId, moderatorId, limit]
    );
    return result.rows;
}

/**
 * Update infraction
 * @param {string} guildId - Guild ID
 * @param {number} caseId - Case ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object|null>} Updated infraction
 */
async function update(guildId, caseId, updates) {
    const allowedFields = ['reason', 'active', 'metadata'];
    const setClauses = [];
    const params = [guildId, caseId];
    let paramIndex = 3;
    
    for (const field of allowedFields) {
        if (updates[field] !== undefined) {
            setClauses.push(`${field} = $${paramIndex++}`);
            params.push(field === 'metadata' ? JSON.stringify(updates[field]) : updates[field]);
        }
    }
    
    if (setClauses.length === 0) return null;
    
    const result = await db.query(
        `UPDATE mod_infractions 
         SET ${setClauses.join(', ')}
         WHERE guild_id = $1 AND case_id = $2
         RETURNING *`,
        params
    );
    
    return result.rows[0] || null;
}

/**
 * Deactivate infraction (soft delete)
 * @param {string} guildId - Guild ID
 * @param {number} caseId - Case ID
 * @returns {Promise<boolean>} Success
 */
async function deactivate(guildId, caseId) {
    const result = await db.query(
        `UPDATE mod_infractions 
         SET active = false 
         WHERE guild_id = $1 AND case_id = $2`,
        [guildId, caseId]
    );
    return result.rowCount > 0;
}

/**
 * Deactivate all warnings for a user
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @returns {Promise<number>} Number of deactivated warnings
 */
async function clearWarnings(guildId, userId) {
    const result = await db.query(
        `UPDATE mod_infractions 
         SET active = false 
         WHERE guild_id = $1 AND user_id = $2 AND type = 'warn' AND active = true`,
        [guildId, userId]
    );
    return result.rowCount;
}

/**
 * Get expired warnings to clean up
 * @returns {Promise<Object[]>} List of expired infractions
 */
async function getExpired() {
    const result = await db.query(
        `SELECT * FROM mod_infractions 
         WHERE active = true AND expires_at IS NOT NULL AND expires_at < NOW()`
    );
    return result.rows;
}

/**
 * Expire old infractions
 * @returns {Promise<number>} Number of expired
 */
async function expireOld() {
    const result = await db.query(
        `UPDATE mod_infractions 
         SET active = false 
         WHERE active = true AND expires_at IS NOT NULL AND expires_at < NOW()`
    );
    return result.rowCount;
}

/**
 * Get infraction statistics for a guild
 * @param {string} guildId - Guild ID
 * @returns {Promise<Object>} Statistics
 */
async function getStats(guildId) {
    const result = await db.query(
        `SELECT 
            type,
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE active = true) as active,
            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as last_7_days,
            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as last_30_days
         FROM mod_infractions 
         WHERE guild_id = $1
         GROUP BY type`,
        [guildId]
    );
    return result.rows;
}

/**
 * Search infractions
 * @param {string} guildId - Guild ID
 * @param {Object} criteria - Search criteria
 * @returns {Promise<Object[]>} Matching infractions
 */
async function search(guildId, criteria) {
    const { userId, moderatorId, type, reason, startDate, endDate, limit = 50 } = criteria;
    
    let sql = `SELECT * FROM mod_infractions WHERE guild_id = $1`;
    const params = [guildId];
    let paramIndex = 2;
    
    if (userId) {
        sql += ` AND user_id = $${paramIndex++}`;
        params.push(userId);
    }
    
    if (moderatorId) {
        sql += ` AND moderator_id = $${paramIndex++}`;
        params.push(moderatorId);
    }
    
    if (type) {
        sql += ` AND type = $${paramIndex++}`;
        params.push(type);
    }
    
    if (reason) {
        sql += ` AND reason ILIKE $${paramIndex++}`;
        params.push(`%${reason}%`);
    }
    
    if (startDate) {
        sql += ` AND created_at >= $${paramIndex++}`;
        params.push(startDate);
    }
    
    if (endDate) {
        sql += ` AND created_at <= $${paramIndex++}`;
        params.push(endDate);
    }
    
    sql += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
    params.push(limit);
    
    const result = await db.query(sql, params);
    return result.rows;
}

module.exports = {
    getNextCaseId,
    create,
    getByCaseId,
    getByUser,
    countActiveWarnings,
    getRecent,
    getByModerator,
    update,
    deactivate,
    clearWarnings,
    getExpired,
    expireOld,
    getStats,
    search
};
