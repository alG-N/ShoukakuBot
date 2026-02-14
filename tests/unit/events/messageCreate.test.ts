/**
 * MessageCreate Event Unit Tests
 * Tests for message event handling (automod + AFK)
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
const mockHandleAutoModMessage = jest.fn().mockResolvedValue(null);
const mockHandleAfkMessage = jest.fn().mockResolvedValue(undefined);

jest.mock('../../../src/handlers/moderation/index', () => ({
    handleAutoModMessage: mockHandleAutoModMessage,
    handleAutoModUpdate: jest.fn(),
    handleMessageUpdateLog: jest.fn(),
    handleMemberJoin: jest.fn(),
    handleMemberLeave: jest.fn(),
    handleAntiRaid: jest.fn(),
}));

jest.mock('../../../src/handlers/general/index', () => ({
    handleAfkMessage: mockHandleAfkMessage,
}));

import logger from '../../../src/core/Logger';
import type { Client, Message } from 'discord.js';

import messageCreateEvent from '../../../src/events/messageCreate';

describe('MessageCreateEvent', () => {
    const mockClient = {} as Client;

    const createMockMessage = (overrides: Partial<Message> = {}): Message => ({
        author: { bot: false, id: '111' },
        guild: { id: '222' },
        content: 'Hello world',
        client: mockClient,
        ...overrides,
    } as unknown as Message);

    beforeEach(() => {
        jest.clearAllMocks();
        mockHandleAutoModMessage.mockResolvedValue(null);
        mockHandleAfkMessage.mockResolvedValue(undefined);
    });

    describe('constructor', () => {
        it('should have correct event name', () => {
            expect(messageCreateEvent.name).toBe('messageCreate');
        });

        it('should not be a once event', () => {
            expect(messageCreateEvent.once).toBe(false);
        });
    });

    describe('execute()', () => {
        it('should ignore bot messages', async () => {
            const botMessage = createMockMessage({ author: { bot: true, id: '111' } } as any);

            await messageCreateEvent.execute(mockClient, botMessage);

            expect(mockHandleAutoModMessage).not.toHaveBeenCalled();
            expect(mockHandleAfkMessage).not.toHaveBeenCalled();
        });

        it('should ignore DM messages', async () => {
            const dmMessage = createMockMessage({ guild: null } as any);

            await messageCreateEvent.execute(mockClient, dmMessage);

            expect(mockHandleAutoModMessage).not.toHaveBeenCalled();
            expect(mockHandleAfkMessage).not.toHaveBeenCalled();
        });

        it('should run automod before AFK handling', async () => {
            const message = createMockMessage();
            const callOrder: string[] = [];

            mockHandleAutoModMessage.mockImplementation(async () => {
                callOrder.push('automod');
                return null;
            });
            mockHandleAfkMessage.mockImplementation(async () => {
                callOrder.push('afk');
            });

            await messageCreateEvent.execute(mockClient, message);

            expect(callOrder).toEqual(['automod', 'afk']);
        });

        it('should skip AFK handling if automod deleted the message', async () => {
            const message = createMockMessage();
            mockHandleAutoModMessage.mockResolvedValue(true); // boolean true = deleted

            await messageCreateEvent.execute(mockClient, message);

            expect(mockHandleAutoModMessage).toHaveBeenCalled();
            expect(mockHandleAfkMessage).not.toHaveBeenCalled();
        });

        it('should skip AFK handling if automod returns { deleted: true }', async () => {
            const message = createMockMessage();
            mockHandleAutoModMessage.mockResolvedValue({ deleted: true });

            await messageCreateEvent.execute(mockClient, message);

            expect(mockHandleAfkMessage).not.toHaveBeenCalled();
        });

        it('should continue to AFK if automod returns { deleted: false }', async () => {
            const message = createMockMessage();
            mockHandleAutoModMessage.mockResolvedValue({ deleted: false });

            await messageCreateEvent.execute(mockClient, message);

            expect(mockHandleAfkMessage).toHaveBeenCalled();
        });

        it('should continue to AFK if automod returns null', async () => {
            const message = createMockMessage();
            mockHandleAutoModMessage.mockResolvedValue(null);

            await messageCreateEvent.execute(mockClient, message);

            expect(mockHandleAfkMessage).toHaveBeenCalled();
        });

        it('should handle automod errors gracefully', async () => {
            const message = createMockMessage();
            mockHandleAutoModMessage.mockRejectedValue(new Error('AutoMod crash'));

            // Should NOT throw - error boundary in _handleAutoMod
            await messageCreateEvent.execute(mockClient, message);

            expect(logger.error).toHaveBeenCalledWith(
                'AutoMod',
                expect.stringContaining('AutoMod crash')
            );
            // AFK should still run after automod error
            expect(mockHandleAfkMessage).toHaveBeenCalled();
        });

        it('should handle AFK errors silently', async () => {
            const message = createMockMessage();
            mockHandleAfkMessage.mockRejectedValue(new Error('AFK crash'));

            // Should NOT throw - silent fail
            await messageCreateEvent.execute(mockClient, message);
        });
    });
});
