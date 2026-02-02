/**
 * AutoMod Repository
 * Database operations for auto-moderation settings
 * @module repositories/moderation/AutoModRepository
 */

const db = require('../../database/postgres');

/**
 * Get auto-mod settings for a guild
 * @param {string} guildId - Guild ID
 * @returns {Promise<Object|null>} Settings or null
 */
async function get(guildId) {
    const result = await db.query(
        `SELECT * FROM automod_settings WHERE guild_id = $1`,
        [guildId]
    );
    return result.rows[0] || null;
}

/**
 * Create default auto-mod settings for a guild
 * @param {string} guildId - Guild ID
 * @returns {Promise<Object>} Created settings
 */
async function create(guildId) {
    const result = await db.query(
        `INSERT INTO automod_settings (guild_id) 
         VALUES ($1) 
         ON CONFLICT (guild_id) DO NOTHING
         RETURNING *`,
        [guildId]
    );
    
    // If insert was skipped due to conflict, fetch existing
    if (result.rows.length === 0) {
        return get(guildId);
    }
    
    return result.rows[0];
}

/**
 * Get or create auto-mod settings
 * @param {string} guildId - Guild ID
 * @returns {Promise<Object>} Settings
 */
async function getOrCreate(guildId) {
    const existing = await get(guildId);
    if (existing) return existing;
    return create(guildId);
}

/**
 * Update auto-mod settings
 * @param {string} guildId - Guild ID
 * @param {Object} updates - Settings to update
 * @returns {Promise<Object|null>} Updated settings
 */
async function update(guildId, updates) {
    const allowedFields = [
        'enabled', 'filter_enabled', 'filtered_words',
        'spam_enabled', 'spam_threshold', 'spam_interval', 'spam_window_ms', 'spam_action', 'spam_mute_duration_ms',
        'duplicate_enabled', 'duplicate_threshold', 'duplicate_window_ms', 'duplicate_action',
        'links_enabled', 'links_whitelist', 'links_action',
        'mention_enabled', 'mention_limit', 'mention_action',
        'caps_enabled', 'caps_percent', 'caps_percentage', 'caps_min_length', 'caps_action',
        'invites_enabled', 'invites_whitelist', 'invites_action',
        'new_account_enabled', 'new_account_age_hours', 'new_account_action',
        'raid_enabled', 'raid_join_threshold', 'raid_window_ms', 'raid_action', 'raid_auto_unlock_ms',
        'ignored_channels', 'ignored_roles', 'log_channel_id',
        'auto_warn', 'mute_duration', 'default_action',
        'warn_threshold', 'warn_action', 'warn_reset_hours'
    ];
    
    const setClauses = [];
    const params = [guildId];
    let paramIndex = 2;
    
    for (const field of allowedFields) {
        // Convert camelCase to snake_case for lookup
        const snakeField = field;
        const camelField = field.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        
        const value = updates[snakeField] ?? updates[camelField];
        if (value !== undefined) {
            setClauses.push(`${snakeField} = $${paramIndex++}`);
            params.push(Array.isArray(value) ? value : value);
        }
    }
    
    if (setClauses.length === 0) return get(guildId);
    
    const result = await db.query(
        `UPDATE automod_settings 
         SET ${setClauses.join(', ')}
         WHERE guild_id = $1
         RETURNING *`,
        params
    );
    
    return result.rows[0] || null;
}

/**
 * Toggle a specific auto-mod feature
 * @param {string} guildId - Guild ID
 * @param {string} feature - Feature name (spam, links, etc.)
 * @param {boolean} enabled - Enable or disable
 * @returns {Promise<Object|null>} Updated settings
 */
async function toggleFeature(guildId, feature, enabled) {
    const fieldName = `${feature}_enabled`;
    return update(guildId, { [fieldName]: enabled });
}

/**
 * Add channel to ignored list
 * @param {string} guildId - Guild ID
 * @param {string} channelId - Channel ID
 * @returns {Promise<Object|null>} Updated settings
 */
async function addIgnoredChannel(guildId, channelId) {
    const result = await db.query(
        `UPDATE automod_settings 
         SET ignored_channels = array_append(
             COALESCE(ignored_channels, '{}'), 
             $2
         )
         WHERE guild_id = $1 AND NOT ($2 = ANY(COALESCE(ignored_channels, '{}')))
         RETURNING *`,
        [guildId, channelId]
    );
    return result.rows[0] || get(guildId);
}

/**
 * Remove channel from ignored list
 * @param {string} guildId - Guild ID
 * @param {string} channelId - Channel ID
 * @returns {Promise<Object|null>} Updated settings
 */
async function removeIgnoredChannel(guildId, channelId) {
    const result = await db.query(
        `UPDATE automod_settings 
         SET ignored_channels = array_remove(ignored_channels, $2)
         WHERE guild_id = $1
         RETURNING *`,
        [guildId, channelId]
    );
    return result.rows[0] || null;
}

/**
 * Add role to ignored list
 * @param {string} guildId - Guild ID
 * @param {string} roleId - Role ID
 * @returns {Promise<Object|null>} Updated settings
 */
async function addIgnoredRole(guildId, roleId) {
    const result = await db.query(
        `UPDATE automod_settings 
         SET ignored_roles = array_append(
             COALESCE(ignored_roles, '{}'), 
             $2
         )
         WHERE guild_id = $1 AND NOT ($2 = ANY(COALESCE(ignored_roles, '{}')))
         RETURNING *`,
        [guildId, roleId]
    );
    return result.rows[0] || get(guildId);
}

/**
 * Remove role from ignored list
 * @param {string} guildId - Guild ID
 * @param {string} roleId - Role ID
 * @returns {Promise<Object|null>} Updated settings
 */
async function removeIgnoredRole(guildId, roleId) {
    const result = await db.query(
        `UPDATE automod_settings 
         SET ignored_roles = array_remove(ignored_roles, $2)
         WHERE guild_id = $1
         RETURNING *`,
        [guildId, roleId]
    );
    return result.rows[0] || null;
}

/**
 * Delete auto-mod settings for a guild
 * @param {string} guildId - Guild ID
 * @returns {Promise<boolean>} Success
 */
async function remove(guildId) {
    const result = await db.query(
        `DELETE FROM automod_settings WHERE guild_id = $1`,
        [guildId]
    );
    return result.rowCount > 0;
}

/**
 * Get all guilds with auto-mod enabled
 * @returns {Promise<string[]>} List of guild IDs
 */
async function getEnabledGuilds() {
    const result = await db.query(
        `SELECT guild_id FROM automod_settings WHERE enabled = true`
    );
    return result.rows.map(r => r.guild_id);
}

module.exports = {
    get,
    create,
    getOrCreate,
    update,
    toggleFeature,
    addIgnoredChannel,
    removeIgnoredChannel,
    addIgnoredRole,
    removeIgnoredRole,
    remove,
    getEnabledGuilds
};
