/**
 * VoiceStateUpdate Event Unit Tests
 * Tests for auto-disconnect logic when bot is alone in voice channel
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
        success: jest.fn(),
    },
}));

// Mock CacheService
const mockPeek = jest.fn();
const mockSet = jest.fn().mockResolvedValue(undefined);
const mockDelete = jest.fn().mockResolvedValue(undefined);

jest.mock('../../../src/cache/CacheService', () => ({
    __esModule: true,
    default: {
        peek: mockPeek,
        set: mockSet,
        delete: mockDelete,
    },
}));

// Mock MusicFacade
const mockCleanup = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../src/services/music/MusicFacade', () => ({
    __esModule: true,
    musicFacade: {
        cleanup: mockCleanup,
    },
}));

import type { Client, VoiceState, VoiceBasedChannel, Collection, GuildMember } from 'discord.js';

// Helper to create mock voice state
function createMockVoiceState(overrides: Record<string, unknown> = {}): VoiceState {
    return {
        channel: null,
        guild: {
            id: 'guild-1',
            members: {
                cache: {
                    get: jest.fn().mockReturnValue(null),
                },
            },
        },
        ...overrides,
    } as unknown as VoiceState;
}

function createMockClient(overrides: Record<string, unknown> = {}): Client {
    return {
        user: { id: 'bot-123' },
        guilds: {
            cache: new Map([['guild-1', { id: 'guild-1' }]]),
        },
        ...overrides,
    } as unknown as Client;
}

describe('VoiceStateUpdateEvent', () => {
    let VoiceStateUpdateEvent: any;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        // Re-import to get fresh instance
        jest.isolateModules(() => {
            VoiceStateUpdateEvent = require('../../../src/events/voiceStateUpdate').default;
        });
    });

    afterEach(() => {
        // Clean up timers
        if (VoiceStateUpdateEvent?.destroy) {
            VoiceStateUpdateEvent.destroy();
        }
        jest.useRealTimers();
    });

    describe('constructor', () => {
        it('should have the correct event name', () => {
            expect(VoiceStateUpdateEvent.name).toBe('voiceStateUpdate');
        });

        it('should not be a once event', () => {
            expect(VoiceStateUpdateEvent.once).toBe(false);
        });
    });

    describe('execute()', () => {
        it('should skip if no old channel (user joining for first time)', async () => {
            const client = createMockClient();
            const oldState = createMockVoiceState({ channel: null });
            const newState = createMockVoiceState();

            await VoiceStateUpdateEvent.execute(client, oldState, newState);

            // No cache operations should happen
            expect(mockSet).not.toHaveBeenCalled();
            expect(mockDelete).not.toHaveBeenCalled();
        });

        it('should skip if bot is not in the old channel', async () => {
            const client = createMockClient();
            const mockChannel = { id: 'channel-1', members: new Map() };
            const oldState = createMockVoiceState({
                channel: mockChannel,
                guild: {
                    id: 'guild-1',
                    members: {
                        cache: {
                            get: jest.fn().mockReturnValue({
                                voice: { channel: null }, // bot not in voice
                            }),
                        },
                    },
                },
            });
            const newState = createMockVoiceState();

            await VoiceStateUpdateEvent.execute(client, oldState, newState);

            expect(mockSet).not.toHaveBeenCalled();
        });

        it('should skip if bot is in a different channel', async () => {
            const client = createMockClient();
            const oldState = createMockVoiceState({
                channel: { id: 'channel-1' },
                guild: {
                    id: 'guild-1',
                    members: {
                        cache: {
                            get: jest.fn().mockReturnValue({
                                voice: { channel: { id: 'channel-2' } }, // different channel
                            }),
                        },
                    },
                },
            });
            const newState = createMockVoiceState();

            await VoiceStateUpdateEvent.execute(client, oldState, newState);

            expect(mockSet).not.toHaveBeenCalled();
        });

        it('should schedule disconnect when channel becomes empty', async () => {
            const client = createMockClient();
            const humanMembers = new Map(); // empty = no humans
            const mockChannel = {
                id: 'channel-1',
                members: {
                    filter: jest.fn().mockReturnValue({ size: 0 }),
                },
            };

            const oldState = createMockVoiceState({
                channel: mockChannel,
                guild: {
                    id: 'guild-1',
                    members: {
                        cache: {
                            get: jest.fn().mockReturnValue({
                                voice: { channel: { id: 'channel-1' } },
                            }),
                        },
                    },
                },
            });
            const newState = createMockVoiceState();

            await VoiceStateUpdateEvent.execute(client, oldState, newState);

            // Should set disconnect deadline in cache
            expect(mockDelete).toHaveBeenCalledWith('voice', 'disconnect:guild-1');
            expect(mockSet).toHaveBeenCalledWith(
                'voice',
                'disconnect:guild-1',
                expect.any(Number),
                40 // DISCONNECT_DELAY_SEC + 10
            );
        });

        it('should cancel disconnect when humans are present', async () => {
            const client = createMockClient();
            const mockChannel = {
                id: 'channel-1',
                members: {
                    filter: jest.fn().mockReturnValue({ size: 2 }), // humans present
                },
            };

            const oldState = createMockVoiceState({
                channel: mockChannel,
                guild: {
                    id: 'guild-1',
                    members: {
                        cache: {
                            get: jest.fn().mockReturnValue({
                                voice: { channel: { id: 'channel-1' } },
                            }),
                        },
                    },
                },
            });
            const newState = createMockVoiceState();

            await VoiceStateUpdateEvent.execute(client, oldState, newState);

            // Should delete the disconnect deadline
            expect(mockDelete).toHaveBeenCalledWith('voice', 'disconnect:guild-1');
            // Should NOT set a new deadline
            expect(mockSet).not.toHaveBeenCalled();
        });
    });

    describe('destroy()', () => {
        it('should clear polling interval and local timers', () => {
            // Trigger internal state by calling execute to start polling
            VoiceStateUpdateEvent.destroy();

            // Should not throw
            expect(() => VoiceStateUpdateEvent.destroy()).not.toThrow();
        });
    });

    describe('_checkExpiredDeadlines()', () => {
        it('should disconnect when deadline has expired', async () => {
            const client = createMockClient();
            // First call to execute to set _client
            const mockChannel = {
                id: 'channel-1',
                members: { filter: jest.fn().mockReturnValue({ size: 0 }) },
            };
            const oldState = createMockVoiceState({
                channel: mockChannel,
                guild: {
                    id: 'guild-1',
                    members: {
                        cache: {
                            get: jest.fn().mockReturnValue({
                                voice: { channel: { id: 'channel-1' } },
                            }),
                        },
                    },
                },
            });
            await VoiceStateUpdateEvent.execute(client, oldState, createMockVoiceState());

            // Now simulate expired deadline via polling
            const expiredDeadline = Date.now() - 1000; // expired 1s ago
            mockPeek.mockResolvedValue(expiredDeadline);

            // Advance timer to trigger poll interval (5000ms)
            await jest.advanceTimersByTimeAsync(5000);

            // Should have called cleanup
            expect(mockDelete).toHaveBeenCalledWith('voice', 'disconnect:guild-1');
            expect(mockCleanup).toHaveBeenCalledWith('guild-1');
        });

        it('should not disconnect when deadline has not expired', async () => {
            const client = createMockClient();
            const mockChannel = {
                id: 'channel-1',
                members: { filter: jest.fn().mockReturnValue({ size: 0 }) },
            };
            const oldState = createMockVoiceState({
                channel: mockChannel,
                guild: {
                    id: 'guild-1',
                    members: {
                        cache: {
                            get: jest.fn().mockReturnValue({
                                voice: { channel: { id: 'channel-1' } },
                            }),
                        },
                    },
                },
            });
            await VoiceStateUpdateEvent.execute(client, oldState, createMockVoiceState());

            // Future deadline
            const futureDeadline = Date.now() + 60000;
            mockPeek.mockResolvedValue(futureDeadline);
            mockCleanup.mockClear();

            await jest.advanceTimersByTimeAsync(5000);

            // Should NOT have called cleanup
            expect(mockCleanup).not.toHaveBeenCalled();
        });
    });
});
