/**
 * Rate Limiter Middleware
 * Redis-backed rate limiting via CacheService
 * @module middleware/rateLimiter
 */

import cacheService from '../cache/CacheService.js';

// Types
export interface RateLimiterOptions {
    cooldownSeconds?: number;
    maxConcurrent?: number;
}

export interface DistributedRateLimiterOptions {
    name?: string;
    limit?: number;
    windowSeconds?: number;
    maxConcurrent?: number;
}

export interface RateLimitCheckResult {
    allowed: boolean;
    remaining: number;
    resetIn: number;
}

/**
 * Shard-safe rate limiter using CacheService (Redis with memory fallback)
 */
export class RateLimiter {
    private active: Set<string>;
    private cooldownMs: number;
    private maxConcurrent: number;
    private name: string;

    constructor(options: RateLimiterOptions = {}) {
        this.active = new Set();
        this.cooldownMs = (options.cooldownSeconds || 30) * 1000;
        this.maxConcurrent = options.maxConcurrent || 5;
        this.name = 'ratelimiter';
    }

    async checkCooldown(userId: string): Promise<number> {
        const remaining = await cacheService.getCooldown(this.name, userId);
        if (remaining !== null && remaining > 0) {
            return Math.ceil(remaining / 1000);
        }
        return 0;
    }

    async setCooldown(userId: string, customMs?: number): Promise<void> {
        await cacheService.setCooldown(this.name, userId, customMs || this.cooldownMs);
    }

    async clearCooldown(userId: string): Promise<void> {
        await cacheService.clearCooldown(this.name, userId);
    }

    isAtLimit(): boolean {
        return this.active.size >= this.maxConcurrent;
    }

    addActive(userId: string): void {
        this.active.add(userId);
    }

    removeActive(userId: string): void {
        this.active.delete(userId);
    }

    destroy(): void {
        this.active.clear();
    }
}

/**
 * Distributed rate limiter using Redis sliding window
 */
export class DistributedRateLimiter {
    private name: string;
    private limit: number;
    private windowSeconds: number;
    private maxConcurrent: number;
    private active: Set<string>;

    constructor(options: DistributedRateLimiterOptions = {}) {
        this.name = options.name || 'default';
        this.limit = options.limit || 5;
        this.windowSeconds = options.windowSeconds || 60;
        this.maxConcurrent = options.maxConcurrent || 5;
        this.active = new Set();
    }

    async check(userId: string): Promise<RateLimitCheckResult> {
        const key = `${this.name}:${userId}`;
        return cacheService.checkRateLimit(key, this.limit, this.windowSeconds);
    }

    async consume(userId: string): Promise<RateLimitCheckResult> {
        return this.check(userId);
    }

    async getRemainingCooldown(userId: string): Promise<number> {
        const result = await this.check(userId);
        if (!result.allowed) {
            return Math.ceil(result.resetIn / 1000);
        }
        return 0;
    }

    isAtLimit(): boolean {
        return this.active.size >= this.maxConcurrent;
    }

    addActive(userId: string): void {
        this.active.add(userId);
    }

    removeActive(userId: string): void {
        this.active.delete(userId);
    }

    destroy(): void {
        this.active.clear();
    }
}
