/**
 * Slowmode Command Unit Tests
 * Tests for slowmode command validation and execution
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

// Mock lockdown service
const mockSetSlowmode = jest.fn();
const mockSetServerSlowmode = jest.fn();
jest.mock('../../../../src/services/moderation/LockdownService', () => ({
    __esModule: true,
    default: {
        setSlowmode: mockSetSlowmode,
        setServerSlowmode: mockSetServerSlowmode,
    },
}));

// Mock moderation config
jest.mock('../../../../src/config/features/moderation/index', () => ({
    __esModule: true,
    default: {
        COLORS: { ERROR: 0xFF0000, SUCCESS: 0x00FF00, WARNING: 0xFFAA00 },
        EMOJIS: { ERROR: '❌', SUCCESS: '✅' },
    },
}));

import slowmodeCommand from '../../../../src/commands/admin/slowmode';

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
        },
        member: {
            id: 'mod-1',
            permissions: { has: jest.fn().mockReturnValue(true) },
        },
        channel: {
            id: 'channel-1',
            type: 0,
            toString: () => '<#channel-1>',
        },
        options: {
            getSubcommand: jest.fn().mockReturnValue('set'),
            getInteger: jest.fn().mockReturnValue(30),
            getChannel: jest.fn().mockReturnValue(null),
            getString: jest.fn().mockReturnValue(null),
        },
        reply: jest.fn().mockResolvedValue({}),
        editReply: jest.fn().mockResolvedValue({}),
        deferReply: jest.fn().mockResolvedValue({}),
        replied: false,
        deferred: false,
        ...overrides,
    } as any;
}

describe('SlowmodeCommand', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockSetSlowmode.mockResolvedValue({ success: true });
        mockSetServerSlowmode.mockResolvedValue({ success: ['ch1', 'ch2'], failed: [] });
    });

    describe('metadata', () => {
        it('should have correct command name', () => {
            expect(slowmodeCommand.data.name).toBe('slowmode');
        });

        it('should have ADMIN category', () => {
            expect(slowmodeCommand.category).toBe('admin');
        });

        it('should require ManageChannels permission', () => {
            expect(slowmodeCommand.userPermissions).toBeDefined();
            expect(slowmodeCommand.userPermissions.length).toBeGreaterThan(0);
        });

        it('should have set, off, and server subcommands', () => {
            const json = slowmodeCommand.data.toJSON();
            const subcommands = json.options?.filter((o: any) => o.type === 1) || [];
            const names = subcommands.map((s: any) => s.name);
            expect(names).toContain('set');
            expect(names).toContain('off');
            expect(names).toContain('server');
        });
    });

    describe('set subcommand', () => {
        it('should set slowmode on current channel', async () => {
            const interaction = createMockInteraction();
            interaction.options.getSubcommand.mockReturnValue('set');
            interaction.options.getInteger.mockReturnValue(30);

            await slowmodeCommand.run(interaction);

            expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
            expect(mockSetSlowmode).toHaveBeenCalled();
        });

        it('should set slowmode on specified channel', async () => {
            const targetChannel = {
                id: 'other-channel',
                type: 0,
                toString: () => '<#other-channel>',
            };
            const interaction = createMockInteraction();
            interaction.options.getSubcommand.mockReturnValue('set');
            interaction.options.getChannel.mockReturnValue(targetChannel);
            interaction.options.getInteger.mockReturnValue(60);

            await slowmodeCommand.run(interaction);

            expect(mockSetSlowmode).toHaveBeenCalledWith(
                targetChannel,
                60,
                expect.any(String),
            );
        });

        it('should handle service error', async () => {
            const interaction = createMockInteraction();
            interaction.options.getSubcommand.mockReturnValue('set');
            mockSetSlowmode.mockResolvedValue({ success: false, error: 'Missing permissions' });

            await slowmodeCommand.run(interaction);

            const reply = interaction.editReply.mock.calls[0][0];
            expect(reply.embeds[0].data.description).toContain('Missing permissions');
        });

        it('should show disable message when duration is 0', async () => {
            const interaction = createMockInteraction();
            interaction.options.getSubcommand.mockReturnValue('set');
            interaction.options.getInteger.mockReturnValue(0);

            await slowmodeCommand.run(interaction);

            const reply = interaction.editReply.mock.calls[0][0];
            expect(reply.embeds[0].data.description).toContain('disabled');
        });
    });

    describe('off subcommand', () => {
        it('should disable slowmode', async () => {
            const interaction = createMockInteraction();
            interaction.options.getSubcommand.mockReturnValue('off');

            await slowmodeCommand.run(interaction);

            expect(mockSetSlowmode).toHaveBeenCalledWith(
                expect.anything(),
                0,
                expect.any(String),
            );
        });

        it('should show success message', async () => {
            const interaction = createMockInteraction();
            interaction.options.getSubcommand.mockReturnValue('off');

            await slowmodeCommand.run(interaction);

            const reply = interaction.editReply.mock.calls[0][0];
            expect(reply.embeds[0].data.description).toContain('disabled');
        });
    });

    describe('server subcommand', () => {
        it('should reject when no guild', async () => {
            const interaction = createMockInteraction({ guild: null });
            interaction.options.getSubcommand.mockReturnValue('server');

            await slowmodeCommand.run(interaction);

            const call = interaction.editReply.mock.calls[0]?.[0] || interaction.reply.mock.calls[0]?.[0];
            expect(call).toBeDefined();
        });

        it('should set server-wide slowmode', async () => {
            const interaction = createMockInteraction();
            interaction.options.getSubcommand.mockReturnValue('server');
            interaction.options.getInteger.mockReturnValue(120);

            await slowmodeCommand.run(interaction);

            expect(mockSetServerSlowmode).toHaveBeenCalled();
        });

        it('should show channels updated count', async () => {
            const interaction = createMockInteraction();
            interaction.options.getSubcommand.mockReturnValue('server');
            interaction.options.getInteger.mockReturnValue(60);
            mockSetServerSlowmode.mockResolvedValue({
                success: ['ch1', 'ch2', 'ch3'],
                failed: ['ch4'],
            });

            await slowmodeCommand.run(interaction);

            const reply = interaction.editReply.mock.calls[0][0];
            const fields = reply.embeds[0].data.fields || [];
            const updatedField = fields.find((f: any) => f.name === 'Channels Updated');
            const failedField = fields.find((f: any) => f.name === 'Failed');
            expect(updatedField?.value).toBe('3');
            expect(failedField?.value).toBe('1');
        });
    });
});
