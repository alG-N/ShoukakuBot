/**
 * Database Configuration
 * Centralized database connection settings
 * @module config/database
 */

export const postgres = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'shoukaku',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'shoukaku_db',
    
    // Connection pool settings (optimized for 1K+ servers)
    pool: {
        min: 2,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
        acquireTimeoutMillis: 30000
    },
    
    // Query settings
    query: {
        timeout: 10000,  // 10 seconds
        statementTimeout: 30000  // 30 seconds for complex queries
    }
};

export const redis = {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    
    // Connection settings
    options: {
        maxRetriesPerRequest: 3,
        retryStrategy: (times: number) => Math.min(times * 100, 3000),
        enableReadyCheck: true,
        enableOfflineQueue: true,
        connectTimeout: 10000,
        lazyConnect: true
    },
    
    // Cache TTL defaults (in seconds)
    ttl: {
        guildSettings: 300,     // 5 minutes
        userData: 600,          // 10 minutes
        apiCache: 900,          // 15 minutes
        sessionData: 3600       // 1 hour
    },
    
    // Key prefixes
    prefixes: {
        guild: 'guild:',
        user: 'user:',
        session: 'session:',
        cache: 'cache:',
        lock: 'lock:'
    }
};

// Enable/disable Redis (fallback to in-memory if disabled)
export const useRedis = process.env.REDIS_URL ? true : false;

// Database health check interval
export const healthCheckInterval = 60000;  // 1 minute

export default {
    postgres,
    redis,
    useRedis,
    healthCheckInterval
};
