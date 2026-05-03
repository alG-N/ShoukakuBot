/**
 * errorHandler Unit Tests
 * Tests for safeAsync, withErrorHandling, withTimeout, interactionErrorBoundary
 */

// Mock Logger
jest.mock('../../../src/core/Logger', () => ({
    __esModule: true,
    default: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        critical: jest.fn(),
        logErrorDetailed: jest.fn().mockResolvedValue(undefined),
    },
}));

import {
    safeAsync,
    withErrorHandling,
    withTimeout,
    interactionErrorBoundary,
} from '../../../src/core/errorHandler';
import logger from '../../../src/core/Logger';

describe('safeAsync()', () => {
    it('should pass through successful return value', async () => {
        const fn = jest.fn().mockResolvedValue(42);
        const wrapped = safeAsync(fn, 'TestCtx');

        const result = await wrapped();

        expect(result).toBe(42);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should log and rethrow errors', async () => {
        const err = new Error('boom');
        const fn = jest.fn().mockRejectedValue(err);
        const wrapped = safeAsync(fn, 'TestCtx');

        await expect(wrapped()).rejects.toThrow('boom');
        expect(logger.error).toHaveBeenCalledWith('TestCtx', expect.stringContaining('boom'));
    });

    it('should forward arguments to wrapped function', async () => {
        const fn = jest.fn(async (a: number, b: string) => `${b}${a}`);
        const wrapped = safeAsync(fn, 'Ctx');

        const result = await wrapped(5, 'hello');

        expect(result).toBe('hello5');
        expect(fn).toHaveBeenCalledWith(5, 'hello');
    });
});

describe('withErrorHandling()', () => {
    it('should return value on success', async () => {
        const fn = jest.fn().mockResolvedValue('ok');
        const wrapped = withErrorHandling(fn, { context: 'Test' });

        const result = await wrapped();

        expect(result).toBe('ok');
    });

    it('should retry on failure', async () => {
        const fn = jest.fn()
            .mockRejectedValueOnce(new Error('fail1'))
            .mockRejectedValueOnce(new Error('fail2'))
            .mockResolvedValue('success');

        const wrapped = withErrorHandling(fn, {
            context: 'RetryTest',
            retries: 2,
            retryDelay: 10,
        });

        const result = await wrapped();

        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should call onError fallback after all retries fail', async () => {
        const fn = jest.fn().mockRejectedValue(new Error('always-fail'));
        const onError = jest.fn().mockResolvedValue('fallback');

        const wrapped = withErrorHandling(fn, {
            context: 'FallbackTest',
            retries: 1,
            retryDelay: 10,
            onError,
            rethrow: false,
        });

        const result = await wrapped();

        expect(result).toBe('fallback');
        expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should rethrow when rethrow=true (default)', async () => {
        const fn = jest.fn().mockRejectedValue(new Error('fatal'));
        const wrapped = withErrorHandling(fn, { context: 'Rethrow', retries: 0 });

        await expect(wrapped()).rejects.toThrow('fatal');
    });

    it('should return undefined when rethrow=false and no onError', async () => {
        const fn = jest.fn().mockRejectedValue(new Error('nope'));
        const wrapped = withErrorHandling(fn, {
            context: 'NoRethrow',
            retries: 0,
            rethrow: false,
        });

        const result = await wrapped();

        expect(result).toBeUndefined();
    });

    it('should use exponential backoff for retries', async () => {
        const fn = jest.fn()
            .mockRejectedValueOnce(new Error('fail'))
            .mockResolvedValue('ok');

        const start = Date.now();
        const wrapped = withErrorHandling(fn, {
            context: 'Backoff',
            retries: 1,
            retryDelay: 50,
        });

        await wrapped();
        const elapsed = Date.now() - start;

        // retryDelay * (attempt + 1) = 50 * 1 = 50ms minimum
        expect(elapsed).toBeGreaterThanOrEqual(40); // Allow small timing variance
    });
});

