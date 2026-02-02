/**
 * Filter Repository
 * Database operations for word filters
 * @module repositories/moderation/FilterRepository
 */

const db = require('../../database/postgres');

/**
 * Get all filters for a guild
 * @param {string} guildId - Guild ID
 * @returns {Promise<Object[]>} List of filters
 */
async function getAll(guildId) {
    const result = await db.query(
        `SELECT * FROM word_filters 
         WHERE guild_id = $1 
         ORDER BY severity DESC, pattern`,
        [guildId]
    );
    return result.rows;
}

/**
 * Get filter by ID
 * @param {number} id - Filter ID
 * @returns {Promise<Object|null>} Filter or null
 */
async function getById(id) {
    const result = await db.query(
        `SELECT * FROM word_filters WHERE id = $1`,
        [id]
    );
    return result.rows[0] || null;
}

/**
 * Get filter by pattern
 * @param {string} guildId - Guild ID
 * @param {string} pattern - Pattern to search
 * @returns {Promise<Object|null>} Filter or null
 */
async function getByPattern(guildId, pattern) {
    const result = await db.query(
        `SELECT * FROM word_filters 
         WHERE guild_id = $1 AND LOWER(pattern) = LOWER($2)`,
        [guildId, pattern]
    );
    return result.rows[0] || null;
}

/**
 * Add a new filter
 * @param {Object} data - Filter data
 * @returns {Promise<Object>} Created filter
 */
async function add(data) {
    const {
        guildId,
        pattern,
        matchType = 'contains',
        action = 'delete_warn',
        severity = 1,
        createdBy
    } = data;
    
    const result = await db.query(
        `INSERT INTO word_filters (guild_id, pattern, match_type, action, severity, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (guild_id, pattern) DO UPDATE 
         SET match_type = $3, action = $4, severity = $5
         RETURNING *`,
        [guildId, pattern, matchType, action, severity, createdBy]
    );
    
    return result.rows[0];
}

/**
 * Add multiple filters at once
 * @param {string} guildId - Guild ID
 * @param {Object[]} filters - Array of filter data
 * @param {string} createdBy - Creator user ID
 * @returns {Promise<number>} Number of filters added
 */
async function addBulk(guildId, filters, createdBy) {
    if (!filters || filters.length === 0) return 0;
    
    const values = filters.map((f, i) => {
        const offset = i * 6;
        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`;
    }).join(', ');
    
    const params = filters.flatMap(f => [
        guildId,
        f.pattern,
        f.matchType || 'contains',
        f.action || 'delete_warn',
        f.severity || 1,
        createdBy
    ]);
    
    const result = await db.query(
        `INSERT INTO word_filters (guild_id, pattern, match_type, action, severity, created_by)
         VALUES ${values}
         ON CONFLICT (guild_id, pattern) DO NOTHING`,
        params
    );
    
    return result.rowCount;
}

/**
 * Update a filter
 * @param {number} id - Filter ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object|null>} Updated filter
 */
async function update(id, updates) {
    const allowedFields = ['pattern', 'match_type', 'action', 'severity'];
    const setClauses = [];
    const params = [id];
    let paramIndex = 2;
    
    for (const field of allowedFields) {
        const camelField = field.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        const value = updates[field] ?? updates[camelField];
        
        if (value !== undefined) {
            setClauses.push(`${field} = $${paramIndex++}`);
            params.push(value);
        }
    }
    
    if (setClauses.length === 0) return getById(id);
    
    const result = await db.query(
        `UPDATE word_filters 
         SET ${setClauses.join(', ')}
         WHERE id = $1
         RETURNING *`,
        params
    );
    
    return result.rows[0] || null;
}

/**
 * Remove a filter by ID
 * @param {number} id - Filter ID
 * @returns {Promise<boolean>} Success
 */
async function remove(id) {
    const result = await db.query(
        `DELETE FROM word_filters WHERE id = $1`,
        [id]
    );
    return result.rowCount > 0;
}

/**
 * Remove filter by pattern
 * @param {string} guildId - Guild ID
 * @param {string} pattern - Pattern to remove
 * @returns {Promise<boolean>} Success
 */
async function removeByPattern(guildId, pattern) {
    const result = await db.query(
        `DELETE FROM word_filters 
         WHERE guild_id = $1 AND LOWER(pattern) = LOWER($2)`,
        [guildId, pattern]
    );
    return result.rowCount > 0;
}

/**
 * Remove all filters for a guild
 * @param {string} guildId - Guild ID
 * @returns {Promise<number>} Number of filters removed
 */
async function removeAll(guildId) {
    const result = await db.query(
        `DELETE FROM word_filters WHERE guild_id = $1`,
        [guildId]
    );
    return result.rowCount;
}

/**
 * Get filter count for a guild
 * @param {string} guildId - Guild ID
 * @returns {Promise<number>} Filter count
 */
async function count(guildId) {
    const result = await db.query(
        `SELECT COUNT(*) as count FROM word_filters WHERE guild_id = $1`,
        [guildId]
    );
    return parseInt(result.rows[0]?.count || 0, 10);
}

/**
 * Get filters by severity
 * @param {string} guildId - Guild ID
 * @param {number} minSeverity - Minimum severity level
 * @returns {Promise<Object[]>} List of filters
 */
async function getBySeverity(guildId, minSeverity) {
    const result = await db.query(
        `SELECT * FROM word_filters 
         WHERE guild_id = $1 AND severity >= $2
         ORDER BY severity DESC`,
        [guildId, minSeverity]
    );
    return result.rows;
}

/**
 * Search filters
 * @param {string} guildId - Guild ID
 * @param {string} searchTerm - Term to search in patterns
 * @returns {Promise<Object[]>} Matching filters
 */
async function search(guildId, searchTerm) {
    const result = await db.query(
        `SELECT * FROM word_filters 
         WHERE guild_id = $1 AND pattern ILIKE $2
         ORDER BY severity DESC`,
        [guildId, `%${searchTerm}%`]
    );
    return result.rows;
}

module.exports = {
    getAll,
    getById,
    getByPattern,
    add,
    addBulk,
    update,
    remove,
    removeByPattern,
    removeAll,
    count,
    getBySeverity,
    search
};
