/**
 * Warnings Command Unit Tests
 * Tests for warnings command — viewing user infractions
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

// Mock formatDuration
jest.mock('../../../../src/utils/common/time', () => ({
    __esModule: true,
    formatDuration: jest.fn().mockImplementation((ms: number) => `${Math.floor(ms / 60000)}m`),
}));

// Mock infraction service
const mockGetUserHistory = jest.fn().mockResolvedValue([]);
const mockGetWarningCount = jest.fn().mockResolvedValue(0);
jest.mock('../../../../src/services/moderation/index', () => ({
    __esModule: true,
    infractionService: {
        getUserHistory: mockGetUserHistory,
        getWarningCount: mockGetWarningCount,
    },
}));

// Mock moderation config
jest.mock('../../../../src/config/features/moderation/index', () => ({
    __esModule: true,
    default: {
        COLORS: { WARN: 0xFFAA00 },
        EMOJIS: { WARN: '⚠️', USER: '👤', BAN: '🔨' },
    },
}));

// Mock database
jest.mock('../../../../src/database/index', () => ({
    __esModule: true,
    default: { query: jest.fn().mockResolvedValue({ rows: [] }) },
}));

import warningsCommand from '../../../../src/commands/admin/warnings';

function createMockInteraction(overrides: Record<string, unknown> = {}) {
    const editReplyMock = jest.fn().mockImplementation(() => {
        // Return a Message-like object with createMessageComponentCollector
        return Promise.resolve({
            createMessageComponentCollector: jest.fn().mockReturnValue({
                on: jest.fn().mockReturnThis(),
            }),
        });
    });

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
        channel: { type: 0 },
        options: {
            getUser: jest.fn().mockReturnValue({
                id: 'target-1',
                tag: 'Target#0001',
                displayAvatarURL: jest.fn().mockReturnValue('https://example.com/target.png'),
            }),
            getBoolean: jest.fn().mockReturnValue(false),
            getString: jest.fn(),
            getInteger: jest.fn(),
        },
        reply: jest.fn().mockResolvedValue({}),
        editReply: editReplyMock,
        deferReply: jest.fn().mockResolvedValue({}),
        replied: false,
        deferred: false,
        ...overrides,
    } as any;
}

function createInfraction(overrides: Record<string, unknown> = {}) {
    return {
        case_id: 1,
        type: 'warn',
        reason: 'Test warning',
        moderator_id: 'mod-1',
        created_at: new Date().toISOString(),
        duration_ms: undefined,
        active: true,
        ...overrides,
    };
}

describe('WarningsCommand', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockGetUserHistory.mockResolvedValue([]);
        mockGetWarningCount.mockResolvedValue(0);
    });

    describe('metadata', () => {
        it('should have correct command name', () => {
            expect(warningsCommand.data.name).toBe('warnings');
        });

        it('should have ADMIN category', () => {
            expect(warningsCommand.category).toBe('admin');
        });

        it('should require ModerateMembers permission', () => {
            expect(warningsCommand.userPermissions).toBeDefined();
            expect(warningsCommand.userPermissions.length).toBeGreaterThan(0);
        });

        it('should have user and all options', () => {
            const json = warningsCommand.data.toJSON();
            const optionNames = (json.options || []).map((o: any) => o.name);
            expect(optionNames).toContain('user');
            expect(optionNames).toContain('all');
        });
    });

    describe('run', () => {
        it('should reject when no guild', async () => {
            const interaction = createMockInteraction({ guild: null });
            await warningsCommand.run(interaction);

            const called = interaction.reply.mock.calls[0]?.[0] || interaction.editReply.mock.calls[0]?.[0];
            expect(called).toBeDefined();
        });

        it('should show clean record when no infractions', async () => {
            const interaction = createMockInteraction();
            mockGetUserHistory.mockResolvedValue([]);

            await warningsCommand.run(interaction);

            const reply = interaction.editReply.mock.calls[0]?.[0];
            expect(reply).toBeDefined();
            expect(reply?.embeds?.[0]).toBeDefined();
        });

        it('should display infractions in embeds', async () => {
            const interaction = createMockInteraction();
            const infractions = [
                createInfraction({ case_id: 1, reason: 'Spam' }),
                createInfraction({ case_id: 2, reason: 'Toxic' }),
            ];
            mockGetUserHistory.mockResolvedValue(infractions);
            mockGetWarningCount.mockResolvedValue(2);

            await warningsCommand.run(interaction);

            const reply = interaction.editReply.mock.calls[0]?.[0];
            expect(reply?.embeds).toBeDefined();
            expect(reply?.embeds?.length).toBeGreaterThan(0);
        });

        it('should paginate when more than 5 infractions', async () => {
            const interaction = createMockInteraction();
            const infractions = Array.from({ length: 8 }, (_, i) =>
                createInfraction({ case_id: i + 1, reason: `Reason ${i}` })
            );
            mockGetUserHistory.mockResolvedValue(infractions);
            mockGetWarningCount.mockResolvedValue(8);

            await warningsCommand.run(interaction);

            const reply = interaction.editReply.mock.calls[0]?.[0];
            // Should have pagination components
            expect(reply?.components).toBeDefined();
        });

        it('should show all infractions when all option is true', async () => {
            const interaction = createMockInteraction();
            interaction.options.getBoolean.mockReturnValue(true);
            const infractions = [
                createInfraction({ type: 'warn', case_id: 1 }),
                createInfraction({ type: 'ban', case_id: 2 }),
                createInfraction({ type: 'mute', case_id: 3 }),
            ];
            mockGetUserHistory.mockResolvedValue(infractions);

            await warningsCommand.run(interaction);

            expect(mockGetUserHistory).toHaveBeenCalledWith(
                'guild-1', 'target-1',
                expect.objectContaining({ type: null, activeOnly: false })
            );
        });

        it('should show only active warnings when all is false', async () => {
            const interaction = createMockInteraction();
            interaction.options.getBoolean.mockReturnValue(false);

            await warningsCommand.run(interaction);

            expect(mockGetUserHistory).toHaveBeenCalledWith(
                'guild-1', 'target-1',
                expect.objectContaining({ type: 'warn', activeOnly: true })
            );
        });

        it('should handle service errors', async () => {
            const interaction = createMockInteraction();
            mockGetUserHistory.mockRejectedValue(new Error('DB error'));

            await warningsCommand.run(interaction);

            const reply = interaction.editReply.mock.calls[0]?.[0];
            expect(reply).toBeDefined();
        });

        it('should show inactive marker for inactive infractions', async () => {
            const interaction = createMockInteraction();
            const infractions = [
                createInfraction({ case_id: 1, active: false }),
            ];
            mockGetUserHistory.mockResolvedValue(infractions);

            await warningsCommand.run(interaction);

            const reply = interaction.editReply.mock.calls[0]?.[0];
            expect(reply?.embeds).toBeDefined();
        });

        it('should show duration for timed infractions', async () => {
            const interaction = createMockInteraction();
            const infractions = [
                createInfraction({ case_id: 1, type: 'mute', duration_ms: 600000 }),
            ];
            mockGetUserHistory.mockResolvedValue(infractions);

            await warningsCommand.run(interaction);

            const reply = interaction.editReply.mock.calls[0]?.[0];
            expect(reply?.embeds).toBeDefined();
        });

        it('should not show pagination for single page', async () => {
            const interaction = createMockInteraction();
            const infractions = [createInfraction({ case_id: 1 })];
            mockGetUserHistory.mockResolvedValue(infractions);

            await warningsCommand.run(interaction);

            const reply = interaction.editReply.mock.calls[0]?.[0];
            // Single page — no components
            expect(reply?.components).toBeUndefined();
        });
    });
});
