/**
 * MusicFacade Integration Tests
 * Tests for the orchestration layer that coordinates all music sub-services
 */

// Mock Logger
jest.mock('../../../../src/core/Logger', () => ({
    __esModule: true,
    default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), success: jest.fn() },
}));

// Mock metrics
jest.mock('../../../../src/core/metrics', () => ({
    __esModule: true,
    updateMusicMetrics: jest.fn(),
    musicTracksPlayedTotal: { inc: jest.fn() },
}));

// Mock music config
jest.mock('../../../../src/config/features/music', () => ({
    __esModule: true,
    TRACK_TRANSITION_DELAY: 10, // Very short for tests
}));

// Mock QueueService
const mockQueueService = {
    getOrCreate: jest.fn(),
    get: jest.fn(),
    getTracks: jest.fn().mockReturnValue([]),
    getLength: jest.fn().mockReturnValue(0),
    getCurrentTrack: jest.fn(),
    setCurrentTrack: jest.fn(),
    getLoopMode: jest.fn().mockReturnValue('off'),
    setLoopMode: jest.fn(),
    cycleLoopMode: jest.fn().mockReturnValue('track'),
    resetLoopCount: jest.fn(),
    getNextTrack: jest.fn(),
    addTrack: jest.fn(),
    clear: jest.fn(),
    endSkipVote: jest.fn(),
    setVolume: jest.fn((_, v: number) => Math.max(0, Math.min(200, v))),
    getVolume: jest.fn().mockReturnValue(100),
    isAutoPlayEnabled: jest.fn().mockReturnValue(false),
    toggleAutoPlay: jest.fn(),
    isShuffled: jest.fn().mockReturnValue(false),
    toggleShuffle: jest.fn(),
    moveTrack: jest.fn(),
    getState: jest.fn(),
};

jest.mock('../../../../src/services/music/queue/index', () => ({
    __esModule: true,
    queueService: mockQueueService,
    QueueService: class {},
    default: mockQueueService,
}));

// Mock PlaybackService
const mockPlayer = {
    paused: false,
    position: 0,
    playTrack: jest.fn().mockResolvedValue(undefined),
    stopTrack: jest.fn().mockResolvedValue(undefined),
    setPaused: jest.fn().mockResolvedValue(undefined),
    setGlobalVolume: jest.fn().mockResolvedValue(undefined),
};

const mockPlaybackService = {
    getPlayer: jest.fn().mockReturnValue(mockPlayer),
    isLavalinkReady: jest.fn().mockReturnValue(true),
    acquireTransitionLock: jest.fn().mockResolvedValue(true),
    releaseTransitionLock: jest.fn(),
    search: jest.fn(),
    searchPlaylist: jest.fn(),
    getTransitionMutex: jest.fn().mockReturnValue({ acquire: jest.fn(), release: jest.fn(), isLocked: jest.fn() }),
};

jest.mock('../../../../src/services/music/playback/index', () => ({
    __esModule: true,
    playbackService: mockPlaybackService,
    PlaybackService: class {},
    default: mockPlaybackService,
}));

// Mock VoiceConnectionService
const mockVoiceService = {
    connect: jest.fn(),
    disconnect: jest.fn(),
    isConnected: jest.fn().mockReturnValue(false),
    getVoiceChannelId: jest.fn(),
    bindPlayerEvents: jest.fn(),
    unbindPlayerEvents: jest.fn(),
    areEventsBound: jest.fn().mockReturnValue(false),
    setInactivityTimer: jest.fn(),
    clearInactivityTimer: jest.fn(),
    startVCMonitor: jest.fn(),
    stopVCMonitor: jest.fn(),
    getListenerCount: jest.fn().mockReturnValue(3),
    getListeners: jest.fn().mockReturnValue([]),
    shutdownAll: jest.fn(),
};

jest.mock('../../../../src/services/music/voice/index', () => ({
    __esModule: true,
    voiceConnectionService: mockVoiceService,
    VoiceConnectionService: class {},
    default: mockVoiceService,
}));

// Mock AutoPlayService
const mockAutoPlayService = {
    findSimilarTrack: jest.fn(),
};

jest.mock('../../../../src/services/music/autoplay/index', () => ({
    __esModule: true,
    autoPlayService: mockAutoPlayService,
    AutoPlayService: class {},
    default: mockAutoPlayService,
}));

// Mock MusicEventBus
const mockMusicEventBus = {
    emitEvent: jest.fn(),
    emitCleanup: jest.fn(),
    subscribe: jest.fn().mockReturnValue(() => {}),
    subscribeGuild: jest.fn().mockReturnValue(() => {}),
    removeGuildListeners: jest.fn(),
    getStats: jest.fn().mockReturnValue({ totalEvents: 0 }),
    shutdown: jest.fn(),
};

