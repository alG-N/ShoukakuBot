/**
 * Circuit Breaker Pattern Implementation
 * Prevents cascading failures by failing fast when a service is unavailable
 * @module core/CircuitBreaker
 */

import { EventEmitter } from 'events';
import logger from './Logger.js';
// TYPES & INTERFACES
/**
 * Circuit Breaker States
 */
export const CircuitState = {
    CLOSED: 'CLOSED',       // Normal operation, requests flow through
    OPEN: 'OPEN',           // Circuit tripped, requests fail fast
    HALF_OPEN: 'HALF_OPEN'  // Testing if service recovered
} as const;

export type CircuitStateType = typeof CircuitState[keyof typeof CircuitState];

/**
 * State change record
 */
export interface StateChange {
    from: CircuitStateType;
    to: CircuitStateType;
    timestamp: string;
}

/**
 * Circuit Breaker metrics
 */
export interface CircuitMetrics {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    rejectedRequests: number;
    timeouts: number;
    fallbackExecutions: number;
    stateChanges: StateChange[];
}

/**
 * Circuit Breaker configuration options
 */
export interface CircuitBreakerOptions {
    /** Name of the circuit breaker */
    name?: string;
    /** Number of failures before opening circuit */
    failureThreshold?: number;
    /** Number of successes in half-open to close circuit */
    successThreshold?: number;
    /** Request timeout in ms */
    timeout?: number;
    /** Time to wait before trying again (half-open) */
    resetTimeout?: number;
    /** Fallback function when circuit is open */
    fallback?: (error: Error) => unknown;
    /** Custom function to determine if result is a failure */
    isFailure?: (error: Error) => boolean;
    /** Whether circuit breaker is enabled */
    enabled?: boolean;
}

/**
 * Full metrics with calculated fields
 */
export interface CircuitBreakerMetrics extends CircuitMetrics {
    name: string;
    state: CircuitStateType;
    failureCount: number;
    successCount: number;
    lastFailureTime: number | null;
    nextAttempt: number | null;
    successRate: string;
}

/**
 * Health status
 */
export interface CircuitHealth {
    name: string;
    status: 'healthy' | 'degraded' | 'unhealthy';
    state: CircuitStateType;
    failureCount: number;
    lastFailure: string | null;
    nextAttempt: string | null;
}

/**
 * Error with circuit breaker info
 */
export interface CircuitBreakerError extends Error {
    code?: string;
    circuitBreaker?: string;
}
// CIRCUIT BREAKER CLASS
/**
 * Circuit Breaker class
 * Implements the circuit breaker pattern for fault tolerance
 */
export class CircuitBreaker extends EventEmitter {
    readonly name: string;
    readonly failureThreshold: number;
    readonly successThreshold: number;
    readonly timeout: number;
    readonly resetTimeout: number;
    readonly fallback: ((error: Error) => unknown) | null;
    readonly isFailure: (error: Error) => boolean;
    readonly enabled: boolean;

    private state: CircuitStateType;
    private failureCount: number;
    private successCount: number;
    private lastFailureTime: number | null;
    private nextAttempt: number | null;
    private metrics: CircuitMetrics;

