/**
 * PostgreSQL Database Service
 * Connection pool and query helpers for PostgreSQL
 * Includes graceful degradation with write queue for resilience
 * @module database/postgres
 */

import { Pool, PoolClient, QueryResult, PoolConfig } from 'pg';
import gracefulDegradation, { ServiceState } from '../core/GracefulDegradation.js';
import { databasePoolSize, databaseQueriesTotal, databaseQueryDuration } from '../core/metrics.js';

// Use require for internal modules to avoid circular dependency
const logger = require('../core/Logger');
// TYPES & INTERFACES
/**
 * Allowed table names (whitelist for SQL injection prevention)
 */
export const ALLOWED_TABLES = [
    'guild_settings',
    'moderation_logs',
    'user_data',
    'guild_user_data',
    'afk_users',
    'snipes',
    'playlists',
    'bot_stats',
    'command_analytics',
    'nhentai_favourites',
    'anime_watchlist',
    'anime_history',
    'anime_favourites',
    'anime_notifications'
] as const;

export type AllowedTable = typeof ALLOWED_TABLES[number];

/**
 * PostgreSQL error codes that indicate transient failures
 */
export const TRANSIENT_ERROR_CODES = [
    '40001', // serialization_failure
    '40P01', // deadlock_detected
    '57P01', // admin_shutdown
    '57P02', // crash_shutdown
    '57P03', // cannot_connect_now
    '08006', // connection_failure
    '08001', // sqlclient_unable_to_establish_sqlconnection
    '08003', // connection_does_not_exist
    '08004', // sqlserver_rejected_establishment_of_sqlconnection
    '53000', // insufficient_resources
    '53100', // disk_full
    '53200', // out_of_memory
    '53300', // too_many_connections
] as const;

/**
 * Retry configuration
 */
export interface RetryConfig {
    maxRetries: number;
    baseDelayMs: number;
    maxDelayMs: number;
}

/**
 * Query options
 */
export interface QueryOptions {
    retries?: number;
    noRetry?: boolean;
    usePrimary?: boolean;
}

/**
 * Database status info
 */
export interface DatabaseStatus {
    isConnected: boolean;
    state: string;
    failureCount: number;
    maxFailures: number;
    pendingWrites: number;
    readReplica: {
        enabled: boolean;
        host: string | null;
    };
    retryConfig: RetryConfig;
}

/**
 * Write queue entry
 */
export interface WriteQueueEntry {
    operation: 'insert' | 'update' | 'delete';
    params: {
        table: string;
        data?: Record<string, unknown>;
        where?: Record<string, unknown>;
    };
    timestamp: number;
}

/**
 * Queued response
 */
export interface QueuedResponse {
    queued: true;
    operation: string;
    table: string;
}

/**
 * Transaction callback function
 */
export type TransactionCallback<T> = (client: PoolClient) => Promise<T>;

/**
 * PostgreSQL error with code
 */
interface PgError extends Error {
    code?: string;
}
// VALIDATION HELPERS
/**
 * Regex for valid SQL identifiers (alphanumeric and underscore only)
 */
const VALID_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Validate table name against whitelist
 * @param table - Table name to validate
 * @throws Error if table is not in whitelist
 */
export function validateTable(table: string): asserts table is AllowedTable {
    if (!ALLOWED_TABLES.includes(table as AllowedTable)) {
        throw new Error(`Invalid table name: ${table}. Table not in whitelist.`);
    }
}

/**
 * Validate column/identifier name format
 * @param identifier - Column or identifier name
 * @throws Error if identifier format is invalid
 */
export function validateIdentifier(identifier: string): void {
    if (!VALID_IDENTIFIER.test(identifier)) {
        throw new Error(`Invalid identifier: ${identifier}. Only alphanumeric and underscore allowed.`);
    }
}
// POSTGRESQL DATABASE CLASS
/**
 * PostgreSQL database service with connection pooling and resilience
 */
export class PostgresDatabase {
    /** Primary connection pool */
    private pool: Pool | null = null;
    
    /** Read replica pool */
    private readPool: Pool | null = null;
    