const mockMusicEvents = {
    TRACK_START: 'track:start',
    TRACK_END: 'track:end',
    TRACK_SKIP: 'track:skip',
    TRACK_EXCEPTION: 'track:exception',
    TRACK_STUCK: 'track:stuck',
    QUEUE_ADD: 'queue:add',
    QUEUE_ADD_MANY: 'queue:addMany',
    QUEUE_REMOVE: 'queue:remove',
    QUEUE_CLEAR: 'queue:clear',
    QUEUE_MOVE: 'queue:move',
    QUEUE_SHUFFLE: 'queue:shuffle',
    PLAYBACK_PAUSE: 'playback:pause',
    PLAYBACK_RESUME: 'playback:resume',
    PLAYBACK_STOP: 'playback:stop',
    LOOP_CHANGE: 'loop:change',
    VOLUME_CHANGE: 'volume:change',
    AUTOPLAY_TOGGLE: 'autoplay:toggle',
    SKIPVOTE_START: 'skipvote:start',
    SKIPVOTE_ADD: 'skipvote:add',
    CLEANUP_COMPLETE: 'cleanup:complete',
};

const mockPlaybackEventHandler = {
    initialize: jest.fn(),
    shutdown: jest.fn(),
};

jest.mock('../../../../src/services/music/events/index', () => ({
    __esModule: true,
    musicEventBus: mockMusicEventBus,
    MusicEvents: mockMusicEvents,
    playbackEventHandler: mockPlaybackEventHandler,
}));

// Mock MusicCacheFacade
const mockMusicCache = {
    queueCache: { getStats: jest.fn().mockReturnValue({ activeQueues: 0, totalTracks: 0 }) },
    getQueue: jest.fn(),
    addTrack: jest.fn().mockReturnValue(1),
    addTrackToFront: jest.fn().mockReturnValue(1),
    addTracks: jest.fn().mockReturnValue([]),
    removeTrack: jest.fn(),
    getNextTrack: jest.fn(),
    getNowPlayingMessage: jest.fn().mockReturnValue(null),
    setNowPlayingMessage: jest.fn(),
    clearNowPlayingMessage: jest.fn(),
    setCurrentTrack: jest.fn(),
    resetLoopCount: jest.fn(),
    getLoopCount: jest.fn().mockReturnValue(0),
    incrementLoopCount: jest.fn().mockReturnValue(1),
    getVoteSkipStatus: jest.fn().mockReturnValue({ count: 0, required: 0 }),
    startSkipVote: jest.fn(),
    addSkipVote: jest.fn(),
    endSkipVote: jest.fn(),
    hasActiveSkipVote: jest.fn().mockReturnValue(false),
    hasEnoughSkipVotes: jest.fn().mockReturnValue(false),
    deleteQueue: jest.fn(),
    getRecentlyPlayed: jest.fn().mockReturnValue([]),
    addFavorite: jest.fn(),
    removeFavorite: jest.fn(),
    getFavorites: jest.fn().mockReturnValue([]),
    isFavorited: jest.fn().mockReturnValue(false),
    addToHistory: jest.fn(),
    getHistory: jest.fn().mockReturnValue([]),
    clearHistory: jest.fn(),
    getPreferences: jest.fn(),
    setPreferences: jest.fn(),
};

jest.mock('../../../../src/cache/music/MusicCacheFacade', () => ({
    __esModule: true,
    default: mockMusicCache,
}));

// Mock trackHandler
const mockTrackHandler = {
    createNowPlayingEmbed: jest.fn().mockReturnValue({ fields: [] }),
    createControlButtons: jest.fn().mockReturnValue([]),
    createInfoEmbed: jest.fn().mockReturnValue({ fields: [] }),
    createQueueFinishedEmbed: jest.fn().mockReturnValue({ fields: [] }),
};

jest.mock('../../../../src/handlers/music/trackHandler', () => ({
    __esModule: true,
    default: mockTrackHandler,
}));

import { musicFacade, MusicFacade } from '../../../../src/services/music/MusicFacade.js';

function makeTrack(title: string) {
    return {
        title,
        url: `https://yt.com/${title}`,
        track: { encoded: `enc_${title}` },
        info: { title, author: 'Artist', sourceName: 'youtube' },
        requestedBy: { id: 'user1', username: 'TestUser' },
    };
}

