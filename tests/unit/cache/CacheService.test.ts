/**
 * CacheService Unit Tests
 * Tests for the unified cache service with Redis + memory fallback
 */

// Mock dependencies before imports
jest.mock('../../../src/core/Logger', () => ({
    default: {
        info: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
    },
    __esModule: true,
}));

jest.mock('../../../src/core/GracefulDegradation', () => ({
    default: {
        initialize: jest.fn(),
        registerFallback: jest.fn(),
        recoverWriteQueue: jest.fn().mockResolvedValue(undefined),
        markDegraded: jest.fn(),
        markHealthy: jest.fn(),
        getServiceState: jest.fn().mockReturnValue('healthy'),
    },
    __esModule: true,
}));

import { CacheService, DEFAULT_NAMESPACES } from '../../../src/cache/CacheService';

// Mock Redis client
const createMockRedis = () => ({
    get: jest.fn(),
    set: jest.fn(),
    setex: jest.fn(),
    del: jest.fn(),
    keys: jest.fn().mockResolvedValue([]),
    incr: jest.fn(),
    expire: jest.fn(),
    multi: jest.fn().mockReturnThis(),
    exec: jest.fn(),
    on: jest.fn(),
    lpush: jest.fn(),
    hset: jest.fn(),
    hget: jest.fn(),
    hdel: jest.fn(),
    hgetall: jest.fn(),
    sadd: jest.fn(),
    srem: jest.fn(),
    smembers: jest.fn(),
    lrange: jest.fn(),
    lset: jest.fn(),
    lindex: jest.fn(),
    llen: jest.fn(),
    lrem: jest.fn(),
    rpop: jest.fn(),
});

