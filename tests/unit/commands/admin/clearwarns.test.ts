/**
 * ClearWarns Command Unit Tests
 * Tests for clear warnings command validation and execution
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

// Mock infraction service
const mockGetWarningCount = jest.fn();
const mockClearWarnings = jest.fn();
const mockCreateInfraction = jest.fn();
jest.mock('../../../../src/services/moderation/index', () => ({
    __esModule: true,
    infractionService: {
        getWarningCount: mockGetWarningCount,
        clearWarnings: mockClearWarnings,
        createInfraction: mockCreateInfraction,
    },
}));

import clearwarnsCommand from '../../../../src/commands/admin/clearwarns';

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
        options: {
            getUser: jest.fn().mockReturnValue({
                id: 'target-1',
                tag: 'TargetUser#0001',
            }),
            getString: jest.fn().mockReturnValue('Clean slate'),
            getSubcommand: jest.fn(),
        },
        reply: jest.fn().mockResolvedValue({}),
        editReply: jest.fn().mockResolvedValue({}),
        replied: false,
        deferred: true,
        channel: { type: 0 },
        ...overrides,
    } as any;
}

describe('ClearWarnsCommand', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('metadata', () => {
        it('should have correct command name', () => {
            expect(clearwarnsCommand.data.name).toBe('clearwarns');
        });

        it('should have ADMIN category', () => {
            expect(clearwarnsCommand.category).toBe('admin');
        });

        it('should require ModerateMembers permission', () => {
            expect(clearwarnsCommand.userPermissions).toBeDefined();
            expect(clearwarnsCommand.userPermissions.length).toBeGreaterThan(0);
        });
    });

    describe('run()', () => {
        it('should reject when no guild', async () => {
            const interaction = createMockInteraction({ guild: null });

            await clearwarnsCommand.run(interaction);

            const call = interaction.editReply.mock.calls[0]?.[0] || interaction.reply.mock.calls[0]?.[0];
            expect(call).toBeDefined();
        });

        it('should reject when user has no warnings', async () => {
            const interaction = createMockInteraction();
            mockGetWarningCount.mockResolvedValue(0);

            await clearwarnsCommand.run(interaction);

            const reply = interaction.editReply.mock.calls[0][0];
            expect(reply.content).toContain('no active warnings');
        });

        it('should successfully clear warnings', async () => {
            const interaction = createMockInteraction();
            mockGetWarningCount.mockResolvedValue(3);
            mockClearWarnings.mockResolvedValue(3);
            mockCreateInfraction.mockResolvedValue({});

            await clearwarnsCommand.run(interaction);

            expect(mockClearWarnings).toHaveBeenCalledWith('guild-1', 'target-1');
            const reply = interaction.editReply.mock.calls[0][0];
            expect(reply.embeds).toBeDefined();
            expect(reply.embeds[0].data.title).toContain('Warnings Cleared');
        });

        it('should show cleared count in response', async () => {
            const interaction = createMockInteraction();
            mockGetWarningCount.mockResolvedValue(5);
            mockClearWarnings.mockResolvedValue(5);
            mockCreateInfraction.mockResolvedValue({});

            await clearwarnsCommand.run(interaction);

            const reply = interaction.editReply.mock.calls[0][0];
            const fields = reply.embeds[0].data.fields || [];
            const countField = fields.find((f: any) => f.name === 'Warnings Cleared');
            expect(countField?.value).toBe('5');
        });

        it('should log the clear action as a note infraction', async () => {
            const interaction = createMockInteraction();
            mockGetWarningCount.mockResolvedValue(2);
            mockClearWarnings.mockResolvedValue(2);
            mockCreateInfraction.mockResolvedValue({});

            await clearwarnsCommand.run(interaction);

            expect(mockCreateInfraction).toHaveBeenCalled();
            const infraData = mockCreateInfraction.mock.calls[0][0];
            expect(infraData.type).toBe('note');
            expect(infraData.reason).toContain('Cleared 2 warning(s)');
            expect(infraData.metadata.action).toBe('clear_warnings');
        });

        it('should show reason in response', async () => {
            const interaction = createMockInteraction();
            mockGetWarningCount.mockResolvedValue(1);
            mockClearWarnings.mockResolvedValue(1);
            mockCreateInfraction.mockResolvedValue({});

            await clearwarnsCommand.run(interaction);

            const reply = interaction.editReply.mock.calls[0][0];
            const fields = reply.embeds[0].data.fields || [];
            const reasonField = fields.find((f: any) => f.name === 'Reason');
            expect(reasonField?.value).toBe('Clean slate');
        });

        it('should handle errors gracefully', async () => {
            const interaction = createMockInteraction();
            mockGetWarningCount.mockRejectedValue(new Error('DB error'));

            await clearwarnsCommand.run(interaction);

            const reply = interaction.editReply.mock.calls[0][0];
            expect(reply.content).toContain('Failed to clear warnings');
        });
    });
});