describe('MusicFacade', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockPlayer.paused = false;
        mockPlaybackService.getPlayer.mockReturnValue(mockPlayer);
        mockMusicCache.getQueue.mockReturnValue(null);
        mockMusicCache.getNowPlayingMessage.mockReturnValue(null);
    });

    describe('constructor', () => {
        it('should expose sub-services', () => {
            expect(musicFacade.queueService).toBeDefined();
            expect(musicFacade.playbackService).toBeDefined();
            expect(musicFacade.voiceService).toBeDefined();
            expect(musicFacade.autoPlayService).toBeDefined();
            expect(musicFacade.eventBus).toBeDefined();
        });
    });

    describe('updateMetrics', () => {
        it('should update metrics from queue stats', () => {
            const { updateMusicMetrics } = require('../../../../src/core/metrics');
            mockMusicCache.queueCache.getStats.mockReturnValue({ activeQueues: 3, totalTracks: 15 });
            musicFacade.updateMetrics();
            expect(updateMusicMetrics).toHaveBeenCalledWith({
                activePlayers: 3,
                totalQueueSize: 15,
                voiceConnections: 3,
            });
        });

        it('should not throw on metric update error', () => {
            mockMusicCache.queueCache.getStats.mockImplementation(() => { throw new Error('fail'); });
            expect(() => musicFacade.updateMetrics()).not.toThrow();
        });
    });

    describe('initializeEventHandler', () => {
        it('should initialize playback event handler once', () => {
            // Reset the initialized state by creating a new instance
            const facade = new MusicFacade();
            facade.initializeEventHandler();
            facade.initializeEventHandler(); // second call should be no-op
            expect(mockPlaybackEventHandler.initialize).toHaveBeenCalledTimes(1);
        });
    });

    describe('Queue Operations', () => {
        it('should get queue', () => {
            const queue = { tracks: [], currentTrack: null };
            mockQueueService.getOrCreate.mockReturnValue(queue);
            expect(musicFacade.getQueue('guild1')).toBe(queue);
        });

        it('should get queue list', () => {
            const tracks = [makeTrack('A'), makeTrack('B')];
            mockQueueService.getTracks.mockReturnValue(tracks);
            expect(musicFacade.getQueueList('guild1')).toBe(tracks);
        });

        it('should get queue length', () => {
            mockQueueService.getLength.mockReturnValue(5);
            expect(musicFacade.getQueueLength('guild1')).toBe(5);
        });

        it('should get current track', () => {
            const track = makeTrack('Playing');
            mockQueueService.getCurrentTrack.mockReturnValue(track);
            expect(musicFacade.getCurrentTrack('guild1')).toBe(track);
        });

        it('should add track and emit event', () => {
            const track = makeTrack('New');
            mockMusicCache.addTrack.mockReturnValue(3);
            const result = musicFacade.addTrack('guild1', track);
            expect(result).toBe(3);
            expect(mockMusicEventBus.emitEvent).toHaveBeenCalledWith('queue:add', expect.objectContaining({ guildId: 'guild1', track }));
        });

        it('should add track to front and emit event', () => {
            const track = makeTrack('Priority');
            mockMusicCache.addTrackToFront.mockReturnValue(1);
            const result = musicFacade.addTrackToFront('guild1', track);
            expect(result).toBe(1);
            expect(mockMusicEventBus.emitEvent).toHaveBeenCalledWith('queue:add', expect.objectContaining({ position: 'front' }));
        });

        it('should add multiple tracks and emit event', () => {
            const tracks = [makeTrack('A'), makeTrack('B')];
            mockMusicCache.addTracks.mockReturnValue(tracks);
            musicFacade.addTracks('guild1', tracks);
            expect(mockMusicEventBus.emitEvent).toHaveBeenCalledWith('queue:addMany', expect.objectContaining({ count: 2 }));
        });

        it('should remove track and emit event', () => {
            const track = makeTrack('Removed');
            mockMusicCache.getQueue.mockReturnValue({ tracks: [makeTrack('A'), track] });
            mockMusicCache.removeTrack.mockReturnValue(track);
            musicFacade.removeTrack('guild1', 1);
            expect(mockMusicEventBus.emitEvent).toHaveBeenCalledWith('queue:remove', expect.objectContaining({ index: 1 }));
        });

        it('should clear queue and emit event', () => {
            musicFacade.clearQueue('guild1');
            expect(mockQueueService.clear).toHaveBeenCalledWith('guild1');
            expect(mockMusicEventBus.emitEvent).toHaveBeenCalledWith('queue:clear', { guildId: 'guild1' });
        });

        it('should move track and emit event on success', () => {
            mockQueueService.moveTrack.mockReturnValue({ isOk: () => true });
            const result = musicFacade.moveTrack('guild1', 0, 2);
            expect(result).toBe(true);
            expect(mockMusicEventBus.emitEvent).toHaveBeenCalledWith('queue:move', expect.objectContaining({ fromIndex: 0, toIndex: 2 }));
        });

        it('should not emit event on failed move', () => {
            mockQueueService.moveTrack.mockReturnValue({ isOk: () => false });
            const result = musicFacade.moveTrack('guild1', -1, 0);
            expect(result).toBe(false);
            expect(mockMusicEventBus.emitEvent).not.toHaveBeenCalled();
        });
    });

    describe('Playback Operations', () => {
        it('should play a track', async () => {
            const track = makeTrack('Song');
            mockMusicCache.getQueue.mockReturnValue({ currentTrack: null, isReplacing: false });
            const result = await musicFacade.playTrack('guild1', track);
            expect(result).toBe(track);
            expect(mockPlayer.playTrack).toHaveBeenCalledWith({ track: { encoded: 'enc_Song' } });
            expect(mockVoiceService.clearInactivityTimer).toHaveBeenCalledWith('guild1');
        });

        it('should throw when no player', async () => {
            mockPlaybackService.getPlayer.mockReturnValue(null);
            await expect(musicFacade.playTrack('guild1', makeTrack('X'))).rejects.toThrow('NO_PLAYER');
        });

        it('should throw for invalid track', async () => {
            const badTrack = { title: 'Bad' } as any;
            await expect(musicFacade.playTrack('guild1', badTrack)).rejects.toThrow('INVALID_TRACK');
        });

        it('should set isReplacing flag when replacing', async () => {
            const queue: any = { currentTrack: makeTrack('Old'), isReplacing: false };
            mockMusicCache.getQueue.mockReturnValue(queue);
            await musicFacade.playTrack('guild1', makeTrack('New'));
            expect(queue.isReplacing).toBe(true);
        });

        it('should track metrics on play', async () => {
            const { musicTracksPlayedTotal } = require('../../../../src/core/metrics');
            mockMusicCache.getQueue.mockReturnValue({ currentTrack: null, isReplacing: false });
            await musicFacade.playTrack('guild1', makeTrack('Song'));
            expect(musicTracksPlayedTotal.inc).toHaveBeenCalledWith({ source: 'youtube' });
        });
    });

    describe('playNext', () => {
        it('should replay track in track loop mode', async () => {
            const current = makeTrack('Looped');
            mockQueueService.getLoopMode.mockReturnValue('track');
            mockQueueService.getCurrentTrack.mockReturnValue(current);
            mockMusicCache.getQueue.mockReturnValue({ currentTrack: current, isReplacing: false });

            const result = await musicFacade.playNext('guild1');
            expect(result?.isLooped).toBe(true);
            expect(result?.track).toBe(current);
        });

        it('should play next track from queue', async () => {
            const next = makeTrack('Next');
            mockQueueService.getLoopMode.mockReturnValue('off');
            mockQueueService.getCurrentTrack.mockReturnValue(makeTrack('Old'));
            mockMusicCache.getNextTrack.mockReturnValue(next);
            mockMusicCache.getQueue.mockReturnValue({ currentTrack: null, isReplacing: false });

            const result = await musicFacade.playNext('guild1');
            expect(result?.track).toBe(next);
            expect(result?.isLooped).toBe(false);
        });

        it('should add current back to queue in queue loop mode', async () => {
            const current = makeTrack('Current');
            mockQueueService.getLoopMode.mockReturnValue('queue');
            mockQueueService.getCurrentTrack.mockReturnValue(current);
            mockMusicCache.getNextTrack.mockReturnValue(makeTrack('Next'));
            mockMusicCache.getQueue.mockReturnValue({ currentTrack: null, isReplacing: false });

            await musicFacade.playNext('guild1');
            expect(mockMusicCache.addTrack).toHaveBeenCalledWith('guild1', current);
        });

        it('should handle queue end when no next track', async () => {
            mockQueueService.getLoopMode.mockReturnValue('off');
            mockQueueService.getCurrentTrack.mockReturnValue(null);
            mockMusicCache.getNextTrack.mockReturnValue(null);
            // Mock handleQueueEnd dependencies
            mockMusicCache.getQueue.mockReturnValue({ textChannel: null, autoPlay: false });

            const result = await musicFacade.playNext('guild1');
            expect(result).toBeNull();
        });
    });

    describe('skip', () => {
        it('should skip current track', async () => {
            const current = makeTrack('Skipped');
            mockQueueService.getCurrentTrack.mockReturnValue(current);
            mockMusicCache.getNextTrack.mockReturnValue(null);
            mockMusicCache.getQueue.mockReturnValue({ textChannel: null, autoPlay: false });

            const result = await musicFacade.skip('guild1');
            expect(result.skipped).toBe(1);
            expect(result.previousTrack).toBe(current);
            expect(mockPlayer.stopTrack).toHaveBeenCalled();
            expect(mockMusicEventBus.emitEvent).toHaveBeenCalledWith('track:skip', expect.any(Object));
        });

        it('should skip multiple tracks', async () => {
            mockQueueService.getCurrentTrack.mockReturnValue(makeTrack('Current'));
            mockMusicCache.getNextTrack.mockReturnValue(null);
            mockMusicCache.getQueue.mockReturnValue({ textChannel: null, autoPlay: false });

            const result = await musicFacade.skip('guild1', 3);
            expect(result.skipped).toBe(3);
            expect(mockMusicCache.getNextTrack).toHaveBeenCalledTimes(3); // count-1 discarded + 1 for playNext
        });

        it('should throw when no player', async () => {
            mockPlaybackService.getPlayer.mockReturnValue(null);
            await expect(musicFacade.skip('guild1')).rejects.toThrow('NO_PLAYER');
        });

        it('should end skip vote', async () => {
            mockQueueService.getCurrentTrack.mockReturnValue(makeTrack('X'));
            mockMusicCache.getNextTrack.mockReturnValue(null);
            mockMusicCache.getQueue.mockReturnValue({ textChannel: null, autoPlay: false });

            await musicFacade.skip('guild1');
            expect(mockQueueService.endSkipVote).toHaveBeenCalledWith('guild1');
        });
    });

    describe('togglePause', () => {
        it('should toggle pause and emit event', async () => {
            mockPlayer.paused = false;
            const result = await musicFacade.togglePause('guild1');
            expect(result).toBe(true);
            expect(mockMusicEventBus.emitEvent).toHaveBeenCalledWith('playback:pause', { guildId: 'guild1' });
        });

        it('should emit resume event', async () => {
            mockPlayer.paused = true;
            await musicFacade.togglePause('guild1');
            expect(mockMusicEventBus.emitEvent).toHaveBeenCalledWith('playback:resume', { guildId: 'guild1' });
        });

        it('should throw when no player', async () => {
            mockPlaybackService.getPlayer.mockReturnValue(null);
            await expect(musicFacade.togglePause('guild1')).rejects.toThrow('NO_PLAYER');
        });
    });

    describe('setPaused', () => {
        it('should set paused state', async () => {
            await musicFacade.setPaused('guild1', true);
            expect(mockPlayer.setPaused).toHaveBeenCalledWith(true);
            expect(mockMusicEventBus.emitEvent).toHaveBeenCalledWith('playback:pause', { guildId: 'guild1' });
        });
    });

    describe('stop', () => {
        it('should stop playback, clear queue, emit event', async () => {
            await musicFacade.stop('guild1');
            expect(mockPlayer.stopTrack).toHaveBeenCalled();
            expect(mockQueueService.clear).toHaveBeenCalledWith('guild1');
            expect(mockQueueService.setCurrentTrack).toHaveBeenCalledWith('guild1', null);
            expect(mockQueueService.endSkipVote).toHaveBeenCalledWith('guild1');
            expect(mockMusicEventBus.emitEvent).toHaveBeenCalledWith('playback:stop', { guildId: 'guild1' });
        });
    });

    describe('Loop/Shuffle', () => {
        it('should toggle loop and emit event', () => {
            mockQueueService.cycleLoopMode.mockReturnValue('track');
            const mode = musicFacade.toggleLoop('guild1');
            expect(mode).toBe('track');
            expect(mockMusicEventBus.emitEvent).toHaveBeenCalledWith('loop:change', { guildId: 'guild1', loopMode: 'track' });
        });

        it('should set loop mode', () => {
            musicFacade.setLoopMode('guild1', 'queue');
            expect(mockQueueService.setLoopMode).toHaveBeenCalledWith('guild1', 'queue');
        });

        it('should get loop mode', () => {
            mockQueueService.getLoopMode.mockReturnValue('queue');
            expect(musicFacade.getLoopMode('guild1')).toBe('queue');
        });

        it('should toggle shuffle and emit event', () => {
            mockQueueService.toggleShuffle.mockReturnValue(true);
            const result = musicFacade.toggleShuffle('guild1');
            expect(result).toBe(true);
            expect(mockMusicEventBus.emitEvent).toHaveBeenCalledWith('queue:shuffle', { guildId: 'guild1', isShuffled: true });
        });

        it('should check shuffle state', () => {
            mockQueueService.isShuffled.mockReturnValue(true);
            expect(musicFacade.isShuffled('guild1')).toBe(true);
        });
    });

    describe('Volume', () => {
        it('should set volume on player and emit event', async () => {
            mockQueueService.setVolume.mockReturnValue(75);
            const vol = await musicFacade.setVolume('guild1', 75);
            expect(vol).toBe(75);
            expect(mockPlayer.setGlobalVolume).toHaveBeenCalledWith(75);
            expect(mockMusicEventBus.emitEvent).toHaveBeenCalledWith('volume:change', { guildId: 'guild1', volume: 75 });
        });

        it('should return 100 when no player', async () => {
            mockPlaybackService.getPlayer.mockReturnValue(null);
            const vol = await musicFacade.setVolume('guild1', 50);
            expect(vol).toBe(100);
        });

        it('should get volume', () => {
            mockQueueService.getVolume.mockReturnValue(80);
            expect(musicFacade.getVolume('guild1')).toBe(80);
        });

        it('should adjust volume by delta', async () => {
            mockQueueService.getVolume.mockReturnValue(50);
            mockQueueService.setVolume.mockReturnValue(75);
            await musicFacade.adjustVolume('guild1', 25);
            expect(mockQueueService.setVolume).toHaveBeenCalledWith('guild1', 75);
        });
    });

    describe('Voice Connection', () => {
        it('should check connection status', () => {
            mockVoiceService.isConnected.mockReturnValue(true);
            expect(musicFacade.isConnected('guild1')).toBe(true);
        });

        it('should disconnect', () => {
            musicFacade.disconnect('guild1');
            expect(mockVoiceService.disconnect).toHaveBeenCalledWith('guild1');
        });

        it('should get voice channel ID', () => {
            mockVoiceService.getVoiceChannelId.mockReturnValue('vc123');
            expect(musicFacade.getVoiceChannelId('guild1')).toBe('vc123');
        });

        it('should get listener count', () => {
            mockVoiceService.getListenerCount.mockReturnValue(5);
            expect(musicFacade.getListenerCount('guild1', null)).toBe(5);
        });
    });

    describe('Auto-Play', () => {
        it('should toggle auto-play and emit event', () => {
            const queue: any = { autoPlay: false, loopMode: 'track' };
            mockMusicCache.getQueue.mockReturnValue(queue);
            const result = musicFacade.toggleAutoPlay('guild1');
            expect(result).toBe(true);
            expect(queue.autoPlay).toBe(true);
            expect(queue.loopMode).toBe('off'); // Disables loop when enabling autoplay
            expect(mockMusicEventBus.emitEvent).toHaveBeenCalledWith('autoplay:toggle', expect.any(Object));
        });

        it('should check auto-play state', () => {
            mockQueueService.isAutoPlayEnabled.mockReturnValue(true);
            expect(musicFacade.isAutoPlayEnabled('guild1')).toBe(true);
        });

        it('should return false when no queue', () => {
            mockMusicCache.getQueue.mockReturnValue(null);
            expect(musicFacade.toggleAutoPlay('guild1')).toBe(false);
        });
    });

    describe('handleQueueEnd', () => {
        it('should try auto-play when enabled', async () => {
            const lastTrack = makeTrack('Last');
            const similar = makeTrack('Similar');
            const mockTextChannel = { send: jest.fn().mockResolvedValue({}) };

            mockMusicCache.getQueue.mockReturnValue({
                autoPlay: true,
                textChannel: mockTextChannel,
                lastPlayedTracks: [],
                currentTrack: null,
                isReplacing: false,
            });
            mockQueueService.getCurrentTrack.mockReturnValue(lastTrack);
            mockAutoPlayService.findSimilarTrack.mockResolvedValue(similar);

            await musicFacade.handleQueueEnd('guild1', lastTrack);
            expect(mockAutoPlayService.findSimilarTrack).toHaveBeenCalledWith('guild1', lastTrack);
            expect(mockMusicCache.setCurrentTrack).toHaveBeenCalledWith('guild1', similar);
        });

        it('should set inactivity timer when no auto-play', async () => {
            mockMusicCache.getQueue.mockReturnValue({ autoPlay: false, textChannel: null });
            mockQueueService.getCurrentTrack.mockReturnValue(null);

            await musicFacade.handleQueueEnd('guild1');
            expect(mockVoiceService.setInactivityTimer).toHaveBeenCalledWith('guild1', expect.any(Function));
        });

        it('should send queue finished embed', async () => {
            const mockTextChannel = { send: jest.fn().mockResolvedValue({}) };
            mockMusicCache.getQueue.mockReturnValue({ autoPlay: false, textChannel: mockTextChannel });
            mockQueueService.getCurrentTrack.mockReturnValue(null);

            await musicFacade.handleQueueEnd('guild1');
            expect(mockTrackHandler.createQueueFinishedEmbed).toHaveBeenCalled();
            expect(mockTextChannel.send).toHaveBeenCalled();
        });

        it('should handle auto-play failure gracefully', async () => {
            const mockTextChannel = { send: jest.fn().mockResolvedValue({}) };
            mockMusicCache.getQueue.mockReturnValue({
                autoPlay: true,
                textChannel: mockTextChannel,
                lastPlayedTracks: [],
            });
            mockQueueService.getCurrentTrack.mockReturnValue(makeTrack('Last'));
            mockAutoPlayService.findSimilarTrack.mockResolvedValue(null);

            // Should not throw, falls through to normal queue end
            await musicFacade.handleQueueEnd('guild1');
            expect(mockVoiceService.setInactivityTimer).toHaveBeenCalled();
        });
    });

    describe('cleanup', () => {
        it('should perform full cleanup', async () => {
            mockMusicCache.getNowPlayingMessage.mockReturnValue(null);

            await musicFacade.cleanup('guild1');
            expect(mockMusicEventBus.emitCleanup).toHaveBeenCalledWith('guild1', 'manual');
            expect(mockMusicCache.clearNowPlayingMessage).toHaveBeenCalledWith('guild1');
            expect(mockVoiceService.stopVCMonitor).toHaveBeenCalledWith('guild1');
            expect(mockVoiceService.clearInactivityTimer).toHaveBeenCalledWith('guild1');
            expect(mockVoiceService.unbindPlayerEvents).toHaveBeenCalledWith('guild1');
            expect(mockMusicEventBus.removeGuildListeners).toHaveBeenCalledWith('guild1');
            expect(mockVoiceService.disconnect).toHaveBeenCalledWith('guild1');
            expect(mockMusicCache.deleteQueue).toHaveBeenCalledWith('guild1');
            expect(mockMusicEventBus.emitEvent).toHaveBeenCalledWith('cleanup:complete', { guildId: 'guild1' });
        });
    });

    describe('Skip Vote', () => {
        it('should start skip vote and emit event', () => {
            mockMusicCache.startSkipVote.mockReturnValue({ voteCount: 1, required: 3 });
            const result = musicFacade.startSkipVote('guild1', 'user1', 5);
            expect(result.voteCount).toBe(1);
            expect(mockMusicEventBus.emitEvent).toHaveBeenCalledWith('skipvote:start', expect.any(Object));
        });

        it('should add skip vote and emit event', () => {
            mockMusicCache.addSkipVote.mockReturnValue({ added: true, voteCount: 2 });
            const result = musicFacade.addSkipVote('guild1', 'user2');
            expect(result?.added).toBe(true);
            expect(mockMusicEventBus.emitEvent).toHaveBeenCalledWith('skipvote:add', expect.any(Object));
        });

        it('should end skip vote', () => {
            musicFacade.endSkipVote('guild1');
            expect(mockMusicCache.endSkipVote).toHaveBeenCalledWith('guild1');
        });

        it('should check skip vote state', () => {
            mockMusicCache.hasEnoughSkipVotes.mockReturnValue(true);
            expect(musicFacade.hasEnoughSkipVotes('guild1')).toBe(true);
        });

        it('should check if skip vote active', () => {
            mockMusicCache.hasActiveSkipVote.mockReturnValue(true);
            expect(musicFacade.isSkipVoteActive('guild1')).toBe(true);
        });
    });

    describe('Now Playing Message', () => {
        it('should set now playing message', () => {
            const msg = { id: 'msg1', channelId: 'ch1' } as any;
            musicFacade.setNowPlayingMessage('guild1', msg);
            expect(mockMusicCache.setNowPlayingMessage).toHaveBeenCalledWith('guild1', msg);
        });

        it('should get now playing message ref', () => {
            const ref = { messageId: 'msg1', channelId: 'ch1' };
            mockMusicCache.getNowPlayingMessage.mockReturnValue(ref);
            expect(musicFacade.getNowPlayingMessageRef('guild1')).toBe(ref);
        });
    });

    describe('User Data', () => {
        it('should add favorite', async () => {
            const track = makeTrack('Fav');
            await musicFacade.addFavorite('user1', track);
            expect(mockMusicCache.addFavorite).toHaveBeenCalledWith('user1', track);
        });

        it('should remove favorite', async () => {
            await musicFacade.removeFavorite('user1', 'https://yt.com/Fav');
            expect(mockMusicCache.removeFavorite).toHaveBeenCalledWith('user1', 'https://yt.com/Fav');
        });

        it('should get favorites', async () => {
            mockMusicCache.getFavorites.mockResolvedValue([makeTrack('A')]);
            const result = await musicFacade.getFavorites('user1');
            expect(result).toHaveLength(1);
        });

        it('should check if favorited', async () => {
            mockMusicCache.isFavorited.mockResolvedValue(true);
            expect(await musicFacade.isFavorited('user1', 'url')).toBe(true);
        });

        it('should add to history', async () => {
            const track = makeTrack('Played');
            await musicFacade.addToHistory('user1', track);
            expect(mockMusicCache.addToHistory).toHaveBeenCalledWith('user1', track);
        });

        it('should get history', async () => {
            mockMusicCache.getHistory.mockResolvedValue([]);
            const result = await musicFacade.getHistory('user1', 10);
            expect(mockMusicCache.getHistory).toHaveBeenCalledWith('user1', 10);
        });

        it('should clear history', async () => {
            await musicFacade.clearHistory('user1');
            expect(mockMusicCache.clearHistory).toHaveBeenCalledWith('user1');
        });

        it('should get/set preferences', async () => {
            await musicFacade.setPreferences('user1', { volume: 80 });
            expect(mockMusicCache.setPreferences).toHaveBeenCalledWith('user1', { volume: 80 });
            await musicFacade.getPreferences('user1');
            expect(mockMusicCache.getPreferences).toHaveBeenCalledWith('user1');
        });
    });

    describe('Loop Count', () => {
        it('should get loop count', () => {
            mockMusicCache.getLoopCount.mockReturnValue(5);
            expect(musicFacade.getLoopCount('guild1')).toBe(5);
        });

        it('should increment loop count', () => {
            mockMusicCache.incrementLoopCount.mockReturnValue(3);
            expect(musicFacade.incrementLoopCount('guild1')).toBe(3);
        });

        it('should reset loop count', () => {
            musicFacade.resetLoopCount('guild1');
            expect(mockMusicCache.resetLoopCount).toHaveBeenCalledWith('guild1');
        });
    });

    describe('Search', () => {
        it('should delegate search to playbackService', async () => {
            mockPlaybackService.search.mockResolvedValue({ isOk: () => true, data: { tracks: [] } });
            await musicFacade.search('test query');
            expect(mockPlaybackService.search).toHaveBeenCalledWith('test query');
        });

        it('should search playlist', async () => {
            mockPlaybackService.searchPlaylist.mockResolvedValue({
                isOk: () => true,
                data: { playlistName: 'Test', tracks: [] },
            });
            const result = await musicFacade.searchPlaylist('https://yt.com/playlist');
            expect(result?.playlistName).toBe('Test');
        });

        it('should return null for failed playlist search', async () => {
            mockPlaybackService.searchPlaylist.mockResolvedValue({ isOk: () => false });
            const result = await musicFacade.searchPlaylist('https://yt.com/bad');
            expect(result).toBeNull();
        });
    });

    describe('Event Bus', () => {
        it('should subscribe to events', () => {
            const handler = jest.fn();
            const unsub = musicFacade.on('test', handler);
            expect(mockMusicEventBus.subscribe).toHaveBeenCalledWith('test', handler);
            expect(typeof unsub).toBe('function');
        });

        it('should subscribe to guild events', () => {
            const handler = jest.fn();
            musicFacade.onGuild('guild1', 'test', handler);
            expect(mockMusicEventBus.subscribeGuild).toHaveBeenCalledWith('guild1', 'test', handler);
        });

        it('should get event stats', () => {
            musicFacade.getEventStats();
            expect(mockMusicEventBus.getStats).toHaveBeenCalled();
        });
    });

    describe('Utilities', () => {
        it('should get player', () => {
            expect(musicFacade.getPlayer('guild1')).toBe(mockPlayer);
        });

        it('should check Lavalink ready', () => {
            mockPlaybackService.isLavalinkReady.mockReturnValue(true);
            expect(musicFacade.isLavalinkReady()).toBe(true);
        });

        it('should get queue state', () => {
            const state = { exists: true, tracks: [] };
            mockQueueService.getState.mockReturnValue(state);
            expect(musicFacade.getQueueState('guild1')).toBe(state);
        });

        it('should get stats', () => {
            const stats = musicFacade.getStats();
            expect(stats.queue).toBeDefined();
            expect(stats.playback).toBeDefined();
            expect(stats.voice).toBeDefined();
            expect(stats.events).toBeDefined();
        });

        it('should expose transitionMutex', () => {
            expect(musicFacade.transitionMutex).toBeDefined();
        });
    });

    describe('shutdownAll', () => {
        it('should shutdown all sub-services', () => {
            musicFacade.shutdownAll();
            expect(mockPlaybackEventHandler.shutdown).toHaveBeenCalled();
            expect(mockMusicEventBus.shutdown).toHaveBeenCalled();
            expect(mockVoiceService.shutdownAll).toHaveBeenCalled();
        });
    });
});