    /** Connection status */
    public isConnected: boolean = false;
    
    /** Read replica enabled */
    public readReplicaEnabled: boolean = false;
    
    /** Consecutive failure count */
    private failureCount: number = 0;
    
    /** Max failures before marking degraded */
    private maxFailures: number = 3;
    
    /** Write queue processor interval */
    private _writeQueueProcessor: NodeJS.Timeout | null = null;
    
    /** Retry configuration */
    public retryConfig: RetryConfig = {
        maxRetries: 3,
        baseDelayMs: 1000,
        maxDelayMs: 10000,
    };

    /**
     * Initialize the database connection pool
     */
    async initialize(): Promise<void> {
        if (this.pool) return;

        const config: PoolConfig = {
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '5432'),
            user: process.env.DB_USER || 'altergolden',
            password: process.env.DB_PASSWORD || 'altergolden_secret',
            database: process.env.DB_NAME || 'altergolden_db',
            
            // Connection pool settings
            max: parseInt(process.env.DB_POOL_MAX || '15'),
            min: parseInt(process.env.DB_POOL_MIN || '2'),
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000,
            
            // Query timeout
            statement_timeout: parseInt(process.env.DB_QUERY_TIMEOUT || '30000'),
            query_timeout: parseInt(process.env.DB_QUERY_TIMEOUT || '30000'),
            
            allowExitOnIdle: false,
        };

        this.pool = new Pool(config);
        
        // Setup pool monitoring
        this._setupPoolMonitoring(this.pool, 'primary');
        
        // Initialize read replica if configured
        if (process.env.DB_READ_HOST) {
            await this._initializeReadReplica();
        }

        // Test connection
        try {
            const client = await this.pool.connect();
            await client.query('SELECT NOW()');
            client.release();
            this.isConnected = true;
            logger.success('PostgreSQL', 'Connected to database');
            
            // Register with graceful degradation
            gracefulDegradation.initialize();
            gracefulDegradation.registerFallback('database', async () => null);
            gracefulDegradation.markHealthy('database');
            
            // Start write queue processor
            this._startWriteQueueProcessor();
        } catch (error) {
            logger.error('PostgreSQL', `Connection failed: ${(error as Error).message}`);
            throw error;
        }

