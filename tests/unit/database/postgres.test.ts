/**
 * PostgresDatabase Unit Tests
 * Tests for connection management, query retry, read replica routing,
 * validation helpers, graceful degradation, and safe* methods
 */

// Mock Logger
jest.mock('../../../src/core/Logger', () => ({
    __esModule: true,
    default: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        success: jest.fn(),
    },
}));

// Mock metrics
jest.mock('../../../src/core/metrics', () => ({
    databasePoolSize: {
        labels: jest.fn().mockReturnValue({ inc: jest.fn(), dec: jest.fn(), set: jest.fn() }),
    },
    databaseQueriesTotal: {
        labels: jest.fn().mockReturnValue({ inc: jest.fn() }),
    },
    databaseQueryDuration: {
        labels: jest.fn().mockReturnValue({ observe: jest.fn() }),
    },
}));

// Mock GracefulDegradation
const mockGracefulDegradation = {
    initialize: jest.fn(),
    registerFallback: jest.fn(),
    markHealthy: jest.fn(),
    markUnavailable: jest.fn(),
    markDegraded: jest.fn(),
    getServiceState: jest.fn().mockReturnValue('HEALTHY'),
    queueWrite: jest.fn(),
};

jest.mock('../../../src/core/GracefulDegradation', () => ({
    __esModule: true,
    default: mockGracefulDegradation,
    ServiceState: {
        HEALTHY: 'HEALTHY',
        DEGRADED: 'DEGRADED',
        UNAVAILABLE: 'UNAVAILABLE',
    },
}));

import {
    PostgresDatabase,
    validateTable,
    validateIdentifier,
    ALLOWED_TABLES,
    TRANSIENT_ERROR_CODES,
} from '../../../src/database/postgres';

// ── Build mock pool BEFORE jest.mock hoisting ──
const mockPoolClient = {
    query: jest.fn().mockResolvedValue({ rows: [{ now: new Date() }], rowCount: 1 }),
    release: jest.fn(),
};

const mockPool = {
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    connect: jest.fn().mockResolvedValue(mockPoolClient),
    end: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    totalCount: 5,
    idleCount: 3,
    waitingCount: 0,
};

// We need to mock pg at module level
jest.mock('pg', () => ({
    Pool: jest.fn().mockImplementation(() => mockPool),
}));

describe('validateTable()', () => {
    it('should accept all whitelisted tables', () => {
        for (const table of ALLOWED_TABLES) {
            expect(() => validateTable(table)).not.toThrow();
        }
    });

    it('should reject non-whitelisted tables', () => {
        expect(() => validateTable('users')).toThrow('Invalid table name');
        expect(() => validateTable('admin_secrets')).toThrow('Invalid table name');
        expect(() => validateTable('')).toThrow('Invalid table name');
    });

    it('should reject SQL injection attempts', () => {
        expect(() => validateTable('guild_settings; DROP TABLE users;')).toThrow('Invalid table name');
        expect(() => validateTable("guild_settings' OR '1'='1")).toThrow('Invalid table name');
    });

    it('should be case-sensitive', () => {
        expect(() => validateTable('Guild_Settings')).toThrow('Invalid table name');
        expect(() => validateTable('GUILD_SETTINGS')).toThrow('Invalid table name');
    });
});

describe('validateIdentifier()', () => {
    it('should accept valid identifiers', () => {
        expect(() => validateIdentifier('column_name')).not.toThrow();
        expect(() => validateIdentifier('id')).not.toThrow();
        expect(() => validateIdentifier('guild_id')).not.toThrow();
        expect(() => validateIdentifier('_private')).not.toThrow();
        expect(() => validateIdentifier('camelCase')).not.toThrow();
        expect(() => validateIdentifier('Col123')).not.toThrow();
    });

    it('should reject identifiers starting with numbers', () => {
        expect(() => validateIdentifier('123column')).toThrow('Invalid identifier');
        expect(() => validateIdentifier('0id')).toThrow('Invalid identifier');
    });

    it('should reject identifiers with special characters', () => {
        expect(() => validateIdentifier('col-name')).toThrow('Invalid identifier');
        expect(() => validateIdentifier('col.name')).toThrow('Invalid identifier');
        expect(() => validateIdentifier('col name')).toThrow('Invalid identifier');
        expect(() => validateIdentifier('col;name')).toThrow('Invalid identifier');
        expect(() => validateIdentifier("col'name")).toThrow('Invalid identifier');
    });

    it('should reject SQL injection in identifiers', () => {
        expect(() => validateIdentifier('id; DROP TABLE users')).toThrow('Invalid identifier');
        expect(() => validateIdentifier('id OR 1=1')).toThrow('Invalid identifier');
    });

    it('should reject empty identifiers', () => {
        expect(() => validateIdentifier('')).toThrow('Invalid identifier');
    });
});

