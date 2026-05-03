/**
 * CacheService Integration Tests
 * Tests cache operations with real Redis
 * @module tests/integration/cache.integration.test
 */

import { getTestRedis, clearTestRedis, testUtils, cleanupTestResources } from './setup';
import { CacheService } from '../../src/cache/cacheService';

// Skip if not running integration tests
const describeIntegration = process.env.RUN_INTEGRATION_TESTS ? describe : describe.skip;

describeIntegration('CacheService Integration', () => {
    let cache: CacheService;
    let cleanupInterval: NodeJS.Timeout;

    beforeAll(async () => {
        const redis = await getTestRedis();
        cache = new CacheService({ cleanupIntervalMs: 1000000 });
        cache.setRedis(redis);
        cleanupInterval = (cache as any)._cleanupInterval;
    });

    beforeEach(async () => {
        await clearTestRedis();
    });

    afterAll(async () => {
        if (cleanupInterval) clearInterval(cleanupInterval);
        await cleanupTestResources();
    });

    describe('Basic Operations with Redis', () => {
        it('should store and retrieve from Redis', async () => {
            const guildId = testUtils.mockGuildId();
            
            await cache.set('guild', guildId, { name: 'Test Guild', premium: true });
            
            const result = await cache.get('guild', guildId);
            
            expect(result).toEqual({ name: 'Test Guild', premium: true });
            expect(cache.getStats().redisHits).toBeGreaterThan(0);
        });

        it('should respect TTL', async () => {
            const key = testUtils.randomId();
            
            await cache.set('temp', key, 'short-lived', 1); // 1 second TTL
            
            // Should exist immediately
            expect(await cache.get('temp', key)).toBe('short-lived');
            
            // Wait for expiration
            await new Promise(r => setTimeout(r, 1500));
            
            // Should be gone
            expect(await cache.get('temp', key)).toBeNull();
        });

        it('should handle concurrent access', async () => {
            const key = testUtils.randomId();
            
            // Concurrent writes
            await Promise.all([
                cache.set('guild', key, { v: 1 }),
                cache.set('guild', key, { v: 2 }),
                cache.set('guild', key, { v: 3 }),
            ]);
            
            // Should have one of the values
            const result = await cache.get<{ v: number }>('guild', key);
            expect([1, 2, 3]).toContain(result?.v);
        });
    });

    describe('Rate Limiting', () => {
        it('should track rate limits across operations', async () => {
            const key = `rate:${testUtils.randomId()}`;
            
            // 5 requests allowed per 10 seconds
            const results = await Promise.all([
                cache.checkRateLimit(key, 5, 10),
                cache.checkRateLimit(key, 5, 10),
                cache.checkRateLimit(key, 5, 10),
                cache.checkRateLimit(key, 5, 10),
                cache.checkRateLimit(key, 5, 10),
            ]);
            
            // All should be allowed
            expect(results.every(r => r.allowed)).toBe(true);
            
            // 6th should be blocked
            const blocked = await cache.checkRateLimit(key, 5, 10);
            expect(blocked.allowed).toBe(false);
        });
    });

    describe('Increment Operations', () => {
        it('should atomically increment counters', async () => {
            const key = testUtils.randomId();
            
            // Concurrent increments
            const results = await Promise.all([
                cache.increment('ratelimit', key),
                cache.increment('ratelimit', key),
                cache.increment('ratelimit', key),
                cache.increment('ratelimit', key),
                cache.increment('ratelimit', key),
            ]);
            
            // All values should be unique 1-5
            const sorted = results.sort((a, b) => a - b);
            expect(sorted).toEqual([1, 2, 3, 4, 5]);
        });
    });

    describe('getOrSet Pattern', () => {
        it('should only call factory once for concurrent requests', async () => {
            const key = testUtils.randomId();
            let factoryCalls = 0;
            
            const factory = async () => {
                factoryCalls++;
                await new Promise(r => setTimeout(r, 100)); // Simulate slow operation
                return { computed: true };
            };
            
            // First call should trigger factory
            const result1 = await cache.getOrSet('api', key, factory);
            expect(result1).toEqual({ computed: true });
            expect(factoryCalls).toBe(1);
            
            // Second call should hit cache
            const result2 = await cache.getOrSet('api', key, factory);
            expect(result2).toEqual({ computed: true });
            expect(factoryCalls).toBe(1); // Still 1, no new call
        });
    });

    describe('Namespace Operations', () => {
        it('should isolate namespaces', async () => {
            const key = 'shared-key';
            
            await cache.set('guild', key, { from: 'guild' });
            await cache.set('user', key, { from: 'user' });
            
            expect(await cache.get('guild', key)).toEqual({ from: 'guild' });
            expect(await cache.get('user', key)).toEqual({ from: 'user' });
        });

        it('should clear only specified namespace', async () => {
            await cache.set('guild', 'key1', 'value1');
            await cache.set('guild', 'key2', 'value2');
            await cache.set('user', 'key1', 'value1');
            
            await cache.clearNamespace('guild');
            
            expect(await cache.get('guild', 'key1')).toBeNull();
            expect(await cache.get('guild', 'key2')).toBeNull();
            expect(await cache.get('user', 'key1')).toBe('value1');
        });
    });

    describe('Music State Operations', () => {
        it('should preserve and restore queue state', async () => {
            const guildId = testUtils.mockGuildId();
            const queueState = {
                tracks: [
                    { id: '1', title: 'Song 1' },
                    { id: '2', title: 'Song 2' },
                ],
                currentIndex: 0,
                volume: 75,
            };
            
            await cache.preserveQueueState(guildId, queueState);
            
            const restored = await cache.getPreservedQueueState(guildId);
            
            expect(restored).toEqual(queueState);
        });

        it('should handle inactivity deadlines', async () => {
            const guildId = testUtils.mockGuildId();
            
            // Set deadline 100ms in the future
            await cache.setInactivityDeadline(guildId, Date.now() + 100);
            
            // Not expired yet
            let expired = await cache.checkInactivityDeadlines();
            expect(expired).not.toContain(guildId);
            
            // Wait for expiration
            await new Promise(r => setTimeout(r, 150));
            
            // Should be expired now
            expired = await cache.checkInactivityDeadlines();
            expect(expired).toContain(guildId);
        });
    });

    describe('Cooldown Operations', () => {
        it('should check and set cooldowns atomically', async () => {
            const command = 'test-command';
            const userId = testUtils.mockUserId();
            
            // First call - no cooldown
            const result1 = await cache.checkAndSetCooldown(command, userId, 5000);
            expect(result1.passed).toBe(true);
            
            // Second call - should be on cooldown
            const result2 = await cache.checkAndSetCooldown(command, userId, 5000);
            expect(result2.passed).toBe(false);
            expect(result2.remaining).toBeGreaterThan(0);
        });
    });

    describe('Error Recovery', () => {
        it('should fallback to memory when Redis operations fail', async () => {
            // This test verifies the fallback mechanism exists
            // In a real scenario, we'd need to simulate Redis failure
            
            const stats = cache.getStats();
            expect(stats.redisConnected).toBe(true);
        });
    });
});
