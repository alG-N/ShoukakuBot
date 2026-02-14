/**
 * CircuitBreakerRegistry Unit Tests
 * Tests for central circuit breaker management, pre-configs, health, and metrics
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

import { CircuitBreakerRegistry, CIRCUIT_CONFIGS } from '../../../src/core/CircuitBreakerRegistry';
import { CircuitState } from '../../../src/core/CircuitBreaker';

describe('CircuitBreakerRegistry', () => {
    let registry: CircuitBreakerRegistry;

    beforeEach(() => {
        registry = new CircuitBreakerRegistry();
    });

    afterEach(() => {
        registry.shutdown();
    });

    describe('CIRCUIT_CONFIGS', () => {
        it('should have pre-configured breakers for all expected services', () => {
            const expected = [
                'lavalink', 'externalApi', 'database', 'redis', 'discord',
                'anime', 'nsfw', 'wikipedia', 'pixiv', 'steam',
            ];

            for (const name of expected) {
                expect(CIRCUIT_CONFIGS[name]).toBeDefined();
                expect(CIRCUIT_CONFIGS[name].name).toBe(name);
            }
        });

        it('should have fallback functions for API breakers', () => {
            for (const [name, config] of Object.entries(CIRCUIT_CONFIGS)) {
                if (['redis', 'discord'].includes(name)) continue;
                if (config.fallback) {
                    const result = config.fallback(new Error('test'));
                    expect(result).toHaveProperty('success');
                    expect(result).toHaveProperty('error');
                    expect(result).toHaveProperty('code');
                }
            }
        });

        it('should have redis fallback return null (cache miss is acceptable)', () => {
            const result = CIRCUIT_CONFIGS.redis.fallback!(new Error('test'));
            expect(result).toBeNull();
        });

        it('should have discord config that ignores 429 rate limits', () => {
            const discordConfig = CIRCUIT_CONFIGS.discord;
            expect(discordConfig.isFailure).toBeDefined();

            // 429 should NOT be counted as failure
            const rateLimitError = Object.assign(new Error('rate limited'), { code: 429 });
            expect(discordConfig.isFailure!(rateLimitError)).toBe(false);

            // Regular error SHOULD be counted as failure
            const normalError = Object.assign(new Error('server error'), { code: 500 });
            expect(discordConfig.isFailure!(normalError)).toBe(true);
        });
    });

    describe('initialize()', () => {
        it('should register all pre-configured breakers', () => {
            registry.initialize();

            const summary = registry.getSummary();
            expect(summary.total).toBe(Object.keys(CIRCUIT_CONFIGS).length);
        });

        it('should only initialize once', () => {
            registry.initialize();
            const firstCount = registry.getSummary().total;

            registry.initialize(); // Second call should be no-op
            const secondCount = registry.getSummary().total;

            expect(firstCount).toBe(secondCount);
        });

        it('should start all breakers in CLOSED state', () => {
            registry.initialize();

            const summary = registry.getSummary();
            expect(summary.closed).toBe(summary.total);
            expect(summary.open).toBe(0);
            expect(summary.halfOpen).toBe(0);
        });
    });

    describe('register()', () => {
        it('should register a new breaker', () => {
            const breaker = registry.register('test-breaker', {
                failureThreshold: 3,
                timeout: 5000,
            });

            expect(breaker).toBeDefined();
            expect(registry.get('test-breaker')).toBe(breaker);
        });

        it('should return existing breaker if name already registered', () => {
            const first = registry.register('dup');
            const second = registry.register('dup');

            expect(first).toBe(second);
        });

        it('should register state change listeners', async () => {
            const breaker = registry.register('test', {
                failureThreshold: 1,
                timeout: 100,
            });

            // Trip the breaker
            try {
                await breaker.execute(async () => { throw new Error('fail'); });
            } catch { /* expected */ }

            expect(breaker.isOpen()).toBe(true);
        });
    });

    describe('get()', () => {
        it('should return breaker by name', () => {
            registry.register('my-breaker');
            expect(registry.get('my-breaker')).toBeDefined();
        });

        it('should return undefined for unknown name', () => {
            expect(registry.get('nonexistent')).toBeUndefined();
        });
    });

    describe('execute()', () => {
        it('should execute through named breaker', async () => {
            registry.register('api');

            const result = await registry.execute('api', async () => 42);
            expect(result).toBe(42);
        });

        it('should execute directly when breaker not found', async () => {
            const result = await registry.execute('unknown', async () => 'ok');
            expect(result).toBe('ok');
        });

        it('should throw when breaker trips', async () => {
            registry.register('test', { failureThreshold: 1, timeout: 100 });

            // Trip it
            await expect(
                registry.execute('test', async () => { throw new Error('fail'); })
            ).rejects.toThrow();

            // Should reject while open
            await expect(
                registry.execute('test', async () => 'should not run')
            ).rejects.toThrow();
        });
    });

    describe('getHealth()', () => {
        it('should report healthy when all breakers are CLOSED', () => {
            registry.register('a');
            registry.register('b');

            const health = registry.getHealth();
            expect(health.status).toBe('healthy');
        });

        it('should report per-breaker health', () => {
            registry.register('api');
            registry.register('db');

            const health = registry.getHealth();
            expect(health.breakers.api).toBeDefined();
            expect(health.breakers.db).toBeDefined();
        });
    });

    describe('getMetrics()', () => {
        it('should return metrics for all breakers', async () => {
            registry.register('api');

            await registry.execute('api', async () => 'ok');

            const metrics = registry.getMetrics();
            expect(metrics.api).toBeDefined();
            expect(metrics.api.totalRequests).toBe(1);
            expect(metrics.api.successfulRequests).toBe(1);
        });
    });

    describe('getSummary()', () => {
        it('should count breakers by state', () => {
            registry.register('a');
            registry.register('b');
            registry.register('c');

            const summary = registry.getSummary();
            expect(summary.total).toBe(3);
            expect(summary.closed).toBe(3);
            expect(summary.open).toBe(0);
            expect(summary.halfOpen).toBe(0);
        });
    });

    describe('resetAll()', () => {
        it('should reset all breakers to CLOSED', async () => {
            const breaker = registry.register('test', {
                failureThreshold: 1,
                timeout: 100,
            });

            // Trip it
            try {
                await breaker.execute(async () => { throw new Error('fail'); });
            } catch { /* expected */ }
            expect(breaker.isOpen()).toBe(true);

            registry.resetAll();
            expect(breaker.isClosed()).toBe(true);
        });
    });

    describe('resetAllMetrics()', () => {
        it('should clear metrics for all breakers', async () => {
            registry.register('api');
            await registry.execute('api', async () => 'ok');

            registry.resetAllMetrics();

            const metrics = registry.getMetrics();
            expect(metrics.api.totalRequests).toBe(0);
        });
    });

    describe('shutdown()', () => {
        it('should clear all breakers', () => {
            registry.register('a');
            registry.register('b');

            registry.shutdown();

            expect(registry.get('a')).toBeUndefined();
            expect(registry.getSummary().total).toBe(0);
        });

        it('should allow re-initialization after shutdown', () => {
            registry.initialize();
            registry.shutdown();

            registry.initialize();
            expect(registry.getSummary().total).toBe(Object.keys(CIRCUIT_CONFIGS).length);
        });
    });
});
