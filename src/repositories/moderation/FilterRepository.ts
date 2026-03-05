/**
 * Filter Repository
 * Database operations for word filters
 */

import db from '../../database/postgres.js';
import type {
    WordFilter,
    FilterMatchType,
    FilterAction,
    FilterAddData,
    FilterBulkItem,
    FilterUpdateData
} from '../../types/moderation/filter-repository.js';
// Repository Functions
/**
 * Get all filters for a guild
 */
async function getAll(guildId: string): Promise<WordFilter[]> {
    const result = await db.query(
        `SELECT * FROM word_filters 
         WHERE guild_id = $1 
         ORDER BY severity DESC, pattern`,
        [guildId]
    );
    return result.rows as unknown as WordFilter[];
}

/**
 * Get filter by ID
 */
async function getById(id: number): Promise<WordFilter | null> {
    const result = await db.query(
        `SELECT * FROM word_filters WHERE id = $1`,
        [id]
    );
    return (result.rows[0] as unknown as WordFilter) || null;
}

/**
 * Get filter by pattern
 */
async function getByPattern(guildId: string, pattern: string): Promise<WordFilter | null> {
    const result = await db.query(
        `SELECT * FROM word_filters 
         WHERE guild_id = $1 AND LOWER(pattern) = LOWER($2)`,
        [guildId, pattern]
    );
    return (result.rows[0] as unknown as WordFilter) || null;
}

/**
 * Add a new filter
 */
async function add(data: FilterAddData): Promise<WordFilter> {
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
    
    return result.rows[0] as unknown as WordFilter;
}

/**
 * Add multiple filters at once
 */
async function addBulk(guildId: string, filters: FilterBulkItem[], createdBy: string): Promise<number> {
    if (!filters || filters.length === 0) return 0;
    
    const values = filters.map((_, i) => {
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
    
    return result.rowCount ?? 0;
}

/**
 * Update a filter
 */
async function update(id: number, updates: FilterUpdateData): Promise<WordFilter | null> {
    const allowedFields = ['pattern', 'match_type', 'action', 'severity'];
    const setClauses: string[] = [];
    const params: any[] = [id];
    let paramIndex = 2;
    
    for (const field of allowedFields) {
        const camelField = field.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        const value = (updates as any)[field] ?? (updates as any)[camelField];
        
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
    
    return (result.rows[0] as unknown as WordFilter) || null;
}

/**
 * Remove a filter by ID
 */
async function remove(id: number): Promise<boolean> {
    const result = await db.query(
        `DELETE FROM word_filters WHERE id = $1`,
        [id]
    );
    return (result.rowCount ?? 0) > 0;
}

/**
 * Remove filter by pattern
 */
async function removeByPattern(guildId: string, pattern: string): Promise<boolean> {
    const result = await db.query(
        `DELETE FROM word_filters 
         WHERE guild_id = $1 AND LOWER(pattern) = LOWER($2)`,
        [guildId, pattern]
    );
    return (result.rowCount ?? 0) > 0;
}

/**
 * Remove all filters for a guild
 */
async function removeAll(guildId: string): Promise<number> {
    const result = await db.query(
        `DELETE FROM word_filters WHERE guild_id = $1`,
        [guildId]
    );
    return result.rowCount ?? 0;
}

/**
 * Get filter count for a guild
 */
async function count(guildId: string): Promise<number> {
    const result = await db.query(
        `SELECT COUNT(*) as count FROM word_filters WHERE guild_id = $1`,
        [guildId]
    );
    return parseInt(String(result.rows[0]?.count ?? '0'), 10);
}

/**
 * Get filters by severity
 */
async function getBySeverity(guildId: string, minSeverity: number): Promise<WordFilter[]> {
    const result = await db.query(
        `SELECT * FROM word_filters 
         WHERE guild_id = $1 AND severity >= $2
         ORDER BY severity DESC`,
        [guildId, minSeverity]
    );
    return result.rows as unknown as WordFilter[];
}

/**
 * Search filters
 */
async function search(guildId: string, searchTerm: string): Promise<WordFilter[]> {
    const result = await db.query(
        `SELECT * FROM word_filters 
         WHERE guild_id = $1 AND pattern ILIKE $2
         ORDER BY severity DESC`,
        [guildId, `%${searchTerm}%`]
    );
    return result.rows as unknown as WordFilter[];
}

// Export as module object
const FilterRepository = {
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

export {
    FilterRepository,
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
export { type WordFilter, type FilterMatchType, type FilterAction, type FilterAddData, type FilterBulkItem, type FilterUpdateData };
export default FilterRepository;


