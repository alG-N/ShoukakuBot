/**
 * Kick Command Unit Tests
 * Tests for kick command validation and execution
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

// Mock moderation service
const mockLogModAction = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../../src/services/moderation/index', () => ({
    __esModule: true,
    moderationService: {
        logModAction: mockLogModAction,
    },
}));

import kickCommand from '../../../../src/commands/admin/kick';

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
            members: {
                fetch: jest.fn().mockResolvedValue({
                    id: 'target-1',
                    roles: {
                        highest: { position: 5 },
                    },
                    kick: jest.fn().mockResolvedValue(undefined),
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
            getString: jest.fn().mockReturnValue('Being rude'),
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

describe('KickCommand', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('metadata', () => {
        it('should have correct command name', () => {
            expect(kickCommand.data.name).toBe('kick');
        });

        it('should have correct category', () => {
            expect(kickCommand.category).toBe('admin');
        });

        it('should require KickMembers permission', () => {
            expect(kickCommand.userPermissions).toBeDefined();
            expect(kickCommand.userPermissions.length).toBeGreaterThan(0);
        });
    });

    describe('run()', () => {
        it('should reject when no guild', async () => {
            const interaction = createMockInteraction({ guild: null });

            await kickCommand.run(interaction);

            // Should have sent error about guild requirement
            const call = interaction.editReply.mock.calls[0]?.[0] || interaction.reply.mock.calls[0]?.[0];
            expect(call).toBeDefined();
        });

        it('should reject self-kick', async () => {
            const interaction = createMockInteraction();
            interaction.options.getUser.mockReturnValue({
                id: 'mod-1', // same as interaction.user.id
                tag: 'Moderator#0001',
                displayAvatarURL: jest.fn(),
                send: jest.fn(),
            });

            await kickCommand.run(interaction);

            // Should respond with error
            expect(interaction.editReply).toHaveBeenCalled();
            const reply = interaction.editReply.mock.calls[0][0];
            // Check for error indicator 
            const hasError = typeof reply === 'string' 
                ? reply.includes('cannot kick yourself')
                : (reply.content?.includes('cannot kick yourself') || 
                   reply.embeds?.[0]?.data?.description?.includes('cannot kick yourself'));
            expect(hasError).toBeTruthy();
        });

        it('should reject kicking bot itself', async () => {
            const interaction = createMockInteraction();
            interaction.options.getUser.mockReturnValue({
                id: 'bot-1', // same as client.user.id
                tag: 'Bot#0001',
                displayAvatarURL: jest.fn(),
                send: jest.fn(),
            });

            await kickCommand.run(interaction);

            expect(interaction.editReply).toHaveBeenCalled();
        });

        it('should reject kicking server owner', async () => {
            const interaction = createMockInteraction();
            interaction.options.getUser.mockReturnValue({
                id: 'owner-1', // same as guild.ownerId
                tag: 'Owner#0001',
                displayAvatarURL: jest.fn(),
                send: jest.fn(),
            });

            await kickCommand.run(interaction);

            expect(interaction.editReply).toHaveBeenCalled();
        });

        it('should reject when target has higher role', async () => {
            const interaction = createMockInteraction();
            // Target has higher role than moderator
            interaction.guild.members.fetch.mockResolvedValue({
                id: 'target-1',
                roles: { highest: { position: 15 } }, // higher than mod's 8
                kick: jest.fn(),
            });

            await kickCommand.run(interaction);

            expect(interaction.editReply).toHaveBeenCalled();
        });

        it('should kick successfully and log', async () => {
            const mockKick = jest.fn().mockResolvedValue(undefined);
            const interaction = createMockInteraction();
            interaction.guild.members.fetch.mockResolvedValue({
                id: 'target-1',
                roles: { highest: { position: 3 } },
                kick: mockKick,
            });

            await kickCommand.run(interaction);

            expect(mockKick).toHaveBeenCalled();
            expect(mockLogModAction).toHaveBeenCalledWith(
                interaction.guild,
                expect.objectContaining({
                    type: 'KICK',
                })
            );
        });

        it('should handle user not found in server', async () => {
            const interaction = createMockInteraction();
            interaction.guild.members.fetch.mockResolvedValue(null);

            await kickCommand.run(interaction);

            expect(interaction.editReply).toHaveBeenCalled();
        });

        it('should use default reason when none provided', async () => {
            const mockKick = jest.fn().mockResolvedValue(undefined);
            const interaction = createMockInteraction();
            interaction.options.getString.mockReturnValue(null); // no reason
            interaction.guild.members.fetch.mockResolvedValue({
                id: 'target-1',
                roles: { highest: { position: 3 } },
                kick: mockKick,
            });

            await kickCommand.run(interaction);

            expect(mockKick).toHaveBeenCalledWith(expect.stringContaining('No reason provided'));
        });
    });
});
