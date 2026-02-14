/**
 * Raid Command Unit Tests
 * Tests for anti-raid mode controls
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

// Mock AntiRaidService
const mockIsRaidModeActive = jest.fn().mockResolvedValue(false);
const mockActivateRaidMode = jest.fn().mockResolvedValue(undefined);
const mockDeactivateRaidMode = jest.fn().mockResolvedValue({ duration: 300000, flaggedAccounts: 5 });
const mockGetRaidModeState = jest.fn().mockResolvedValue(null);
const mockGetFlaggedAccounts = jest.fn().mockResolvedValue([]);
const mockUpdateStats = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../../src/services/moderation/AntiRaidService', () => ({
    __esModule: true,
    default: {
        isRaidModeActive: mockIsRaidModeActive,
        activateRaidMode: mockActivateRaidMode,
        deactivateRaidMode: mockDeactivateRaidMode,
        getRaidModeState: mockGetRaidModeState,
        getFlaggedAccounts: mockGetFlaggedAccounts,
        updateStats: mockUpdateStats,
    },
}));

// Mock LockdownService
const mockLockServer = jest.fn().mockResolvedValue({ success: ['ch1'], skipped: [], failed: [] });
const mockUnlockServer = jest.fn().mockResolvedValue({ success: ['ch1'], skipped: [], failed: [] });
const mockGetLockStatus = jest.fn().mockResolvedValue({ lockedCount: 0 });
jest.mock('../../../../src/services/moderation/LockdownService', () => ({
    __esModule: true,
    default: {
        lockServer: mockLockServer,
        unlockServer: mockUnlockServer,
        getLockStatus: mockGetLockStatus,
    },
}));

// Mock moderation config
jest.mock('../../../../src/config/features/moderation/index', () => ({
    __esModule: true,
    default: {
        COLORS: { RAID: 0xFF0000, SUCCESS: 0x00FF00, WARNING: 0xFFAA00, INFO: 0x5865F2, ERROR: 0xFF0000 },
        EMOJIS: { WARNING: '⚠️', INFO: 'ℹ️', ERROR: '❌' },
    },
}));

// Mock database
jest.mock('../../../../src/database/index', () => ({
    __esModule: true,
    default: { query: jest.fn().mockResolvedValue({ rows: [] }) },
}));

import raidCommand from '../../../../src/commands/admin/raid';

function createMockInteraction(subcommand: string, overrides: Record<string, unknown> = {}) {
    return {
        user: {
            id: 'admin-1',
            tag: 'Admin#0001',
            username: 'Admin',
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
                fetch: jest.fn(),
            },
        },
        guildId: 'guild-1',
        member: {
            id: 'admin-1',
            permissions: { has: jest.fn().mockReturnValue(true) },
            roles: { highest: { position: 10 } },
        },
        channelId: 'channel-1',
        channel: { id: 'channel-1', type: 0 },
        options: {
            getSubcommand: jest.fn().mockReturnValue(subcommand),
            getString: jest.fn().mockReturnValue(null),
            getBoolean: jest.fn().mockReturnValue(false),
            getInteger: jest.fn(),
        },
        reply: jest.fn().mockResolvedValue({}),
        editReply: jest.fn().mockResolvedValue({}),
        deferReply: jest.fn().mockResolvedValue({}),
        replied: false,
        deferred: false,
        ...overrides,
    } as any;
}

describe('RaidCommand', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockIsRaidModeActive.mockResolvedValue(false);
        mockGetRaidModeState.mockResolvedValue(null);
        mockGetFlaggedAccounts.mockResolvedValue([]);
    });

    describe('metadata', () => {
        it('should have correct command name', () => {
            expect(raidCommand.data.name).toBe('raid');
        });

        it('should have ADMIN category', () => {
            expect(raidCommand.category).toBe('admin');
        });

        it('should require Administrator permission', () => {
            expect(raidCommand.userPermissions).toBeDefined();
            expect(raidCommand.userPermissions.length).toBeGreaterThan(0);
        });

        it('should have on, off, status, clean subcommands', () => {
            const json = raidCommand.data.toJSON();
            const subcommands = (json.options || []).filter((o: any) => o.type === 1);
            const names = subcommands.map((s: any) => s.name);
            expect(names).toContain('on');
            expect(names).toContain('off');
            expect(names).toContain('status');
            expect(names).toContain('clean');
        });
    });

    describe('on subcommand', () => {
        it('should reject when no guild', async () => {
            const interaction = createMockInteraction('on', { guild: null });
            await raidCommand.run(interaction);

            const called = interaction.reply.mock.calls[0]?.[0] || interaction.editReply.mock.calls[0]?.[0];
            expect(called).toBeDefined();
        });

        it('should warn if raid mode already active', async () => {
            mockIsRaidModeActive.mockResolvedValue(true);
            const interaction = createMockInteraction('on');

            await raidCommand.run(interaction);

            const reply = interaction.reply.mock.calls[0]?.[0];
            expect(reply?.ephemeral).toBe(true);
        });

        it('should activate raid mode', async () => {
            const interaction = createMockInteraction('on');
            interaction.options.getString.mockReturnValue('Raid detected');

            await raidCommand.run(interaction);

            expect(mockActivateRaidMode).toHaveBeenCalledWith(
                'guild-1', 'admin-1', 'Raid detected'
            );
        });

        it('should also lock server when lockdown option is true', async () => {
            const interaction = createMockInteraction('on');
            interaction.options.getBoolean.mockReturnValue(true);

            await raidCommand.run(interaction);

            expect(mockLockServer).toHaveBeenCalled();
        });

        it('should not lock server when lockdown option is false', async () => {
            const interaction = createMockInteraction('on');
            interaction.options.getBoolean.mockReturnValue(false);

            await raidCommand.run(interaction);

            expect(mockLockServer).not.toHaveBeenCalled();
        });
    });

    describe('off subcommand', () => {
        it('should reject when no guild', async () => {
            const interaction = createMockInteraction('off', { guild: null });
            await raidCommand.run(interaction);

            const called = interaction.reply.mock.calls[0]?.[0] || interaction.editReply.mock.calls[0]?.[0];
            expect(called).toBeDefined();
        });

        it('should inform when raid mode is not active', async () => {
            mockIsRaidModeActive.mockResolvedValue(false);
            const interaction = createMockInteraction('off');

            await raidCommand.run(interaction);

            const reply = interaction.reply.mock.calls[0]?.[0];
            expect(reply?.ephemeral).toBe(true);
        });

        it('should deactivate raid mode', async () => {
            mockIsRaidModeActive.mockResolvedValue(true);
            const interaction = createMockInteraction('off');

            await raidCommand.run(interaction);

            expect(mockDeactivateRaidMode).toHaveBeenCalledWith('guild-1');
        });

        it('should also unlock server when unlock option is true', async () => {
            mockIsRaidModeActive.mockResolvedValue(true);
            const interaction = createMockInteraction('off');
            interaction.options.getBoolean.mockReturnValue(true);

            await raidCommand.run(interaction);

            expect(mockUnlockServer).toHaveBeenCalled();
        });
    });

    describe('status subcommand', () => {
        it('should reject when no guild', async () => {
            const interaction = createMockInteraction('status', { guild: null });
            await raidCommand.run(interaction);

            const called = interaction.reply.mock.calls[0]?.[0] || interaction.editReply.mock.calls[0]?.[0];
            expect(called).toBeDefined();
        });

        it('should show inactive status', async () => {
            const interaction = createMockInteraction('status');
            mockGetRaidModeState.mockResolvedValue(null);

            await raidCommand.run(interaction);

            const reply = interaction.reply.mock.calls[0]?.[0];
            expect(reply?.embeds?.[0]).toBeDefined();
        });

        it('should show active raid status with stats', async () => {
            const interaction = createMockInteraction('status');
            mockGetRaidModeState.mockResolvedValue({
                active: true,
                activatedAt: Date.now() - 300000,
                activatedBy: 'admin-1',
                reason: 'Raid detected',
                stats: { kickedCount: 3, bannedCount: 1 },
            });
            mockGetFlaggedAccounts.mockResolvedValue(['user-1', 'user-2']);

            await raidCommand.run(interaction);

            const reply = interaction.reply.mock.calls[0]?.[0];
            expect(reply?.embeds?.[0]).toBeDefined();
        });
    });

    describe('clean subcommand', () => {
        it('should reject when no guild', async () => {
            const interaction = createMockInteraction('clean', { guild: null });
            await raidCommand.run(interaction);

            const called = interaction.reply.mock.calls[0]?.[0] || interaction.editReply.mock.calls[0]?.[0];
            expect(called).toBeDefined();
        });

        it('should show message when no flagged users', async () => {
            const interaction = createMockInteraction('clean');
            interaction.options.getString.mockReturnValue('kick');
            mockGetFlaggedAccounts.mockResolvedValue([]);

            await raidCommand.run(interaction);

            const reply = interaction.reply.mock.calls[0]?.[0];
            expect(reply?.ephemeral).toBe(true);
        });

        it('should kick flagged users', async () => {
            const mockMember = {
                roles: { cache: { size: 1 } },
                kick: jest.fn().mockResolvedValue(undefined),
                ban: jest.fn().mockResolvedValue(undefined),
            };
            const interaction = createMockInteraction('clean');
            interaction.options.getString.mockReturnValue('kick');
            mockGetFlaggedAccounts.mockResolvedValue(['user-1']);
            interaction.guild.members.fetch.mockResolvedValue(mockMember);

            await raidCommand.run(interaction);

            expect(mockMember.kick).toHaveBeenCalled();
        });

        it('should ban flagged users when action is ban', async () => {
            const mockMember = {
                roles: { cache: { size: 1 } },
                kick: jest.fn().mockResolvedValue(undefined),
                ban: jest.fn().mockResolvedValue(undefined),
            };
            const interaction = createMockInteraction('clean');
            interaction.options.getString.mockReturnValue('ban');
            mockGetFlaggedAccounts.mockResolvedValue(['user-1']);
            interaction.guild.members.fetch.mockResolvedValue(mockMember);

            await raidCommand.run(interaction);

            expect(mockMember.ban).toHaveBeenCalled();
        });

        it('should skip users with roles', async () => {
            const mockMember = {
                roles: { cache: { size: 3 } }, // has roles
                kick: jest.fn(),
                ban: jest.fn(),
            };
            const interaction = createMockInteraction('clean');
            interaction.options.getString.mockReturnValue('kick');
            mockGetFlaggedAccounts.mockResolvedValue(['user-1']);
            interaction.guild.members.fetch.mockResolvedValue(mockMember);

            await raidCommand.run(interaction);

            expect(mockMember.kick).not.toHaveBeenCalled();
        });

        it('should handle member not found', async () => {
            const interaction = createMockInteraction('clean');
            interaction.options.getString.mockReturnValue('kick');
            mockGetFlaggedAccounts.mockResolvedValue(['user-1']);
            interaction.guild.members.fetch.mockResolvedValue(null);

            await raidCommand.run(interaction);

            const reply = interaction.editReply.mock.calls[0]?.[0];
            expect(reply?.embeds?.[0]).toBeDefined();
        });
    });
});
