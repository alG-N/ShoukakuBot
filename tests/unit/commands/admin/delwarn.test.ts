/**
 * DelWarn Command Unit Tests
 * Tests for delete warning command validation and execution
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
const mockGetCase = jest.fn();
const mockDeleteCase = jest.fn();
jest.mock('../../../../src/services/moderation/index', () => ({
    __esModule: true,
    infractionService: {
        getCase: mockGetCase,
        deleteCase: mockDeleteCase,
    },
}));

import delwarnCommand from '../../../../src/commands/admin/delwarn';

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
            users: {
                fetch: jest.fn().mockResolvedValue({
                    id: 'target-1',
                    tag: 'TargetUser#0001',
                }),
            },
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
            getInteger: jest.fn().mockReturnValue(1),
            getString: jest.fn().mockReturnValue('Undeserved'),
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

describe('DelWarnCommand', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('metadata', () => {
        it('should have correct command name', () => {
            expect(delwarnCommand.data.name).toBe('delwarn');
        });

        it('should have ADMIN category', () => {
            expect(delwarnCommand.category).toBe('admin');
        });

        it('should require ModerateMembers permission', () => {
            expect(delwarnCommand.userPermissions).toBeDefined();
            expect(delwarnCommand.userPermissions.length).toBeGreaterThan(0);
        });

        it('should have case and reason options', () => {
            const json = delwarnCommand.data.toJSON();
            const optionNames = json.options?.map((o: any) => o.name) || [];
            expect(optionNames).toContain('case');
            expect(optionNames).toContain('reason');
        });
    });

    describe('run()', () => {
        it('should reject when no guild', async () => {
            const interaction = createMockInteraction({ guild: null });

            await delwarnCommand.run(interaction);

            const call = interaction.editReply.mock.calls[0]?.[0] || interaction.reply.mock.calls[0]?.[0];
            expect(call).toBeDefined();
        });

        it('should reject when case not found', async () => {
            const interaction = createMockInteraction();
            mockGetCase.mockResolvedValue(null);

            await delwarnCommand.run(interaction);

            expect(interaction.editReply).toHaveBeenCalled();
            const reply = interaction.editReply.mock.calls[0][0];
            expect(reply.content).toContain('not found');
        });

        it('should reject when case is already inactive', async () => {
            const interaction = createMockInteraction();
            mockGetCase.mockResolvedValue({
                id: 1,
                guild_id: 'guild-1',
                user_id: 'target-1',
                moderator_id: 'mod-1',
                type: 'warn',
                reason: 'Test',
                active: false,
                created_at: new Date(),
            });

            await delwarnCommand.run(interaction);

            expect(interaction.editReply).toHaveBeenCalled();
            const reply = interaction.editReply.mock.calls[0][0];
            expect(reply.content).toContain('already deleted');
        });

        it('should reject deleting non-warning infractions', async () => {
            const interaction = createMockInteraction();
            mockGetCase.mockResolvedValue({
                id: 1,
                guild_id: 'guild-1',
                user_id: 'target-1',
                moderator_id: 'mod-1',
                type: 'ban',
                reason: 'Test',
                active: true,
                created_at: new Date(),
            });

            await delwarnCommand.run(interaction);

            expect(interaction.editReply).toHaveBeenCalled();
            const reply = interaction.editReply.mock.calls[0][0];
            expect(reply.content).toContain('ban');
            expect(reply.content).toContain('not a warning');
        });

        it('should successfully delete a warning', async () => {
            const interaction = createMockInteraction();
            mockGetCase.mockResolvedValue({
                id: 1,
                guild_id: 'guild-1',
                user_id: 'target-1',
                moderator_id: 'mod-1',
                type: 'warn',
                reason: 'Being rude',
                active: true,
                created_at: new Date(),
            });
            mockDeleteCase.mockResolvedValue(true);

            await delwarnCommand.run(interaction);

            expect(mockDeleteCase).toHaveBeenCalledWith('guild-1', 1);
            expect(interaction.editReply).toHaveBeenCalled();
            const reply = interaction.editReply.mock.calls[0][0];
            expect(reply.embeds).toBeDefined();
            expect(reply.embeds[0].data.title).toContain('Warning Deleted');
        });

        it('should show original reason and user in success embed', async () => {
            const interaction = createMockInteraction();
            interaction.options.getInteger.mockReturnValue(5);
            mockGetCase.mockResolvedValue({
                id: 5,
                guild_id: 'guild-1',
                user_id: 'target-1',
                moderator_id: 'mod-1',
                type: 'warn',
                reason: 'Spamming',
                active: true,
                created_at: new Date(),
            });
            mockDeleteCase.mockResolvedValue(true);

            await delwarnCommand.run(interaction);

            const reply = interaction.editReply.mock.calls[0][0];
            const fields = reply.embeds[0].data.fields || [];
            const caseField = fields.find((f: any) => f.name === 'Case ID');
            const reasonField = fields.find((f: any) => f.name === 'Original Reason');
            expect(caseField?.value).toBe('#5');
            expect(reasonField?.value).toBe('Spamming');
        });

        it('should handle errors gracefully', async () => {
            const interaction = createMockInteraction();
            mockGetCase.mockRejectedValue(new Error('DB error'));

            await delwarnCommand.run(interaction);

            const reply = interaction.editReply.mock.calls[0][0];
            expect(reply.content).toContain('Failed to delete warning');
        });

        it('should handle user fetch failure gracefully', async () => {
            const interaction = createMockInteraction();
            interaction.client.users.fetch.mockRejectedValue(new Error('Unknown User'));
            mockGetCase.mockResolvedValue({
                id: 1,
                guild_id: 'guild-1',
                user_id: 'unknown-id',
                moderator_id: 'mod-1',
                type: 'warn',
                reason: 'Test',
                active: true,
                created_at: new Date(),
            });
            mockDeleteCase.mockResolvedValue(true);

            await delwarnCommand.run(interaction);

            const reply = interaction.editReply.mock.calls[0][0];
            expect(reply.embeds).toBeDefined();
            const fields = reply.embeds[0].data.fields || [];
            const userField = fields.find((f: any) => f.name === 'User');
            expect(userField?.value).toContain('Unknown User');
        });
    });
});