describe('CacheService', () => {
    let cache: CacheService;
    let cleanupInterval: NodeJS.Timeout | null = null;

    beforeEach(() => {
        jest.clearAllMocks();
        cache = new CacheService({ cleanupIntervalMs: 1000000 }); // Long interval to prevent cleanup during tests
        // Store reference to cleanup interval
        cleanupInterval = (cache as any)._cleanupInterval;
    });

    afterEach(() => {
        // Clean up any intervals from test instance
        if (cleanupInterval) {
            clearInterval(cleanupInterval);
            cleanupInterval = null;
        }
        // Also shutdown the cache instance
        if (cache) {
            cache.shutdown();
        }
    });

    afterAll(() => {
        jest.clearAllTimers();
        // Clean up the singleton instance's interval if imported
        const singletonCache = require('../../../src/cache/CacheService').default;
        if (singletonCache && typeof singletonCache.shutdown === 'function') {
            singletonCache.shutdown();
        }
    });

    describe('constructor', () => {
        it('should initialize with default namespaces', () => {
            const stats = cache.getStats();
            
            expect(stats.namespaces).toContain('guild');
            expect(stats.namespaces).toContain('api:nhentai');
            expect(stats.namespaces).toContain('api:anime');
            expect(stats.namespaces).toContain('api:search');
            expect(stats.namespaces).toContain('music');
            expect(stats.namespaces).toContain('automod');
            expect(stats.namespaces).toContain('ratelimit');
        });

        it('should initialize metrics to zero', () => {
            const stats = cache.getStats();
            
            expect(stats.hits).toBe(0);
            expect(stats.misses).toBe(0);
            expect(stats.writes).toBe(0);
            expect(stats.errors).toBe(0);
        });

        it('should start without Redis connection', () => {
            const stats = cache.getStats();
            expect(stats.redisConnected).toBe(false);
        });
    });

    describe('setRedis()', () => {
        it('should accept Redis client', () => {
            const mockRedis = createMockRedis();
            cache.setRedis(mockRedis as any);
            
            expect(cache.getStats().redisConnected).toBe(true);
        });

        it('should handle null Redis client', () => {
            cache.setRedis(null);
            expect(cache.getStats().redisConnected).toBe(false);
        });
    });

    describe('get() - memory only', () => {
        beforeEach(async () => {
            // Ensure no Redis
            cache.setRedis(null);
        });

        it('should return null for non-existent key', async () => {
            const result = await cache.get('guild', 'nonexistent');
            expect(result).toBeNull();
        });

        it('should return cached value', async () => {
            await cache.set('guild', 'test-key', { data: 'value' });
            const result = await cache.get('guild', 'test-key');
            expect(result).toEqual({ data: 'value' });
        });

        it('should track cache misses', async () => {
            await cache.get('guild', 'miss1');
            await cache.get('guild', 'miss2');
            
            expect(cache.getStats().misses).toBe(2);
        });

        it('should track cache hits', async () => {
            await cache.set('guild', 'key', 'value');
            await cache.get('guild', 'key');
            await cache.get('guild', 'key');
            
            expect(cache.getStats().hits).toBe(2);
            expect(cache.getStats().memoryHits).toBe(2);
        });
    });

    describe('get() - with Redis', () => {
        let mockRedis: ReturnType<typeof createMockRedis>;

        beforeEach(() => {
            mockRedis = createMockRedis();
            cache.setRedis(mockRedis as any);
        });

        it('should fetch from Redis first', async () => {
            mockRedis.get.mockResolvedValue(JSON.stringify({ data: 'from-redis' }));
            
            const result = await cache.get('guild', 'test-key');
            
            expect(result).toEqual({ data: 'from-redis' });
            expect(mockRedis.get).toHaveBeenCalledWith('guild:test-key');
            expect(cache.getStats().redisHits).toBe(1);
        });

        it('should fallback to memory when Redis fails', async () => {
            mockRedis.get.mockRejectedValue(new Error('Redis connection lost'));
            
            // First set to memory
            await cache.set('guild', 'key', 'memory-value');
            
            // Redis mock cleared, now get should fallback
            const result = await cache.get('guild', 'key');
            
            expect(cache.getStats().redisFallbacks).toBeGreaterThan(0);
        });

        it('should skip Redis for temp namespace', async () => {
            await cache.set('temp', 'key', 'value');
            await cache.get('temp', 'key');
            
            expect(mockRedis.get).not.toHaveBeenCalledWith('temp:key');
        });
    });

    describe('set()', () => {
        it('should store value in memory', async () => {
            await cache.set('guild', 'key', { test: 'data' });
            
            const result = await cache.get('guild', 'key');
            expect(result).toEqual({ test: 'data' });
        });

        it('should track writes', async () => {
            await cache.set('guild', 'key1', 'value1');
            await cache.set('guild', 'key2', 'value2');
            
            expect(cache.getStats().writes).toBe(2);
        });

        it('should use namespace default TTL', async () => {
            await cache.set('temp', 'key', 'value'); // temp has 60s TTL
            
            // Value should exist
            const result = await cache.get('temp', 'key');
            expect(result).toBe('value');
        });

        it('should accept custom TTL', async () => {
            await cache.set('guild', 'key', 'value', 1); // 1 second TTL
            
            // Wait for expiration
            await new Promise(r => setTimeout(r, 1100));
            
            const result = await cache.get('guild', 'key');
            expect(result).toBeNull();
        });

        it('should evict when at capacity', async () => {
            // Register namespace with small capacity
            cache.registerNamespace('small', { ttl: 60, maxSize: 2, useRedis: false });
            
            await cache.set('small', 'key1', 'value1');
            await cache.set('small', 'key2', 'value2');
            await cache.set('small', 'key3', 'value3'); // Should evict key1
            
            // key1 should be evicted
            const key1 = await cache.get('small', 'key1');
            const key3 = await cache.get('small', 'key3');
            
            expect(key1).toBeNull();
            expect(key3).toBe('value3');
        });
    });

    describe('delete()', () => {
        it('should delete from memory cache', async () => {
            await cache.set('guild', 'key', 'value');
            await cache.delete('guild', 'key');
            
            const result = await cache.get('guild', 'key');
            expect(result).toBeNull();
        });

        it('should track deletes', async () => {
            await cache.set('guild', 'key', 'value');
            await cache.delete('guild', 'key');
            
            expect(cache.getStats().deletes).toBe(1);
        });

        it('should not error when deleting non-existent key', async () => {
            await expect(cache.delete('guild', 'nonexistent')).resolves.not.toThrow();
        });
    });

    describe('has()', () => {
        it('should return true for existing key', async () => {
            await cache.set('guild', 'key', 'value');
            expect(await cache.has('guild', 'key')).toBe(true);
        });

        it('should return false for non-existent key', async () => {
            expect(await cache.has('guild', 'nonexistent')).toBe(false);
        });
    });

    describe('getOrSet()', () => {
        it('should return cached value without calling factory', async () => {
            await cache.set('guild', 'key', 'cached');
            
            const factory = jest.fn().mockResolvedValue('fresh');
            const result = await cache.getOrSet('guild', 'key', factory);
            
            expect(result).toBe('cached');
            expect(factory).not.toHaveBeenCalled();
        });

        it('should call factory and cache result on miss', async () => {
            const factory = jest.fn().mockResolvedValue('fresh-value');
            
            const result = await cache.getOrSet('guild', 'key', factory);
            
            expect(result).toBe('fresh-value');
            expect(factory).toHaveBeenCalledTimes(1);
            
            // Should be cached now
            const cached = await cache.get('guild', 'key');
            expect(cached).toBe('fresh-value');
        });

        it('should pass TTL to cache', async () => {
            const factory = jest.fn().mockResolvedValue('value');
            
            await cache.getOrSet('guild', 'key', factory, 1); // 1 second TTL
            
            await new Promise(r => setTimeout(r, 1100));
            
            const result = await cache.get('guild', 'key');
            expect(result).toBeNull();
        });
    });

    describe('increment()', () => {
        it('should increment counter from 0', async () => {
            const count = await cache.increment('ratelimit', 'counter');
            expect(count).toBe(1);
        });

        it('should increment existing counter', async () => {
            await cache.increment('ratelimit', 'counter');
            await cache.increment('ratelimit', 'counter');
            const count = await cache.increment('ratelimit', 'counter');
            
            expect(count).toBe(3);
        });

        it('should use Redis when available', async () => {
            const mockRedis = createMockRedis();
            const mockMulti = {
                incr: jest.fn().mockReturnThis(),
                expire: jest.fn().mockReturnThis(),
                exec: jest.fn().mockResolvedValue([[null, 5]]),
            };
            mockRedis.multi.mockReturnValue(mockMulti);
            cache.setRedis(mockRedis as any);
            
            const count = await cache.increment('ratelimit', 'counter');
            
            expect(mockMulti.incr).toHaveBeenCalledWith('ratelimit:counter');
            expect(count).toBe(5);
        });
    });

    describe('clearNamespace()', () => {
        it('should clear all keys in namespace', async () => {
            await cache.set('guild', 'key1', 'value1');
            await cache.set('guild', 'key2', 'value2');
            await cache.set('music', 'key3', 'value3'); // Different namespace
            
            await cache.clearNamespace('guild');
            
            expect(await cache.get('guild', 'key1')).toBeNull();
            expect(await cache.get('guild', 'key2')).toBeNull();
            expect(await cache.get('music', 'key3')).toBe('value3'); // Should still exist
        });
    });

    describe('registerNamespace()', () => {
        it('should register new namespace', () => {
            cache.registerNamespace('custom', { ttl: 120, maxSize: 500, useRedis: true });
            
            const stats = cache.getStats();
            expect(stats.namespaces).toContain('custom');
        });

        it('should use default values for missing config', () => {
            cache.registerNamespace('partial', { ttl: 120 });
            
            // Should work without errors
            expect(cache.getStats().namespaces).toContain('partial');
        });
    });

    describe('getStats()', () => {
        it('should return comprehensive statistics', async () => {
            await cache.set('guild', 'key', 'value');
            await cache.get('guild', 'key');
            await cache.get('guild', 'miss');
            
            const stats = cache.getStats();
            
            expect(stats.writes).toBe(1);
            expect(stats.hits).toBe(1);
            expect(stats.misses).toBe(1);
            expect(stats.hitRate).toBe(0.5);
            expect(stats.memoryEntries).toBe(1);
            expect(stats.effectiveHitRate).toBeGreaterThanOrEqual(0);
            expect(stats.topMissNamespaces).toBeDefined();
            expect(Array.isArray(stats.topMissNamespaces)).toBe(true);
        });

        it('should calculate hit rate correctly', async () => {
            await cache.set('guild', 'k1', 'v1');
            await cache.set('guild', 'k2', 'v2');
            
            // 3 hits, 1 miss
            await cache.get('guild', 'k1');
            await cache.get('guild', 'k1');
            await cache.get('guild', 'k2');
            await cache.get('guild', 'nonexistent');
            
            expect(cache.getStats().hitRate).toBe(0.75);
        });

        it('should track per-namespace stats in topMissNamespaces', async () => {
            await cache.get('guild', 'miss1');
            await cache.get('guild', 'miss2');
            await cache.set('guild', 'hit1', 'v');
            await cache.get('guild', 'hit1');
            
            const stats = cache.getStats();
            const guildNs = stats.topMissNamespaces.find(n => n.namespace === 'guild');
            expect(guildNs).toBeDefined();
            expect(guildNs!.misses).toBe(2);
            expect(guildNs!.hits).toBe(1);
        });

        it('should track specializedOps for rate limit checks', async () => {
            await cache.checkRateLimit('test:user1', 5, 60);
            await cache.checkRateLimit('test:user2', 5, 60);
            
            const stats = cache.getStats();
            expect(stats.specializedOps).toBe(2);
        });

        it('should count getOrSet misses as real misses', async () => {
            let factoryCalls = 0;
            const factory = async () => { factoryCalls++; return 'generated'; };
            
            // First call: cache miss → factory called
            await cache.getOrSet('guild', 'gosKey', factory);
            expect(factoryCalls).toBe(1);
            expect(cache.getStats().misses).toBe(1);  // miss IS counted now
            
            // Second call: cache hit → factory not called
            await cache.getOrSet('guild', 'gosKey', factory);
            expect(factoryCalls).toBe(1);
            expect(cache.getStats().hits).toBe(1);
        });
    });

    describe('DEFAULT_NAMESPACES', () => {
        it('should have correct TTL configurations', () => {
            expect(DEFAULT_NAMESPACES.guild.ttl).toBe(300);
            expect(DEFAULT_NAMESPACES['api:nhentai'].ttl).toBe(300);
            expect(DEFAULT_NAMESPACES['api:anime'].ttl).toBe(600);
            expect(DEFAULT_NAMESPACES['api:search'].ttl).toBe(300);
            expect(DEFAULT_NAMESPACES['api:translate'].ttl).toBe(1800);
            expect(DEFAULT_NAMESPACES.music.ttl).toBe(3600);
            expect(DEFAULT_NAMESPACES.automod.ttl).toBe(60);
            expect(DEFAULT_NAMESPACES.ratelimit.ttl).toBe(60);
            expect(DEFAULT_NAMESPACES.temp.ttl).toBe(60);
        });

        it('should have Redis enabled for most namespaces', () => {
            expect(DEFAULT_NAMESPACES.guild.useRedis).toBe(true);
            expect(DEFAULT_NAMESPACES['api:anime'].useRedis).toBe(true);
            expect(DEFAULT_NAMESPACES.temp.useRedis).toBe(false); // temp is memory-only
        });
    });

    describe('memory cache expiration', () => {
        it('should return null for expired entries', async () => {
            await cache.set('temp', 'expiring', 'value', 1); // 1 second TTL
            
            // Should exist immediately
            expect(await cache.get('temp', 'expiring')).toBe('value');
            
            // Wait for expiration
            await new Promise(r => setTimeout(r, 1100));
            
            // Should be expired now
            expect(await cache.get('temp', 'expiring')).toBeNull();
        });
    });

    describe('key building', () => {
        it('should build keys with namespace prefix', async () => {
            const mockRedis = createMockRedis();
            mockRedis.get.mockResolvedValue(null);
            cache.setRedis(mockRedis as any);
            
            await cache.get('guild', 'my-key');
            
            expect(mockRedis.get).toHaveBeenCalledWith('guild:my-key');
        });
    });
});
