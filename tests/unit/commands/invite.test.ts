/**
 * Invite Command Unit Tests
 * Tests for the bot invite link generation
 */

// Mock Logger
jest.mock('../../../src/core/Logger', () => ({
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
jest.mock('../../../src/core/metrics', () => ({
    __esModule: true,
    trackCommand: jest.fn(),
    commandsActive: { inc: jest.fn(), dec: jest.fn() },
    commandErrorsTotal: { inc: jest.fn() },
}));

// Mock owner config
jest.mock('../../../src/config/owner', () => ({
    __esModule: true,
    isOwner: jest.fn().mockReturnValue(false),
}));

// Mock cooldown
jest.mock('../../../src/utils/common/cooldown', () => ({
    __esModule: true,
    globalCooldownManager: {
        check: jest.fn().mockResolvedValue({ onCooldown: false }),
        set: jest.fn(),
    },
}));

// Mock constants
jest.mock('../../../src/constants', () => ({
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
jest.mock('../../../src/errors/index', () => ({
    __esModule: true,
    AppError: class AppError extends Error {},
    ValidationError: class ValidationError extends Error {},
    PermissionError: class PermissionError extends Error {},
}));

// Mock config/index (dynamic import inside the command)
jest.mock('../../../src/config/index', () => ({
    __esModule: true,
    bot: { clientId: 'test-client-id-123' },
}));

import inviteCommand from '../../../src/commands/general/invite';

describe('InviteCommand', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('metadata', () => {
        it('should have correct command name', () => {
            expect(inviteCommand.data.name).toBe('invite');
        });

        it('should have correct category', () => {
            expect(inviteCommand.category).toBe('general');
        });

        it('should be ephemeral', () => {
            expect(inviteCommand.ephemeral).toBe(true);
        });

        it('should have 10s cooldown', () => {
            expect(inviteCommand.cooldown).toBe(10);
        });
    });

    describe('run()', () => {
        function createInteraction() {
            return {
                user: {
                    id: 'user-1',
                    tag: 'TestUser#0001',
                    username: 'TestUser',
                    displayAvatarURL: jest.fn().mockReturnValue('https://example.com/avatar.png'),
                },
                client: {
                    user: {
                        id: 'bot-1',
                        displayAvatarURL: jest.fn().mockReturnValue('https://example.com/bot.png'),
                    },
                },
                guild: { id: 'guild-1' },
                member: { permissions: { has: jest.fn().mockReturnValue(true) } },
                reply: jest.fn().mockResolvedValue({}),
                editReply: jest.fn().mockResolvedValue({}),
                replied: false,
                deferred: false,
                channel: { type: 0 },
                options: {
                    getString: jest.fn(),
                    getInteger: jest.fn(),
                    getUser: jest.fn(),
                    getSubcommand: jest.fn(),
                },
            } as any;
        }

        it('should reply with invite embed and buttons', async () => {
            const interaction = createInteraction();

            await inviteCommand.run(interaction);

            expect(interaction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.any(Array),
                    components: expect.any(Array),
                    ephemeral: true,
                })
            );
        });

        it('should include 3 invite buttons', async () => {
            const interaction = createInteraction();

            await inviteCommand.run(interaction);

            const call = interaction.reply.mock.calls[0][0];
            expect(call.components).toHaveLength(1); // 1 action row
            const row = call.components[0];
            expect(row.components).toHaveLength(3); // 3 buttons
        });

        it('should generate correct invite URLs with client ID', async () => {
            const interaction = createInteraction();

            await inviteCommand.run(interaction);

            const call = interaction.reply.mock.calls[0][0];
            const buttons = call.components[0].components;

            // All buttons should contain the client ID
            for (const button of buttons) {
                expect(button.data.url).toContain('test-client-id-123');
            }
        });

        it('should include Full Access, Music Only, and Basic options', async () => {
            const interaction = createInteraction();

            await inviteCommand.run(interaction);

            const call = interaction.reply.mock.calls[0][0];
            const embed = call.embeds[0];
            const fieldNames = embed.data.fields?.map((f: any) => f.name) || [];

            expect(fieldNames).toContain('👑 Full Access');
            expect(fieldNames).toContain('🎵 Music Only');
            expect(fieldNames).toContain('📋 Basic');
        });
    });
});
