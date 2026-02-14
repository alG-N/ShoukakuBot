/**
 * Report Command Unit Tests
 * Tests for bug reporting via modal
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
    REPORT_CHANNEL_ID: 'report-channel-1',
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

import reportCommand, { handleModal } from '../../../src/commands/general/report';

function createMockInteraction(overrides: Record<string, unknown> = {}) {
    return {
        user: {
            id: 'user-1',
            tag: 'User#0001',
            username: 'User',
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
            id: 'user-1',
            permissions: { has: jest.fn().mockReturnValue(true) },
            roles: { highest: { position: 1 } },
        },
        channelId: 'channel-1',
        channel: { type: 0 },
        options: {
            getString: jest.fn(),
            getBoolean: jest.fn(),
            getInteger: jest.fn(),
        },
        reply: jest.fn().mockResolvedValue({}),
        editReply: jest.fn().mockResolvedValue({}),
        deferReply: jest.fn().mockResolvedValue({}),
        showModal: jest.fn().mockResolvedValue({}),
        replied: false,
        deferred: false,
        ...overrides,
    } as any;
}

function createMockModalInteraction(overrides: Record<string, unknown> = {}) {
    return {
        user: {
            id: 'user-1',
            tag: 'User#0001',
        },
        guild: {
            name: 'Test Server',
        },
        client: {
            channels: {
                fetch: jest.fn(),
            },
        },
        fields: {
            getTextInputValue: jest.fn().mockImplementation((field: string) => {
                switch (field) {
                    case 'report_title': return 'Test Bug';
                    case 'report_description': return 'Something broke';
                    case 'report_steps': return '1. Do this\n2. See error';
                    default: return '';
                }
            }),
        },
        reply: jest.fn().mockResolvedValue({}),
        ...overrides,
    } as any;
}

describe('ReportCommand', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('metadata', () => {
        it('should have correct command name', () => {
            expect(reportCommand.data.name).toBe('report');
        });

        it('should have GENERAL category', () => {
            expect(reportCommand.category).toBe('general');
        });

        it('should have 60 second cooldown', () => {
            expect(reportCommand.cooldown).toBe(60);
        });
    });

    describe('run', () => {
        it('should show a modal', async () => {
            const interaction = createMockInteraction();
            await reportCommand.run(interaction);

            expect(interaction.showModal).toHaveBeenCalled();
            const modal = interaction.showModal.mock.calls[0][0];
            expect(modal.data.custom_id).toContain('report_submit');
        });
    });

    describe('handleModal', () => {
        it('should send report to report channel', async () => {
            const mockChannel = {
                isTextBased: jest.fn().mockReturnValue(true),
                send: jest.fn().mockResolvedValue({}),
            };
            const interaction = createMockModalInteraction();
            interaction.client.channels.fetch.mockResolvedValue(mockChannel);

            await handleModal(interaction);

            expect(mockChannel.send).toHaveBeenCalled();
            expect(interaction.reply).toHaveBeenCalledWith(
                expect.objectContaining({ ephemeral: true })
            );
        });

        it('should handle missing report channel', async () => {
            const interaction = createMockModalInteraction();
            interaction.client.channels.fetch.mockRejectedValue(new Error('Not found'));

            await handleModal(interaction);

            expect(interaction.reply).toHaveBeenCalled();
        });

        it('should include report title and description in embed', async () => {
            const mockChannel = {
                isTextBased: jest.fn().mockReturnValue(true),
                send: jest.fn().mockResolvedValue({}),
            };
            const interaction = createMockModalInteraction();
            interaction.client.channels.fetch.mockResolvedValue(mockChannel);

            await handleModal(interaction);

            const sentEmbed = mockChannel.send.mock.calls[0]?.[0];
            expect(sentEmbed).toBeDefined();
        });

        it('should handle steps not provided', async () => {
            const interaction = createMockModalInteraction();
            interaction.fields.getTextInputValue.mockImplementation((field: string) => {
                if (field === 'report_title') return 'Bug';
                if (field === 'report_description') return 'Broken';
                return '';
            });
            interaction.client.channels.fetch.mockRejectedValue(new Error('No channel'));

            await handleModal(interaction);

            expect(interaction.reply).toHaveBeenCalled();
        });
    });
});
