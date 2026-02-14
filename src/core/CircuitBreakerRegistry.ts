/**
 * Circuit Breaker Registry
 * Central management for all circuit breakers
 * @module core/CircuitBreakerRegistry
 */

import { 
    CircuitBreaker, 
    CircuitBreakerOptions, 
    CircuitHealth, 
    CircuitBreakerMetrics,
    CircuitState 
} from './CircuitBreaker.js';
import logger from './Logger.js';
// TYPES & INTERFACES
/**
 * Registry health status
 */
export interface RegistryHealth {
    status: 'healthy' | 'degraded' | 'unhealthy';
    breakers: Record<string, CircuitHealth>;
}

/**
 * Registry summary
 */
export interface RegistrySummary {
    total: number;
    closed: number;
    open: number;
    halfOpen: number;
}

/**
 * Fallback result type
 */
export interface FallbackResult {
    success: boolean;
    error: string;
    code: string;
}
// PRE-CONFIGURED CIRCUIT CONFIGS
/**
 * Pre-configured circuit breaker configs for different services
 */
export const CIRCUIT_CONFIGS: Record<string, CircuitBreakerOptions> = {
    // Lavalink - music streaming, can be slow
    lavalink: {
        name: 'lavalink',
        failureThreshold: 5,
        successThreshold: 2,
        timeout: 30000,      // 30s - search can be slow
        resetTimeout: 60000, // 60s - give time to recover
        fallback: (_error: Error): FallbackResult => ({
            success: false,
            error: 'Music service temporarily unavailable',
            code: 'LAVALINK_UNAVAILABLE'
        })
    },

    // External APIs (Reddit, Steam, etc.)
    externalApi: {
        name: 'externalApi',
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 10000,      // 10s
        resetTimeout: 30000, // 30s
        fallback: (_error: Error): FallbackResult => ({
            success: false,
            error: 'External service temporarily unavailable',
            code: 'API_UNAVAILABLE'
        })
    },

    // Database operations
    database: {
        name: 'database',
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 5000,       // 5s
        resetTimeout: 30000, // 30s
        fallback: (_error: Error): FallbackResult => ({
            success: false,
            error: 'Database temporarily unavailable',
            code: 'DB_UNAVAILABLE'
        })
    },

    // Redis cache
    redis: {
        name: 'redis',
        failureThreshold: 5,
        successThreshold: 3,
        timeout: 3000,       // 3s
        resetTimeout: 15000, // 15s
        fallback: (_error: Error): null => null // Cache miss is acceptable
    },

    // Discord API (rate limited)
    discord: {
        name: 'discord',
        failureThreshold: 10, // Higher threshold for rate limits
        successThreshold: 3,
        timeout: 15000,       // 15s
        resetTimeout: 30000,  // 30s
        isFailure: (err: Error & { code?: string | number; httpStatus?: number }): boolean => {
            // Don't trip on rate limits — discord.js uses string error codes
            // (e.g., 'RateLimited'), not HTTP status 429
            if (err.code === 'RateLimited' || err.code === 429 || err.httpStatus === 429) {
                return false;
            }
            // Also ignore transient Discord API errors
            if (typeof err.code === 'string' && ['ECONNRESET', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT'].includes(err.code)) {
                return true; // These ARE real failures that should count
            }
            return true;
        }
    },

    // Anime/Manga APIs (AniList, MAL)
    anime: {
        name: 'anime',
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 10000,
        resetTimeout: 30000,
        fallback: (_error: Error): FallbackResult => ({
            success: false,
            error: 'Anime service temporarily unavailable',
            code: 'ANIME_API_UNAVAILABLE'
        })
    },

    // NSFW APIs (nhentai, rule34, etc.)
    nsfw: {
        name: 'nsfw',
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 15000,
        resetTimeout: 60000,
        fallback: (_error: Error): FallbackResult => ({
            success: false,
            error: 'Service temporarily unavailable',
            code: 'NSFW_API_UNAVAILABLE'
        })
    },

    // Wikipedia API
    wikipedia: {
        name: 'wikipedia',
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 8000,
        resetTimeout: 30000,
        fallback: (_error: Error): FallbackResult => ({
            success: false,
            error: 'Wikipedia service temporarily unavailable',
            code: 'WIKIPEDIA_API_UNAVAILABLE'
        })
    },

    // Pixiv API
    pixiv: {
        name: 'pixiv',
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 15000,
        resetTimeout: 60000,
        fallback: (_error: Error): FallbackResult => ({
            success: false,
            error: 'Pixiv service temporarily unavailable',
            code: 'PIXIV_API_UNAVAILABLE'
        })
    },

    // Steam API
    steam: {
        name: 'steam',
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 10000,
        resetTimeout: 30000,
        fallback: (_error: Error): FallbackResult => ({
            success: false,
            error: 'Steam service temporarily unavailable',
            code: 'STEAM_API_UNAVAILABLE'
        })
    }
};
// CIRCUIT BREAKER REGISTRY CLASS
/**
 * Circuit Breaker Registry
 * Manages all circuit breakers in the application
 */
export class CircuitBreakerRegistry {
    private breakers: Map<string, CircuitBreaker>;
    private initialized: boolean;

    constructor() {
        this.breakers = new Map();
        this.initialized = false;
    }

    /**
     * Initialize all pre-configured circuit breakers
     */
    initialize(): void {
        if (this.initialized) return;

        for (const [key, config] of Object.entries(CIRCUIT_CONFIGS)) {
            this.register(key, config);
        }

        this.initialized = true;
        logger.info('CircuitBreakerRegistry', `Initialized ${this.breakers.size} circuit breakers`);
    }

    /**
     * Register a new circuit breaker
     */
    register(name: string, config: CircuitBreakerOptions = {}): CircuitBreaker {
        if (this.breakers.has(name)) {
            logger.warn('CircuitBreakerRegistry', `Breaker '${name}' already exists, returning existing`);
            return this.breakers.get(name)!;
        }

        const breaker = new CircuitBreaker({ name, ...config });

        // Log state changes
        breaker.on('stateChange', ({ name, from, to }: { name: string; from: string; to: string }) => {
            if (to === 'OPEN') {
                logger.warn('CircuitBreakerRegistry', `⚠️ Circuit '${name}' OPENED - service degraded`);
            } else if (to === 'CLOSED' && from === 'HALF_OPEN') {
                logger.info('CircuitBreakerRegistry', `✅ Circuit '${name}' recovered`);
            }
        });

        this.breakers.set(name, breaker);
        return breaker;
    }

    /**
     * Get a circuit breaker by name
     */
    get(name: string): CircuitBreaker | undefined {
        return this.breakers.get(name);
    }

    /**
     * Execute a function with a specific circuit breaker
     */
    async execute<T>(name: string, fn: () => Promise<T>): Promise<T> {
        const breaker = this.breakers.get(name);
        if (!breaker) {
            logger.warn('CircuitBreakerRegistry', `Breaker '${name}' not found, executing without protection`);
            return fn();
        }
        return breaker.execute(fn);
    }

    /**
     * Get all breakers' health status
     */
    getHealth(): RegistryHealth {
        const health: RegistryHealth = {
            status: 'healthy',
            breakers: {}
        };

        let hasUnhealthy = false;
        let hasDegraded = false;

        for (const [name, breaker] of this.breakers) {
            const breakerHealth = breaker.getHealth();
            health.breakers[name] = breakerHealth;

            if (breakerHealth.status === 'unhealthy') hasUnhealthy = true;
            if (breakerHealth.status === 'degraded') hasDegraded = true;
        }

        if (hasUnhealthy) health.status = 'unhealthy';
        else if (hasDegraded) health.status = 'degraded';

        return health;
    }

    /**
     * Get all breakers' metrics
     */
    getMetrics(): Record<string, CircuitBreakerMetrics> {
        const metrics: Record<string, CircuitBreakerMetrics> = {};
        for (const [name, breaker] of this.breakers) {
            metrics[name] = breaker.getMetrics();
        }
        return metrics;
    }

    /**
     * Reset all circuit breakers
     */
    resetAll(): void {
        for (const breaker of this.breakers.values()) {
            breaker.reset();
        }
        logger.info('CircuitBreakerRegistry', 'All circuits reset');
    }

    /**
     * Reset metrics for all breakers
     */
    resetAllMetrics(): void {
        for (const breaker of this.breakers.values()) {
            breaker.resetMetrics();
        }
    }

    /**
     * Get summary of current states
     */
    getSummary(): RegistrySummary {
        const summary: RegistrySummary = {
            total: this.breakers.size,
            closed: 0,
            open: 0,
            halfOpen: 0
        };

        for (const breaker of this.breakers.values()) {
            const state = breaker.getState();
            if (state === CircuitState.CLOSED) summary.closed++;
            else if (state === CircuitState.OPEN) summary.open++;
            else if (state === CircuitState.HALF_OPEN) summary.halfOpen++;
        }

        return summary;
    }

    /**
     * Shutdown - cleanup
     */
    shutdown(): void {
        for (const breaker of this.breakers.values()) {
            breaker.removeAllListeners();
        }
        this.breakers.clear();
        this.initialized = false;
    }
}

// Export singleton and class
const circuitBreakerRegistry = new CircuitBreakerRegistry();

export { circuitBreakerRegistry };
export default circuitBreakerRegistry;