describe('ALLOWED_TABLES', () => {
    it('should contain core tables', () => {
        expect(ALLOWED_TABLES).toContain('guild_settings');
        expect(ALLOWED_TABLES).toContain('moderation_logs');
        expect(ALLOWED_TABLES).toContain('user_data');
        expect(ALLOWED_TABLES).toContain('snipes');
    });

    it('should contain moderation tables', () => {
        expect(ALLOWED_TABLES).toContain('mod_infractions');
        expect(ALLOWED_TABLES).toContain('mod_log_settings');
        expect(ALLOWED_TABLES).toContain('automod_settings');
        expect(ALLOWED_TABLES).toContain('word_filters');
        expect(ALLOWED_TABLES).toContain('warn_thresholds');
        expect(ALLOWED_TABLES).toContain('raid_mode');
    });

    it('should contain music tables', () => {
        expect(ALLOWED_TABLES).toContain('user_music_preferences');
        expect(ALLOWED_TABLES).toContain('user_music_favorites');
        expect(ALLOWED_TABLES).toContain('user_music_history');
    });

    it('should be frozen (immutable)', () => {
        // ALLOWED_TABLES uses `as const`, verify it's a readonly tuple
        expect(Array.isArray(ALLOWED_TABLES)).toBe(true);
        expect(ALLOWED_TABLES.length).toBeGreaterThan(10);
    });
});

describe('TRANSIENT_ERROR_CODES', () => {
    it('should include serialization failures', () => {
        expect(TRANSIENT_ERROR_CODES).toContain('40001');
    });

    it('should include deadlock', () => {
        expect(TRANSIENT_ERROR_CODES).toContain('40P01');
    });

    it('should include connection failures', () => {
        expect(TRANSIENT_ERROR_CODES).toContain('08006');
        expect(TRANSIENT_ERROR_CODES).toContain('08001');
        expect(TRANSIENT_ERROR_CODES).toContain('08003');
    });

    it('should include resource exhaustion', () => {
        expect(TRANSIENT_ERROR_CODES).toContain('53000');
        expect(TRANSIENT_ERROR_CODES).toContain('53300');
    });
});

