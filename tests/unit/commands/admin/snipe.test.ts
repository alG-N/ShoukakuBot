/**
 * Snipe Command Unit Tests
 * Tests for snipe command — recovering deleted messages
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
        INFO: 0x3498db,
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
const mockGetSnipeLimit = jest.fn().mockResolvedValue(10);
jest.mock('../../../../src/services/guild/index', () => ({
    __esModule: true,
    GuildSettingsService: {
        getSnipeLimit: mockGetSnipeLimit,
    },
}));

// Mock SnipeService
const mockGetDeletedMessages = jest.fn().mockResolvedValue([]);
jest.mock('../../../../src/services/moderation/index', () => ({
    __esModule: true,
    snipeService: {
        getDeletedMessages: mockGetDeletedMessages,
    },
}));

import snipeCommand from '../../../../src/commands/admin/snipe';

function createMockInteraction(overrides: Record<string, unknown> = {}) {
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
            ownerId: 'owner-1',
        },
        guildId: 'guild-1',
        member: {
            id: 'mod-1',
            permissions: { has: jest.fn().mockReturnValue(true) },
            roles: { highest: { position: 8 } },
        },
        channelId: 'channel-1',
        channel: { id: 'channel-1', type: 0 },
        options: {
            getInteger: jest.fn().mockReturnValue(null),
            getChannel: jest.fn().mockReturnValue(null),
            getUser: jest.fn().mockReturnValue(null),
            getString: jest.fn(),
            getBoolean: jest.fn(),
        },
        reply: jest.fn().mockResolvedValue({}),
        editReply: jest.fn().mockResolvedValue({}),
        deferReply: jest.fn().mockResolvedValue({}),
        replied: false,
        deferred: false,
        ...overrides,
    } as any;
}

function createTrackedMessage(overrides: Record<string, unknown> = {}) {
    return {
        id: 'msg-1',
        content: 'Hello world',
        author: {
            id: 'user-1',
            tag: 'User#0001',
            displayName: 'User',
            avatarURL: 'https://example.com/avatar.png',
        },
        channel: { id: 'channel-1' },
        createdAt: Date.now() - 60000,
        deletedAt: Date.now() - 1000,
        attachments: [],
        embeds: [],
        ...overrides,
    };
}

describe('SnipeCommand', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockGetSnipeLimit.mockResolvedValue(10);
        mockGetDeletedMessages.mockResolvedValue([]);
    });

    describe('metadata', () => {
        it('should have correct command name', () => {
            expect(snipeCommand.data.name).toBe('snipe');
        });

        it('should have ADMIN category', () => {
            expect(snipeCommand.category).toBe('admin');
        });

        it('should require ManageMessages permission', () => {
            expect(snipeCommand.userPermissions).toBeDefined();
            expect(snipeCommand.userPermissions.length).toBeGreaterThan(0);
        });

        it('should have count, channel, and user options', () => {
            const json = snipeCommand.data.toJSON();
            const optionNames = (json.options || []).map((o: any) => o.name);
            expect(optionNames).toContain('count');
            expect(optionNames).toContain('channel');
            expect(optionNames).toContain('user');
        });
    });

    describe('run', () => {
        it('should reject when no guild', async () => {
            const interaction = createMockInteraction({ guild: null });
            await snipeCommand.run(interaction);

            const replyCall = interaction.reply.mock.calls[0]?.[0] || interaction.editReply.mock.calls[0]?.[0];
            expect(replyCall).toBeDefined();
        });

        it('should show empty message when no deleted messages found', async () => {
            const interaction = createMockInteraction();
            mockGetDeletedMessages.mockResolvedValue([]);

            await snipeCommand.run(interaction);

            const replyCall = interaction.editReply.mock.calls[0]?.[0] || interaction.reply.mock.calls[0]?.[0];
            expect(replyCall).toBeDefined();
            if (replyCall?.embeds) {
                const embedData = replyCall.embeds[0]?.data || replyCall.embeds[0];
                const desc = embedData?.description || JSON.stringify(replyCall);
                expect(desc).toContain('No deleted messages');
            }
        });

        it('should display deleted messages as embeds', async () => {
            const interaction = createMockInteraction();
            const messages = [createTrackedMessage()];
            mockGetDeletedMessages.mockResolvedValue(messages);

            await snipeCommand.run(interaction);

            const replyCall = interaction.editReply.mock.calls[0]?.[0] || interaction.reply.mock.calls[0]?.[0];
            expect(replyCall).toBeDefined();
            expect(replyCall?.embeds?.length).toBeGreaterThan(0);
        });

        it('should respect count option', async () => {
            const interaction = createMockInteraction();
            interaction.options.getInteger.mockReturnValue(3);
            const messages = Array.from({ length: 5 }, (_, i) =>
                createTrackedMessage({ id: `msg-${i}`, content: `Message ${i}` })
            );
            mockGetDeletedMessages.mockResolvedValue(messages);

            await snipeCommand.run(interaction);

            const replyCall = interaction.editReply.mock.calls[0]?.[0] || interaction.reply.mock.calls[0]?.[0];
            // Should limit embeds to effectiveCount (3)
            expect(replyCall?.embeds?.length).toBeLessThanOrEqual(3);
        });

        it('should respect snipe limit from settings', async () => {
            const interaction = createMockInteraction();
            interaction.options.getInteger.mockReturnValue(8);
            mockGetSnipeLimit.mockResolvedValue(5);
            const messages = Array.from({ length: 10 }, (_, i) =>
                createTrackedMessage({ id: `msg-${i}` })
            );
            mockGetDeletedMessages.mockResolvedValue(messages);

            await snipeCommand.run(interaction);

            const replyCall = interaction.editReply.mock.calls[0]?.[0] || interaction.reply.mock.calls[0]?.[0];
            // effectiveCount = Math.min(8, 5) = 5
            expect(replyCall?.embeds?.length).toBeLessThanOrEqual(5);
        });

        it('should filter by user when user option is provided', async () => {
            const interaction = createMockInteraction();
            interaction.options.getUser.mockReturnValue({ id: 'user-1' });
            const messages = [
                createTrackedMessage({ author: { id: 'user-1', tag: 'A#001', displayName: 'A', avatarURL: null } }),
                createTrackedMessage({ author: { id: 'user-2', tag: 'B#002', displayName: 'B', avatarURL: null } }),
            ];
            mockGetDeletedMessages.mockResolvedValue(messages);

            await snipeCommand.run(interaction);

            const replyCall = interaction.editReply.mock.calls[0]?.[0] || interaction.reply.mock.calls[0]?.[0];
            expect(replyCall).toBeDefined();
        });

        it('should use target channel when channel option is provided', async () => {
            const interaction = createMockInteraction();
            const targetChannel = { id: 'other-channel', type: 0 };
            interaction.options.getChannel.mockReturnValue(targetChannel);
            mockGetDeletedMessages.mockResolvedValue([]);

            await snipeCommand.run(interaction);

            expect(mockGetDeletedMessages).toHaveBeenCalledWith('guild-1', 'other-channel');
        });

        it('should handle snipe service errors gracefully', async () => {
            const interaction = createMockInteraction();
            mockGetDeletedMessages.mockRejectedValue(new Error('Service down'));

            await snipeCommand.run(interaction);

            const replyCall = interaction.editReply.mock.calls[0]?.[0] || interaction.reply.mock.calls[0]?.[0];
            expect(replyCall).toBeDefined();
        });

        it('should handle messages with attachments', async () => {
            const interaction = createMockInteraction();
            const msg = createTrackedMessage({
                attachments: [
                    { name: 'image.png', url: 'https://example.com/image.png', type: 'image/png', proxyUrl: 'https://proxy.com/image.png' },
                ],
            });
            mockGetDeletedMessages.mockResolvedValue([msg]);

            await snipeCommand.run(interaction);

            const replyCall = interaction.editReply.mock.calls[0]?.[0] || interaction.reply.mock.calls[0]?.[0];
            expect(replyCall?.embeds?.length).toBeGreaterThan(0);
        });

        it('should handle messages with embeds info', async () => {
            const interaction = createMockInteraction();
            const msg = createTrackedMessage({
                embeds: [{ title: 'Test Embed', description: 'Some desc' }],
            });
            mockGetDeletedMessages.mockResolvedValue([msg]);

            await snipeCommand.run(interaction);

            const replyCall = interaction.editReply.mock.calls[0]?.[0] || interaction.reply.mock.calls[0]?.[0];
            expect(replyCall?.embeds?.length).toBeGreaterThan(0);
        });

        it('should default count to 1 when not specified', async () => {
            const interaction = createMockInteraction();
            interaction.options.getInteger.mockReturnValue(null);
            const messages = Array.from({ length: 5 }, (_, i) =>
                createTrackedMessage({ id: `msg-${i}` })
            );
            mockGetDeletedMessages.mockResolvedValue(messages);

            await snipeCommand.run(interaction);

            const replyCall = interaction.editReply.mock.calls[0]?.[0] || interaction.reply.mock.calls[0]?.[0];
            expect(replyCall?.embeds?.length).toBe(1);
        });
    });
});
