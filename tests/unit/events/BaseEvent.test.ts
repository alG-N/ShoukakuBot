/**
 * BaseEvent Unit Tests
 * Tests for the event error boundary and lifecycle
 */

// Mock Logger before imports
jest.mock('../../../src/core/Logger', () => ({
    __esModule: true,
    default: {
        error: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        success: jest.fn(),
    },
    logger: {
        error: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        success: jest.fn(),
    },
}));

import { BaseEvent, EventOptions } from '../../../src/events/BaseEvent';
import logger from '../../../src/core/Logger';
import type { Client } from 'discord.js';

// Concrete test implementation
class TestEvent extends BaseEvent {
    public executeFn: jest.Mock;

    constructor(options: EventOptions, executeFn?: jest.Mock) {
        super(options);
        this.executeFn = executeFn || jest.fn();
    }

    async execute(client: Client, ...args: unknown[]): Promise<void> {
        return this.executeFn(client, ...args);
    }
}

describe('BaseEvent', () => {
    const mockClient = {} as Client;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('constructor', () => {
        it('should set name and once from options', () => {
            const event = new TestEvent({ name: 'messageCreate', once: false });
            expect(event.name).toBe('messageCreate');
            expect(event.once).toBe(false);
        });

        it('should default once to false', () => {
            const event = new TestEvent({ name: 'ready' });
            expect(event.once).toBe(false);
        });

        it('should set once to true when specified', () => {
            const event = new TestEvent({ name: 'ready', once: true });
            expect(event.once).toBe(true);
        });

        it('should throw when instantiating BaseEvent directly', () => {
            expect(() => {
                // @ts-expect-error - Testing abstract class instantiation
                new BaseEvent({ name: 'test' });
            }).toThrow('BaseEvent is abstract and cannot be instantiated directly');
        });
    });

    describe('safeExecute()', () => {
        it('should call execute() with client and args', async () => {
            const executeFn = jest.fn();
            const event = new TestEvent({ name: 'test' }, executeFn);

            await event.safeExecute(mockClient, 'arg1', 'arg2');

            expect(executeFn).toHaveBeenCalledWith(mockClient, 'arg1', 'arg2');
        });

        it('should catch errors and log them', async () => {
            const executeFn = jest.fn().mockRejectedValue(new Error('Test error'));
            const event = new TestEvent({ name: 'testEvent' }, executeFn);

            // Should NOT throw
            await event.safeExecute(mockClient);

            expect(logger.error).toHaveBeenCalledWith(
                'Event',
                expect.stringContaining('[testEvent] Unhandled error: Test error')
            );
        });

        it('should log stack trace on error', async () => {
            const error = new Error('Stack test');
            const executeFn = jest.fn().mockRejectedValue(error);
            const event = new TestEvent({ name: 'stackEvent' }, executeFn);

            await event.safeExecute(mockClient);

            expect(logger.debug).toHaveBeenCalledWith(
                'Event',
                expect.stringContaining('[stackEvent] Stack:')
            );
        });

        it('should handle non-Error objects thrown', async () => {
            const executeFn = jest.fn().mockRejectedValue('string error');
            const event = new TestEvent({ name: 'stringErr' }, executeFn);

            await event.safeExecute(mockClient);

            expect(logger.error).toHaveBeenCalledWith(
                'Event',
                expect.stringContaining('[stringErr] Unhandled error: string error')
            );
        });

        it('should not throw even on catastrophic errors', async () => {
            const executeFn = jest.fn().mockRejectedValue(null);
            const event = new TestEvent({ name: 'nullErr' }, executeFn);

            // Should not throw
            await expect(event.safeExecute(mockClient)).resolves.toBeUndefined();
        });

        it('should pass through return value silently (void)', async () => {
            const executeFn = jest.fn().mockResolvedValue('should be ignored');
            const event = new TestEvent({ name: 'returnVal' }, executeFn);

            const result = await event.safeExecute(mockClient);
            expect(result).toBeUndefined();
        });
    });
});
