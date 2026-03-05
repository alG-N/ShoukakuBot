import type { PoolClient } from 'pg';

export interface RetryConfig {
    maxRetries: number;
    baseDelayMs: number;
    maxDelayMs: number;
}

export interface QueryOptions {
    retries?: number;
    noRetry?: boolean;
    usePrimary?: boolean;
}

export interface DatabaseStatus {
    isConnected: boolean;
    state: string;
    failureCount: number;
    maxFailures: number;
    pendingWrites: number;
    readReplica: {
        enabled: boolean;
        host: string | null;
    };
    retryConfig: RetryConfig;
}

export interface WriteQueueEntry {
    operation: 'insert' | 'update' | 'delete';
    params: {
        table: string;
        data?: Record<string, unknown>;
        where?: Record<string, unknown>;
    };
    timestamp: number;
}

export interface QueuedResponse {
    queued: true;
    operation: string;
    table: string;
}

export type TransactionCallback<T> = (client: PoolClient) => Promise<T>;
