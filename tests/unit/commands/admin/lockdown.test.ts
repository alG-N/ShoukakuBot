/**
 * Lockdown Command Unit Tests
 * Tests for channel/server lockdown management
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

// Mock LockdownService
const mockLockChannel = jest.fn().mockResolvedValue({ success: true });
const mockUnlockChannel = jest.fn().mockResolvedValue({ success: true });
const mockLockServer = jest.fn().mockResolvedValue({ success: ['ch1'], skipped: [], failed: [] });
const mockUnlockServer = jest.fn().mockResolvedValue({ success: ['ch1'], skipped: [], failed: [] });
const mockGetLockStatus = jest.fn().mockResolvedValue({ lockedCount: 0, channelIds: [] });
jest.mock('../../../../src/services/moderation/LockdownService', () => ({
    __esModule: true,
    default: {
        lockChannel: mockLockChannel,
        unlockChannel: mockUnlockChannel,
        lockServer: mockLockServer,
        unlockServer: mockUnlockServer,
        getLockStatus: mockGetLockStatus,
    },
}));

// Mock moderation config
jest.mock('../../../../src/config/features/moderation/index', () => ({
    __esModule: true,
    default: {
        COLORS: { LOCKDOWN: 0xFF5555, SUCCESS: 0x00FF00, ERROR: 0xFF0000, WARNING: 0xFFAA00, INFO: 0x5865F2 },
        EMOJIS: { LOCK: '🔒', UNLOCK: '🔓', ERROR: '❌', INFO: 'ℹ️' },
    },
}));

// Mock database
jest.mock('../../../../src/database/index', () => ({
    __esModule: true,
    default: { query: jest.fn().mockResolvedValue({ rows: [] }) },
}));

import lockdownCommand from '../../../../src/commands/admin/lockdown';

function createMockInteraction(subcommand: string, overrides: Record<string, unknown> = {}) {
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
        channel: {
            id: 'channel-1',
            type: 0,
            send: jest.fn().mockResolvedValue({}),
            awaitMessages: jest.fn(),
        },
        options: {
            getSubcommand: jest.fn().mockReturnValue(subcommand),
            getChannel: jest.fn().mockReturnValue(null),
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

describe('LockdownCommand', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockLockChannel.mockResolvedValue({ success: true });
        mockUnlockChannel.mockResolvedValue({ success: true });
        mockGetLockStatus.mockResolvedValue({ lockedCount: 0, channelIds: [] });
    });

    describe('metadata', () => {
        it('should have correct command name', () => {
            expect(lockdownCommand.data.name).toBe('lockdown');
        });

        it('should have ADMIN category', () => {
            expect(lockdownCommand.category).toBe('admin');
        });

        it('should require ManageChannels permission', () => {
            expect(lockdownCommand.userPermissions).toBeDefined();
            expect(lockdownCommand.userPermissions.length).toBeGreaterThan(0);
        });

        it('should have all 5 subcommands', () => {
            const json = lockdownCommand.data.toJSON();
            const subcommands = (json.options || []).filter((o: any) => o.type === 1);
            const names = subcommands.map((s: any) => s.name);
            expect(names).toContain('channel');
            expect(names).toContain('server');
            expect(names).toContain('unlock');
            expect(names).toContain('unlockall');
            expect(names).toContain('status');
        });
    });

    describe('channel subcommand', () => {
        it('should lock the current channel when no channel specified', async () => {
            const interaction = createMockInteraction('channel');
            await lockdownCommand.run(interaction);

            expect(mockLockChannel).toHaveBeenCalled();
        });

        it('should lock the specified channel', async () => {
            const targetChannel = { id: 'other-channel', type: 0, send: jest.fn().mockResolvedValue({}) };
            const interaction = createMockInteraction('channel');
            interaction.options.getChannel.mockReturnValue(targetChannel);

            await lockdownCommand.run(interaction);

            expect(mockLockChannel).toHaveBeenCalledWith(
                targetChannel,
                expect.stringContaining('Moderator#0001')
            );
        });

        it('should show error on failed lock', async () => {
            mockLockChannel.mockResolvedValue({ success: false, error: 'Already locked' });
            const interaction = createMockInteraction('channel');

            await lockdownCommand.run(interaction);

            const reply = interaction.editReply.mock.calls[0]?.[0];
            expect(reply).toBeDefined();
        });

        it('should send lockdown embed to the locked channel', async () => {
            const channel = { id: 'channel-1', type: 0, send: jest.fn().mockResolvedValue({}) };
            const interaction = createMockInteraction('channel', { channel });

            await lockdownCommand.run(interaction);

            expect(channel.send).toHaveBeenCalled();
        });

        it('should include reason in lock message', async () => {
            const interaction = createMockInteraction('channel');
            interaction.options.getString.mockReturnValue('Emergency maintenance');

            await lockdownCommand.run(interaction);

            expect(mockLockChannel).toHaveBeenCalledWith(
                expect.anything(),
                expect.stringContaining('Emergency maintenance')
            );
        });
    });

    describe('unlock subcommand', () => {
        it('should unlock the current channel', async () => {
            const interaction = createMockInteraction('unlock');
            await lockdownCommand.run(interaction);

            expect(mockUnlockChannel).toHaveBeenCalled();
        });

        it('should show error on failed unlock', async () => {
            mockUnlockChannel.mockResolvedValue({ success: false, error: 'Not locked' });
            const interaction = createMockInteraction('unlock');

            await lockdownCommand.run(interaction);

            const reply = interaction.editReply.mock.calls[0]?.[0];
            expect(reply).toBeDefined();
        });
    });

    describe('unlockall subcommand', () => {
        it('should reject when no guild', async () => {
            const interaction = createMockInteraction('unlockall', { guild: null });
            await lockdownCommand.run(interaction);

            const reply = interaction.reply.mock.calls[0]?.[0] || interaction.editReply.mock.calls[0]?.[0];
            expect(reply).toBeDefined();
        });

        it('should unlock all channels', async () => {
            const interaction = createMockInteraction('unlockall');
            mockUnlockServer.mockResolvedValue({ success: ['ch1', 'ch2'], skipped: [], failed: [] });

            await lockdownCommand.run(interaction);

            expect(mockUnlockServer).toHaveBeenCalled();
        });

        it('should show message when no channels to unlock', async () => {
            const interaction = createMockInteraction('unlockall');
            mockUnlockServer.mockResolvedValue({ success: [], skipped: [], failed: [], message: 'No channels locked' });

            await lockdownCommand.run(interaction);

            const reply = interaction.editReply.mock.calls[0]?.[0];
            expect(reply).toBeDefined();
        });
    });

    describe('status subcommand', () => {
        it('should reject when no guild', async () => {
            const interaction = createMockInteraction('status', { guild: null });
            await lockdownCommand.run(interaction);

            const reply = interaction.reply.mock.calls[0]?.[0] || interaction.editReply.mock.calls[0]?.[0];
            expect(reply).toBeDefined();
        });

        it('should show no channels locked', async () => {
            const interaction = createMockInteraction('status');
            mockGetLockStatus.mockResolvedValue({ lockedCount: 0, channelIds: [] });

            await lockdownCommand.run(interaction);

            const reply = interaction.reply.mock.calls[0]?.[0];
            expect(reply?.embeds?.[0]).toBeDefined();
        });

        it('should show locked channels', async () => {
            const interaction = createMockInteraction('status');
            mockGetLockStatus.mockResolvedValue({ lockedCount: 3, channelIds: ['ch1', 'ch2', 'ch3'] });

            await lockdownCommand.run(interaction);

            const reply = interaction.reply.mock.calls[0]?.[0];
            expect(reply?.embeds?.[0]).toBeDefined();
        });
    });
});
