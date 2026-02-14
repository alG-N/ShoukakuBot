/**
 * MessageUpdate Event Unit Tests
 * Tests for message edit handling (automod + mod logging)
 */

// Mock Logger
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

// Mock handlers
const mockHandleAutoModUpdate = jest.fn().mockResolvedValue(undefined);
const mockHandleMessageUpdateLog = jest.fn().mockResolvedValue(undefined);

jest.mock('../../../src/handlers/moderation/index', () => ({
    handleAutoModMessage: jest.fn(),
    handleAutoModUpdate: mockHandleAutoModUpdate,
    handleMessageUpdateLog: mockHandleMessageUpdateLog,
    handleMemberJoin: jest.fn(),
    handleMemberLeave: jest.fn(),
    handleAntiRaid: jest.fn(),
}));

import type { Client, Message, PartialMessage } from 'discord.js';

import messageUpdateEvent from '../../../src/events/messageUpdate';

describe('MessageUpdateEvent', () => {
    const mockClient = {} as Client;

    const createMockMessage = (overrides: Record<string, unknown> = {}): Message => ({
        author: { bot: false, id: '111' },
        guild: { id: '222' },
        content: 'Old content',
        partial: false,
        fetch: jest.fn(),
        ...overrides,
    } as unknown as Message);

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('constructor', () => {
        it('should have correct event name', () => {
            expect(messageUpdateEvent.name).toBe('messageUpdate');
        });

        it('should not be a once event', () => {
            expect(messageUpdateEvent.once).toBe(false);
        });
    });

    describe('execute()', () => {
        it('should ignore bot message edits', async () => {
            const oldMsg = createMockMessage({ content: 'old' });
            const newMsg = createMockMessage({ content: 'new', author: { bot: true, id: '111' } });

            await messageUpdateEvent.execute(mockClient, oldMsg, newMsg);

            expect(mockHandleAutoModUpdate).not.toHaveBeenCalled();
            expect(mockHandleMessageUpdateLog).not.toHaveBeenCalled();
        });

        it('should ignore DM message edits', async () => {
            const oldMsg = createMockMessage({ content: 'old' });
            const newMsg = createMockMessage({ content: 'new', guild: null });

            await messageUpdateEvent.execute(mockClient, oldMsg, newMsg);

            expect(mockHandleAutoModUpdate).not.toHaveBeenCalled();
        });

        it('should ignore edits where content did not change', async () => {
            const oldMsg = createMockMessage({ content: 'same' });
            const newMsg = createMockMessage({ content: 'same' });

            await messageUpdateEvent.execute(mockClient, oldMsg, newMsg);

            expect(mockHandleAutoModUpdate).not.toHaveBeenCalled();
        });

        it('should run automod and mod log on valid edit', async () => {
            const oldMsg = createMockMessage({ content: 'old content' });
            const newMsg = createMockMessage({ content: 'new content' });

            await messageUpdateEvent.execute(mockClient, oldMsg, newMsg);

            expect(mockHandleAutoModUpdate).toHaveBeenCalled();
            expect(mockHandleMessageUpdateLog).toHaveBeenCalled();
        });

        it('should fetch partial old messages', async () => {
            const fetchFn = jest.fn().mockResolvedValue(undefined);
            const oldMsg = createMockMessage({ content: 'old', partial: true, fetch: fetchFn }) as unknown as PartialMessage;
            const newMsg = createMockMessage({ content: 'new' });

            await messageUpdateEvent.execute(mockClient, oldMsg, newMsg);

            expect(fetchFn).toHaveBeenCalled();
        });

        it('should handle partial fetch failure gracefully', async () => {
            const fetchFn = jest.fn().mockRejectedValue(new Error('Too old'));
            const oldMsg = createMockMessage({ content: 'old', partial: true, fetch: fetchFn }) as unknown as PartialMessage;
            const newMsg = createMockMessage({ content: 'new' });

            // Should NOT throw
            await messageUpdateEvent.execute(mockClient, oldMsg, newMsg);

            // Should still try to process
            expect(mockHandleAutoModUpdate).toHaveBeenCalled();
        });

        it('should handle automod error gracefully', async () => {
            mockHandleAutoModUpdate.mockRejectedValue(new Error('AutoMod crash'));
            const oldMsg = createMockMessage({ content: 'old' });
            const newMsg = createMockMessage({ content: 'new' });

            // Should NOT throw
            await messageUpdateEvent.execute(mockClient, oldMsg, newMsg);

            // Mod log should still run
            expect(mockHandleMessageUpdateLog).toHaveBeenCalled();
        });

        it('should handle mod log error gracefully', async () => {
            mockHandleMessageUpdateLog.mockRejectedValue(new Error('Log crash'));
            const oldMsg = createMockMessage({ content: 'old' });
            const newMsg = createMockMessage({ content: 'new' });

            // Should NOT throw
            await messageUpdateEvent.execute(mockClient, oldMsg, newMsg);
        });
    });
});
