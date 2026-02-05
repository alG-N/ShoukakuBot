"use strict";
/**
 * PostgreSQL Database Service
 * Connection pool and query helpers for PostgreSQL
 * Includes graceful degradation with write queue for resilience
 * @module database/postgres
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresDatabase = exports.TRANSIENT_ERROR_CODES = exports.ALLOWED_TABLES = void 0;
exports.validateTable = validateTable;
exports.validateIdentifier = validateIdentifier;
exports.initializeDatabase = initializeDatabase;
exports.isDatabaseReady = isDatabaseReady;
const pg_1 = require("pg");
const GracefulDegradation_js_1 = __importStar(require("../core/GracefulDegradation.js"));
const metrics_js_1 = require("../core/metrics.js");
// Use require for internal modules to avoid circular dependency
const logger = require('../core/Logger');
// TYPES & INTERFACES
/**
 * Allowed table names (whitelist for SQL injection prevention)
 */
exports.ALLOWED_TABLES = [
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
    'anime_notifications',
    'automod_settings',
    'mod_log_settings'
];
/**
 * PostgreSQL error codes that indicate transient failures
 */
exports.TRANSIENT_ERROR_CODES = [
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
];
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
function validateTable(table) {
    if (!exports.ALLOWED_TABLES.includes(table)) {
        throw new Error(`Invalid table name: ${table}. Table not in whitelist.`);
    }
}
/**
 * Validate column/identifier name format
 * @param identifier - Column or identifier name
 * @throws Error if identifier format is invalid
 */
function validateIdentifier(identifier) {
    if (!VALID_IDENTIFIER.test(identifier)) {
        throw new Error(`Invalid identifier: ${identifier}. Only alphanumeric and underscore allowed.`);
    }
}
// POSTGRESQL DATABASE CLASS
/**
 * PostgreSQL database service with connection pooling and resilience
 */
