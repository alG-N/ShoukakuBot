export interface RetryOptions {
    name?: string;
    maxRetries?: number;
    retryDelay?: number;
    retryableStatusCodes?: number[];
    onRetry?: (attempt: number, error: Error) => void;
}

export interface ErrorWithResponse extends Error {
    code?: string;
    response?: { status?: number };
    status?: number;
}
