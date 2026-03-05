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