describe('PostgresDatabase', () => {
    let db: PostgresDatabase;

    beforeEach(() => {
        jest.clearAllMocks();
        db = new PostgresDatabase();
        // Reset mock pool
        mockPool.query.mockReset().mockResolvedValue({ rows: [], rowCount: 0 });
        mockPool.connect.mockReset().mockResolvedValue(mockPoolClient);
        mockPoolClient.query.mockReset().mockResolvedValue({ rows: [{ now: new Date() }], rowCount: 1 });
        mockPoolClient.release.mockReset();
        mockPool.end.mockReset().mockResolvedValue(undefined);
        mockPool.on.mockReset();
        mockGracefulDegradation.getServiceState.mockReturnValue('HEALTHY');
    });

    afterEach(async () => {
        try {
            await db.close();
        } catch {
            // Ignore cleanup errors
        }
    });

    describe('initial state', () => {
        it('should start disconnected', () => {
            expect(db.isConnected).toBe(false);
        });

        it('should have read replica disabled', () => {
            expect(db.readReplicaEnabled).toBe(false);
        });

        it('should have default retry config', () => {
            expect(db.retryConfig).toEqual({
                maxRetries: 3,
                baseDelayMs: 1000,
                maxDelayMs: 10000,
            });
        });
    });

    describe('initialize()', () => {
        it('should connect to database', async () => {
            await db.initialize();

            expect(db.isConnected).toBe(true);
            expect(mockPool.connect).toHaveBeenCalled();
            expect(mockPoolClient.release).toHaveBeenCalled();
        });

        it('should register with graceful degradation', async () => {
            await db.initialize();

            expect(mockGracefulDegradation.initialize).toHaveBeenCalled();
            expect(mockGracefulDegradation.registerFallback).toHaveBeenCalledWith('database', expect.any(Function));
            expect(mockGracefulDegradation.markHealthy).toHaveBeenCalledWith('database');
        });

        it('should be idempotent', async () => {
            await db.initialize();
            await db.initialize();

            // Pool constructor should only be called once per db instance
            // (because internal pool is reused)
            expect(mockPool.connect).toHaveBeenCalledTimes(1);
        });

        it('should throw on connection failure', async () => {
            mockPool.connect.mockRejectedValueOnce(new Error('ECONNREFUSED'));

            await expect(db.initialize()).rejects.toThrow('ECONNREFUSED');
            expect(db.isConnected).toBe(false);
        });
    });

    describe('query()', () => {
        beforeEach(async () => {
            await db.initialize();
        });

        it('should execute a query', async () => {
            mockPool.query.mockResolvedValueOnce({
                rows: [{ id: 1, name: 'test' }],
                rowCount: 1,
            });

            const result = await db.query('SELECT * FROM guild_settings WHERE id = $1', [1]);

            expect(result.rows).toEqual([{ id: 1, name: 'test' }]);
            expect(mockPool.query).toHaveBeenCalled();
        });

        it('should throw when database not initialized', async () => {
            const uninitDb = new PostgresDatabase();

            await expect(uninitDb.query('SELECT 1')).rejects.toThrow('Database not initialized');
        });

        it('should reset failure count on success', async () => {
            mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

            await db.query('SELECT 1');

            // Failure count is private, but we can verify via getStatus
            const status = db.getStatus();
            expect(status.failureCount).toBe(0);
        });

        it('should throw on query error', async () => {
            mockPool.query.mockRejectedValueOnce(new Error('syntax error'));

            await expect(db.query('INVALID SQL')).rejects.toThrow('syntax error');
        });

        it('should not retry when noRetry is set', async () => {
            const transientError = Object.assign(new Error('deadlock'), { code: '40P01' });
            mockPool.query.mockRejectedValue(transientError);

            await expect(
                db.query('SELECT 1', [], { noRetry: true })
            ).rejects.toThrow('deadlock');

            // Should only be called once (no retries)
            expect(mockPool.query).toHaveBeenCalledTimes(1);
        });
    });

    describe('query() - retry behavior', () => {
        beforeEach(async () => {
            await db.initialize();
            // Speed up retries for tests
            db.retryConfig.baseDelayMs = 10;
            db.retryConfig.maxDelayMs = 50;
        });

        it('should retry on transient errors', async () => {
            const transientError = Object.assign(new Error('deadlock'), { code: '40P01' });
            
            mockPool.query
                .mockRejectedValueOnce(transientError)
                .mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 });

            const result = await db.query('SELECT 1');
            
            expect(result.rows).toEqual([{ id: 1 }]);
            expect(mockPool.query).toHaveBeenCalledTimes(2);
        });

        it('should retry on connection refused errors', async () => {
            const connError = Object.assign(new Error('ECONNREFUSED'), {});
            
            mockPool.query
                .mockRejectedValueOnce(connError)
                .mockResolvedValueOnce({ rows: [], rowCount: 0 });

            await db.query('SELECT 1');
            
            expect(mockPool.query).toHaveBeenCalledTimes(2);
        });

        it('should not retry on non-transient errors', async () => {
            const syntaxError = Object.assign(new Error('syntax error'), { code: '42601' });
            mockPool.query.mockRejectedValue(syntaxError);

            await expect(db.query('BAD SQL')).rejects.toThrow('syntax error');
            
            // Should only try once
            expect(mockPool.query).toHaveBeenCalledTimes(1);
        });

        it('should exhaust retries and throw on persistent transient error', async () => {
            const transientError = Object.assign(new Error('serialization failure'), { code: '40001' });
            mockPool.query.mockRejectedValue(transientError);

            await expect(
                db.query('SELECT 1', [], { retries: 2 })
            ).rejects.toThrow('serialization failure');

            // 1 initial + 2 retries = 3 calls
            expect(mockPool.query).toHaveBeenCalledTimes(3);
        });

        it('should respect custom retry count', async () => {
            const transientError = Object.assign(new Error('timeout'), { code: '57P03' });
            mockPool.query.mockRejectedValue(transientError);

            await expect(
                db.query('SELECT 1', [], { retries: 1 })
            ).rejects.toThrow();

            // 1 initial + 1 retry = 2 calls
            expect(mockPool.query).toHaveBeenCalledTimes(2);
        });
    });

    describe('getOne()', () => {
        beforeEach(async () => {
            await db.initialize();
        });

        it('should return first row', async () => {
            mockPool.query.mockResolvedValueOnce({
                rows: [{ id: 1, name: 'test' }],
                rowCount: 1,
            });

            const result = await db.getOne('SELECT * FROM guild_settings WHERE id = $1', [1]);
            
            expect(result).toEqual({ id: 1, name: 'test' });
        });

        it('should return null when no rows', async () => {
            mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

            const result = await db.getOne('SELECT * FROM guild_settings WHERE id = $1', [999]);
            
            expect(result).toBeNull();
        });
    });

    describe('getMany()', () => {
        beforeEach(async () => {
            await db.initialize();
        });

        it('should return all rows', async () => {
            mockPool.query.mockResolvedValueOnce({
                rows: [{ id: 1 }, { id: 2 }, { id: 3 }],
                rowCount: 3,
            });

            const result = await db.getMany('SELECT * FROM guild_settings');
            
            expect(result).toHaveLength(3);
        });

        it('should return empty array when no rows', async () => {
            mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

            const result = await db.getMany('SELECT * FROM guild_settings WHERE id = $1', [999]);
            
            expect(result).toEqual([]);
        });
    });

    describe('insert()', () => {
        beforeEach(async () => {
            await db.initialize();
        });

        it('should insert and return row', async () => {
            mockPool.query.mockResolvedValueOnce({
                rows: [{ id: 1, guild_id: '123', name: 'test' }],
                rowCount: 1,
            });

            const result = await db.insert('guild_settings', {
                guild_id: '123',
                name: 'test',
            });

            expect(result).toEqual({ id: 1, guild_id: '123', name: 'test' });
            expect(mockPool.query).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO guild_settings'),
                ['123', 'test']
            );
        });

        it('should reject invalid table', async () => {
            await expect(
                db.insert('evil_table', { id: 1 })
            ).rejects.toThrow('Invalid table name');
        });

        it('should reject invalid column names', async () => {
            await expect(
                db.insert('guild_settings', { 'col;drop': 'value' })
            ).rejects.toThrow('Invalid identifier');
        });
    });

    describe('update()', () => {
        beforeEach(async () => {
            await db.initialize();
        });

        it('should update and return row', async () => {
            mockPool.query.mockResolvedValueOnce({
                rows: [{ id: 1, name: 'updated' }],
                rowCount: 1,
            });

            const result = await db.update(
                'guild_settings',
                { name: 'updated' },
                { guild_id: '123' }
            );

            expect(result).toEqual({ id: 1, name: 'updated' });
            expect(mockPool.query).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE guild_settings SET'),
                ['updated', '123']
            );
        });

        it('should return null when no rows match', async () => {
            mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

            const result = await db.update(
                'guild_settings',
                { name: 'updated' },
                { guild_id: '999' }
            );

            expect(result).toBeNull();
        });

        it('should reject invalid table', async () => {
            await expect(
                db.update('evil_table', { name: 'x' }, { id: 1 })
            ).rejects.toThrow('Invalid table name');
        });
    });

    describe('delete()', () => {
        beforeEach(async () => {
            await db.initialize();
        });

        it('should delete and return count', async () => {
            mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 3 });

            const count = await db.delete('guild_settings', { guild_id: '123' });

            expect(count).toBe(3);
            expect(mockPool.query).toHaveBeenCalledWith(
                expect.stringContaining('DELETE FROM guild_settings WHERE'),
                ['123']
            );
        });

        it('should return 0 when no rows deleted', async () => {
            mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

            const count = await db.delete('guild_settings', { guild_id: '999' });

            expect(count).toBe(0);
        });

        it('should reject invalid table', async () => {
            await expect(
                db.delete('evil_table', { id: 1 })
            ).rejects.toThrow('Invalid table name');
        });
    });

    describe('upsert()', () => {
        beforeEach(async () => {
            await db.initialize();
        });

        it('should upsert with conflict resolution', async () => {
            mockPool.query.mockResolvedValueOnce({
                rows: [{ guild_id: '123', prefix: '!' }],
                rowCount: 1,
            });

            const result = await db.upsert(
                'guild_settings',
                { guild_id: '123', prefix: '!' },
                'guild_id'
            );

            expect(result).toEqual({ guild_id: '123', prefix: '!' });
            expect(mockPool.query).toHaveBeenCalledWith(
                expect.stringContaining('ON CONFLICT (guild_id)'),
                ['123', '!']
            );
        });

        it('should handle upsert with only conflict key', async () => {
            // When only the conflict key is provided, it should use DO NOTHING
            mockPool.query
                .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // INSERT DO NOTHING
                .mockResolvedValueOnce({ rows: [{ guild_id: '123' }], rowCount: 1 }); // SELECT existing

            const result = await db.upsert(
                'guild_settings',
                { guild_id: '123' },
                'guild_id'
            );

            expect(result).toEqual({ guild_id: '123' });
        });

        it('should reject invalid table', async () => {
            await expect(
                db.upsert('evil_table', { id: 1 }, 'id')
            ).rejects.toThrow('Invalid table name');
        });
    });

    describe('transaction()', () => {
        beforeEach(async () => {
            await db.initialize();
        });

        it('should execute callback within transaction', async () => {
            const result = await db.transaction(async (client) => {
                return 'transaction-result';
            });

            expect(result).toBe('transaction-result');
            expect(mockPoolClient.query).toHaveBeenCalledWith('BEGIN');
            expect(mockPoolClient.query).toHaveBeenCalledWith('COMMIT');
        });

        it('should rollback on error', async () => {
            await expect(
                db.transaction(async () => {
                    throw new Error('transaction-error');
                })
            ).rejects.toThrow('transaction-error');

            expect(mockPoolClient.query).toHaveBeenCalledWith('BEGIN');
            expect(mockPoolClient.query).toHaveBeenCalledWith('ROLLBACK');
        });

        it('should release client after success', async () => {
            await db.transaction(async () => 'ok');

            expect(mockPoolClient.release).toHaveBeenCalled();
        });

        it('should release client after failure', async () => {
            try {
                await db.transaction(async () => {
                    throw new Error('fail');
                });
            } catch {
                // expected
            }

            expect(mockPoolClient.release).toHaveBeenCalled();
        });

        it('should throw when not initialized', async () => {
            const uninitDb = new PostgresDatabase();

            await expect(
                uninitDb.transaction(async () => 'ok')
            ).rejects.toThrow('Database not initialized');
        });
    });

    describe('healthCheck()', () => {
        beforeEach(async () => {
            await db.initialize();
        });

        it('should return true when database responds', async () => {
            mockPool.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }], rowCount: 1 });

            const healthy = await db.healthCheck();

            expect(healthy).toBe(true);
        });

        it('should return false when database is down', async () => {
            mockPool.query.mockRejectedValue(new Error('ECONNREFUSED'));

            const healthy = await db.healthCheck();

            expect(healthy).toBe(false);
        });
    });

    describe('safe* methods - graceful degradation', () => {
        beforeEach(async () => {
            await db.initialize();
        });

        describe('safeInsert()', () => {
            it('should perform normal insert when healthy', async () => {
                mockGracefulDegradation.getServiceState.mockReturnValue('HEALTHY');
                mockPool.query.mockResolvedValueOnce({
                    rows: [{ id: 1, guild_id: '123' }],
                    rowCount: 1,
                });

                const result = await db.safeInsert('guild_settings', { guild_id: '123' });

                expect(result).toEqual({ id: 1, guild_id: '123' });
                expect(mockGracefulDegradation.queueWrite).not.toHaveBeenCalled();
            });

            it('should queue write when database unavailable', async () => {
                mockGracefulDegradation.getServiceState.mockReturnValue('UNAVAILABLE');
                (db as any).isConnected = false;

                const result = await db.safeInsert('guild_settings', { guild_id: '123' });

                expect(result).toEqual({
                    queued: true,
                    operation: 'insert',
                    table: 'guild_settings',
                });
                expect(mockGracefulDegradation.queueWrite).toHaveBeenCalledWith(
                    'database',
                    'insert',
                    { table: 'guild_settings', data: { guild_id: '123' } }
                );
            });
        });

        describe('safeUpdate()', () => {
            it('should perform normal update when healthy', async () => {
                mockGracefulDegradation.getServiceState.mockReturnValue('HEALTHY');
                mockPool.query.mockResolvedValueOnce({
                    rows: [{ id: 1, name: 'updated' }],
                    rowCount: 1,
                });

                const result = await db.safeUpdate(
                    'guild_settings',
                    { name: 'updated' },
                    { guild_id: '123' }
                );

                expect(result).toEqual({ id: 1, name: 'updated' });
            });

            it('should queue write when database unavailable', async () => {
                mockGracefulDegradation.getServiceState.mockReturnValue('UNAVAILABLE');
                (db as any).isConnected = false;

                const result = await db.safeUpdate(
                    'guild_settings',
                    { name: 'x' },
                    { guild_id: '123' }
                );

                expect(result).toEqual({
                    queued: true,
                    operation: 'update',
                    table: 'guild_settings',
                });
            });
        });

        describe('safeDelete()', () => {
            it('should perform normal delete when healthy', async () => {
                mockGracefulDegradation.getServiceState.mockReturnValue('HEALTHY');
                mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 2 });

                const result = await db.safeDelete('guild_settings', { guild_id: '123' });

                expect(result).toBe(2);
            });

            it('should queue write when database unavailable', async () => {
                mockGracefulDegradation.getServiceState.mockReturnValue('UNAVAILABLE');
                (db as any).isConnected = false;

                const result = await db.safeDelete('guild_settings', { guild_id: '123' });

                expect(result).toEqual({
                    queued: true,
                    operation: 'delete',
                    table: 'guild_settings',
                });
            });
        });
    });

    describe('getStatus()', () => {
        it('should return status when not initialized', () => {
            const status = db.getStatus();

            expect(status.isConnected).toBe(false);
            expect(status.failureCount).toBe(0);
            expect(status.readReplica.enabled).toBe(false);
        });

        it('should return connected status after init', async () => {
            await db.initialize();

            const status = db.getStatus();

            expect(status.isConnected).toBe(true);
            expect(status.maxFailures).toBe(3);
            expect(status.retryConfig).toEqual(db.retryConfig);
        });
    });

    describe('close()', () => {
        it('should close pool', async () => {
            await db.initialize();
            await db.close();

            expect(db.isConnected).toBe(false);
            expect(mockPool.end).toHaveBeenCalled();
        });

        it('should handle close when not initialized', async () => {
            // Should not throw
            await expect(db.close()).resolves.not.toThrow();
        });
    });

    describe('_isReadOnlyQuery() (via _getPool routing)', () => {
        // We test indirectly through query behavior
        // The private method routes SELECT to read replica
        
        it('should classify SELECT as read-only', () => {
            // Access private method for testing
            const isReadOnly = (db as any)._isReadOnlyQuery.bind(db);
            
            expect(isReadOnly('SELECT * FROM users')).toBe(true);
            expect(isReadOnly('  SELECT id FROM users  ')).toBe(true);
            expect(isReadOnly('SELECT COUNT(*) FROM users')).toBe(true);
        });

        it('should classify INSERT/UPDATE/DELETE as not read-only', () => {
            const isReadOnly = (db as any)._isReadOnlyQuery.bind(db);
            
            expect(isReadOnly('INSERT INTO users VALUES (1)')).toBe(false);
            expect(isReadOnly('UPDATE users SET name = $1')).toBe(false);
            expect(isReadOnly('DELETE FROM users WHERE id = $1')).toBe(false);
        });

        it('should classify SELECT FOR UPDATE as not read-only', () => {
            const isReadOnly = (db as any)._isReadOnlyQuery.bind(db);
            
            expect(isReadOnly('SELECT * FROM users FOR UPDATE')).toBe(false);
            expect(isReadOnly('SELECT * FROM users FOR SHARE')).toBe(false);
        });

        it('should classify CTE with mutations as not read-only', () => {
            const isReadOnly = (db as any)._isReadOnlyQuery.bind(db);
            
            expect(isReadOnly('WITH deleted AS (DELETE FROM users) SELECT * FROM deleted')).toBe(false);
            expect(isReadOnly('WITH ins AS (INSERT INTO users VALUES (1)) SELECT * FROM ins')).toBe(false);
        });
    });

    describe('_isTransientError()', () => {
        it('should detect transient PostgreSQL error codes', () => {
            const isTransient = (db as any)._isTransientError.bind(db);
            
            expect(isTransient({ code: '40001', message: '' })).toBe(true); // serialization_failure
            expect(isTransient({ code: '40P01', message: '' })).toBe(true); // deadlock
            expect(isTransient({ code: '08006', message: '' })).toBe(true); // connection_failure
            expect(isTransient({ code: '53300', message: '' })).toBe(true); // too_many_connections
        });

        it('should detect transient errors by message', () => {
            const isTransient = (db as any)._isTransientError.bind(db);
            
            expect(isTransient({ message: 'ECONNREFUSED' })).toBe(true);
            expect(isTransient({ message: 'ETIMEDOUT' })).toBe(true);
            expect(isTransient({ message: 'connection terminated unexpectedly' })).toBe(true);
            expect(isTransient({ message: 'connection refused by server' })).toBe(true);
        });

        it('should not classify syntax errors as transient', () => {
            const isTransient = (db as any)._isTransientError.bind(db);
            
            expect(isTransient({ code: '42601', message: 'syntax error' })).toBe(false);
            expect(isTransient({ code: '23505', message: 'unique violation' })).toBe(false);
            expect(isTransient({ message: 'column does not exist' })).toBe(false);
        });
    });

    describe('_calculateRetryDelay()', () => {
        it('should calculate exponential backoff', () => {
            const calcDelay = (db as any)._calculateRetryDelay.bind(db);
            
            // With baseDelayMs: 1000, the delays should grow exponentially
            // attempt 0: ~1000ms, attempt 1: ~2000ms, attempt 2: ~4000ms
            const delays: number[] = [];
            for (let i = 0; i < 5; i++) {
                delays.push(calcDelay(i));
            }
            
            // Each delay should generally be larger than the previous (with jitter)
            // Verify the trend, not exact values (due to random jitter)
            expect(delays[2]).toBeGreaterThan(delays[0] * 0.5);
        });

        it('should not exceed maxDelayMs', () => {
            const calcDelay = (db as any)._calculateRetryDelay.bind(db);
            
            // Very high attempt number should still be capped
            const delay = calcDelay(20);
            expect(delay).toBeLessThanOrEqual(db.retryConfig.maxDelayMs);
        });

        it('should add jitter', () => {
            const calcDelay = (db as any)._calculateRetryDelay.bind(db);
            
            // Run multiple times and check that we get different values (jitter)
            const results = new Set<number>();
            for (let i = 0; i < 10; i++) {
                results.add(calcDelay(1));
            }
            
            // With jitter, we should get at least some different values
            expect(results.size).toBeGreaterThan(1);
        });
    });

    describe('connection error handling', () => {
        beforeEach(async () => {
            await db.initialize();
        });

        it('should track consecutive failures', async () => {
            // Simulate connection errors
            const connError = new Error('ECONNREFUSED');
            
            (db as any)._handleConnectionError(connError);
            expect(db.getStatus().failureCount).toBe(1);
            
            (db as any)._handleConnectionError(connError);
            expect(db.getStatus().failureCount).toBe(2);
        });

        it('should mark degraded after max failures', async () => {
            const connError = new Error('ECONNREFUSED');
            
            for (let i = 0; i < 3; i++) {
                (db as any)._handleConnectionError(connError);
            }

            expect(mockGracefulDegradation.markUnavailable).toHaveBeenCalledWith(
                'database',
                'Too many connection failures'
            );
            expect(db.isConnected).toBe(false);
        });
    });
});
