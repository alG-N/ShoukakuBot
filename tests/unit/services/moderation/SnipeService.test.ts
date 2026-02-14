/**
 * SnipeService Unit Tests
 * Tests for deleted message tracking and retrieval
 */

// Mock Logger
jest.mock('../../../../src/core/Logger', () => ({
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

// Mock CacheService
const mockPeek = jest.fn();
const mockSet = jest.fn().mockResolvedValue(undefined);
const mockCacheDelete = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../../src/cache/CacheService', () => ({
    __esModule: true,
    default: {
        peek: mockPeek,
        set: mockSet,
        delete: mockCacheDelete,
    },
}));

// Mock GuildSettingsService
jest.mock('../../../../src/services/guild/GuildSettingsService', () => ({
    __esModule: true,
    default: {
        getSnipeLimit: jest.fn().mockResolvedValue(25),
    },
}));

import {
    getDeletedMessages,
    getMessage,
    clearMessages,
} from '../../../../src/services/moderation/SnipeService';

// Sample tracked messages for testing
const sampleMessages = [
    {
        id: 'msg-1',
        content: 'First deleted message',
        author: { id: '111', tag: 'User1#0001', displayName: 'User1', avatarURL: null },
        channel: { id: 'chan-1', name: 'general' },
        attachments: [],
        embeds: [],
        createdAt: Date.now() - 5000,
        deletedAt: Date.now() - 1000,
    },
    {
        id: 'msg-2',
        content: 'Second deleted message',
        author: { id: '222', tag: 'User2#0002', displayName: 'User2', avatarURL: null },
        channel: { id: 'chan-2', name: 'off-topic' },
        attachments: [],
        embeds: [],
        createdAt: Date.now() - 10000,
        deletedAt: Date.now() - 2000,
    },
    {
        id: 'msg-3',
        content: 'Third message in general',
        author: { id: '333', tag: 'User3#0003', displayName: 'User3', avatarURL: null },
        channel: { id: 'chan-1', name: 'general' },
        attachments: [],
        embeds: [],
        createdAt: Date.now() - 15000,
        deletedAt: Date.now() - 3000,
    },
];

describe('SnipeService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // ========== getDeletedMessages() ==========
    describe('getDeletedMessages()', () => {
        it('should return all messages for a guild', async () => {
            mockPeek.mockResolvedValue(sampleMessages);

            const messages = await getDeletedMessages('guild-1');

            expect(messages).toHaveLength(3);
            expect(mockPeek).toHaveBeenCalledWith('snipe', 'messages:guild-1');
        });

        it('should return empty array when no messages exist', async () => {
            mockPeek.mockResolvedValue(null);

            const messages = await getDeletedMessages('guild-1');

            expect(messages).toEqual([]);
        });

        it('should filter by channel when channelId is provided', async () => {
            mockPeek.mockResolvedValue(sampleMessages);

            const messages = await getDeletedMessages('guild-1', 'chan-1');

            expect(messages).toHaveLength(2);
            expect(messages.every((m: any) => m.channel.id === 'chan-1')).toBe(true);
        });

        it('should return empty array when channel has no messages', async () => {
            mockPeek.mockResolvedValue(sampleMessages);

            const messages = await getDeletedMessages('guild-1', 'chan-999');

            expect(messages).toHaveLength(0);
        });
    });

    // ========== getMessage() ==========
    describe('getMessage()', () => {
        it('should return message at default index 0', async () => {
            mockPeek.mockResolvedValue(sampleMessages);

            const message = await getMessage('guild-1');

            expect(message).not.toBeNull();
            expect(message!.id).toBe('msg-1');
        });

        it('should return message at specific index', async () => {
            mockPeek.mockResolvedValue(sampleMessages);

            const message = await getMessage('guild-1', 1);

            expect(message).not.toBeNull();
            expect(message!.id).toBe('msg-2');
        });

        it('should return null for out-of-bounds index', async () => {
            mockPeek.mockResolvedValue(sampleMessages);

            const message = await getMessage('guild-1', 99);

            expect(message).toBeNull();
        });

        it('should filter by channel and return indexed result', async () => {
            mockPeek.mockResolvedValue(sampleMessages);

            const message = await getMessage('guild-1', 1, 'chan-1');

            // chan-1 has msg-1 (index 0) and msg-3 (index 1)
            expect(message).not.toBeNull();
            expect(message!.id).toBe('msg-3');
        });

        it('should return null when no messages exist', async () => {
            mockPeek.mockResolvedValue(null);

            const message = await getMessage('guild-1');

            expect(message).toBeNull();
        });
    });

    // ========== clearMessages() ==========
    describe('clearMessages()', () => {
        it('should clear all messages for a guild', async () => {
            mockPeek.mockResolvedValue(sampleMessages);

            const count = await clearMessages('guild-1');

            expect(count).toBe(3);
            expect(mockCacheDelete).toHaveBeenCalledWith('snipe', 'messages:guild-1');
        });

        it('should return 0 when no messages exist', async () => {
            mockPeek.mockResolvedValue(null);

            const count = await clearMessages('guild-1');

            expect(count).toBe(0);
        });

        it('should clear messages for a specific channel only', async () => {
            mockPeek.mockResolvedValue([...sampleMessages]);

            const count = await clearMessages('guild-1', 'chan-1');

            // chan-1 has 2 messages, chan-2 has 1
            expect(count).toBe(2);
            // Should save remaining messages
            expect(mockSet).toHaveBeenCalledWith(
                'snipe',
                'messages:guild-1',
                expect.arrayContaining([
                    expect.objectContaining({ channel: { id: 'chan-2', name: 'off-topic' } }),
                ]),
                expect.any(Number)
            );
        });

        it('should delete cache key when channel clear removes all messages', async () => {
            // Only messages from one channel
            const singleChannelMessages = sampleMessages.filter(m => m.channel.id === 'chan-2');
            mockPeek.mockResolvedValue([...singleChannelMessages]);

            await clearMessages('guild-1', 'chan-2');

            // All messages removed — should delete, not set
            expect(mockCacheDelete).toHaveBeenCalledWith('snipe', 'messages:guild-1');
        });
    });
});
