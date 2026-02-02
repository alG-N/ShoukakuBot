/**
 * ModLog Repository
 * Database operations for mod log settings
 * @module repositories/moderation/ModLogRepository
 */

const db = require('../../database/postgres');

/**
 * Get mod log settings for a guild
 * @param {string} guildId - Guild ID
 * @returns {Promise<Object|null>} Settings or null
 */
async function get(guildId) {
    const result = await db.query(
        `SELECT * FROM mod_log_settings WHERE guild_id = $1`,
        [guildId]
    );
    return result.rows[0] || null;
}

/**
 * Create default mod log settings
 * @param {string} guildId - Guild ID
 * @returns {Promise<Object>} Created settings
 */
async function create(guildId) {
    const result = await db.query(
        `INSERT INTO mod_log_settings (guild_id) 
         VALUES ($1) 
         ON CONFLICT (guild_id) DO NOTHING
         RETURNING *`,
        [guildId]
    );
    
    if (result.rows.length === 0) {
        return get(guildId);
    }
    
    return result.rows[0];
}

/**
 * Get or create mod log settings
 * @param {string} guildId - Guild ID
 * @returns {Promise<Object>} Settings
 */
async function getOrCreate(guildId) {
    const existing = await get(guildId);
    if (existing) return existing;
    return create(guildId);
}

/**
 * Update mod log settings
 * @param {string} guildId - Guild ID
 * @param {Object} updates - Settings to update
 * @returns {Promise<Object|null>} Updated settings
 */
async function update(guildId, updates) {
    const allowedFields = [
        'log_channel_id',
        'log_warns', 'log_mutes', 'log_kicks', 'log_bans', 'log_unbans',
        'log_automod', 'log_filters',
        'log_message_deletes', 'log_message_edits',
        'log_member_joins', 'log_member_leaves',
        'log_role_changes', 'log_nickname_changes',
        'use_embeds', 'include_moderator', 'include_reason'
    ];
    
    const setClauses = [];
    const params = [guildId];
    let paramIndex = 2;
    
    for (const field of allowedFields) {
        const camelField = field.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        const value = updates[field] ?? updates[camelField];
        
        if (value !== undefined) {
            setClauses.push(`${field} = $${paramIndex++}`);
            params.push(value);
        }
    }
    
    if (setClauses.length === 0) return get(guildId);
    
    const result = await db.query(
        `UPDATE mod_log_settings 
         SET ${setClauses.join(', ')}
         WHERE guild_id = $1
         RETURNING *`,
        params
    );
    
    return result.rows[0] || null;
}

/**
 * Set log channel
 * @param {string} guildId - Guild ID
 * @param {string|null} channelId - Channel ID or null to disable
 * @returns {Promise<Object|null>} Updated settings
 */
async function setLogChannel(guildId, channelId) {
    return update(guildId, { log_channel_id: channelId });
}

/**
 * Toggle a specific log type
 * @param {string} guildId - Guild ID
 * @param {string} logType - Log type (warns, mutes, kicks, etc.)
 * @param {boolean} enabled - Enable or disable
 * @returns {Promise<Object|null>} Updated settings
 */
async function toggleLogType(guildId, logType, enabled) {
    const fieldName = `log_${logType}`;
    return update(guildId, { [fieldName]: enabled });
}

/**
 * Delete mod log settings
 * @param {string} guildId - Guild ID
 * @returns {Promise<boolean>} Success
 */
async function remove(guildId) {
    const result = await db.query(
        `DELETE FROM mod_log_settings WHERE guild_id = $1`,
        [guildId]
    );
    return result.rowCount > 0;
}

/**
 * Check if logging is enabled for a type
 * @param {string} guildId - Guild ID
 * @param {string} logType - Log type
 * @returns {Promise<boolean>} Is enabled
 */
async function isEnabled(guildId, logType) {
    const settings = await get(guildId);
    if (!settings || !settings.log_channel_id) return false;
    
    const fieldName = `log_${logType}`;
    return settings[fieldName] === true;
}

/**
 * Get all guilds with mod logging enabled
 * @returns {Promise<Object[]>} List of guild settings
 */
async function getGuildsWithLogging() {
    const result = await db.query(
        `SELECT * FROM mod_log_settings WHERE log_channel_id IS NOT NULL`
    );
    return result.rows;
}

module.exports = {
    get,
    create,
    getOrCreate,
    update,
    setLogChannel,
    toggleLogType,
    remove,
    isEnabled,
    getGuildsWithLogging
};
