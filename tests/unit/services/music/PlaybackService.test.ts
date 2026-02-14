/**
 * PlaybackService Unit Tests
 * Tests for play, pause, skip, stop, seek, volume, search operations
 */

// Mock Logger
jest.mock('../../../../src/core/Logger', () => ({
    __esModule: true,
    default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Mock LavalinkService
const mockPlayer = {
    paused: false,
    position: 30000,
    playTrack: jest.fn().mockResolvedValue(undefined),
    stopTrack: jest.fn().mockResolvedValue(undefined),
    setPaused: jest.fn().mockResolvedValue(undefined),
    seekTo: jest.fn().mockResolvedValue(undefined),
    setGlobalVolume: jest.fn().mockResolvedValue(undefined),
};

const mockLavalinkService = {
    getPlayer: jest.fn(),
    isReady: true,
    search: jest.fn(),
    searchPlaylist: jest.fn(),
};

jest.mock('../../../../src/services/music/LavalinkService', () => ({
    __esModule: true,
    default: mockLavalinkService,
}));

// Mock QueueService
const mockQueueService = {
    getCurrentTrack: jest.fn(),
    setCurrentTrack: jest.fn(),
    getLoopMode: jest.fn().mockReturnValue('off'),
    resetLoopCount: jest.fn(),
    getNextTrack: jest.fn(),
    addTrack: jest.fn(),
    clear: jest.fn(),
    endSkipVote: jest.fn(),
    setVolume: jest.fn((_, v: number) => Math.max(0, Math.min(200, v))),
    getVolume: jest.fn().mockReturnValue(100),
};

jest.mock('../../../../src/services/music/queue/index', () => ({
    __esModule: true,
    queueService: mockQueueService,
    default: mockQueueService,
}));

// Mock MusicCacheFacade
const mockMusicCache = {
    getQueue: jest.fn(),
};

jest.mock('../../../../src/cache/music/MusicCacheFacade', () => ({
    __esModule: true,
    default: mockMusicCache,
}));

// Mock music config
jest.mock('../../../../src/config/features/music', () => ({
    __esModule: true,
    TRACK_TRANSITION_DELAY: 100, // Short delay for tests
}));

import playbackService from '../../../../src/services/music/playback/PlaybackService.js';

function makeTrack(title: string, encoded: string = `enc_${title}`) {
    return {
        title,
        url: `https://yt.com/${title}`,
        track: { encoded },
        info: { title, author: 'Artist', length: 240000 },
    };
}

describe('PlaybackService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockLavalinkService.getPlayer.mockReturnValue(mockPlayer);
        mockPlayer.paused = false;
        mockPlayer.position = 30000;
        mockMusicCache.getQueue.mockReturnValue({ isReplacing: false, currentTrack: null });
    });

    describe('getPlayer', () => {
        it('should return player from LavalinkService', () => {
            const player = playbackService.getPlayer('guild1');
            expect(player).toBe(mockPlayer);
            expect(mockLavalinkService.getPlayer).toHaveBeenCalledWith('guild1');
        });

        it('should return null when no player', () => {
            mockLavalinkService.getPlayer.mockReturnValue(null);
            expect(playbackService.getPlayer('guild1')).toBeNull();
        });
    });

    describe('isLavalinkReady', () => {
        it('should return Lavalink ready state', () => {
            expect(playbackService.isLavalinkReady()).toBe(true);
            mockLavalinkService.isReady = false;
            expect(playbackService.isLavalinkReady()).toBe(false);
            mockLavalinkService.isReady = true;
        });
    });

    describe('playTrack', () => {
        it('should play a track successfully', async () => {
            const track = makeTrack('Test Song');
            const result = await playbackService.playTrack('guild1', track);
            expect(result.isOk()).toBe(true);
            expect(mockPlayer.playTrack).toHaveBeenCalledWith({ track: { encoded: 'enc_Test Song' } });
            expect(mockQueueService.setCurrentTrack).toHaveBeenCalledWith('guild1', track);
        });

        it('should return err when no player', async () => {
            mockLavalinkService.getPlayer.mockReturnValue(null);
            const result = await playbackService.playTrack('guild1', makeTrack('X'));
            expect(result.isErr()).toBe(true);
            expect(result.code).toBe('NO_PLAYER');
        });

        it('should return err for invalid track (no encoded)', async () => {
            const result = await playbackService.playTrack('guild1', { title: 'Bad' } as any);
            expect(result.isErr()).toBe(true);
            expect(result.code).toBe('TRACK_NOT_FOUND');
        });

        it('should set isReplacing flag if track already playing', async () => {
            const queue: any = { isReplacing: false };
            mockMusicCache.getQueue.mockReturnValue(queue);
            mockQueueService.getCurrentTrack.mockReturnValue(makeTrack('Old'));
            const track = makeTrack('New');
            await playbackService.playTrack('guild1', track);
            expect(queue.isReplacing).toBe(true); // Set during play
        });

        it('should handle player error', async () => {
            mockPlayer.playTrack.mockRejectedValueOnce(new Error('Connection lost'));
            const result = await playbackService.playTrack('guild1', makeTrack('X'));
            expect(result.isErr()).toBe(true);
        });
    });

    describe('playNext', () => {
        it('should replay current track in track loop mode', async () => {
            const current = makeTrack('Looped');
            mockQueueService.getLoopMode.mockReturnValue('track');
            mockQueueService.getCurrentTrack.mockReturnValue(current);
            const result = await playbackService.playNext('guild1');
            expect(result.isOk()).toBe(true);
            expect(result.data?.isLooped).toBe(true);
            expect(result.data?.track).toBe(current);
        });

        it('should get next track from queue', async () => {
            const next = makeTrack('Next Song');
            mockQueueService.getLoopMode.mockReturnValue('off');
            mockQueueService.getCurrentTrack.mockReturnValue(makeTrack('Old'));
            mockQueueService.getNextTrack.mockReturnValue(next);
            const result = await playbackService.playNext('guild1');
            expect(result.isOk()).toBe(true);
            expect(result.data?.track).toBe(next);
            expect(result.data?.isLooped).toBe(false);
        });

        it('should add current track back in queue loop mode', async () => {
            const current = makeTrack('Current');
            mockQueueService.getLoopMode.mockReturnValue('queue');
            mockQueueService.getCurrentTrack.mockReturnValue(current);
            mockQueueService.getNextTrack.mockReturnValue(makeTrack('Next'));
            await playbackService.playNext('guild1');
            expect(mockQueueService.addTrack).toHaveBeenCalledWith('guild1', current);
        });

        it('should return queueEnded when no next track', async () => {
            mockQueueService.getLoopMode.mockReturnValue('off');
            mockQueueService.getCurrentTrack.mockReturnValue(null);
            mockQueueService.getNextTrack.mockReturnValue(null);
            const result = await playbackService.playNext('guild1');
            expect(result.isOk()).toBe(true);
            expect(result.data?.queueEnded).toBe(true);
            expect(result.data?.track).toBeNull();
        });

        it('should reset loop count', async () => {
            mockQueueService.getLoopMode.mockReturnValue('off');
            mockQueueService.getNextTrack.mockReturnValue(makeTrack('Next'));
            await playbackService.playNext('guild1');
            expect(mockQueueService.resetLoopCount).toHaveBeenCalledWith('guild1');
        });
    });

    describe('skip', () => {
        it('should skip current track', async () => {
            const current = makeTrack('Current');
            mockQueueService.getCurrentTrack.mockReturnValue(current);
            const result = await playbackService.skip('guild1');
            expect(result.isOk()).toBe(true);
            expect(result.data?.skipped).toBe(1);
            expect(result.data?.previousTrack).toBe(current);
            expect(mockPlayer.stopTrack).toHaveBeenCalled();
        });

        it('should skip multiple tracks', async () => {
            mockQueueService.getCurrentTrack.mockReturnValue(makeTrack('Current'));
            const result = await playbackService.skip('guild1', 3);
            expect(result.data?.skipped).toBe(3);
            // Should discard 2 tracks (count - 1)
            expect(mockQueueService.getNextTrack).toHaveBeenCalledTimes(2);
        });

        it('should end skip vote', async () => {
            mockQueueService.getCurrentTrack.mockReturnValue(makeTrack('X'));
            await playbackService.skip('guild1');
            expect(mockQueueService.endSkipVote).toHaveBeenCalledWith('guild1');
        });

        it('should return err when no player', async () => {
            mockLavalinkService.getPlayer.mockReturnValue(null);
            const result = await playbackService.skip('guild1');
            expect(result.isErr()).toBe(true);
            expect(result.code).toBe('NO_PLAYER');
        });

        it('should return err when no track playing', async () => {
            mockQueueService.getCurrentTrack.mockReturnValue(null);
            const result = await playbackService.skip('guild1');
            expect(result.isErr()).toBe(true);
            expect(result.code).toBe('NO_TRACK');
        });
    });

    describe('togglePause', () => {
        it('should toggle from playing to paused', async () => {
            mockPlayer.paused = false;
            const result = await playbackService.togglePause('guild1');
            expect(result.isOk()).toBe(true);
            expect(result.data?.paused).toBe(true);
            expect(mockPlayer.setPaused).toHaveBeenCalledWith(true);
        });

        it('should toggle from paused to playing', async () => {
            mockPlayer.paused = true;
            const result = await playbackService.togglePause('guild1');
            expect(result.isOk()).toBe(true);
            expect(result.data?.paused).toBe(false);
        });

        it('should return err when no player', async () => {
            mockLavalinkService.getPlayer.mockReturnValue(null);
            const result = await playbackService.togglePause('guild1');
            expect(result.isErr()).toBe(true);
        });
    });

    describe('setPaused', () => {
        it('should set paused state', async () => {
            const result = await playbackService.setPaused('guild1', true);
            expect(result.isOk()).toBe(true);
            expect(mockPlayer.setPaused).toHaveBeenCalledWith(true);
        });

        it('should return err when no player', async () => {
            mockLavalinkService.getPlayer.mockReturnValue(null);
            const result = await playbackService.setPaused('guild1', true);
            expect(result.isErr()).toBe(true);
        });
    });

    describe('isPaused', () => {
        it('should return player paused state', () => {
            mockPlayer.paused = true;
            expect(playbackService.isPaused('guild1')).toBe(true);
        });

        it('should return false when no player', () => {
            mockLavalinkService.getPlayer.mockReturnValue(null);
            expect(playbackService.isPaused('guild1')).toBe(false);
        });
    });

    describe('stop', () => {
        it('should stop playback and clear queue', async () => {
            const result = await playbackService.stop('guild1');
            expect(result.isOk()).toBe(true);
            expect(mockPlayer.stopTrack).toHaveBeenCalled();
            expect(mockQueueService.clear).toHaveBeenCalledWith('guild1');
            expect(mockQueueService.setCurrentTrack).toHaveBeenCalledWith('guild1', null);
            expect(mockQueueService.endSkipVote).toHaveBeenCalledWith('guild1');
        });

        it('should succeed even without a player', async () => {
            mockLavalinkService.getPlayer.mockReturnValue(null);
            const result = await playbackService.stop('guild1');
            expect(result.isOk()).toBe(true);
        });
    });

    describe('seek', () => {
        it('should seek to position', async () => {
            mockQueueService.getCurrentTrack.mockReturnValue(makeTrack('Song'));
            const result = await playbackService.seek('guild1', 60000);
            expect(result.isOk()).toBe(true);
            expect(mockPlayer.seekTo).toHaveBeenCalledWith(60000);
        });

        it('should clamp position to track duration', async () => {
            const track = makeTrack('Song');
            track.info!.length = 120000;
            mockQueueService.getCurrentTrack.mockReturnValue(track);
            const result = await playbackService.seek('guild1', 500000);
            expect(result.data?.position).toBe(120000);
        });

        it('should clamp negative position to 0', async () => {
            mockQueueService.getCurrentTrack.mockReturnValue(makeTrack('Song'));
            const result = await playbackService.seek('guild1', -5000);
            expect(result.data?.position).toBe(0);
        });

        it('should return err when no player', async () => {
            mockLavalinkService.getPlayer.mockReturnValue(null);
            const result = await playbackService.seek('guild1', 30000);
            expect(result.isErr()).toBe(true);
        });

        it('should return err when no track', async () => {
            mockQueueService.getCurrentTrack.mockReturnValue(null);
            const result = await playbackService.seek('guild1', 30000);
            expect(result.isErr()).toBe(true);
        });
    });

    describe('getPosition', () => {
        it('should return player position', () => {
            mockPlayer.position = 45000;
            expect(playbackService.getPosition('guild1')).toBe(45000);
        });

        it('should return 0 when no player', () => {
            mockLavalinkService.getPlayer.mockReturnValue(null);
            expect(playbackService.getPosition('guild1')).toBe(0);
        });
    });

    describe('setVolume', () => {
        it('should set volume on player and cache', async () => {
            mockQueueService.setVolume.mockReturnValue(75);
            const result = await playbackService.setVolume('guild1', 75);
            expect(result.isOk()).toBe(true);
            expect(result.data?.volume).toBe(75);
            expect(mockPlayer.setGlobalVolume).toHaveBeenCalledWith(75);
        });

        it('should return err when no player', async () => {
            mockLavalinkService.getPlayer.mockReturnValue(null);
            const result = await playbackService.setVolume('guild1', 50);
            expect(result.isErr()).toBe(true);
        });
    });

    describe('adjustVolume', () => {
        it('should adjust by delta', async () => {
            mockQueueService.getVolume.mockReturnValue(50);
            mockQueueService.setVolume.mockReturnValue(75);
            const result = await playbackService.adjustVolume('guild1', 25);
            expect(result.isOk()).toBe(true);
        });
    });

    describe('search', () => {
        it('should return search results', async () => {
            const track = makeTrack('Found');
            mockLavalinkService.search.mockResolvedValue(track);
            const result = await playbackService.search('test query');
            expect(result.isOk()).toBe(true);
            expect(result.data?.tracks).toHaveLength(1);
        });

        it('should return err when no results', async () => {
            mockLavalinkService.search.mockResolvedValue(null);
            const result = await playbackService.search('nothing');
            expect(result.isErr()).toBe(true);
            expect(result.code).toBe('NO_RESULTS');
        });

        it('should handle search errors', async () => {
            mockLavalinkService.search.mockRejectedValue(new Error('Network error'));
            const result = await playbackService.search('error');
            expect(result.isErr()).toBe(true);
        });
    });

    describe('searchPlaylist', () => {
        it('should return playlist results', async () => {
            mockLavalinkService.searchPlaylist.mockResolvedValue({
                playlistName: 'My Playlist',
                tracks: [makeTrack('A'), makeTrack('B')],
            });
            const result = await playbackService.searchPlaylist('https://yt.com/playlist');
            expect(result.isOk()).toBe(true);
            expect(result.data?.playlistName).toBe('My Playlist');
            expect(result.data?.tracks).toHaveLength(2);
        });

        it('should return err for empty playlist', async () => {
            mockLavalinkService.searchPlaylist.mockResolvedValue({ tracks: [] });
            const result = await playbackService.searchPlaylist('https://yt.com/empty');
            expect(result.isErr()).toBe(true);
        });

        it('should return err on null result', async () => {
            mockLavalinkService.searchPlaylist.mockResolvedValue(null);
            const result = await playbackService.searchPlaylist('https://yt.com/bad');
            expect(result.isErr()).toBe(true);
        });
    });

    describe('getState', () => {
        it('should return playback state', () => {
            const track = makeTrack('Playing');
            mockQueueService.getCurrentTrack.mockReturnValue(track);
            mockQueueService.getVolume.mockReturnValue(80);
            mockPlayer.paused = false;
            mockPlayer.position = 60000;

            const state = playbackService.getState('guild1');
            expect(state.hasPlayer).toBe(true);
            expect(state.isPlaying).toBe(true);
            expect(state.isPaused).toBe(false);
            expect(state.position).toBe(60000);
            expect(state.currentTrack).toBe(track);
            expect(state.volume).toBe(80);
        });

        it('should report not playing when paused', () => {
            mockQueueService.getCurrentTrack.mockReturnValue(makeTrack('X'));
            mockPlayer.paused = true;
            const state = playbackService.getState('guild1');
            expect(state.isPlaying).toBe(false);
            expect(state.isPaused).toBe(true);
        });

        it('should report no player', () => {
            mockLavalinkService.getPlayer.mockReturnValue(null);
            const state = playbackService.getState('guild1');
            expect(state.hasPlayer).toBe(false);
            expect(state.isPlaying).toBe(false);
        });
    });

    describe('transition mutex', () => {
        it('should acquire and release lock', async () => {
            const acquired = await playbackService.acquireTransitionLock('guild1');
            expect(acquired).toBe(true);
            expect(playbackService.isTransitionLocked('guild1')).toBe(true);
            playbackService.releaseTransitionLock('guild1');
            expect(playbackService.isTransitionLocked('guild1')).toBe(false);
        });

        it('should not be locked initially', () => {
            expect(playbackService.isTransitionLocked('newGuild')).toBe(false);
        });

        it('should expose mutex via getter', () => {
            const mutex = playbackService.getTransitionMutex();
            expect(mutex).toBeDefined();
            expect(typeof mutex.acquire).toBe('function');
            expect(typeof mutex.release).toBe('function');
        });

        it('should timeout when lock is held', async () => {
            await playbackService.acquireTransitionLock('guild1');
            // Try to acquire again with short timeout
            const acquired = await playbackService.acquireTransitionLock('guild1', 200);
            expect(acquired).toBe(false);
            playbackService.releaseTransitionLock('guild1');
        }, 10000);
    });
});
