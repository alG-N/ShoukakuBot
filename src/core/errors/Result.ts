/**
 * Result Pattern
 * Standardized return type for service operations
 * @module core/Result
 */
import type { ErrorDetails, ReplyOptions, DiscordReply, ResultJSON } from '../../types/core/result.js';
// RESULT CLASS
/**
 * Result class for consistent service returns
 * Implements Railway-Oriented Programming pattern
 */
export class Result<T> {
    readonly success: boolean;
    readonly data: T | null;
    readonly error: string | null;
    readonly code: string | null;
    readonly details: ErrorDetails | null;

    private constructor(
        success: boolean,
        data: T | null,
        error: string | null,
        code: string | null,
        details: ErrorDetails | null = null
    ) {
        this.success = success;
        this.data = data;
        this.error = error;
        this.code = code;
        this.details = details;
    }

    /**
     * Create a success result
     */
    static ok<T>(data: T): Result<T>;
    static ok(): Result<null>;
    static ok<T>(data?: T): Result<T | null> {
        return new Result<T | null>(true, data ?? null, null, null, null);
    }

    /**
     * Create an error result
     */
    static err<T = null>(
        code: string, 
        message: string, 
        details: ErrorDetails | null = null
    ): Result<T> {
        return new Result<T>(false, null, message, code, details);
    }

    /**
     * Create error from an exception
     */
    static fromError<T = null>(error: Error, code: string = 'INTERNAL_ERROR'): Result<T> {
        return new Result<T>(
            false,
            null,
            error.message,
            code,
            { stack: error.stack, name: error.name }
        );
    }

    /**
     * Check if result is success
     */
    isOk(): this is Result<T> & { data: T; error: null; code: null } {
        return this.success === true;
    }

    /**
     * Check if result is error
     */
    isErr(): this is Result<T> & { data: null; error: string; code: string } {
        return this.success === false;
    }

    /**
     * Get data or throw if error
     */
    unwrap(): T {
        if (this.isErr()) {
            const error = new Error(this.error ?? 'Unknown error') as Error & { code?: string };
            error.code = this.code ?? undefined;
            throw error;
        }
        return this.data as T;
    }

    /**
     * Get data or return default value
     */
    unwrapOr<D>(defaultValue: D): T | D {
        return this.isOk() ? this.data as T : defaultValue;
    }

    /**
     * Map success data to new value
     */
    map<U>(fn: (data: T) => U): Result<U> {
        if (this.isErr()) {
            return Result.err<U>(this.code ?? 'UNKNOWN', this.error ?? 'Unknown error', this.details);
        }
        return Result.ok(fn(this.data as T));
    }

    /**
     * Chain another Result-returning function
     */
    flatMap<U>(fn: (data: T) => Result<U>): Result<U> {
        if (this.isErr()) {
            return Result.err<U>(this.code ?? 'UNKNOWN', this.error ?? 'Unknown error', this.details);
        }
        return fn(this.data as T);
    }

    /**
     * Convert to plain object (for JSON serialization)
     */
    toJSON(): ResultJSON<T> {
        return {
            success: this.success,
            data: this.data,
            error: this.error,
            code: this.code,
            ...(this.details && { details: this.details })
        };
    }

    /**
     * Convert to Discord-friendly reply format
     */
    toReply(options: ReplyOptions = {}): DiscordReply {
        const { successMessage, ephemeral = false } = options;

        if (this.isOk()) {
            return {
                content: successMessage || '✅ Success!',
                ephemeral
            };
        }

        return {
            content: `❌ ${this.error}`,
            ephemeral: true
        };
    }
}

export { type ErrorDetails, type ReplyOptions, type DiscordReply, type ResultJSON };
