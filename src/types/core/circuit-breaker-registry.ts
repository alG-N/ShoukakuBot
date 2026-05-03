import type { CircuitHealth } from '../../core/resilience/CircuitBreaker.js';

export interface RegistryHealth {
    status: 'healthy' | 'degraded' | 'unhealthy';
    breakers: Record<string, CircuitHealth>;
}

export interface RegistrySummary {
    total: number;
    closed: number;
    open: number;
    halfOpen: number;
}

export interface FallbackResult {
    success: boolean;
    error: string;
    code: string;
}
