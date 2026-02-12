/**
 * Infraction Repository
 * Database operations for mod infractions/cases
 */

import db from '../../database/postgres.js';
// Interfaces
type InfractionType = 'warn' | 'mute' | 'kick' | 'ban' | 'unban' | 'unmute' | 'note';

interface Infraction {
    id?: number;
    case_id: number;
    guild_id: string;
    user_id: string;
    moderator_id: string;
    type: InfractionType;
    reason: string | null;
    duration_ms: number | null;
    expires_at: Date | null;
    reference_id: number | null;
    metadata: Record<string, any>;
    active: boolean;
    created_at: Date;
}

interface InfractionCreateData {
    guildId: string;
    userId: string;
    moderatorId: string;
    type: InfractionType;
    reason?: string;
    durationMs?: number;
    expiresAt?: Date;
    referenceId?: number;
    metadata?: Record<string, any>;
}

interface InfractionQueryOptions {
    type?: InfractionType;
    activeOnly?: boolean;
    limit?: number;
    offset?: number;
}

interface InfractionSearchCriteria {
    userId?: string;
    moderatorId?: string;
    type?: InfractionType;
    reason?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
}

interface InfractionStats {
    type: InfractionType;
    total: number;
    active: number;
    last_7_days: number;
    last_30_days: number;
}

interface InfractionUpdateData {
    reason?: string;
    active?: boolean;
    metadata?: Record<string, any>;
}
// Repository Functions
/**
 * Get next case ID for a guild (atomic — safe under concurrent access)
 */
async function getNextCaseId(guildId: string): Promise<number> {
    const result = await db.query(
        `SELECT COALESCE(MAX(case_id), 0) + 1 as next_id 
         FROM mod_infractions 
         WHERE guild_id = $1
         FOR UPDATE`,
        [guildId]
    );
    return (result.rows[0] as { next_id: number })?.next_id || 1;
}

/**
 * Create a new infraction
 * Uses atomic case ID generation to prevent race conditions
 */
async function create(data: InfractionCreateData): Promise<Infraction> {
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
    
    // Atomic: generate case_id and insert in a single transaction
    const result = await db.query(
        `INSERT INTO mod_infractions 
         (case_id, guild_id, user_id, moderator_id, type, reason, duration_ms, expires_at, reference_id, metadata)
         VALUES (
            (SELECT COALESCE(MAX(case_id), 0) + 1 FROM mod_infractions WHERE guild_id = $1 FOR UPDATE),
            $1, $2, $3, $4, $5, $6, $7, $8, $9
         )
         RETURNING *`,
        [guildId, userId, moderatorId, type, reason, durationMs, expiresAt, referenceId, metadata || {}]
    );
    
    return result.rows[0] as unknown as Infraction;
}

/**
 * Get infraction by case ID
 */
async function getByCaseId(guildId: string, caseId: number): Promise<Infraction | null> {
    const result = await db.query(
        `SELECT * FROM mod_infractions 
         WHERE guild_id = $1 AND case_id = $2`,
        [guildId, caseId]
    );
    return (result.rows[0] as unknown as Infraction) || null;
}

/**
 * Get infractions for a user
 */
async function getByUser(guildId: string, userId: string, options: InfractionQueryOptions = {}): Promise<Infraction[]> {
    const { type, activeOnly = false, limit = 50, offset = 0 } = options;
    
    let sql = `SELECT * FROM mod_infractions WHERE guild_id = $1 AND user_id = $2`;
    const params: any[] = [guildId, userId];
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
    return result.rows as unknown as Infraction[];
}

/**
 * Count active warnings for a user
 */
async function countActiveWarnings(guildId: string, userId: string): Promise<number> {
    const result = await db.query(
        `SELECT COUNT(*) as count FROM mod_infractions 
         WHERE guild_id = $1 AND user_id = $2 
           AND type = 'warn' AND active = true
           AND (expires_at IS NULL OR expires_at > NOW())`,
        [guildId, userId]
    );
    return parseInt(String(result.rows[0]?.count ?? '0'), 10);
}

