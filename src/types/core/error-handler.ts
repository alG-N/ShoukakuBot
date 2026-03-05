export type AsyncFunction<T extends unknown[], R> = (...args: T) => Promise<R>;

export interface ErrorHandlingOptions {
    context?: string;
    retries?: number;
    retryDelay?: number;
    onError?: (error: Error, ...args: unknown[]) => Promise<unknown> | unknown;
    rethrow?: boolean;
}

export interface InteractionErrorBoundaryOptions {
    ephemeral?: boolean;
}
