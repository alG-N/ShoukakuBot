/**
 * Case Command Unit Tests
 * Tests for case command validation and execution
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
const mockBuildCaseEmbed = jest.fn();
jest.mock('../../../../src/services/moderation/index', () => ({
    __esModule: true,
    infractionService: {
        getCase: mockGetCase,
        buildCaseEmbed: mockBuildCaseEmbed,
    },
}));

import caseCommand from '../../../../src/commands/admin/case';

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
                    displayAvatarURL: jest.fn().mockReturnValue('https://example.com/target.png'),
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

describe('CaseCommand', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('metadata', () => {
        it('should have correct command name', () => {
            expect(caseCommand.data.name).toBe('case');
        });

        it('should have ADMIN category', () => {
            expect(caseCommand.category).toBe('admin');
        });

        it('should require ModerateMembers permission', () => {
            expect(caseCommand.userPermissions).toBeDefined();
            expect(caseCommand.userPermissions.length).toBeGreaterThan(0);
        });

        it('should have id option', () => {
            const json = caseCommand.data.toJSON();
            const optionNames = json.options?.map((o: any) => o.name) || [];
            expect(optionNames).toContain('id');
        });
    });

    describe('run()', () => {
        it('should reject when no guild', async () => {
            const interaction = createMockInteraction({ guild: null });

            await caseCommand.run(interaction);

            const call = interaction.editReply.mock.calls[0]?.[0] || interaction.reply.mock.calls[0]?.[0];
            expect(call).toBeDefined();
        });

        it('should reject when case not found', async () => {
            const interaction = createMockInteraction();
            mockGetCase.mockResolvedValue(null);

            await caseCommand.run(interaction);

            const reply = interaction.editReply.mock.calls[0][0];
            expect(reply.content).toContain('not found');
        });

        it('should use buildCaseEmbed from service when available', async () => {
            const interaction = createMockInteraction();
            const mockEmbed = {
                data: { title: 'Case #1 from service' },
            };
            mockGetCase.mockResolvedValue({
                id: 1,
                guild_id: 'guild-1',
                user_id: 'target-1',
                moderator_id: 'mod-1',
                type: 'warn',
                reason: 'Test',
                active: true,
                created_at: new Date(),
            });
            mockBuildCaseEmbed.mockReturnValue(mockEmbed);

            await caseCommand.run(interaction);

            expect(mockBuildCaseEmbed).toHaveBeenCalled();
            const reply = interaction.editReply.mock.calls[0][0];
            expect(reply.embeds[0]).toBe(mockEmbed);
        });

        it('should build default embed when service method unavailable', async () => {
            const interaction = createMockInteraction();
            mockGetCase.mockResolvedValue({
                id: 42,
                guild_id: 'guild-1',
                user_id: 'target-1',
                moderator_id: 'mod-1',
                type: 'warn',
                reason: 'Spamming',
                active: true,
                created_at: new Date('2026-01-01'),
            });
            mockBuildCaseEmbed.mockReturnValue(null); // returns falsy → use default

            await caseCommand.run(interaction);

            const reply = interaction.editReply.mock.calls[0][0];
            expect(reply.embeds).toBeDefined();
            expect(reply.embeds[0].data.title).toContain('Case #42');
        });

        it('should show case type in default embed', async () => {
            const interaction = createMockInteraction();
            mockGetCase.mockResolvedValue({
                id: 1,
                guild_id: 'guild-1',
                user_id: 'target-1',
                moderator_id: 'mod-1',
                type: 'ban',
                reason: 'Trolling',
                active: true,
                created_at: new Date(),
            });
            mockBuildCaseEmbed.mockReturnValue(null);

            await caseCommand.run(interaction);

            const reply = interaction.editReply.mock.calls[0][0];
            const fields = reply.embeds[0].data.fields || [];
            const typeField = fields.find((f: any) => f.name === 'Type');
            expect(typeField?.value).toBe('BAN');
        });

        it('should show active status for active cases', async () => {
            const interaction = createMockInteraction();
            mockGetCase.mockResolvedValue({
                id: 1,
                guild_id: 'guild-1',
                user_id: 'target-1',
                moderator_id: 'mod-1',
                type: 'warn',
                reason: 'Test',
                active: true,
                created_at: new Date(),
            });
            mockBuildCaseEmbed.mockReturnValue(null);

            await caseCommand.run(interaction);

            const reply = interaction.editReply.mock.calls[0][0];
            const fields = reply.embeds[0].data.fields || [];
            const statusField = fields.find((f: any) => f.name === 'Status');
            expect(statusField?.value).toContain('Active');
        });

        it('should show inactive status for inactive cases', async () => {
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
            mockBuildCaseEmbed.mockReturnValue(null);

            await caseCommand.run(interaction);

            const reply = interaction.editReply.mock.calls[0][0];
            const fields = reply.embeds[0].data.fields || [];
            const statusField = fields.find((f: any) => f.name === 'Status');
            expect(statusField?.value).toContain('Inactive');
        });

        it('should handle user fetch failure', async () => {
            const interaction = createMockInteraction();
            interaction.client.users.fetch.mockRejectedValue(new Error('Unknown User'));
            mockGetCase.mockResolvedValue({
                id: 1,
                guild_id: 'guild-1',
                user_id: 'unknown-user',
                moderator_id: 'mod-1',
                type: 'warn',
                reason: 'Test',
                active: true,
                created_at: new Date(),
            });
            mockBuildCaseEmbed.mockReturnValue(null);

            await caseCommand.run(interaction);

            // Should not throw — handles gracefully
            expect(interaction.editReply).toHaveBeenCalled();
        });

        it('should handle errors gracefully', async () => {
            const interaction = createMockInteraction();
            mockGetCase.mockRejectedValue(new Error('DB error'));

            await caseCommand.run(interaction);

            const reply = interaction.editReply.mock.calls[0][0];
            expect(reply.content).toContain('Failed to fetch case');
        });
    });
});