        // Handle pool errors
        this.pool.on('error', (err: Error) => {
            logger.error('PostgreSQL', `Pool error: ${err.message}`);
            this._handleConnectionError(err);
        });
    }

    /**
     * Initialize read replica pool
     */
    private async _initializeReadReplica(): Promise<void> {
        const readConfig: PoolConfig = {
            host: process.env.DB_READ_HOST,
            port: parseInt(process.env.DB_READ_PORT || process.env.DB_PORT || '5432'),
            user: process.env.DB_READ_USER || process.env.DB_USER || 'altergolden',
            password: process.env.DB_READ_PASSWORD || process.env.DB_PASSWORD || 'altergolden_secret',
            database: process.env.DB_NAME || 'altergolden_db',
            
            max: parseInt(process.env.DB_READ_POOL_MAX || '20'),
            min: parseInt(process.env.DB_READ_POOL_MIN || '2'),
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000,
            
            statement_timeout: parseInt(process.env.DB_QUERY_TIMEOUT || '30000'),
            query_timeout: parseInt(process.env.DB_QUERY_TIMEOUT || '30000'),
            
            allowExitOnIdle: false,
        };

        try {
            this.readPool = new Pool(readConfig);
            
            const client = await this.readPool.connect();
            await client.query('SELECT NOW()');
            client.release();
            
            this.readReplicaEnabled = true;
            logger.success('PostgreSQL', `Read replica connected: ${process.env.DB_READ_HOST}`);
            
            this.readPool.on('error', (err: Error) => {
                logger.error('PostgreSQL', `Read pool error: ${err.message}`);
            });
            
            // Setup monitoring for read pool
            this._setupPoolMonitoring(this.readPool, 'replica');
        } catch (error) {
            logger.warn('PostgreSQL', `Read replica connection failed, using primary only: ${(error as Error).message}`);
            this.readPool = null;
            this.readReplicaEnabled = false;
        }
    }

    /**
     * Setup pool monitoring with Prometheus metrics
     * Tracks connections acquired, released, and pool utilization
     */
    private _setupPoolMonitoring(pool: Pool, poolName: string): void {
        // Track connection acquisition
        pool.on('connect', () => {
            databasePoolSize.labels({ state: `${poolName}_total` }).inc();
            logger.debug('PostgreSQL', `${poolName} pool: connection created`);
        });

        pool.on('acquire', () => {
            databasePoolSize.labels({ state: `${poolName}_active` }).inc();
        });

        pool.on('release', () => {
            databasePoolSize.labels({ state: `${poolName}_active` }).dec();
        });

        pool.on('remove', () => {
            databasePoolSize.labels({ state: `${poolName}_total` }).dec();
            logger.debug('PostgreSQL', `${poolName} pool: connection removed`);
        });

        // Start periodic pool stats collection
        const statsInterval = setInterval(() => {
            if (!pool) return;
            
            const total = pool.totalCount;
            const idle = pool.idleCount;
            const waiting = pool.waitingCount;
            const active = total - idle;
            
            // Update gauges
            databasePoolSize.labels({ state: `${poolName}_total` }).set(total);
            databasePoolSize.labels({ state: `${poolName}_idle` }).set(idle);
            databasePoolSize.labels({ state: `${poolName}_active` }).set(active);
            databasePoolSize.labels({ state: `${poolName}_waiting` }).set(waiting);
            
            // Log warning if pool is near exhaustion
            const utilization = active / (total || 1);
            if (utilization > 0.8) {
                logger.warn('PostgreSQL', `${poolName} pool high utilization: ${(utilization * 100).toFixed(1)}% (${active}/${total} active, ${waiting} waiting)`);
            }
            
            // Critical alert if there are waiting clients
            if (waiting > 0) {
                logger.error('PostgreSQL', `${poolName} pool exhaustion: ${waiting} clients waiting for connections`);
            }
        }, 10000); // Every 10 seconds
        
        // Don't prevent process exit
        statsInterval.unref();
    }

    /**
     * Check if a query is read-only
     */
    private _isReadOnlyQuery(text: string): boolean {
        const normalized = text.trim().toUpperCase();
        
        if (!normalized.startsWith('SELECT')) {
            return false;
        }
        
        if (normalized.includes('FOR UPDATE') || normalized.includes('FOR SHARE')) {
            return false;
        }
        
        if (normalized.startsWith('WITH') && (
            normalized.includes('INSERT') ||
            normalized.includes('UPDATE') ||
            normalized.includes('DELETE')
        )) {
            return false;
        }
        
        return true;
    }

    /**
     * Get the appropriate pool for a query
     */
    private _getPool(text: string, options: QueryOptions = {}): Pool {
        if (options.usePrimary || !this.pool) {
            return this.pool!;
        }
        
        if (this.readReplicaEnabled && this.readPool && this._isReadOnlyQuery(text)) {
            return this.readPool;
        }
        
        return this.pool;
    }

    /**
     * Execute a query with automatic retry
     * @param text - SQL query
     * @param params - Query parameters
     * @param options - Query options
     * @returns Query result
     */
    async query<T extends Record<string, unknown> = Record<string, unknown>>(
        text: string, 
        params: unknown[] = [], 
        options: QueryOptions = {}
    ): Promise<QueryResult<T>> {
        if (!this.pool) {
            throw new Error('Database not initialized');
        }

        const pool = this._getPool(text, options);
        const maxRetries = options.noRetry ? 0 : (options.retries ?? this.retryConfig.maxRetries);
        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            const start = Date.now();
            
            try {
                const result = await pool.query<T>(text, params);
                const duration = Date.now() - start;
                
                this.failureCount = 0;
                
                if (duration > 1000) {
                    logger.warn('PostgreSQL', `Slow query (${duration}ms): ${text.substring(0, 100)}`);
                }
                
                if (attempt > 0) {
                    logger.info('PostgreSQL', `Query succeeded on retry ${attempt}`);
                }
                
                return result;
            } catch (error) {
                lastError = error as Error;
                
                if (attempt < maxRetries && this._isTransientError(error as PgError)) {
                    const delay = this._calculateRetryDelay(attempt);
                    logger.warn('PostgreSQL', `Transient error (${(error as PgError).code}), retry ${attempt + 1}/${maxRetries} in ${delay}ms`);
                    await this._sleep(delay);
                    continue;
                }
                
                this._handleQueryError(error as Error);
                throw error;
            }
        }

        throw lastError!;
    }

    /**
     * Check if error is transient
     */
    private _isTransientError(error: PgError): boolean {
        if (error.code && TRANSIENT_ERROR_CODES.includes(error.code as typeof TRANSIENT_ERROR_CODES[number])) {
            return true;
        }
        
        const transientMessages = [
            'ECONNREFUSED',
            'ENOTFOUND',
            'ETIMEDOUT',
            'ECONNRESET',
            'connection terminated',
            'connection refused',
            'timeout expired',
        ];
        
        const errorMessage = error.message?.toLowerCase() || '';
        return transientMessages.some(msg => errorMessage.includes(msg.toLowerCase()));
    }

    /**
     * Calculate retry delay with exponential backoff
     */
    private _calculateRetryDelay(attempt: number): number {
        const { baseDelayMs, maxDelayMs } = this.retryConfig;
        const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
        const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
        return Math.min(exponentialDelay + jitter, maxDelayMs);
    }

    /**
     * Sleep helper
     */
    private _sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get a single row
     */
    async getOne<T extends Record<string, unknown> = Record<string, unknown>>(
        text: string, 
        params: unknown[] = []
    ): Promise<T | null> {
        const result = await this.query<T>(text, params);
        return result.rows[0] || null;
    }

    /**
     * Get multiple rows
     */
    async getMany<T extends Record<string, unknown> = Record<string, unknown>>(
        text: string, 
        params: unknown[] = []
    ): Promise<T[]> {
        const result = await this.query<T>(text, params);
        return result.rows;
    }

    /**
     * Execute an insert and return the inserted row
     */
    async insert<T extends Record<string, unknown> = Record<string, unknown>>(
        table: string, 
        data: Record<string, unknown>
    ): Promise<T> {
        validateTable(table);
        
        const keys = Object.keys(data);
        const values = Object.values(data);
        
        keys.forEach(key => validateIdentifier(key));
        
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
        const text = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`;
        
        const result = await this.query<T>(text, values);
        return result.rows[0] as T;
    }

    /**
     * Execute an update
     */
    async update<T extends Record<string, unknown> = Record<string, unknown>>(
        table: string, 
        data: Record<string, unknown>, 
        where: Record<string, unknown>
    ): Promise<T | null> {
        validateTable(table);
        
        const setKeys = Object.keys(data);
        const setValues = Object.values(data);
        const whereKeys = Object.keys(where);
        const whereValues = Object.values(where);
        
        setKeys.forEach(key => validateIdentifier(key));
        whereKeys.forEach(key => validateIdentifier(key));
        
        const setClause = setKeys.map((k, i) => `${k} = $${i + 1}`).join(', ');
        const whereClause = whereKeys.map((k, i) => `${k} = $${setKeys.length + i + 1}`).join(' AND ');
        
        const text = `UPDATE ${table} SET ${setClause} WHERE ${whereClause} RETURNING *`;
        const result = await this.query<T>(text, [...setValues, ...whereValues]);
        return result.rows[0] || null;
    }

    /**
     * Upsert (insert or update)
     */
    async upsert<T extends Record<string, unknown> = Record<string, unknown>>(
        table: string, 
        data: Record<string, unknown>, 
        conflictKey: string
    ): Promise<T> {
        validateTable(table);
        
        const keys = Object.keys(data);
        const values = Object.values(data);
        
        keys.forEach(key => validateIdentifier(key));
        validateIdentifier(conflictKey);
        
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
        const updateClause = keys
            .filter(k => k !== conflictKey)
            .map(k => `${k} = EXCLUDED.${k}`)
            .join(', ');
        
        const text = `
            INSERT INTO ${table} (${keys.join(', ')}) 
            VALUES (${placeholders}) 
            ON CONFLICT (${conflictKey}) 
            DO UPDATE SET ${updateClause}
            RETURNING *
        `;
        
        const result = await this.query<T>(text, values);
        return result.rows[0] as T;
    }

    /**
     * Delete rows
     */
    async delete(table: string, where: Record<string, unknown>): Promise<number> {
        validateTable(table);
        
        const whereKeys = Object.keys(where);
        const whereValues = Object.values(where);
        
        whereKeys.forEach(key => validateIdentifier(key));
        
        const whereClause = whereKeys.map((k, i) => `${k} = $${i + 1}`).join(' AND ');
        const text = `DELETE FROM ${table} WHERE ${whereClause}`;
        
        const result = await this.query(text, whereValues);
        return result.rowCount || 0;
    }

    /**
     * Execute a transaction
     */
    async transaction<T>(callback: TransactionCallback<T>): Promise<T> {
        if (!this.pool) {
            throw new Error('Database not initialized');
        }
        
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Close the connection pool
     */
    async close(): Promise<void> {
        if (this._writeQueueProcessor) {
            clearInterval(this._writeQueueProcessor);
            this._writeQueueProcessor = null;
        }
        
        if (this.readPool) {
            await this.readPool.end();
            this.readPool = null;
            this.readReplicaEnabled = false;
            logger.info('PostgreSQL', 'Read replica pool closed');
        }
        
        if (this.pool) {
            await this.pool.end();
            this.pool = null;
            this.isConnected = false;
            logger.info('PostgreSQL', 'Connection pool closed');
        }
    }

    /**
     * Health check
     */
    async healthCheck(): Promise<boolean> {
        try {
            await this.query('SELECT 1', [], { usePrimary: true });
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Read replica health check
     */
    async readReplicaHealthCheck(): Promise<boolean> {
        if (!this.readPool || !this.readReplicaEnabled) {
            return false;
        }
        
        try {
            await this.readPool.query('SELECT 1');
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Handle connection error
     */
    private _handleConnectionError(error: Error): void {
        this.failureCount++;
        logger.error('PostgreSQL', `Connection error (${this.failureCount}/${this.maxFailures}): ${error.message}`);
        
        if (this.failureCount >= this.maxFailures) {
            gracefulDegradation.markUnavailable('database', 'Too many connection failures');
            this.isConnected = false;
        }
    }

    /**
     * Handle query error
     */
    private _handleQueryError(error: Error): void {
        logger.error('PostgreSQL', `Query error: ${error.message}`);
        
        const connectionErrors = ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'CONNECTION_TIMEOUT'];
        if (connectionErrors.some(code => error.message.includes(code))) {
            this._handleConnectionError(error);
        }
    }

    /**
     * Start write queue processor
     */
    private _startWriteQueueProcessor(): void {
        this._writeQueueProcessor = setInterval(async () => {
            try {
                const state = gracefulDegradation.getServiceState('database');
                
                // Queue processing happens automatically when service becomes healthy
                // This is just for monitoring - actual processing is event-driven
                if (state === ServiceState.HEALTHY && this.isConnected) {
                    // Queue is processed automatically by GracefulDegradation
                    // when markHealthy is called
                }
            } catch (error) {
                logger.error('PostgreSQL', `Write queue processing error: ${(error as Error).message}`);
            }
        }, 30000);
    }

    /**
     * Queue a write operation for later execution
     */
    async queueWrite(operation: WriteQueueEntry['operation'], params: WriteQueueEntry['params']): Promise<void> {
        gracefulDegradation.queueWrite('database', operation, params);
        logger.warn('PostgreSQL', `Queued ${operation} for later execution`);
    }

    /**
     * Safe insert with graceful degradation
     */
    async safeInsert<T extends Record<string, unknown> = Record<string, unknown>>(
        table: string, 
        data: Record<string, unknown>
    ): Promise<T | QueuedResponse> {
        const state = gracefulDegradation.getServiceState('database');
        
        if (state === ServiceState.UNAVAILABLE || !this.isConnected) {
            await this.queueWrite('insert', { table, data });
            return { queued: true, operation: 'insert', table };
        }
        
        return this.insert<T>(table, data);
    }

    /**
     * Safe update with graceful degradation
     */
    async safeUpdate<T extends Record<string, unknown> = Record<string, unknown>>(
        table: string, 
        data: Record<string, unknown>, 
        where: Record<string, unknown>
    ): Promise<T | QueuedResponse | null> {
        const state = gracefulDegradation.getServiceState('database');
        
        if (state === ServiceState.UNAVAILABLE || !this.isConnected) {
            await this.queueWrite('update', { table, data, where });
            return { queued: true, operation: 'update', table };
        }
        
        return this.update<T>(table, data, where);
    }

    /**
     * Safe delete with graceful degradation
     */
    async safeDelete(
        table: string, 
        where: Record<string, unknown>
    ): Promise<number | QueuedResponse> {
        const state = gracefulDegradation.getServiceState('database');
        
        if (state === ServiceState.UNAVAILABLE || !this.isConnected) {
            await this.queueWrite('delete', { table, where });
            return { queued: true, operation: 'delete', table };
        }
        
        return this.delete(table, where);
    }

    /**
     * Get database status
     */
    getStatus(): DatabaseStatus {
        const state = gracefulDegradation.getServiceState('database');
        const stateString = state ? state.toLowerCase() : 'unknown';
        
        return {
            isConnected: this.isConnected,
            state: stateString,
            failureCount: this.failureCount,
            maxFailures: this.maxFailures,
            pendingWrites: 0, // Write queue is internal to GracefulDegradation
            readReplica: {
                enabled: this.readReplicaEnabled,
                host: process.env.DB_READ_HOST || null,
            },
            retryConfig: this.retryConfig,
        };
    }

    /**
     * Shutdown (alias for close)
     */
    async shutdown(): Promise<void> {
        await this.close();
    }
}
// SINGLETON EXPORT
/**
 * Default database instance
 */
const defaultInstance = new PostgresDatabase();

// ============================================================================
// HIGH-LEVEL INITIALIZATION
// ============================================================================

let isDbInitialized = false;

/**
 * Initialize database connection with table verification
 * This is the recommended entry point for application startup
 * Tables are created by 01-schema.sql when Docker starts
 */
export async function initializeDatabase(): Promise<void> {
    if (isDbInitialized) {
        console.log('⚠️ [Database] Already initialized');
        return;
    }

    try {
        await defaultInstance.initialize();
        
        // Verify tables exist
        const result = await defaultInstance.query<{ table_name: string }>(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('guild_settings', 'moderation_logs', 'snipes')
        `);
        
        if (result.rows.length < 3) {
            console.warn('⚠️ [Database] Some tables missing. Ensure 01-schema.sql has been executed.');
        }
        
        isDbInitialized = true;
        console.log('✅ [Database] PostgreSQL initialized');
    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error('❌ [Database] PostgreSQL initialization failed:', errMsg);
        throw error; // Don't fail silently - DB is required
    }
}

/**
 * Check if database is initialized
 */
export function isDatabaseReady(): boolean {
    return isDbInitialized;
}

// Default export
export default defaultInstance;
// CommonJS COMPATIBILITY
module.exports = defaultInstance;
module.exports.PostgresDatabase = PostgresDatabase;
module.exports.validateTable = validateTable;
module.exports.validateIdentifier = validateIdentifier;
module.exports.ALLOWED_TABLES = ALLOWED_TABLES;
module.exports.TRANSIENT_ERROR_CODES = TRANSIENT_ERROR_CODES;
module.exports.initializeDatabase = initializeDatabase;
module.exports.isDatabaseReady = isDatabaseReady;
module.exports.default = defaultInstance;
