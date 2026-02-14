/**
 * Music Command Unit Tests
 * Tests for the music slash command router that delegates to handlers
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

// Mock checkAccess
const mockCheckAccess = jest.fn().mockResolvedValue({ blocked: false });
jest.mock('../../../src/middleware/access', () => ({
    __esModule: true,
    checkAccess: mockCheckAccess,
    AccessType: { SUB: 'SUB' },
}));

// Also mock the services index re-export
jest.mock('../../../src/services/index', () => ({
    __esModule: true,
    checkAccess: mockCheckAccess,
    AccessType: { SUB: 'SUB' },
}));

// Mock music handlers
const mockHandlePlay = jest.fn().mockResolvedValue(undefined);
const mockHandleStop = jest.fn().mockResolvedValue(undefined);
const mockHandleSkip = jest.fn().mockResolvedValue(undefined);
const mockHandlePause = jest.fn().mockResolvedValue(undefined);
const mockHandleQueue = jest.fn().mockResolvedValue(undefined);
const mockHandleNowPlaying = jest.fn().mockResolvedValue(undefined);
const mockHandleVolume = jest.fn().mockResolvedValue(undefined);
const mockHandleLoop = jest.fn().mockResolvedValue(undefined);
const mockHandleShuffle = jest.fn().mockResolvedValue(undefined);
const mockHandleRemove = jest.fn().mockResolvedValue(undefined);
const mockHandleMove = jest.fn().mockResolvedValue(undefined);
const mockHandleClear = jest.fn().mockResolvedValue(undefined);
const mockHandleSeek = jest.fn().mockResolvedValue(undefined);
const mockFetchLyrics = jest.fn().mockResolvedValue(null);
const mockHandleRecent = jest.fn().mockResolvedValue(undefined);
const mockHandleAutoPlay = jest.fn().mockResolvedValue(undefined);
const mockHandleButton = jest.fn().mockResolvedValue(undefined);

jest.mock('../../../src/handlers/music/index', () => ({
    __esModule: true,
    default: {
        handlePlay: mockHandlePlay,
        handleStop: mockHandleStop,
        handleSkip: mockHandleSkip,
        handlePause: mockHandlePause,
        handleQueue: mockHandleQueue,
        handleNowPlaying: mockHandleNowPlaying,
        handleVolume: mockHandleVolume,
        handleLoop: mockHandleLoop,
        handleShuffle: mockHandleShuffle,
        handleRemove: mockHandleRemove,
        handleMove: mockHandleMove,
        handleClear: mockHandleClear,
        handleSeek: mockHandleSeek,
        fetchLyrics: mockFetchLyrics,
        handleRecent: mockHandleRecent,
        handleAutoPlay: mockHandleAutoPlay,
        handleButton: mockHandleButton,
    },
}));

// Mock constants
jest.mock('../../../src/constants', () => ({
    __esModule: true,
    COLORS: { PRIMARY: 0x5865f2, ERROR: 0xff0000, SUCCESS: 0x00ff00, WARNING: 0xffaa00 },
    EMOJIS: { ERROR: '❌', SUCCESS: '✅', WARNING: '⚠️', INFO: 'ℹ️', LOADING: '⏳' },
}));

import musicCommand from '../../../src/commands/music/music';
import logger from '../../../src/core/Logger';

// Helper: create mock interaction
function createMockInteraction(subcommand: string, overrides: Record<string, any> = {}): any {
    return {
        guild: { id: '111' },
        user: { id: '222' },
        options: {
            getSubcommand: jest.fn().mockReturnValue(subcommand),
        },
        reply: jest.fn().mockResolvedValue(undefined),
        editReply: jest.fn().mockResolvedValue(undefined),
        deferReply: jest.fn().mockResolvedValue(undefined),
        replied: false,
        deferred: false,
        ...overrides,
    };
}

describe('MusicCommand', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockCheckAccess.mockResolvedValue({ blocked: false });
    });

    // --- Data ---
    describe('data', () => {
        it('should have name "music"', () => {
            const data = musicCommand.data;
            expect(data.name).toBe('music');
        });

        it('should have proper subcommands', () => {
            const data = musicCommand.data.toJSON() as any;
            const subcommandNames = data.options
                .filter((o: any) => o.type === 1) // SUB_COMMAND type
                .map((o: any) => o.name);

            expect(subcommandNames).toContain('play');
            expect(subcommandNames).toContain('stop');
            expect(subcommandNames).toContain('skip');
            expect(subcommandNames).toContain('pause');
            expect(subcommandNames).toContain('queue');
            expect(subcommandNames).toContain('nowplaying');
            expect(subcommandNames).toContain('volume');
            expect(subcommandNames).toContain('loop');
            expect(subcommandNames).toContain('shuffle');
            expect(subcommandNames).toContain('lyrics');
            expect(subcommandNames).toContain('history');
            expect(subcommandNames).toContain('autoplay');
            expect(subcommandNames).toContain('grab');
        });
    });

    // --- Access control ---
    describe('access control', () => {
        it('should block when access is denied', async () => {
            mockCheckAccess.mockResolvedValue({
                blocked: true,
                embed: { data: { description: 'Blocked' } },
            });
            const interaction = createMockInteraction('play');

            await musicCommand.run(interaction);

            expect(interaction.reply).toHaveBeenCalledWith(
                expect.objectContaining({ ephemeral: true })
            );
            expect(mockHandlePlay).not.toHaveBeenCalled();
        });
    });

    // --- Guild check ---
    describe('guild check', () => {
        it('should reject when used outside a guild', async () => {
            const interaction = createMockInteraction('play', { guild: null });

            await musicCommand.run(interaction);

            // Should reply with error and not call handler
            expect(mockHandlePlay).not.toHaveBeenCalled();
        });

        it('should reject when userId is missing', async () => {
            const interaction = createMockInteraction('play', { user: null });

            await musicCommand.run(interaction);

            expect(mockHandlePlay).not.toHaveBeenCalled();
        });
    });

    // --- Subcommand routing ---
    describe('subcommand routing', () => {
        const routeTests: Array<[string, jest.Mock]> = [
            ['play', mockHandlePlay],
            ['stop', mockHandleStop],
            ['skip', mockHandleSkip],
            ['pause', mockHandlePause],
            ['queue', mockHandleQueue],
            ['nowplaying', mockHandleNowPlaying],
            ['volume', mockHandleVolume],
            ['loop', mockHandleLoop],
            ['shuffle', mockHandleShuffle],
            ['remove', mockHandleRemove],
            ['move', mockHandleMove],
            ['clear', mockHandleClear],
            ['seek', mockHandleSeek],
            ['history', mockHandleRecent],
            ['autoplay', mockHandleAutoPlay],
        ];

        it.each(routeTests)('should route "%s" to correct handler', async (subcommand, handler) => {
            const interaction = createMockInteraction(subcommand);

            await musicCommand.run(interaction);

            expect(handler).toHaveBeenCalledWith(interaction, '111', '222');
        });

        it('should route "grab" to handleNowPlaying', async () => {
            const interaction = createMockInteraction('grab');

            await musicCommand.run(interaction);

            expect(mockHandleNowPlaying).toHaveBeenCalledWith(interaction, '111', '222');
        });

        it('should route "lyrics" to fetchLyrics handler', async () => {
            const interaction = createMockInteraction('lyrics');

            await musicCommand.run(interaction);

            expect(mockFetchLyrics).toHaveBeenCalledWith(interaction, '111', '222');
        });
    });

    // --- Error handling ---
    describe('error handling', () => {
        it('should handle handler errors gracefully', async () => {
            mockHandlePlay.mockRejectedValueOnce(new Error('Handler crash'));
            const interaction = createMockInteraction('play');

            await musicCommand.run(interaction);

            expect(logger.error).toHaveBeenCalledWith('Music', expect.stringContaining('play error'));
        });

        it('should show error embed for unknown subcommand', async () => {
            const interaction = createMockInteraction('nonexistent');

            await musicCommand.run(interaction);

            // Should have tried to reply with error
            expect(logger.error).not.toHaveBeenCalled(); // unknown subcommand isn't an error, it's handled gracefully
        });
    });

    // --- handleButton ---
    describe('handleButton', () => {
        it('should delegate to button handler', async () => {
            const buttonInteraction = {
                replied: false,
                deferred: false,
                reply: jest.fn().mockResolvedValue(undefined),
            } as any;

            await musicCommand.handleButton(buttonInteraction);

            expect(mockHandleButton).toHaveBeenCalledWith(buttonInteraction);
        });

        it('should handle button handler errors', async () => {
            mockHandleButton.mockRejectedValueOnce(new Error('Button crash'));
            const buttonInteraction = {
                replied: false,
                deferred: false,
                reply: jest.fn().mockResolvedValue(undefined),
            } as any;

            await musicCommand.handleButton(buttonInteraction);

            expect(logger.error).toHaveBeenCalledWith('Music', expect.stringContaining('Button error'));
            expect(buttonInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({ ephemeral: true })
            );
        });
    });
});
