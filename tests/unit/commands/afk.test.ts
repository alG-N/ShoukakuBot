/**
 * AFK Command Unit Tests
 * Tests for utility functions and command logic
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

// Mock errors
jest.mock('../../../src/errors/index', () => ({
    __esModule: true,
    AppError: class AppError extends Error {},
    ValidationError: class ValidationError extends Error {},
    PermissionError: class PermissionError extends Error {},
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

// Mock AfkRepository
const mockSetAfk = jest.fn();
const mockRemoveAfk = jest.fn();
const mockGetMultipleAfk = jest.fn();

jest.mock('../../../src/repositories/general/AfkRepository', () => ({
    __esModule: true,
    default: {
        setAfk: mockSetAfk,
        removeAfk: mockRemoveAfk,
        getMultipleAfk: mockGetMultipleAfk,
    },
}));

import afkCommand, { formatDuration, removeAfk, onMessage } from '../../../src/commands/general/afk';

describe('AFK Command', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // ========== formatDuration() ==========
    describe('formatDuration()', () => {
        it('should format seconds only', () => {
            expect(formatDuration(30)).toBe('30s');
        });

        it('should format minutes only', () => {
            expect(formatDuration(120)).toBe('2m');
        });

        it('should format minutes and seconds', () => {
            expect(formatDuration(90)).toBe('1m 30s');
        });

        it('should format hours only', () => {
            expect(formatDuration(7200)).toBe('2h');
        });

        it('should format hours and minutes', () => {
            expect(formatDuration(3660)).toBe('1h 1m');
        });

        it('should format days only', () => {
            expect(formatDuration(172800)).toBe('2d');
        });

        it('should format days and hours', () => {
            expect(formatDuration(90000)).toBe('1d 1h');
        });

        it('should handle zero', () => {
            expect(formatDuration(0)).toBe('0s');
        });
    });

    // ========== removeAfk() ==========
    describe('removeAfk()', () => {
        it('should delegate to repository', async () => {
            const afkInfo = { userId: 'user-1', reason: 'test', timestamp: Date.now() };
            mockRemoveAfk.mockResolvedValue(afkInfo);

            const result = await removeAfk('user-1', 'guild-1');

            expect(mockRemoveAfk).toHaveBeenCalledWith('user-1', 'guild-1');
            expect(result).toEqual(afkInfo);
        });

        it('should return null when not AFK', async () => {
            mockRemoveAfk.mockResolvedValue(null);

            const result = await removeAfk('user-1', 'guild-1');

            expect(result).toBeNull();
        });
    });

    // ========== Command Metadata ==========
    describe('metadata', () => {
        it('should have correct command name', () => {
            expect(afkCommand.data.name).toBe('afk');
        });

        it('should have correct category', () => {
            expect(afkCommand.category).toBe('general');
        });

        it('should have 10s cooldown', () => {
            expect(afkCommand.cooldown).toBe(10);
        });
    });

    // ========== run() ==========
    describe('run()', () => {
        function createInteraction(opts: Record<string, unknown> = {}) {
            return {
                user: {
                    id: 'user-1',
                    tag: 'TestUser#0001',
                    username: 'TestUser',
                    displayAvatarURL: jest.fn().mockReturnValue('https://example.com/avatar.png'),
                },
                client: {
                    user: { displayAvatarURL: jest.fn().mockReturnValue('https://example.com/bot.png') },
                },
                guild: { id: 'guild-1' },
                member: { permissions: { has: jest.fn().mockReturnValue(true) } },
                options: {
                    getString: jest.fn().mockImplementation((name: string) => {
                        if (name === 'type') return null; // default to guild
                        if (name === 'reason') return null;
                        return null;
                    }),
                },
                reply: jest.fn().mockResolvedValue({}),
                editReply: jest.fn().mockResolvedValue({}),
                replied: false,
                deferred: false,
                channel: { type: 0 },
                ...opts,
            } as any;
        }

        it('should set AFK successfully', async () => {
            mockSetAfk.mockResolvedValue(true);
            const interaction = createInteraction();

            await afkCommand.run(interaction);

            expect(mockSetAfk).toHaveBeenCalledWith({
                userId: 'user-1',
                guildId: 'guild-1',
                reason: 'No reason provided.',
                type: 'guild',
            });
            expect(interaction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: 'AFK mode activated!',
                            }),
                        }),
                    ]),
                })
            );
        });

        it('should handle global AFK type', async () => {
            mockSetAfk.mockResolvedValue(true);
            const interaction = createInteraction({
                options: {
                    getString: jest.fn().mockImplementation((name: string) => {
                        if (name === 'type') return 'global';
                        if (name === 'reason') return 'Going to sleep';
                        return null;
                    }),
                },
            });

            await afkCommand.run(interaction);

            expect(mockSetAfk).toHaveBeenCalledWith({
                userId: 'user-1',
                guildId: null, // global = null guildId
                reason: 'Going to sleep',
                type: 'global',
            });
        });

        it('should show error when setAfk fails', async () => {
            mockSetAfk.mockResolvedValue(false);
            const interaction = createInteraction();

            await afkCommand.run(interaction);

            expect(interaction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('Failed to set AFK'),
                    ephemeral: true,
                })
            );
        });
    });

    // ========== onMessage() (deprecated but still exported) ==========
    describe('onMessage()', () => {
        function createMessage(overrides: Record<string, unknown> = {}) {
            return {
                author: { bot: false, id: 'user-1', displayAvatarURL: jest.fn().mockReturnValue('url') },
                guild: { id: 'guild-1' },
                mentions: { users: new Map() },
                reply: jest.fn().mockResolvedValue({
                    delete: jest.fn().mockResolvedValue(undefined),
                }),
                ...overrides,
            } as any;
        }

        function createClient() {
            return {
                user: { displayAvatarURL: jest.fn().mockReturnValue('url') },
            } as any;
        }

        it('should skip bot messages', async () => {
            const message = createMessage({ author: { bot: true, id: 'bot-1' } });
            await onMessage(message, createClient());
            expect(mockRemoveAfk).not.toHaveBeenCalled();
        });

        it('should skip DM messages', async () => {
            const message = createMessage({ guild: null });
            await onMessage(message, createClient());
            expect(mockRemoveAfk).not.toHaveBeenCalled();
        });

        it('should remove AFK status when user sends a message', async () => {
            const afkInfo = { userId: 'user-1', reason: 'brb', timestamp: Date.now() - 60000 };
            mockRemoveAfk.mockResolvedValue(afkInfo);

            const mockReplyMsg = {
                delete: jest.fn().mockResolvedValue(undefined),
            };
            const message = createMessage();
            message.reply.mockResolvedValue(mockReplyMsg);
            
            await onMessage(message, createClient());

            expect(mockRemoveAfk).toHaveBeenCalledWith('user-1', 'guild-1');
            // reply is fire-and-forget (.then().catch()), so it may be called
            // but the important thing is the removeAfk was called
        });

        it('should notify when mentioning AFK user', async () => {
            mockRemoveAfk.mockResolvedValue(null); // author not AFK
            const mentionedUsers = new Map([
                ['mentioned-1', { id: 'mentioned-1', username: 'AFKUser' }],
            ]);
            mockGetMultipleAfk.mockResolvedValue(
                new Map([['mentioned-1', { reason: 'sleeping', timestamp: Date.now() - 3600000 }]])
            );

            const message = createMessage({
                mentions: { users: mentionedUsers },
            });
            await onMessage(message, createClient());

            // Should have checked mentions
            expect(mockGetMultipleAfk).toHaveBeenCalledWith(['mentioned-1'], 'guild-1');
        });
    });
});