describe('withTimeout()', () => {
    it('should return result when function completes in time', async () => {
        const fn = () => Promise.resolve('fast');

        const result = await withTimeout(fn, 1000, 'FastOp');

        expect(result).toBe('fast');
    });

    it('should reject when function exceeds timeout', async () => {
        const fn = () => new Promise(resolve => setTimeout(resolve, 500));

        await expect(
            withTimeout(fn, 50, 'SlowOp')
        ).rejects.toThrow('SlowOp timed out after 50ms');
    });

    it('should clean up timer after successful execution (no leak)', async () => {
        const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
        const fn = () => Promise.resolve('done');

        await withTimeout(fn, 1000, 'Cleanup');

        expect(clearTimeoutSpy).toHaveBeenCalled();
        clearTimeoutSpy.mockRestore();
    });

    it('should clean up timer after timeout rejection', async () => {
        const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
        const fn = () => new Promise(resolve => setTimeout(resolve, 500));

        await withTimeout(fn, 10, 'TimeoutCleanup').catch(() => {});

        expect(clearTimeoutSpy).toHaveBeenCalled();
        clearTimeoutSpy.mockRestore();
    });

    it('should use default context in error message', async () => {
        const fn = () => new Promise(resolve => setTimeout(resolve, 500));

        await expect(
            withTimeout(fn, 10) // No context arg
        ).rejects.toThrow('Operation timed out after 10ms');
    });
});

describe('interactionErrorBoundary()', () => {
    function createMockInteraction(overrides: Record<string, unknown> = {}) {
        return {
            commandName: 'test',
            deferred: false,
            replied: false,
            reply: jest.fn().mockResolvedValue(undefined),
            editReply: jest.fn().mockResolvedValue(undefined),
            ...overrides,
        } as any;
    }

    it('should call the handler on success', async () => {
        const handler = jest.fn().mockResolvedValue(undefined);
        const wrapped = interactionErrorBoundary(handler);
        const interaction = createMockInteraction();

        await wrapped(interaction);

        expect(handler).toHaveBeenCalledWith(interaction);
    });

    it('should reply with operational error message', async () => {
        const { ValidationError } = require('../../../src/errors/appError');
        const handler = jest.fn().mockRejectedValue(new ValidationError('Bad input'));
        const wrapped = interactionErrorBoundary(handler);
        const interaction = createMockInteraction();

        await wrapped(interaction);

        expect(interaction.reply).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.stringContaining('Bad input'),
                ephemeral: true,
            })
        );
    });

    it('should reply with generic message for non-operational errors', async () => {
        const handler = jest.fn().mockRejectedValue(new Error('programmer bug'));
        const wrapped = interactionErrorBoundary(handler);
        const interaction = createMockInteraction();

        await wrapped(interaction);

        expect(interaction.reply).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.stringContaining('unexpected error'),
                ephemeral: true,
            })
        );
    });

    it('should use editReply when interaction is deferred', async () => {
        const handler = jest.fn().mockRejectedValue(new Error('fail'));
        const wrapped = interactionErrorBoundary(handler);
        const interaction = createMockInteraction({ deferred: true });

        await wrapped(interaction);

        expect(interaction.editReply).toHaveBeenCalled();
        expect(interaction.reply).not.toHaveBeenCalled();
    });

    it('should use editReply when interaction is already replied', async () => {
        const handler = jest.fn().mockRejectedValue(new Error('fail'));
        const wrapped = interactionErrorBoundary(handler);
        const interaction = createMockInteraction({ replied: true });

        await wrapped(interaction);

        expect(interaction.editReply).toHaveBeenCalled();
    });

    it('should use custom ephemeral option', async () => {
        const handler = jest.fn().mockRejectedValue(new Error('fail'));
        const wrapped = interactionErrorBoundary(handler, { ephemeral: false });
        const interaction = createMockInteraction();

        await wrapped(interaction);

        expect(interaction.reply).toHaveBeenCalledWith(
            expect.objectContaining({ ephemeral: false })
        );
    });

    it('should silently handle reply errors', async () => {
        const handler = jest.fn().mockRejectedValue(new Error('fail'));
        const wrapped = interactionErrorBoundary(handler);
        const interaction = createMockInteraction({
            reply: jest.fn().mockRejectedValue(new Error('Unknown interaction')),
        });

        // Should not throw
        await expect(wrapped(interaction)).resolves.not.toThrow();
    });

    it('should forward extra arguments to handler', async () => {
        const handler = jest.fn().mockResolvedValue(undefined);
        const wrapped = interactionErrorBoundary(handler);
        const interaction = createMockInteraction();

        await wrapped(interaction, 'extra1' as any, 'extra2' as any);

        expect(handler).toHaveBeenCalledWith(interaction, 'extra1', 'extra2');
    });
});