/**
 * Get recent infractions for a guild
 */
async function getRecent(guildId: string, limit: number = 20): Promise<Infraction[]> {
    const result = await db.query(
        `SELECT * FROM mod_infractions 
         WHERE guild_id = $1 
         ORDER BY created_at DESC 
         LIMIT $2`,
        [guildId, limit]
    );
    return result.rows as unknown as Infraction[];
}

/**
 * Get infractions by moderator
 */
async function getByModerator(guildId: string, moderatorId: string, limit: number = 50): Promise<Infraction[]> {
    const result = await db.query(
        `SELECT * FROM mod_infractions 
         WHERE guild_id = $1 AND moderator_id = $2 
         ORDER BY created_at DESC 
         LIMIT $3`,
        [guildId, moderatorId, limit]
    );
    return result.rows as unknown as Infraction[];
}

/**
 * Update infraction
 */
async function update(guildId: string, caseId: number, updates: InfractionUpdateData): Promise<Infraction | null> {
    const allowedFields = ['reason', 'active', 'metadata'];
    const setClauses: string[] = [];
    const params: any[] = [guildId, caseId];
    let paramIndex = 3;
    
    for (const field of allowedFields) {
        if ((updates as any)[field] !== undefined) {
            setClauses.push(`${field} = $${paramIndex++}`);
            params.push(field === 'metadata' ? JSON.stringify((updates as any)[field]) : (updates as any)[field]);
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
    
    return (result.rows[0] as unknown as Infraction) || null;
}

/**
 * Deactivate infraction (soft delete)
 */
async function deactivate(guildId: string, caseId: number): Promise<boolean> {
    const result = await db.query(
        `UPDATE mod_infractions 
         SET active = false 
         WHERE guild_id = $1 AND case_id = $2`,
        [guildId, caseId]
    );
    return (result.rowCount ?? 0) > 0;
}

/**
 * Deactivate all warnings for a user
 */
async function clearWarnings(guildId: string, userId: string): Promise<number> {
    const result = await db.query(
        `UPDATE mod_infractions 
         SET active = false 
         WHERE guild_id = $1 AND user_id = $2 AND type = 'warn' AND active = true`,
        [guildId, userId]
    );
    return result.rowCount ?? 0;
}

/**
 * Get expired warnings to clean up
 */
async function getExpired(): Promise<Infraction[]> {
    const result = await db.query(
        `SELECT * FROM mod_infractions 
         WHERE active = true AND expires_at IS NOT NULL AND expires_at < NOW()`
    );
    return result.rows as unknown as Infraction[];
}

/**
 * Expire old infractions
 */
async function expireOld(): Promise<number> {
    const result = await db.query(
        `UPDATE mod_infractions 
         SET active = false 
         WHERE active = true AND expires_at IS NOT NULL AND expires_at < NOW()`
    );
    return result.rowCount ?? 0;
}

/**
 * Get infraction statistics for a guild
 */
async function getStats(guildId: string): Promise<InfractionStats[]> {
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
    return result.rows as unknown as InfractionStats[];
}

/**
 * Search infractions
 */
async function search(guildId: string, criteria: InfractionSearchCriteria): Promise<Infraction[]> {
    const { userId, moderatorId, type, reason, startDate, endDate, limit = 50 } = criteria;
    
    let sql = `SELECT * FROM mod_infractions WHERE guild_id = $1`;
    const params: any[] = [guildId];
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
    return result.rows as unknown as Infraction[];
}

// Export as module object
const InfractionRepository = {
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

export {
    InfractionRepository,
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
export type { 
    Infraction, 
    InfractionType, 
    InfractionCreateData, 
    InfractionQueryOptions, 
    InfractionSearchCriteria,
    InfractionStats,
    InfractionUpdateData
};
export default InfractionRepository;