class PostgresDatabase {
    /** Primary connection pool */
    pool = null;
    /** Read replica pool */
    readPool = null;
    /** Connection status */
    isConnected = false;
    /** Read replica enabled */
    readReplicaEnabled = false;
    /** Consecutive failure count */
    failureCount = 0;
    /** Max failures before marking degraded */
    maxFailures = 3;
    /** Write queue processor interval */
    _writeQueueProcessor = null;
    /** Retry configuration */
    retryConfig = {
        maxRetries: 3,
        baseDelayMs: 1000,
        maxDelayMs: 10000,
    };
    /**
     * Initialize the database connection pool
     */
    async initialize() {
        if (this.pool)
            return;
        const config = {
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
        this.pool = new pg_1.Pool(config);
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
            GracefulDegradation_js_1.default.initialize();
            GracefulDegradation_js_1.default.registerFallback('database', async () => null);
            GracefulDegradation_js_1.default.markHealthy('database');
            // Start write queue processor
            this._startWriteQueueProcessor();
        }
        catch (error) {
            logger.error('PostgreSQL', `Connection failed: ${error.message}`);
            throw error;
        }
        // Handle pool errors
        this.pool.on('error', (err) => {
            logger.error('PostgreSQL', `Pool error: ${err.message}`);
            this._handleConnectionError(err);
        });
    }
    /**
     * Initialize read replica pool
     */
    async _initializeReadReplica() {
        const readConfig = {
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
            this.readPool = new pg_1.Pool(readConfig);
            const client = await this.readPool.connect();
            await client.query('SELECT NOW()');
            client.release();
            this.readReplicaEnabled = true;
            logger.success('PostgreSQL', `Read replica connected: ${process.env.DB_READ_HOST}`);
            this.readPool.on('error', (err) => {
                logger.error('PostgreSQL', `Read pool error: ${err.message}`);
            });
            // Setup monitoring for read pool
            this._setupPoolMonitoring(this.readPool, 'replica');
        }
        catch (error) {
            logger.warn('PostgreSQL', `Read replica connection failed, using primary only: ${error.message}`);
            this.readPool = null;
            this.readReplicaEnabled = false;
        }
    }
    /**
     * Setup pool monitoring with Prometheus metrics
     * Tracks connections acquired, released, and pool utilization
     */
    _setupPoolMonitoring(pool, poolName) {
        // Track connection acquisition
        pool.on('connect', () => {
            metrics_js_1.databasePoolSize.labels({ state: `${poolName}_total` }).inc();
            logger.debug('PostgreSQL', `${poolName} pool: connection created`);
        });
        pool.on('acquire', () => {
            metrics_js_1.databasePoolSize.labels({ state: `${poolName}_active` }).inc();
        });
        pool.on('release', () => {
            metrics_js_1.databasePoolSize.labels({ state: `${poolName}_active` }).dec();
        });
        pool.on('remove', () => {
            metrics_js_1.databasePoolSize.labels({ state: `${poolName}_total` }).dec();
            logger.debug('PostgreSQL', `${poolName} pool: connection removed`);
        });
        // Start periodic pool stats collection
        const statsInterval = setInterval(() => {
            if (!pool)
                return;
            const total = pool.totalCount;
            const idle = pool.idleCount;
            const waiting = pool.waitingCount;
            const active = total - idle;
            // Update gauges
            metrics_js_1.databasePoolSize.labels({ state: `${poolName}_total` }).set(total);
            metrics_js_1.databasePoolSize.labels({ state: `${poolName}_idle` }).set(idle);
            metrics_js_1.databasePoolSize.labels({ state: `${poolName}_active` }).set(active);
            metrics_js_1.databasePoolSize.labels({ state: `${poolName}_waiting` }).set(waiting);
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
    _isReadOnlyQuery(text) {
        const normalized = text.trim().toUpperCase();
        if (!normalized.startsWith('SELECT')) {
            return false;
        }
        if (normalized.includes('FOR UPDATE') || normalized.includes('FOR SHARE')) {
            return false;
        }
        if (normalized.startsWith('WITH') && (normalized.includes('INSERT') ||
            normalized.includes('UPDATE') ||
            normalized.includes('DELETE'))) {
            return false;
        }
        return true;
    }
    /**
     * Get the appropriate pool for a query
     */
    _getPool(text, options = {}) {
        if (options.usePrimary || !this.pool) {
            return this.pool;
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
    async query(text, params = [], options = {}) {
        if (!this.pool) {
            throw new Error('Database not initialized');
        }
        const pool = this._getPool(text, options);
        const maxRetries = options.noRetry ? 0 : (options.retries ?? this.retryConfig.maxRetries);
        let lastError = null;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            const start = Date.now();
            try {
                const result = await pool.query(text, params);
                const duration = Date.now() - start;
                this.failureCount = 0;
                if (duration > 1000) {
                    logger.warn('PostgreSQL', `Slow query (${duration}ms): ${text.substring(0, 100)}`);
                }
                if (attempt > 0) {
                    logger.info('PostgreSQL', `Query succeeded on retry ${attempt}`);
                }
                return result;
            }
            catch (error) {
                lastError = error;
                if (attempt < maxRetries && this._isTransientError(error)) {
                    const delay = this._calculateRetryDelay(attempt);
                    logger.warn('PostgreSQL', `Transient error (${error.code}), retry ${attempt + 1}/${maxRetries} in ${delay}ms`);
                    await this._sleep(delay);
                    continue;
                }
                this._handleQueryError(error);
                throw error;
            }
        }
        throw lastError;
    }
    /**
     * Check if error is transient
     */
    _isTransientError(error) {
        if (error.code && exports.TRANSIENT_ERROR_CODES.includes(error.code)) {
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
    _calculateRetryDelay(attempt) {
        const { baseDelayMs, maxDelayMs } = this.retryConfig;
        const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
        const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
        return Math.min(exponentialDelay + jitter, maxDelayMs);
    }
    /**
     * Sleep helper
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * Get a single row
     */
    async getOne(text, params = []) {
        const result = await this.query(text, params);
        return result.rows[0] || null;
    }
    /**
     * Get multiple rows
     */
    async getMany(text, params = []) {
        const result = await this.query(text, params);
        return result.rows;
    }
    /**
     * Execute an insert and return the inserted row
     */
    async insert(table, data) {
        validateTable(table);
        const keys = Object.keys(data);
        const values = Object.values(data);
        keys.forEach(key => validateIdentifier(key));
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
        const text = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`;
        const result = await this.query(text, values);
        return result.rows[0];
    }
    /**
     * Execute an update
     */
    async update(table, data, where) {
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
        const result = await this.query(text, [...setValues, ...whereValues]);
        return result.rows[0] || null;
    }
    /**
     * Upsert (insert or update)
     */
    async upsert(table, data, conflictKey) {
        validateTable(table);
        const keys = Object.keys(data);
        const values = Object.values(data);
        keys.forEach(key => validateIdentifier(key));
        validateIdentifier(conflictKey);
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
        const updateKeys = keys.filter(k => k !== conflictKey);
        let text;
        // If only conflict key provided, use DO NOTHING
        if (updateKeys.length === 0) {
            text = `
                INSERT INTO ${table} (${keys.join(', ')}) 
                VALUES (${placeholders}) 
                ON CONFLICT (${conflictKey}) DO NOTHING
            `;
            await this.query(text, values);
            // Return the existing row
            const existing = await this.getOne(`SELECT * FROM ${table} WHERE ${conflictKey} = $1`, [data[conflictKey]]);
            return existing;
        }
        const updateClause = updateKeys
            .map(k => `${k} = EXCLUDED.${k}`)
            .join(', ');
        text = `
            INSERT INTO ${table} (${keys.join(', ')}) 
            VALUES (${placeholders}) 
            ON CONFLICT (${conflictKey}) 
            DO UPDATE SET ${updateClause}
            RETURNING *
        `;
        const result = await this.query(text, values);
        return result.rows[0];
    }
    /**
     * Delete rows
     */
    async delete(table, where) {
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
    async transaction(callback) {
        if (!this.pool) {
            throw new Error('Database not initialized');
        }
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    /**
     * Close the connection pool
     */
    async close() {
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
    async healthCheck() {
        try {
            await this.query('SELECT 1', [], { usePrimary: true });
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Read replica health check
     */
    async readReplicaHealthCheck() {
        if (!this.readPool || !this.readReplicaEnabled) {
            return false;
        }
        try {
            await this.readPool.query('SELECT 1');
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Handle connection error
     */
    _handleConnectionError(error) {
        this.failureCount++;
        logger.error('PostgreSQL', `Connection error (${this.failureCount}/${this.maxFailures}): ${error.message}`);
        if (this.failureCount >= this.maxFailures) {
            GracefulDegradation_js_1.default.markUnavailable('database', 'Too many connection failures');
            this.isConnected = false;
        }
    }
    /**
     * Handle query error
     */
    _handleQueryError(error) {
        logger.error('PostgreSQL', `Query error: ${error.message}`);
        const connectionErrors = ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'CONNECTION_TIMEOUT'];
        if (connectionErrors.some(code => error.message.includes(code))) {
            this._handleConnectionError(error);
        }
    }
    /**
     * Start write queue processor
     */
    _startWriteQueueProcessor() {
        this._writeQueueProcessor = setInterval(async () => {
            try {
                const state = GracefulDegradation_js_1.default.getServiceState('database');
                // Queue processing happens automatically when service becomes healthy
                // This is just for monitoring - actual processing is event-driven
                if (state === GracefulDegradation_js_1.ServiceState.HEALTHY && this.isConnected) {
                    // Queue is processed automatically by GracefulDegradation
                    // when markHealthy is called
                }
            }
            catch (error) {
                logger.error('PostgreSQL', `Write queue processing error: ${error.message}`);
            }
        }, 30000);
    }
    /**
     * Queue a write operation for later execution
     */
    async queueWrite(operation, params) {
        GracefulDegradation_js_1.default.queueWrite('database', operation, params);
        logger.warn('PostgreSQL', `Queued ${operation} for later execution`);
    }
    /**
     * Safe insert with graceful degradation
     */
    async safeInsert(table, data) {
        const state = GracefulDegradation_js_1.default.getServiceState('database');
        if (state === GracefulDegradation_js_1.ServiceState.UNAVAILABLE || !this.isConnected) {
            await this.queueWrite('insert', { table, data });
            return { queued: true, operation: 'insert', table };
        }
        return this.insert(table, data);
    }
    /**
     * Safe update with graceful degradation
     */
    async safeUpdate(table, data, where) {
        const state = GracefulDegradation_js_1.default.getServiceState('database');
        if (state === GracefulDegradation_js_1.ServiceState.UNAVAILABLE || !this.isConnected) {
            await this.queueWrite('update', { table, data, where });
            return { queued: true, operation: 'update', table };
        }
        return this.update(table, data, where);
    }
    /**
     * Safe delete with graceful degradation
     */
    async safeDelete(table, where) {
        const state = GracefulDegradation_js_1.default.getServiceState('database');
        if (state === GracefulDegradation_js_1.ServiceState.UNAVAILABLE || !this.isConnected) {
            await this.queueWrite('delete', { table, where });
            return { queued: true, operation: 'delete', table };
        }
        return this.delete(table, where);
    }
    /**
     * Get database status
     */
    getStatus() {
        const state = GracefulDegradation_js_1.default.getServiceState('database');
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
    async shutdown() {
        await this.close();
    }
}
exports.PostgresDatabase = PostgresDatabase;
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
async function initializeDatabase() {
    if (isDbInitialized) {
        console.log('⚠️ [Database] Already initialized');
        return;
    }
    try {
        await defaultInstance.initialize();
        // Verify tables exist
        const result = await defaultInstance.query(`
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
    }
    catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error('❌ [Database] PostgreSQL initialization failed:', errMsg);
        throw error; // Don't fail silently - DB is required
    }
}
/**
 * Check if database is initialized
 */
function isDatabaseReady() {
    return isDbInitialized;
}
// Default export
exports.default = defaultInstance;
// CommonJS COMPATIBILITY
module.exports = defaultInstance;
module.exports.PostgresDatabase = PostgresDatabase;
module.exports.validateTable = validateTable;
module.exports.validateIdentifier = validateIdentifier;
module.exports.ALLOWED_TABLES = exports.ALLOWED_TABLES;
module.exports.TRANSIENT_ERROR_CODES = exports.TRANSIENT_ERROR_CODES;
module.exports.initializeDatabase = initializeDatabase;
module.exports.isDatabaseReady = isDatabaseReady;
module.exports.default = defaultInstance;
//# sourceMappingURL=postgres.js.map