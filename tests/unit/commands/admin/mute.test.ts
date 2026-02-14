/**
 * Mute Command Unit Tests
 * Tests for mute/unmute subcommands, parseDuration, formatDuration, and validation
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

// Mock moderation service
const mockLogModAction = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../../src/services/moderation/index', () => ({
    __esModule: true,
    moderationService: {
        logModAction: mockLogModAction,
    },
}));

import muteCommand, { parseDuration, formatDuration } from '../../../../src/commands/admin/mute';

function createMockInteraction(overrides: Record<string, unknown> = {}) {
    const mockTimeout = jest.fn().mockResolvedValue(undefined);
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
            members: {
                fetch: jest.fn().mockResolvedValue({
                    id: 'target-1',
                    roles: { highest: { position: 5 } },
                    communicationDisabledUntil: null,
                    timeout: mockTimeout,
                    displayAvatarURL: jest.fn().mockReturnValue('https://example.com/target.png'),
                }),
                me: {
                    roles: { highest: { position: 10 } },
                },
            },
        },
        member: {
            id: 'mod-1',
            permissions: { has: jest.fn().mockReturnValue(true) },
            roles: { highest: { position: 8 } },
        },
        options: {
            getUser: jest.fn().mockReturnValue({
                id: 'target-1',
                tag: 'TargetUser#0001',
                displayAvatarURL: jest.fn().mockReturnValue('https://example.com/target.png'),
                send: jest.fn().mockResolvedValue(undefined),
            }),
            getString: jest.fn().mockImplementation((name: string) => {
                if (name === 'duration') return '1h';
                if (name === 'reason') return 'Being disruptive';
                return null;
            }),
            getInteger: jest.fn(),
            getSubcommand: jest.fn().mockReturnValue('add'),
        },
        reply: jest.fn().mockResolvedValue({}),
        editReply: jest.fn().mockResolvedValue({}),
        replied: false,
        deferred: true,
        channel: { type: 0 },
        _mockTimeout: mockTimeout,
        ...overrides,
    } as any;
}

describe('MuteCommand', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('parseDuration', () => {
        it('should parse seconds', () => {
            expect(parseDuration('60s')).toBe(60000);
        });

        it('should parse minutes', () => {
            expect(parseDuration('5m')).toBe(300000);
        });

        it('should parse hours', () => {
            expect(parseDuration('1h')).toBe(3600000);
        });

        it('should parse days', () => {
            expect(parseDuration('1d')).toBe(86400000);
        });

        it('should parse weeks', () => {
            expect(parseDuration('1w')).toBe(604800000);
        });

        it('should return null for invalid format', () => {
            expect(parseDuration('invalid')).toBeNull();
            expect(parseDuration('10x')).toBeNull();
            expect(parseDuration('')).toBeNull();
            expect(parseDuration('abc')).toBeNull();
        });

        it('should handle large values', () => {
            expect(parseDuration('28d')).toBe(28 * 86400000);
        });
    });

    describe('formatDuration', () => {
        it('should format days', () => {
            expect(formatDuration(86400000)).toBe('1 day');
            expect(formatDuration(172800000)).toBe('2 days');
        });

        it('should format hours', () => {
            expect(formatDuration(3600000)).toBe('1 hour');
            expect(formatDuration(7200000)).toBe('2 hours');
        });

        it('should format minutes', () => {
            expect(formatDuration(60000)).toBe('1 minute');
            expect(formatDuration(300000)).toBe('5 minutes');
        });

        it('should format seconds', () => {
            expect(formatDuration(1000)).toBe('1 second');
            expect(formatDuration(30000)).toBe('30 seconds');
        });

        it('should use the largest unit', () => {
            // 1 day + 2 hours → should show "1 day" (integer division)
            expect(formatDuration(86400000 + 7200000)).toBe('1 day');
        });
    });

    describe('metadata', () => {
        it('should have correct command name', () => {
            expect(muteCommand.data.name).toBe('mute');
        });

        it('should have correct category', () => {
            expect(muteCommand.category).toBe('admin');
        });

        it('should require ModerateMembers permission', () => {
            expect(muteCommand.userPermissions).toBeDefined();
            expect(muteCommand.userPermissions.length).toBeGreaterThan(0);
        });

        it('should have 2 subcommands (add, remove)', () => {
            const json = muteCommand.data.toJSON() as any;
            expect(json.options).toHaveLength(2);
            const names = json.options.map((o: any) => o.name);
            expect(names).toContain('add');
            expect(names).toContain('remove');
        });
    });

    describe('mute add', () => {
        it('should reject when no guild', async () => {
            const interaction = createMockInteraction({ guild: null });
            interaction.options.getSubcommand.mockReturnValue('add');

            await muteCommand.run(interaction);

            expect(interaction.editReply).toHaveBeenCalled();
        });

        it('should reject self-mute', async () => {
            const interaction = createMockInteraction();
            interaction.options.getSubcommand.mockReturnValue('add');
            interaction.options.getUser.mockReturnValue({
                id: 'mod-1',
                tag: 'Moderator#0001',
                displayAvatarURL: jest.fn(),
                send: jest.fn(),
            });

            await muteCommand.run(interaction);

            expect(interaction.editReply).toHaveBeenCalled();
        });

        it('should reject muting bot itself', async () => {
            const interaction = createMockInteraction();
            interaction.options.getSubcommand.mockReturnValue('add');
            interaction.options.getUser.mockReturnValue({
                id: 'bot-1',
                tag: 'Bot#0001',
                displayAvatarURL: jest.fn(),
                send: jest.fn(),
            });

            await muteCommand.run(interaction);

            expect(interaction.editReply).toHaveBeenCalled();
        });

        it('should reject muting server owner', async () => {
            const interaction = createMockInteraction();
            interaction.options.getSubcommand.mockReturnValue('add');
            interaction.options.getUser.mockReturnValue({
                id: 'owner-1',
                tag: 'Owner#0001',
                displayAvatarURL: jest.fn(),
                send: jest.fn(),
            });

            await muteCommand.run(interaction);

            expect(interaction.editReply).toHaveBeenCalled();
        });

        it('should reject invalid duration', async () => {
            const interaction = createMockInteraction();
            interaction.options.getSubcommand.mockReturnValue('add');
            interaction.options.getString.mockImplementation((name: string) => {
                if (name === 'duration') return 'invalid';
                return null;
            });

            await muteCommand.run(interaction);

            expect(interaction.editReply).toHaveBeenCalled();
        });

        it('should reject duration exceeding 28 days', async () => {
            const interaction = createMockInteraction();
            interaction.options.getSubcommand.mockReturnValue('add');
            interaction.options.getString.mockImplementation((name: string, required?: boolean) => {
                if (name === 'duration') return '29d';
                if (name === 'reason') return 'test';
                return null;
            });

            await muteCommand.run(interaction);

            expect(interaction.editReply).toHaveBeenCalled();
        });

        it('should reject when target has higher role', async () => {
            const interaction = createMockInteraction();
            interaction.options.getSubcommand.mockReturnValue('add');
            interaction.guild.members.fetch.mockResolvedValue({
                id: 'target-1',
                roles: { highest: { position: 15 } },
                communicationDisabledUntil: null,
                timeout: jest.fn(),
            });

            await muteCommand.run(interaction);

            expect(interaction.editReply).toHaveBeenCalled();
        });

        it('should reject already timed out user', async () => {
            const interaction = createMockInteraction();
            interaction.options.getSubcommand.mockReturnValue('add');
            const futureDate = new Date(Date.now() + 3600000);
            interaction.guild.members.fetch.mockResolvedValue({
                id: 'target-1',
                roles: { highest: { position: 3 } },
                communicationDisabledUntil: futureDate,
                timeout: jest.fn(),
            });

            await muteCommand.run(interaction);

            expect(interaction.editReply).toHaveBeenCalled();
        });

        it('should mute successfully and log action', async () => {
            const mockTimeout = jest.fn().mockResolvedValue(undefined);
            const interaction = createMockInteraction();
            interaction.options.getSubcommand.mockReturnValue('add');
            interaction.guild.members.fetch.mockResolvedValue({
                id: 'target-1',
                roles: { highest: { position: 3 } },
                communicationDisabledUntil: null,
                timeout: mockTimeout,
            });

            await muteCommand.run(interaction);

            expect(mockTimeout).toHaveBeenCalledWith(
                3600000, // 1h
                expect.any(String)
            );
            expect(mockLogModAction).toHaveBeenCalledWith(
                interaction.guild,
                expect.objectContaining({ type: 'MUTE' })
            );
        });

        it('should DM user before muting', async () => {
            const mockSend = jest.fn().mockResolvedValue(undefined);
            const interaction = createMockInteraction();
            interaction.options.getSubcommand.mockReturnValue('add');
            interaction.options.getUser.mockReturnValue({
                id: 'target-1',
                tag: 'TargetUser#0001',
                displayAvatarURL: jest.fn(),
                send: mockSend,
            });
            interaction.guild.members.fetch.mockResolvedValue({
                id: 'target-1',
                roles: { highest: { position: 3 } },
                communicationDisabledUntil: null,
                timeout: jest.fn().mockResolvedValue(undefined),
            });

            await muteCommand.run(interaction);

            expect(mockSend).toHaveBeenCalled();
        });
    });

    describe('mute remove (unmute)', () => {
        it('should reject when no guild', async () => {
            const interaction = createMockInteraction({ guild: null });
            interaction.options.getSubcommand.mockReturnValue('remove');

            await muteCommand.run(interaction);

            expect(interaction.editReply).toHaveBeenCalled();
        });

        it('should reject when user not found', async () => {
            const interaction = createMockInteraction();
            interaction.options.getSubcommand.mockReturnValue('remove');
            interaction.guild.members.fetch.mockResolvedValue(null);

            await muteCommand.run(interaction);

            expect(interaction.editReply).toHaveBeenCalled();
        });

        it('should reject when user is not timed out', async () => {
            const interaction = createMockInteraction();
            interaction.options.getSubcommand.mockReturnValue('remove');
            interaction.guild.members.fetch.mockResolvedValue({
                id: 'target-1',
                communicationDisabledUntil: null,
                timeout: jest.fn(),
            });

            await muteCommand.run(interaction);

            expect(interaction.editReply).toHaveBeenCalled();
        });

        it('should unmute successfully and log action', async () => {
            const mockTimeout = jest.fn().mockResolvedValue(undefined);
            const futureDate = new Date(Date.now() + 3600000);
            const interaction = createMockInteraction();
            interaction.options.getSubcommand.mockReturnValue('remove');
            interaction.guild.members.fetch.mockResolvedValue({
                id: 'target-1',
                communicationDisabledUntil: futureDate,
                timeout: mockTimeout,
                displayAvatarURL: jest.fn(),
            });
            interaction.options.getUser.mockReturnValue({
                id: 'target-1',
                tag: 'TargetUser#0001',
                displayAvatarURL: jest.fn().mockReturnValue('https://example.com/target.png'),
                send: jest.fn().mockResolvedValue(undefined),
            });

            await muteCommand.run(interaction);

            expect(mockTimeout).toHaveBeenCalledWith(null, expect.any(String));
            expect(mockLogModAction).toHaveBeenCalledWith(
                interaction.guild,
                expect.objectContaining({ type: 'UNMUTE' })
            );
        });
    });
});
