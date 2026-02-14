/**
 * Help Command Unit Tests
 * Tests for help command metadata, embed building, and button navigation
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

import helpCommand from '../../../src/commands/general/help';

// Helpers
function createMockInteraction(overrides: Record<string, unknown> = {}) {
    const mockCollector = {
        on: jest.fn().mockReturnThis(),
    };

    return {
        user: {
            id: 'user-1',
            tag: 'TestUser#0001',
            username: 'TestUser',
            displayAvatarURL: jest.fn().mockReturnValue('https://example.com/avatar.png'),
        },
        client: {
            user: { id: 'bot-1' },
        },
        guild: { id: 'guild-1', name: 'Test Server' },
        member: {
            id: 'user-1',
            permissions: { has: jest.fn().mockReturnValue(true) },
        },
        options: {
            getSubcommand: jest.fn(),
        },
        reply: jest.fn().mockResolvedValue({
            createMessageComponentCollector: jest.fn().mockReturnValue(mockCollector),
        }),
        editReply: jest.fn().mockResolvedValue({}),
        replied: false,
        deferred: false,
        channel: { type: 0 },
        ...overrides,
    } as any;
}

describe('HelpCommand', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('metadata', () => {
        it('should have correct command name', () => {
            expect(helpCommand.data.name).toBe('help');
        });

        it('should have correct description', () => {
            expect(helpCommand.data.description).toBe('Shows a list of all available commands');
        });

        it('should have GENERAL category', () => {
            expect(helpCommand.category).toBe('general');
        });

        it('should have 5 second cooldown', () => {
            expect(helpCommand.cooldown).toBe(5);
        });
    });

    describe('run()', () => {
        it('should reply with embed and button components', async () => {
            const interaction = createMockInteraction();

            await helpCommand.run(interaction);

            expect(interaction.reply).toHaveBeenCalledTimes(1);
            const call = interaction.reply.mock.calls[0][0];
            expect(call.embeds).toBeDefined();
            expect(call.embeds.length).toBe(1);
            expect(call.components).toBeDefined();
            expect(call.components.length).toBe(2); // 2 button rows
            expect(call.fetchReply).toBe(true);
        });

        it('should show home category embed by default', async () => {
            const interaction = createMockInteraction();

            await helpCommand.run(interaction);

            const call = interaction.reply.mock.calls[0][0];
            const embed = call.embeds[0];
            expect(embed.data.title).toContain('Help Menu');
        });

        it('should set up a button collector', async () => {
            const mockCollector = { on: jest.fn().mockReturnThis() };
            const interaction = createMockInteraction();
            interaction.reply.mockResolvedValue({
                createMessageComponentCollector: jest.fn().mockReturnValue(mockCollector),
            });

            await helpCommand.run(interaction);

            expect(mockCollector.on).toHaveBeenCalledWith('collect', expect.any(Function));
            expect(mockCollector.on).toHaveBeenCalledWith('end', expect.any(Function));
        });

        it('should include all 6 category fields in home embed', async () => {
            const interaction = createMockInteraction();

            await helpCommand.run(interaction);

            const call = interaction.reply.mock.calls[0][0];
            const embed = call.embeds[0];
            const fields = embed.data.fields || [];
            expect(fields.length).toBe(6);
            const fieldNames = fields.map((f: any) => f.name);
            expect(fieldNames).toContain('🎬 Media');
            expect(fieldNames).toContain('🎵 Music');
            expect(fieldNames).toContain('⚔️ Fun');
            expect(fieldNames).toContain('📋 Utility');
            expect(fieldNames).toContain('🛡️ Admin');
            expect(fieldNames).toContain('⚙️ Moderation');
        });

        it('should have navigation buttons with correct IDs', async () => {
            const interaction = createMockInteraction();

            await helpCommand.run(interaction);

            const call = interaction.reply.mock.calls[0][0];
            const row1Buttons = call.components[0].components;
            const row2Buttons = call.components[1].components;

            // Row 1: home, media, music, fun
            expect(row1Buttons[0].data.custom_id).toBe('help_home');
            expect(row1Buttons[1].data.custom_id).toBe('help_media');
            expect(row1Buttons[2].data.custom_id).toBe('help_music');
            expect(row1Buttons[3].data.custom_id).toBe('help_fun');

            // Row 2: utility, admin, moderation
            expect(row2Buttons[0].data.custom_id).toBe('help_utility');
            expect(row2Buttons[1].data.custom_id).toBe('help_admin');
            expect(row2Buttons[2].data.custom_id).toBe('help_moderation');
        });

        it('should disable home button on home page', async () => {
            const interaction = createMockInteraction();

            await helpCommand.run(interaction);

            const call = interaction.reply.mock.calls[0][0];
            const homeButton = call.components[0].components[0];
            expect(homeButton.data.disabled).toBe(true);
        });

        it('should include footer with user tag', async () => {
            const interaction = createMockInteraction();

            await helpCommand.run(interaction);

            const call = interaction.reply.mock.calls[0][0];
            const embed = call.embeds[0];
            expect(embed.data.footer?.text).toContain('TestUser#0001');
        });
    });
});
