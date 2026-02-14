/**
 * Warn Command Unit Tests
 * Tests for warn command utility functions, validation, and execution
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
        MODERATION: 0xff6b6b,
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

// Mock infraction service
const mockCreateWarning = jest.fn();
const mockLogMute = jest.fn();
const mockLogKick = jest.fn();
const mockLogBan = jest.fn();
jest.mock('../../../../src/services/moderation/index', () => ({
    __esModule: true,
    infractionService: {
        createWarning: mockCreateWarning,
        logMute: mockLogMute,
        logKick: mockLogKick,
        logBan: mockLogBan,
    },
    moderationService: {
        muteUser: jest.fn(),
        kickUser: jest.fn(),
        banUser: jest.fn(),
    },
}));

// Mock moderation config
jest.mock('../../../../src/config/features/moderation/index', () => ({
    __esModule: true,
    default: {
        COLORS: { WARN: 0xFFAA00 },
        EMOJIS: { WARN: '⚠️' },
        punishments: {
            warnings: { sendDM: true },
        },
    },
}));

// Mock database
const mockDbQuery = jest.fn().mockResolvedValue({ rows: [] });
jest.mock('../../../../src/database/index', () => ({
    __esModule: true,
    default: {
        query: mockDbQuery,
    },
}));

import warnCommand from '../../../../src/commands/admin/warn';

// Helper to create mock interaction
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
        options: {
            getSubcommand: jest.fn().mockReturnValue('user'),
            getMember: jest.fn().mockReturnValue({
                id: 'target-1',
                user: {
                    id: 'target-1',
                    tag: 'Target#0001',
                },
                roles: { highest: { position: 5 } },
                send: jest.fn().mockResolvedValue(undefined),
            }),
            getUser: jest.fn().mockReturnValue({
                id: 'target-1',
                tag: 'Target#0001',
            }),
            getString: jest.fn().mockReturnValue('Being rude'),
            getBoolean: jest.fn().mockReturnValue(false),
            getInteger: jest.fn(),
        },
        reply: jest.fn().mockResolvedValue({}),
        editReply: jest.fn().mockResolvedValue({}),
        deferReply: jest.fn().mockResolvedValue({}),
        replied: false,
        deferred: false,
        channel: { type: 0 },
        ...overrides,
    } as any;
}

describe('WarnCommand', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockCreateWarning.mockResolvedValue({
            infraction: { case_id: 1, type: 'warn', reason: 'Being rude' },
            warnCount: 1,
            escalation: null,
        });
    });

    describe('metadata', () => {
        it('should have correct command name', () => {
            expect(warnCommand.data.name).toBe('warn');
        });

        it('should have ADMIN category', () => {
            expect(warnCommand.category).toBe('admin');
        });

        it('should require ModerateMembers permission', () => {
            expect(warnCommand.userPermissions).toBeDefined();
            expect(warnCommand.userPermissions.length).toBeGreaterThan(0);
        });

        it('should have user and setting subcommands', () => {
            const json = warnCommand.data.toJSON();
            const subcommands = json.options?.filter((o: any) => o.type === 1) || [];
            const names = subcommands.map((s: any) => s.name);
            expect(names).toContain('user');
            expect(names).toContain('setting');
        });
    });

    describe('warn user subcommand', () => {
        it('should reject when no guild', async () => {
            const interaction = createMockInteraction({ guild: null });
            interaction.options.getSubcommand.mockReturnValue('user');

            await warnCommand.run(interaction);

            const replyCall = interaction.reply.mock.calls[0]?.[0] || interaction.editReply.mock.calls[0]?.[0];
            expect(replyCall).toBeDefined();
        });

        it('should reject when target not found', async () => {
            const interaction = createMockInteraction();
            interaction.options.getMember.mockReturnValue(null);

            await warnCommand.run(interaction);

            expect(interaction.reply).toHaveBeenCalled();
            const reply = interaction.reply.mock.calls[0][0];
            expect(reply.content || reply.embeds?.[0]?.data?.description).toContain('not found');
        });

        it('should reject self-warn', async () => {
            const interaction = createMockInteraction();
            interaction.options.getMember.mockReturnValue({
                id: 'mod-1', // same as interaction.user.id
                user: { id: 'mod-1', tag: 'Moderator#0001' },
                roles: { highest: { position: 5 } },
                send: jest.fn(),
            });

            await warnCommand.run(interaction);

            expect(interaction.reply).toHaveBeenCalled();
            const reply = interaction.reply.mock.calls[0][0];
            expect(reply.content).toContain('cannot warn yourself');
        });

        it('should reject warning bot', async () => {
            const interaction = createMockInteraction();
            interaction.options.getMember.mockReturnValue({
                id: 'bot-1', // same as client.user.id
                user: { id: 'bot-1', tag: 'Bot#0001' },
                roles: { highest: { position: 5 } },
                send: jest.fn(),
            });

            await warnCommand.run(interaction);

            expect(interaction.reply).toHaveBeenCalled();
            const reply = interaction.reply.mock.calls[0][0];
            expect(reply.content).toContain('cannot warn myself');
        });

        it('should reject warning user with higher/equal role', async () => {
            const interaction = createMockInteraction();
            interaction.options.getMember.mockReturnValue({
                id: 'target-1',
                user: { id: 'target-1', tag: 'Target#0001' },
                roles: { highest: { position: 10 } }, // higher than mod's 8
                send: jest.fn(),
            });

            await warnCommand.run(interaction);

            expect(interaction.reply).toHaveBeenCalled();
            const reply = interaction.reply.mock.calls[0][0];
            expect(reply.content).toContain('equal or higher role');
        });

        it('should succeed and create warning', async () => {
            const interaction = createMockInteraction();

            await warnCommand.run(interaction);

            expect(interaction.deferReply).toHaveBeenCalled();
            expect(mockCreateWarning).toHaveBeenCalled();
            expect(interaction.editReply).toHaveBeenCalled();
            const reply = interaction.editReply.mock.calls[0][0];
            expect(reply.embeds).toBeDefined();
            expect(reply.embeds[0].data.title).toContain('Warning Issued');
        });

        it('should show case ID in response', async () => {
            const interaction = createMockInteraction();
            mockCreateWarning.mockResolvedValue({
                infraction: { case_id: 42, type: 'warn', reason: 'Test' },
                warnCount: 3,
                escalation: null,
            });

            await warnCommand.run(interaction);

            const reply = interaction.editReply.mock.calls[0][0];
            const fields = reply.embeds[0].data.fields || [];
            const caseField = fields.find((f: any) => f.name === 'Case ID');
            expect(caseField?.value).toBe('#42');
        });

        it('should handle service unavailable', async () => {
            const interaction = createMockInteraction();
            mockCreateWarning.mockResolvedValue(null);

            await warnCommand.run(interaction);

            const reply = interaction.editReply.mock.calls[0][0];
            expect(reply.content).toContain('service unavailable');
        });

        it('should handle errors gracefully', async () => {
            const interaction = createMockInteraction();
            mockCreateWarning.mockRejectedValue(new Error('DB connection lost'));

            await warnCommand.run(interaction);

            const reply = interaction.editReply.mock.calls[0][0];
            expect(reply.content).toContain('Failed to warn user');
        });

        it('should handle mute escalation', async () => {
            const interaction = createMockInteraction();
            const { moderationService } = require('../../../../src/services/moderation/index');
            moderationService.muteUser.mockResolvedValue({ success: true });

            mockCreateWarning.mockResolvedValue({
                infraction: { case_id: 5, type: 'warn', reason: 'Strike 3' },
                warnCount: 3,
                escalation: { action: 'mute', reason: '3 warnings reached', durationMs: 3600000 },
            });

            await warnCommand.run(interaction);

            expect(moderationService.muteUser).toHaveBeenCalled();
            const reply = interaction.editReply.mock.calls[0][0];
            const fields = reply.embeds[0].data.fields || [];
            const escalationField = fields.find((f: any) => f.name === '⚠️ Automatic Action');
            expect(escalationField).toBeDefined();
            expect(escalationField.value).toContain('muted');
        });
    });

    describe('warn settings subcommand', () => {
        it('should defer reply as ephemeral', async () => {
            const interaction = createMockInteraction();
            interaction.options.getSubcommand.mockReturnValue('setting');
            interaction.editReply.mockResolvedValue({
                createMessageComponentCollector: jest.fn().mockReturnValue({
                    on: jest.fn().mockReturnThis(),
                }),
            });

            await warnCommand.run(interaction);

            expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
        });

        it('should build settings embed with default thresholds when none configured', async () => {
            const interaction = createMockInteraction();
            interaction.options.getSubcommand.mockReturnValue('setting');
            mockDbQuery.mockResolvedValue({ rows: [] });
            interaction.editReply.mockResolvedValue({
                createMessageComponentCollector: jest.fn().mockReturnValue({
                    on: jest.fn().mockReturnThis(),
                }),
            });

            await warnCommand.run(interaction);

            expect(interaction.editReply).toHaveBeenCalled();
            const reply = interaction.editReply.mock.calls[0][0];
            expect(reply.embeds[0].data.title).toContain('Warning Escalation Settings');
            expect(reply.embeds[0].data.description).toContain('defaults');
        });

        it('should show configured thresholds', async () => {
            const interaction = createMockInteraction();
            interaction.options.getSubcommand.mockReturnValue('setting');
            mockDbQuery.mockResolvedValue({
                rows: [
                    { guild_id: 'guild-1', warn_count: 3, action: 'mute', duration_ms: 3600000 },
                    { guild_id: 'guild-1', warn_count: 5, action: 'kick', duration_ms: null },
                ],
            });
            interaction.editReply.mockResolvedValue({
                createMessageComponentCollector: jest.fn().mockReturnValue({
                    on: jest.fn().mockReturnThis(),
                }),
            });

            await warnCommand.run(interaction);

            const reply = interaction.editReply.mock.calls[0][0];
            expect(reply.embeds[0].data.description).toContain('3 warns');
            expect(reply.embeds[0].data.description).toContain('mute');
        });
    });
});