    constructor(options: CircuitBreakerOptions = {}) {
        super();

        this.name = options.name || 'default';
        this.failureThreshold = options.failureThreshold || 5;
        this.successThreshold = options.successThreshold || 2;
        this.timeout = options.timeout || 30000;
        this.resetTimeout = options.resetTimeout || 60000;
        this.fallback = options.fallback || null;
        this.isFailure = options.isFailure || ((_err: Error) => true);
        this.enabled = options.enabled !== false;

        // State
        this.state = CircuitState.CLOSED;
        this.failureCount = 0;
        this.successCount = 0;
        this.lastFailureTime = null;
        this.nextAttempt = null;

        // Metrics
        this.metrics = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            rejectedRequests: 0,
            timeouts: 0,
            fallbackExecutions: 0,
            stateChanges: []
        };
    }

    /**
     * Execute a function with circuit breaker protection
     */
    async execute<T>(fn: () => Promise<T>): Promise<T> {
        if (!this.enabled) {
            return fn();
        }

        this.metrics.totalRequests++;

        // Check if circuit is open
        if (this.state === CircuitState.OPEN) {
            if (Date.now() >= (this.nextAttempt || 0)) {
                // Try half-open
                this._setState(CircuitState.HALF_OPEN);
            } else {
                // Fail fast
                return this._handleRejection() as T;
            }
        }

        try {
            // Execute with timeout
            const result = await this._executeWithTimeout(fn);
            this._onSuccess();
            return result;
        } catch (error) {
            return this._onFailure(error as Error) as T;
        }
    }

    /**
     * Execute function with timeout
     */
    private async _executeWithTimeout<T>(fn: () => Promise<T>): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                this.metrics.timeouts++;
                reject(new Error(`Circuit breaker timeout: ${this.name}`));
            }, this.timeout);

            fn()
                .then((result) => {
                    clearTimeout(timeoutId);
                    resolve(result);
                })
                .catch((error) => {
                    clearTimeout(timeoutId);
                    reject(error);
                });
        });
    }

    /**
     * Handle successful execution
     */
    private _onSuccess(): void {
        this.metrics.successfulRequests++;

        if (this.state === CircuitState.HALF_OPEN) {
            this.successCount++;

            if (this.successCount >= this.successThreshold) {
                this._setState(CircuitState.CLOSED);
                this.failureCount = 0;
                this.successCount = 0;
            }
        } else {
            // Reset failure count on success in closed state
            this.failureCount = 0;
        }
    }

    /**
     * Handle failed execution
     */
    private _onFailure(error: Error): unknown {
        this.metrics.failedRequests++;
        this.lastFailureTime = Date.now();

        // Check if this error type should count as a circuit-tripping failure.
        // Non-failure errors (business logic, validation, rate limits) should NOT
        // increment the failure counter or trip the circuit.
        if (!this.isFailure(error)) {
            throw error;
        }

        this.failureCount++;

        if (this.state === CircuitState.HALF_OPEN) {
            // Single failure in half-open trips circuit again
            this._setState(CircuitState.OPEN);
            this.successCount = 0;
        } else if (this.failureCount >= this.failureThreshold) {
            this._setState(CircuitState.OPEN);
        }

        return this._executeFallback(error);
    }

    /**
     * Handle rejection when circuit is open
     */
    private _handleRejection(): unknown {
        this.metrics.rejectedRequests++;

        const error = new Error(`Circuit breaker is OPEN: ${this.name}`) as CircuitBreakerError;
        error.code = 'CIRCUIT_OPEN';
        error.circuitBreaker = this.name;

        this.emit('reject', { name: this.name, state: this.state });

        return this._executeFallback(error);
    }

    /**
     * Execute fallback function
     */
    private _executeFallback(error: Error): unknown {
        if (this.fallback) {
            this.metrics.fallbackExecutions++;
            return this.fallback(error);
        }
        throw error;
    }

    /**
     * Set circuit state
     */
    private _setState(newState: CircuitStateType): void {
        const oldState = this.state;
        this.state = newState;

        if (newState === CircuitState.OPEN) {
            this.nextAttempt = Date.now() + this.resetTimeout;
        }

        // Track state change
        this.metrics.stateChanges.push({
            from: oldState,
            to: newState,
            timestamp: new Date().toISOString()
        });

        // Keep only last 20 state changes
        if (this.metrics.stateChanges.length > 20) {
            this.metrics.stateChanges.shift();
        }

        this.emit('stateChange', {
            name: this.name,
            from: oldState,
            to: newState
        });

        logger.info('CircuitBreaker', `[${this.name}] State changed: ${oldState} → ${newState}`);
    }

    /**
     * Manually trip the circuit
     */
    trip(): void {
        if (this.state !== CircuitState.OPEN) {
            this._setState(CircuitState.OPEN);
        }
    }

    /**
     * Manually reset the circuit
     */
    reset(): void {
        this._setState(CircuitState.CLOSED);
        this.failureCount = 0;
        this.successCount = 0;
    }

    /**
     * Check if circuit is open
     */
    isOpen(): boolean {
        return this.state === CircuitState.OPEN;
    }

    /**
     * Check if circuit is closed
     */
    isClosed(): boolean {
        return this.state === CircuitState.CLOSED;
    }

    /**
     * Get current state
     */
    getState(): CircuitStateType {
        return this.state;
    }

    /**
     * Get metrics
     */
    getMetrics(): CircuitBreakerMetrics {
        return {
            name: this.name,
            state: this.state,
            failureCount: this.failureCount,
            successCount: this.successCount,
            lastFailureTime: this.lastFailureTime,
            nextAttempt: this.nextAttempt,
            ...this.metrics,
            successRate: this.metrics.totalRequests > 0
                ? ((this.metrics.successfulRequests / this.metrics.totalRequests) * 100).toFixed(2) + '%'
                : 'N/A'
        };
    }

    /**
     * Reset metrics
     */
    resetMetrics(): void {
        this.metrics = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            rejectedRequests: 0,
            timeouts: 0,
            fallbackExecutions: 0,
            stateChanges: []
        };
    }

    /**
     * Get health status for health checks
     */
    getHealth(): CircuitHealth {
        return {
            name: this.name,
            status: this.state === CircuitState.CLOSED ? 'healthy' :
                    this.state === CircuitState.HALF_OPEN ? 'degraded' : 'unhealthy',
            state: this.state,
            failureCount: this.failureCount,
            lastFailure: this.lastFailureTime ? new Date(this.lastFailureTime).toISOString() : null,
            nextAttempt: this.nextAttempt ? new Date(this.nextAttempt).toISOString() : null
        };
    }
}
