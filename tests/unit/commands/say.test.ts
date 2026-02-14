/**
 * Say Command Unit Tests
 * Tests for send-message-as-bot functionality
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
}));

// Mock metrics
jest.mock('../../../src/core/metrics', () => ({
    __esModule: true,
    trackCommand: jest.fn(),
    commandsActive: { inc: jest.fn(), dec: jest.fn() },
    commandErrorsTotal: { inc: jest.fn() },
}));

// Mock owner config
jest.mock('../../../src/config/owner', () => ({
    __esModule: true,
    isOwner: jest.fn().mockReturnValue(false),
}));

// Mock cooldown
jest.mock('../../../src/utils/common/cooldown', () => ({
    __esModule: true,
    globalCooldownManager: {
        check: jest.fn().mockResolvedValue({ onCooldown: false }),
        set: jest.fn(),
    },
}));

// Mock constants
jest.mock('../../../src/constants', () => ({
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
jest.mock('../../../src/errors/index', () => ({
    __esModule: true,
    AppError: class AppError extends Error {},
    ValidationError: class ValidationError extends Error {},
    PermissionError: class PermissionError extends Error {},
}));

// Mock access check
const mockCheckAccess = jest.fn().mockResolvedValue({ blocked: false });
jest.mock('../../../src/services/index', () => ({
    __esModule: true,
    checkAccess: mockCheckAccess,
    AccessType: { SUB: 'sub' },
}));

// Mock say service
const mockValidateChannel = jest.fn().mockReturnValue(true);
const mockSanitizeMessage = jest.fn().mockImplementation((msg: string) => msg.replace(/@(everyone|here)/gi, '@\u200b$1'));
jest.mock('../../../src/services/fun/say/SayService', () => ({
    __esModule: true,
    default: {
        validateChannel: mockValidateChannel,
        sanitizeMessage: mockSanitizeMessage,
    },
}));

import sayCommand from '../../../src/commands/fun/say';

function createMockInteraction(overrides: Record<string, unknown> = {}) {
    const mockChannel = {
        id: 'channel-1',
        type: 0,
        send: jest.fn().mockResolvedValue({}),
        permissionsFor: jest.fn().mockReturnValue({
            has: jest.fn().mockReturnValue(true),
        }),
    };

    return {
        user: {
            id: 'user-1',
            tag: 'User#0001',
            username: 'User',
            displayName: 'User',
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
            id: 'user-1',
            permissions: { has: jest.fn().mockReturnValue(true) },
            roles: { highest: { position: 1 } },
        },
        channelId: 'channel-1',
        channel: mockChannel,
        options: {
            getString: jest.fn().mockImplementation((name: string) => {
                if (name === 'message') return 'Hello world';
                if (name === 'type') return 'normal';
                return null;
            }),
            getChannel: jest.fn().mockReturnValue(null),
            getBoolean: jest.fn().mockReturnValue(false),
            getInteger: jest.fn(),
        },
        reply: jest.fn().mockResolvedValue({}),
        editReply: jest.fn().mockResolvedValue({}),
        deferReply: jest.fn().mockResolvedValue({}),
        followUp: jest.fn().mockResolvedValue({}),
        replied: false,
        deferred: false,
        ...overrides,
    } as any;
}

describe('SayCommand', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockCheckAccess.mockResolvedValue({ blocked: false });
        mockValidateChannel.mockReturnValue(true);
    });

    describe('metadata', () => {
        it('should have correct command name', () => {
            expect(sayCommand.data.name).toBe('say');
        });

        it('should have FUN category', () => {
            expect(sayCommand.category).toBe('fun');
        });

        it('should have 5 second cooldown', () => {
            expect(sayCommand.cooldown).toBe(5);
        });

        it('should have message, channel, embed, credit, and type options', () => {
            const json = sayCommand.data.toJSON();
            const optionNames = (json.options || []).map((o: any) => o.name);
            expect(optionNames).toContain('message');
            expect(optionNames).toContain('channel');
            expect(optionNames).toContain('embed');
            expect(optionNames).toContain('credit');
            expect(optionNames).toContain('type');
        });
    });

    describe('run', () => {
        it('should block without access', async () => {
            mockCheckAccess.mockResolvedValue({
                blocked: true,
                embed: { data: { description: 'No access' } },
            });
            const interaction = createMockInteraction();

            await sayCommand.run(interaction);

            expect(interaction.reply).toHaveBeenCalledWith(
                expect.objectContaining({ ephemeral: true })
            );
            expect(interaction.channel.send).not.toHaveBeenCalled();
        });

        it('should send plain text message', async () => {
            const interaction = createMockInteraction();
            interaction.options.getBoolean.mockReturnValue(false);

            await sayCommand.run(interaction);

            expect(interaction.channel.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('Hello world'),
                })
            );
        });

        it('should send embed message when embed option is true', async () => {
            const interaction = createMockInteraction();
            interaction.options.getBoolean.mockImplementation((name: string) => {
                if (name === 'embed') return true;
                return false;
            });

            await sayCommand.run(interaction);

            expect(interaction.channel.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.any(Array),
                })
            );
        });

        it('should reject invalid channel', async () => {
            mockValidateChannel.mockReturnValue(false);
            const interaction = createMockInteraction();

            await sayCommand.run(interaction);

            expect(interaction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('not a text-based channel'),
                    ephemeral: true,
                })
            );
        });

        it('should reject when bot lacks send permissions', async () => {
            const interaction = createMockInteraction();
            interaction.channel.permissionsFor.mockReturnValue({
                has: jest.fn().mockReturnValue(false),
            });

            await sayCommand.run(interaction);

            expect(interaction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining("don't have permission"),
                    ephemeral: true,
                })
            );
        });

        it('should sanitize @everyone/@here', async () => {
            const interaction = createMockInteraction();
            interaction.options.getString.mockImplementation((name: string) => {
                if (name === 'message') return '@everyone hello';
                if (name === 'type') return 'normal';
                return null;
            });

            await sayCommand.run(interaction);

            expect(mockSanitizeMessage).toHaveBeenCalledWith('@everyone hello');
        });

        it('should send to specified channel', async () => {
            const targetChannel = {
                id: 'other-channel',
                type: 0,
                send: jest.fn().mockResolvedValue({}),
                permissionsFor: jest.fn().mockReturnValue({
                    has: jest.fn().mockReturnValue(true),
                }),
                toString: () => '<#other-channel>',
            };
            const interaction = createMockInteraction();
            interaction.options.getChannel.mockReturnValue(targetChannel);

            await sayCommand.run(interaction);

            expect(targetChannel.send).toHaveBeenCalled();
        });

        it('should confirm message sent', async () => {
            const interaction = createMockInteraction();

            await sayCommand.run(interaction);

            expect(interaction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('Message sent'),
                    ephemeral: true,
                })
            );
        });

        it('should handle send errors', async () => {
            const interaction = createMockInteraction();
            interaction.channel.send.mockRejectedValue(new Error('Cannot send'));

            await sayCommand.run(interaction);

            const called = interaction.reply.mock.calls[0]?.[0] || interaction.followUp.mock.calls[0]?.[0];
            expect(called).toBeDefined();
        });
    });
});
