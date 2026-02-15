/**
 * Integration Test Setup
 * Provides utilities for testing with real Redis and Postgres
 * @module tests/integration/setup
 */

import { Redis } from 'ioredis';
import { Knex, knex } from 'knex';

// Test configuration
export const TEST_CONFIG = {
    redis: {
        host: process.env.TEST_REDIS_HOST || 'localhost',
        port: parseInt(process.env.TEST_REDIS_PORT || '6379', 10),
        db: parseInt(process.env.TEST_REDIS_DB || '15', 10), // Use DB 15 for tests
        keyPrefix: 'test:',
    },
    postgres: {
        host: process.env.TEST_PG_HOST || 'localhost',
        port: parseInt(process.env.TEST_PG_PORT || '5432', 10),
        database: process.env.TEST_PG_DATABASE || 'shoukaku_test',
        user: process.env.TEST_PG_USER || 'postgres',
        password: process.env.TEST_PG_PASSWORD || 'postgres',
    },
};

// Global test instances
let redisClient: Redis | null = null;
let postgresClient: Knex | null = null;

/**
 * Get or create Redis client for tests
 */
export async function getTestRedis(): Promise<Redis> {
    if (redisClient) return redisClient;

    redisClient = new Redis({
        host: TEST_CONFIG.redis.host,
        port: TEST_CONFIG.redis.port,
        db: TEST_CONFIG.redis.db,
        keyPrefix: TEST_CONFIG.redis.keyPrefix,
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => {
            if (times > 3) return null;
            return Math.min(times * 100, 1000);
        },
    });

    // Wait for connection
    await new Promise<void>((resolve, reject) => {
        redisClient!.on('connect', () => resolve());
        redisClient!.on('error', (err) => reject(err));
        setTimeout(() => reject(new Error('Redis connection timeout')), 5000);
    });

    return redisClient;
}

/**
 * Get or create Postgres client for tests
 */
export async function getTestPostgres(): Promise<Knex> {
    if (postgresClient) return postgresClient;

    postgresClient = knex({
        client: 'pg',
        connection: {
            host: TEST_CONFIG.postgres.host,
            port: TEST_CONFIG.postgres.port,
            database: TEST_CONFIG.postgres.database,
            user: TEST_CONFIG.postgres.user,
            password: TEST_CONFIG.postgres.password,
        },
        pool: { min: 1, max: 5 },
    });

    // Test connection
    await postgresClient.raw('SELECT 1');

    return postgresClient;
}

/**
 * Clear all test data from Redis
 */
export async function clearTestRedis(): Promise<void> {
    if (!redisClient) return;

    // Get all keys with test prefix
    const keys = await redisClient.keys('*');
    if (keys.length > 0) {
        // Remove prefix before deleting (ioredis adds it back)
        const keysWithoutPrefix = keys.map(k => k.replace(TEST_CONFIG.redis.keyPrefix, ''));
        await redisClient.del(...keysWithoutPrefix);
    }
}

/**
 * Cleanup test resources
 */
export async function cleanupTestResources(): Promise<void> {
    if (redisClient) {
        await clearTestRedis();
        await redisClient.quit();
        redisClient = null;
    }

    if (postgresClient) {
        await postgresClient.destroy();
        postgresClient = null;
    }
}

/**
 * Test utilities
 */
export const testUtils = {
    /**
     * Wait for a condition to be true
     */
    async waitFor(
        condition: () => boolean | Promise<boolean>,
        timeout = 5000,
        interval = 100
    ): Promise<void> {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            if (await condition()) return;
            await new Promise(r => setTimeout(r, interval));
        }
        throw new Error('Condition not met within timeout');
    },

    /**
     * Generate random test ID
     */
    randomId(): string {
        return `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    },

    /**
     * Create a mock guild ID
     */
    mockGuildId(): string {
        return `guild-${Date.now()}`;
    },

    /**
     * Create a mock user ID
     */
    mockUserId(): string {
        return `user-${Date.now()}`;
    },
};

// Jest hooks
beforeAll(async () => {
    // Skip if no integration flag
    if (!process.env.RUN_INTEGRATION_TESTS) {
        console.log('â­ï¸  Skipping integration tests (set RUN_INTEGRATION_TESTS=1 to enable)');
    }
});

afterAll(async () => {
    await cleanupTestResources();
});
