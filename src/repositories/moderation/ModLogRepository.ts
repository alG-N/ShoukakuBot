/**
 * ModLog Repository
 * Database operations for mod log settings
 */

import db from '../../database/postgres.js';
import type { ModLogSettings, ModLogUpdateData, ModLogType as LogType } from '../../types/moderation/modlog.js';
// Repository Functions
/**
 * Get mod log settings for a guild
 */
async function get(guildId: string): Promise<ModLogSettings | null> {
    const result = await db.query(
        `SELECT * FROM mod_log_settings WHERE guild_id = $1`,
        [guildId]
    );
    return (result.rows[0] as unknown as ModLogSettings) || null;
}

/**
 * Create default mod log settings
 */
async function create(guildId: string): Promise<ModLogSettings | null> {
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
    
    return result.rows[0] as unknown as ModLogSettings;
}

/**
 * Get or create mod log settings
 */
async function getOrCreate(guildId: string): Promise<ModLogSettings | null> {
    const existing = await get(guildId);
    if (existing) return existing;
    return create(guildId);
}

/**
 * Update mod log settings
 */
async function update(guildId: string, updates: ModLogUpdateData): Promise<ModLogSettings | null> {
    const allowedFields = [
        'log_channel_id',
        'log_warns', 'log_mutes', 'log_kicks', 'log_bans', 'log_unbans',
        'log_automod', 'log_filters',
        'log_message_deletes', 'log_message_edits',
        'log_member_joins', 'log_member_leaves',
        'log_role_changes', 'log_nickname_changes',
        'use_embeds', 'include_moderator', 'include_reason'
    ];
    
    const setClauses: string[] = [];
    const params: any[] = [guildId];
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
    
    return (result.rows[0] as unknown as ModLogSettings) || null;
}

/**
 * Set log channel
 */
async function setLogChannel(guildId: string, channelId: string | null): Promise<ModLogSettings | null> {
    return update(guildId, { log_channel_id: channelId });
}

/**
 * Toggle a specific log type
 */
async function toggleLogType(guildId: string, logType: LogType, enabled: boolean): Promise<ModLogSettings | null> {
    const fieldName = `log_${logType}`;
    return update(guildId, { [fieldName]: enabled });
}

/**
 * Delete mod log settings
 */
async function remove(guildId: string): Promise<boolean> {
    const result = await db.query(
        `DELETE FROM mod_log_settings WHERE guild_id = $1`,
        [guildId]
    );
    return (result.rowCount ?? 0) > 0;
}

/**
 * Check if logging is enabled for a type
 */
async function isEnabled(guildId: string, logType: LogType): Promise<boolean> {
    const settings = await get(guildId);
    if (!settings || !settings.log_channel_id) return false;
    
    const fieldName = `log_${logType}` as keyof ModLogSettings;
    return settings[fieldName] === true;
}

/**
 * Get all guilds with mod logging enabled
 */
async function getGuildsWithLogging(): Promise<ModLogSettings[]> {
    const result = await db.query(
        `SELECT * FROM mod_log_settings WHERE log_channel_id IS NOT NULL`
    );
    return result.rows as unknown as ModLogSettings[];
}

// Export as module object
const ModLogRepository = {
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

export {
    ModLogRepository,
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
export { type ModLogSettings, type ModLogUpdateData, type LogType };
export default ModLogRepository;



