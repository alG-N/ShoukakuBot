/**
 * Delete Command Unit Tests
 * Tests for bulk delete command validation and execution
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
}));

// Mock metrics
jest.mock('../../../../src/core/metrics', () => ({
    __esModule: true,
    trackCommand: jest.fn(),
    commandsActive: { inc: jest.fn(), dec: jest.fn() },
    commandErrorsTotal: { inc: jest.fn() },
}));

// Mock owner config
jest.mock('../../../../src/config/owner', () => ({
    __esModule: true,
    isOwner: jest.fn().mockReturnValue(false),
}));

// Mock cooldown
jest.mock('../../../../src/utils/common/cooldown', () => ({
    __esModule: true,
    globalCooldownManager: {
        check: jest.fn().mockResolvedValue({ onCooldown: false }),
        set: jest.fn(),
    },
}));

// Mock constants
jest.mock('../../../../src/constants', () => ({
    __esModule: true,
    COLORS: {
        SUCCESS: 0x00ff00,
        WARNING: 0xffff00,
        ERROR: 0xff0000,
        PRIMARY: 0x5865F2,
    },
    TIMEOUTS: { DEFAULT_COOLDOWN: 3 },
    EMOJIS: {},
}));

// Mock errors
jest.mock('../../../../src/errors/index', () => ({
    __esModule: true,
    AppError: class AppError extends Error {},
    ValidationError: class ValidationError extends Error {},
    PermissionError: class PermissionError extends Error {},
}));

// Mock GuildSettingsService
const mockGetDeleteLimit = jest.fn().mockResolvedValue(100);
jest.mock('../../../../src/services/guild/index', () => ({
    __esModule: true,
    GuildSettingsService: {
        getDeleteLimit: mockGetDeleteLimit,
    },
}));

// Mock moderation service
const mockLogModAction = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../../src/services/moderation/index', () => ({
    __esModule: true,
    moderationService: {
        logModAction: mockLogModAction,
    },
}));

import deleteCommand from '../../../../src/commands/admin/delete';
import { Collection } from 'discord.js';

function createMockMessage(id: string, overrides: Record<string, unknown> = {}) {
    return {
        id,
        author: { id: 'user-1', tag: 'User#0001', bot: false },
        content: 'Hello world',
        createdTimestamp: Date.now(), // recent message
        pinned: false,
        ...overrides,
    };
}

function createMockInteraction(overrides: Record<string, unknown> = {}) {
    const messages = new Collection<string, any>();
    for (let i = 0; i < 10; i++) {
        const msg = createMockMessage(`msg-${i}`);
        messages.set(msg.id, msg);
    }

    const mockBulkDelete = jest.fn().mockResolvedValue(messages);

    return {
        user: {
            id: 'mod-1',
            tag: 'Moderator#0001',
            username: 'Moderator',
            displayAvatarURL: jest.fn().mockReturnValue('https://example.com/avatar.png'),
        },
        client: {
            user: { id: 'bot-1' },
        },
        guild: {
            id: 'guild-1',
            name: 'Test Server',
        },
        guildId: 'guild-1',
        member: {
            id: 'mod-1',
            permissions: { has: jest.fn().mockReturnValue(true) },
        },
        channel: {
            id: 'channel-1',
            type: 0,
            messages: {
                fetch: jest.fn().mockResolvedValue(messages),
            },
            bulkDelete: mockBulkDelete,
        },
        options: {
            getInteger: jest.fn().mockReturnValue(10),
            getUser: jest.fn().mockReturnValue(null),
            getString: jest.fn().mockReturnValue(null),
            getBoolean: jest.fn().mockReturnValue(false),
            getSubcommand: jest.fn(),
        },
        reply: jest.fn().mockResolvedValue({}),
        editReply: jest.fn().mockResolvedValue({}),
        followUp: jest.fn().mockResolvedValue({}),
        replied: false,
        deferred: true,
        ...overrides,
    } as any;
}

describe('DeleteCommand', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockGetDeleteLimit.mockResolvedValue(100);
    });

    describe('metadata', () => {
        it('should have correct command name', () => {
            expect(deleteCommand.data.name).toBe('delete');
        });

        it('should have ADMIN category', () => {
            expect(deleteCommand.category).toBe('admin');
        });

        it('should require ManageMessages permission', () => {
            expect(deleteCommand.userPermissions).toBeDefined();
            expect(deleteCommand.userPermissions.length).toBeGreaterThan(0);
        });

        it('should have amount, user, contains, bots, pinned options', () => {
            const json = deleteCommand.data.toJSON();
            const optionNames = json.options?.map((o: any) => o.name) || [];
            expect(optionNames).toContain('amount');
            expect(optionNames).toContain('user');
            expect(optionNames).toContain('contains');
            expect(optionNames).toContain('bots');
            expect(optionNames).toContain('pinned');
        });
    });

    describe('run()', () => {
        it('should reject when no guild', async () => {
            const interaction = createMockInteraction({ guild: null });

            await deleteCommand.run(interaction);

            const call = interaction.editReply.mock.calls[0]?.[0] || interaction.reply.mock.calls[0]?.[0];
            expect(call).toBeDefined();
        });

        it('should reject when amount exceeds server limit', async () => {
            const interaction = createMockInteraction();
            interaction.options.getInteger.mockReturnValue(50);
            mockGetDeleteLimit.mockResolvedValue(25);

            await deleteCommand.run(interaction);

            const call = interaction.editReply.mock.calls[0]?.[0] || interaction.reply.mock.calls[0]?.[0];
            const content = call?.content || call?.embeds?.[0]?.data?.description || '';
            expect(content).toContain('25');
        });

        it('should delete messages successfully', async () => {
            const interaction = createMockInteraction();

            await deleteCommand.run(interaction);

            expect(interaction.channel.bulkDelete).toHaveBeenCalled();
        });

        it('should show deleted count in response', async () => {
            const messages = new Collection<string, any>();
            for (let i = 0; i < 5; i++) {
                const msg = createMockMessage(`msg-${i}`);
                messages.set(msg.id, msg);
            }
            const interaction = createMockInteraction();
            interaction.channel.messages.fetch.mockResolvedValue(messages);
            interaction.channel.bulkDelete.mockResolvedValue(messages);

            await deleteCommand.run(interaction);

            const calls = [
                ...interaction.editReply.mock.calls,
                ...interaction.reply.mock.calls,
                ...interaction.followUp.mock.calls,
            ];
            const lastCall = calls[calls.length - 1]?.[0];
            const description = lastCall?.embeds?.[0]?.data?.description || '';
            expect(description).toContain('5');
        });

        it('should filter by user when specified', async () => {
            const targetUser = { id: 'user-2', tag: 'Target#0001' };
            const messages = new Collection<string, any>();
            messages.set('msg-1', createMockMessage('msg-1', { author: { id: 'user-1', bot: false } }));
            messages.set('msg-2', createMockMessage('msg-2', { author: { id: 'user-2', bot: false } }));
            messages.set('msg-3', createMockMessage('msg-3', { author: { id: 'user-2', bot: false } }));

            const interaction = createMockInteraction();
            interaction.options.getUser.mockReturnValue(targetUser);
            interaction.channel.messages.fetch.mockResolvedValue(messages);
            interaction.channel.bulkDelete.mockImplementation((msgs: any[]) => {
                const deleted = new Collection<string, any>();
                msgs.forEach((m: any) => deleted.set(m.id || m, m));
                return deleted;
            });

            await deleteCommand.run(interaction);

            // bulkDelete should have been called with only user-2's messages
            const deletedMsgs = interaction.channel.bulkDelete.mock.calls[0][0];
            const deletedArray = Array.isArray(deletedMsgs) ? deletedMsgs : [...deletedMsgs.values()];
            expect(deletedArray.every((m: any) => m.author?.id === 'user-2')).toBeTruthy();
        });

        it('should skip pinned messages unless includePinned is true', async () => {
            const messages = new Collection<string, any>();
            messages.set('msg-1', createMockMessage('msg-1', { pinned: true }));
            messages.set('msg-2', createMockMessage('msg-2', { pinned: false }));
            messages.set('msg-3', createMockMessage('msg-3', { pinned: false }));

            const interaction = createMockInteraction();
            interaction.channel.messages.fetch.mockResolvedValue(messages);
            interaction.channel.bulkDelete.mockImplementation((msgs: any[]) => {
                const deleted = new Collection<string, any>();
                msgs.forEach((m: any) => deleted.set(m.id || m, m));
                return deleted;
            });

            await deleteCommand.run(interaction);

            const deletedMsgs = interaction.channel.bulkDelete.mock.calls[0][0];
            const deletedArray = Array.isArray(deletedMsgs) ? deletedMsgs : [...deletedMsgs.values()];
            expect(deletedArray.every((m: any) => !m.pinned)).toBeTruthy();
        });

        it('should filter by bots only when specified', async () => {
            const messages = new Collection<string, any>();
            messages.set('msg-1', createMockMessage('msg-1', { author: { id: 'user-1', bot: false } }));
            messages.set('msg-2', createMockMessage('msg-2', { author: { id: 'bot-2', bot: true } }));

            const interaction = createMockInteraction();
            interaction.options.getBoolean.mockImplementation((key: string) => {
                if (key === 'bots') return true;
                return false;
            });
            interaction.channel.messages.fetch.mockResolvedValue(messages);
            interaction.channel.bulkDelete.mockImplementation((msgs: any[]) => {
                const deleted = new Collection<string, any>();
                msgs.forEach((m: any) => deleted.set(m.id || m, m));
                return deleted;
            });

            await deleteCommand.run(interaction);

            const deletedMsgs = interaction.channel.bulkDelete.mock.calls[0][0];
            const deletedArray = Array.isArray(deletedMsgs) ? deletedMsgs : [...deletedMsgs.values()];
            expect(deletedArray.every((m: any) => m.author?.bot)).toBeTruthy();
        });

        it('should reject messages older than 14 days', async () => {
            const oldTimestamp = Date.now() - (15 * 24 * 60 * 60 * 1000); // 15 days ago
            const messages = new Collection<string, any>();
            messages.set('msg-1', createMockMessage('msg-1', { createdTimestamp: oldTimestamp }));

            const interaction = createMockInteraction();
            interaction.channel.messages.fetch.mockResolvedValue(messages);

            await deleteCommand.run(interaction);

            // Should report no messages found
            const call = interaction.editReply.mock.calls[0]?.[0] || interaction.reply.mock.calls[0]?.[0];
            const content = call?.content || call?.embeds?.[0]?.data?.description || '';
            expect(content).toContain('No messages found');
        });

        it('should log action to moderation service', async () => {
            const interaction = createMockInteraction();

            await deleteCommand.run(interaction);

            expect(mockLogModAction).toHaveBeenCalled();
            const logCall = mockLogModAction.mock.calls[0];
            expect(logCall[1].type).toBe('DELETE');
        });

        it('should handle bulk delete errors gracefully', async () => {
            const interaction = createMockInteraction();
            interaction.channel.bulkDelete.mockRejectedValue(new Error('Missing Access'));

            await deleteCommand.run(interaction);

            const calls = [
                ...interaction.editReply.mock.calls,
                ...interaction.reply.mock.calls,
            ];
            const errorCall = calls.find((c: any) => {
                const arg = c[0];
                const text = arg?.content || arg?.embeds?.[0]?.data?.description || '';
                return text.includes('Failed') || text.includes('error');
            });
            expect(errorCall).toBeDefined();
        });

        it('should handle 14-day error code', async () => {
            const interaction = createMockInteraction();
            const error = new Error('Cannot delete messages older than 14 days');
            (error as any).code = 50034;
            interaction.channel.bulkDelete.mockRejectedValue(error);

            await deleteCommand.run(interaction);

            const calls = [
                ...interaction.editReply.mock.calls,
                ...interaction.reply.mock.calls,
            ];
            const errorCall = calls.find((c: any) => {
                const arg = c[0];
                const text = arg?.content || arg?.embeds?.[0]?.data?.description || '';
                return text.includes('14 days');
            });
            expect(errorCall).toBeDefined();
        });
    });
});
