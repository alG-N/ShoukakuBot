/**
 * GracefulDegradation Unit Tests
 * Tests for service health tracking, fallback execution, write queueing, and degradation levels
 */

// Mock Logger
jest.mock('../../../src/core/Logger', () => ({
    __esModule: true,
    default: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    },
}));

// Mock CacheService
jest.mock('../../../src/cache/cacheService', () => ({
    __esModule: true,
    default: {
        getRedis: jest.fn().mockReturnValue(null),
    },
}));

import { GracefulDegradation, DegradationLevel, ServiceState } from '../../../src/core/GracefulDegradation';

describe('GracefulDegradation', () => {
    let gd: GracefulDegradation;

    beforeEach(() => {
        gd = new GracefulDegradation();
    });

    afterEach(() => {
        gd.shutdown();
    });

    describe('initialize()', () => {
        it('should register core services on init', () => {
            gd.initialize();

            expect(gd.getServiceState('redis')).toBe(ServiceState.HEALTHY);
            expect(gd.getServiceState('database')).toBe(ServiceState.HEALTHY);
            expect(gd.getServiceState('lavalink')).toBe(ServiceState.HEALTHY);
            expect(gd.getServiceState('discord')).toBe(ServiceState.HEALTHY);
        });

        it('should only initialize once', () => {
            gd.initialize();
            gd.initialize(); // Should not throw or double-register

            expect(gd.getServiceState('redis')).toBe(ServiceState.HEALTHY);
        });
    });

    describe('registerService()', () => {
        it('should register a new service', () => {
            gd.registerService('custom-api');

            expect(gd.getServiceState('custom-api')).toBe(ServiceState.HEALTHY);
        });

        it('should register critical service', () => {
            gd.registerService('payment', { critical: true });

            expect(gd.getServiceState('payment')).toBe(ServiceState.HEALTHY);
        });
    });

    describe('markService() / markHealthy() / markDegraded() / markUnavailable()', () => {
        beforeEach(() => {
            gd.registerService('api', { critical: false });
            gd.registerService('db', { critical: true });
        });

        it('should mark service as degraded', () => {
            gd.markDegraded('api', 'slow responses');

            expect(gd.getServiceState('api')).toBe(ServiceState.DEGRADED);
            expect(gd.isDegraded('api')).toBe(true);
        });

        it('should mark service as unavailable', () => {
            gd.markUnavailable('api', 'connection refused');

            expect(gd.getServiceState('api')).toBe(ServiceState.UNAVAILABLE);
            expect(gd.isAvailable('api')).toBe(false);
        });

        it('should mark service as healthy', () => {
            gd.markUnavailable('api');
            gd.markHealthy('api');

            expect(gd.getServiceState('api')).toBe(ServiceState.HEALTHY);
            expect(gd.isAvailable('api')).toBe(true);
        });

        it('should emit serviceStateChange event on state change', () => {
            const handler = jest.fn();
            gd.on('serviceStateChange', handler);

            gd.markDegraded('api', 'slow');

            expect(handler).toHaveBeenCalledWith({
                service: 'api',
                previousState: ServiceState.HEALTHY,
                newState: ServiceState.DEGRADED,
                reason: 'slow',
            });
        });

        it('should not emit event if state unchanged', () => {
            gd.markDegraded('api');

            const handler = jest.fn();
            gd.on('serviceStateChange', handler);

            gd.markDegraded('api'); // Same state again

            expect(handler).not.toHaveBeenCalled();
        });

        it('should ignore unknown services', () => {
            expect(() => gd.markDegraded('nonexistent')).not.toThrow();
        });
    });

    describe('degradation level updates', () => {
        beforeEach(() => {
            gd.registerService('api', { critical: false });
            gd.registerService('db', { critical: true });
            gd.registerService('redis', { critical: false });
        });

        it('should be NORMAL when all services healthy', () => {
            const status = gd.getStatus();
            expect(status.level).toBe(DegradationLevel.NORMAL);
            expect(gd.isSystemDegraded()).toBe(false);
        });

        it('should be DEGRADED when non-critical service is down', () => {
            gd.markUnavailable('api');

            const status = gd.getStatus();
            expect(status.level).toBe(DegradationLevel.DEGRADED);
            expect(gd.isSystemDegraded()).toBe(true);
        });

        it('should be CRITICAL when critical service is down', () => {
            gd.markUnavailable('db');

            const status = gd.getStatus();
            expect(status.level).toBe(DegradationLevel.CRITICAL);
        });

        it('should be OFFLINE when all services are down', () => {
            gd.markUnavailable('api');
            gd.markUnavailable('db');
            gd.markUnavailable('redis');

            const status = gd.getStatus();
            expect(status.level).toBe(DegradationLevel.OFFLINE);
        });

        it('should recover from DEGRADED to NORMAL', () => {
            gd.markUnavailable('api');
            expect(gd.getStatus().level).toBe(DegradationLevel.DEGRADED);

            gd.markHealthy('api');
            expect(gd.getStatus().level).toBe(DegradationLevel.NORMAL);
        });

        it('should emit levelChange event', () => {
            const handler = jest.fn();
            gd.on('levelChange', handler);

            gd.markUnavailable('db');

            expect(handler).toHaveBeenCalledWith({
                previousLevel: DegradationLevel.NORMAL,
                newLevel: DegradationLevel.CRITICAL,
            });
        });
    });

    describe('execute() — primary + fallback', () => {
        beforeEach(() => {
            gd.registerService('api');
        });

        it('should return success result on successful execution', async () => {
            const result = await gd.execute('api', async () => 'data');

            expect(result.success).toBe(true);
            expect(result.data).toBe('data');
            expect(result.degraded).toBe(false);
        });

        it('should use fallback function when primary fails', async () => {
            const result = await gd.execute(
                'api',
                async () => { throw new Error('fail'); },
                { fallback: async () => 'fallback-data' }
            );

            expect(result.success).toBe(true);
            expect(result.data).toBe('fallback-data');
            expect(result.degraded).toBe(true);
        });

        it('should use fallbackValue when no fallback function', async () => {
            const result = await gd.execute(
                'api',
                async () => { throw new Error('fail'); },
                { fallbackValue: [] as string[] }
            );

            expect(result.success).toBe(true);
            expect(result.data).toEqual([]);
            expect(result.degraded).toBe(true);
        });

        it('should return failure when all fallbacks fail', async () => {
            const result = await gd.execute(
                'api',
                async () => { throw new Error('primary fail'); },
            );

            expect(result.success).toBe(false);
            expect(result.data).toBeNull();
            expect(result.degraded).toBe(true);
            expect(result.error).toBe('primary fail');
        });

        it('should cache successful results when cacheKey provided', async () => {
            // First call — populates cache
            await gd.execute('api', async () => ({ items: [1, 2, 3] }), {
                cacheKey: 'test-list',
            });

            // Second call — primary fails, should return cached
            const result = await gd.execute(
                'api',
                async () => { throw new Error('fail'); },
                { cacheKey: 'test-list' }
            );

            expect(result.success).toBe(true);
            expect(result.data).toEqual({ items: [1, 2, 3] });
            expect(result.stale).toBe(true);
            expect(result.cacheAge).toBeGreaterThanOrEqual(0);
        });

        it('should skip to fallback when service is UNAVAILABLE', async () => {
            gd.markUnavailable('api');

            const primaryFn = jest.fn(async () => 'should not run');

            const result = await gd.execute('api', primaryFn, {
                fallbackValue: 'degraded-value',
            });

            expect(primaryFn).not.toHaveBeenCalled();
            expect(result.data).toBe('degraded-value');
            expect(result.degraded).toBe(true);
        });

        it('should recover service state on success after degradation', async () => {
            gd.markDegraded('api');

            await gd.execute('api', async () => 'recovered');

            expect(gd.isAvailable('api')).toBe(true);
        });

        it('should use registered fallback handler', async () => {
            gd.registerFallback('api', async () => 'handler-result');

            const result = await gd.execute(
                'api',
                async () => { throw new Error('fail'); },
            );

            expect(result.success).toBe(true);
            expect(result.data).toBe('handler-result');
            expect(result.degraded).toBe(true);
        });
    });

    describe('write queue', () => {
        beforeEach(() => {
            gd.registerService('db');
        });

        it('should queue write operations', async () => {
            await gd.queueWrite('db', 'INSERT', { id: 1, name: 'test' });

            expect(gd.getQueueSize()).toBe(1);
        });

        it('should include write data in queue', async () => {
            await gd.queueWrite('db', 'INSERT', { id: 1 }, { table: 'users' });

            const writes = gd.getQueuedWrites();
            expect(writes).toHaveLength(1);
            expect(writes[0].serviceName).toBe('db');
            expect(writes[0].operation).toBe('INSERT');
            expect(writes[0].data).toEqual({ id: 1 });
        });

        it('should emit writeQueued event', async () => {
            const handler = jest.fn();
            gd.on('writeQueued', handler);

            await gd.queueWrite('db', 'INSERT', { id: 1 });

            expect(handler).toHaveBeenCalledWith(
                expect.objectContaining({
                    serviceName: 'db',
                    operation: 'INSERT',
                    queueSize: 1,
                })
            );
        });

        it('should process queue on service recovery', async () => {
            const handler = jest.fn().mockResolvedValue(undefined);
            gd.registerWriteReplay('db', handler);

            gd.markUnavailable('db');
            await gd.queueWrite('db', 'INSERT', { id: 1 });
            await gd.queueWrite('db', 'UPDATE', { id: 2 });

            // Recover service — should trigger queue processing
            gd.markHealthy('db');

            // Give event loop a tick
            await new Promise(r => setTimeout(r, 10));

            expect(handler).toHaveBeenCalledTimes(2);
            expect(gd.getQueueSize()).toBe(0);
        });

        it('should preserve queued writes when no replay handler is registered', async () => {
            gd.markUnavailable('db');
            await gd.queueWrite('db', 'INSERT', { id: 1 });

            gd.markHealthy('db');
            await new Promise(r => setTimeout(r, 10));

            expect(gd.getQueueSize()).toBe(1);
        });

        it('should replay recovered writes immediately for healthy services with a handler', async () => {
            const redis = {
                lrange: jest.fn().mockResolvedValue([
                    JSON.stringify({
                        serviceName: 'db',
                        operation: 'INSERT',
                        data: { id: 99 },
                        options: {},
                        timestamp: Date.now(),
                        retries: 0,
                    })
                ])
            };
            const handler = jest.fn().mockResolvedValue(undefined);

            gd.registerService('db');
            gd.registerWriteReplay('db', handler);
            gd.markHealthy('db');

            const recovered = await gd.recoverWriteQueue(redis as never);

            expect(recovered).toBe(1);
            expect(handler).toHaveBeenCalledTimes(1);
            expect(gd.getQueueSize()).toBe(0);
        });

        it('should drop oldest entry when queue is full', async () => {
            // Access private maxQueueSize via cast
            (gd as any).maxQueueSize = 3;

            await gd.queueWrite('db', 'INSERT', { id: 1 });
            await gd.queueWrite('db', 'INSERT', { id: 2 });
            await gd.queueWrite('db', 'INSERT', { id: 3 });
            await gd.queueWrite('db', 'INSERT', { id: 4 }); // Should drop id:1

            expect(gd.getQueueSize()).toBe(3);
            const writes = gd.getQueuedWrites();
            expect(writes[0].data).toEqual({ id: 2 });
        });
    });

    describe('getStatus() / getHealth()', () => {
        it('should return full system status', () => {
            gd.registerService('api');
            gd.registerService('db', { critical: true });

            const status = gd.getStatus();

            expect(status.level).toBe(DegradationLevel.NORMAL);
            expect(status.timestamp).toBeDefined();
            expect(status.services.api).toBeDefined();
            expect(status.services.api.state).toBe(ServiceState.HEALTHY);
            expect(status.services.db.critical).toBe(true);
            expect(status.queuedWrites).toBe(0);
            expect(status.cacheEntries).toBe(0);
        });

        it('should report healthy when system is NORMAL', () => {
            gd.registerService('api');

            const health = gd.getHealth();
            expect(health.healthy).toBe(true);
        });

        it('should report healthy when system is DEGRADED', () => {
            gd.registerService('api');
            gd.registerService('other'); // Need a healthy service so level isn't OFFLINE
            gd.markDegraded('api');

            const health = gd.getHealth();
            expect(health.healthy).toBe(true); // Degraded is still usable
        });

        it('should report unhealthy when CRITICAL', () => {
            gd.registerService('db', { critical: true });
            gd.markUnavailable('db');

            const health = gd.getHealth();
            expect(health.healthy).toBe(false);
        });

        it('should report unhealthy when OFFLINE', () => {
            gd.registerService('a');
            gd.markUnavailable('a');

            const health = gd.getHealth();
            expect(health.healthy).toBe(false);
        });
    });

    describe('clearCache()', () => {
        it('should clear all cache entries', async () => {
            gd.registerService('api');

            // Populate cache via execute
            await gd.execute('api', async () => 'data1', { cacheKey: 'key1' });
            await gd.execute('api', async () => 'data2', { cacheKey: 'key2' });

            gd.clearCache();

            // Cache should be empty — stale data unavailable
            gd.markUnavailable('api');
            const result = await gd.execute(
                'api',
                async () => { throw new Error('fail'); },
                { cacheKey: 'key1' }
            );
            expect(result.success).toBe(false);
        });

        it('should clear only specific service cache', async () => {
            gd.registerService('api');
            gd.registerService('db');

            await gd.execute('api', async () => 'api-data', { cacheKey: 'k1' });
            await gd.execute('db', async () => 'db-data', { cacheKey: 'k2' });

            gd.clearCache('api'); // Only clear api cache

            // API cache cleared
            gd.markUnavailable('api');
            const apiResult = await gd.execute(
                'api',
                async () => { throw new Error('fail'); },
                { cacheKey: 'k1' }
            );
            expect(apiResult.success).toBe(false);

            // DB cache still available
            gd.markUnavailable('db');
            const dbResult = await gd.execute(
                'db',
                async () => { throw new Error('fail'); },
                { cacheKey: 'k2' }
            );
            expect(dbResult.success).toBe(true);
            expect(dbResult.data).toBe('db-data');
        });
    });

    describe('shutdown()', () => {
        it('should clear all internal state', () => {
            gd.registerService('api');
            gd.markDegraded('api');

            gd.shutdown();

            expect(gd.getServiceState('api')).toBeNull();
            expect(gd.getQueueSize()).toBe(0);
        });
    });

    describe('LRU cache eviction', () => {
        it('should evict oldest cache entries when exceeding maxCacheSize', async () => {
            gd.registerService('api');
            (gd as any).maxCacheSize = 3;

            // Fill cache
            await gd.execute('api', async () => 'v1', { cacheKey: 'k1' });
            await gd.execute('api', async () => 'v2', { cacheKey: 'k2' });
            await gd.execute('api', async () => 'v3', { cacheKey: 'k3' });

            // This should evict k1
            await gd.execute('api', async () => 'v4', { cacheKey: 'k4' });

            gd.markUnavailable('api');

            // k1 should be evicted
            const r1 = await gd.execute(
                'api',
                async () => { throw new Error('fail'); },
                { cacheKey: 'k1' }
            );
            expect(r1.success).toBe(false);

            // Reset for next check
            gd.markHealthy('api');
            gd.markUnavailable('api');

            // k4 should still be cached
            const r4 = await gd.execute(
                'api',
                async () => { throw new Error('fail'); },
                { cacheKey: 'k4' }
            );
            expect(r4.success).toBe(true);
            expect(r4.data).toBe('v4');
        });
    });
});
