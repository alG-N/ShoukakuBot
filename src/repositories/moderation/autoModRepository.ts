/**
 * AutoMod Repository
 * Database operations for auto-moderation settings
 */

import db from '../../database/postgres.js';
import type { AutoModSettings } from '../../types/moderation/automod.js';
import type { AutoModAction, AutoModUpdateData } from '../../types/moderation/automod-repository.js';
// Repository Functions
/**
 * Get auto-mod settings for a guild
 */
async function get(guildId: string): Promise<AutoModSettings | null> {
    const result = await db.query(
        `SELECT * FROM automod_settings WHERE guild_id = $1`,
        [guildId]
    );
    return (result.rows[0] as unknown as AutoModSettings) || null;
}

/**
 * Create default auto-mod settings for a guild
 */
async function create(guildId: string): Promise<AutoModSettings | null> {
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
    
    return result.rows[0] as unknown as AutoModSettings;
}

/**
 * Get or create auto-mod settings
 */
async function getOrCreate(guildId: string): Promise<AutoModSettings | null> {
    const existing = await get(guildId);
    if (existing) return existing;
    return create(guildId);
}

/**
 * Update auto-mod settings
 */
async function update(guildId: string, updates: AutoModUpdateData): Promise<AutoModSettings | null> {
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
    
    const setClauses: string[] = [];
    const params: any[] = [guildId];
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
    
    return (result.rows[0] as unknown as AutoModSettings) || null;
}

/**
 * Toggle a specific auto-mod feature
 */
async function toggleFeature(guildId: string, feature: string, enabled: boolean): Promise<AutoModSettings | null> {
    const fieldName = `${feature}_enabled`;
    return update(guildId, { [fieldName]: enabled });
}

/**
 * Add channel to ignored list
 */
async function addIgnoredChannel(guildId: string, channelId: string): Promise<AutoModSettings | null> {
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
    return (result.rows[0] as unknown as AutoModSettings) || get(guildId);
}

/**
 * Remove channel from ignored list
 */
async function removeIgnoredChannel(guildId: string, channelId: string): Promise<AutoModSettings | null> {
    const result = await db.query(
        `UPDATE automod_settings 
         SET ignored_channels = array_remove(ignored_channels, $2)
         WHERE guild_id = $1
         RETURNING *`,
        [guildId, channelId]
    );
    return (result.rows[0] as unknown as AutoModSettings) || null;
}

/**
 * Add role to ignored list
 */
async function addIgnoredRole(guildId: string, roleId: string): Promise<AutoModSettings | null> {
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
    return (result.rows[0] as unknown as AutoModSettings) || get(guildId);
}

/**
 * Remove role from ignored list
 */
async function removeIgnoredRole(guildId: string, roleId: string): Promise<AutoModSettings | null> {
    const result = await db.query(
        `UPDATE automod_settings 
         SET ignored_roles = array_remove(ignored_roles, $2)
         WHERE guild_id = $1
         RETURNING *`,
        [guildId, roleId]
    );
    return (result.rows[0] as unknown as AutoModSettings) || null;
}

/**
 * Delete auto-mod settings for a guild
 */
async function remove(guildId: string): Promise<boolean> {
    const result = await db.query(
        `DELETE FROM automod_settings WHERE guild_id = $1`,
        [guildId]
    );
    return (result.rowCount ?? 0) > 0;
}

/**
 * Get all guilds with auto-mod enabled
 */
async function getEnabledGuilds(): Promise<string[]> {
    const result = await db.query(
        `SELECT guild_id FROM automod_settings WHERE enabled = true`
    );
    return (result.rows as unknown as { guild_id: string }[]).map(r => r.guild_id);
}

// Export as module object
const AutoModRepository = {
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

export { 
    AutoModRepository,
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
export { type AutoModSettings, type AutoModUpdateData, type AutoModAction };
export default AutoModRepository;




