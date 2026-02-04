/**
 * QueueService Unit Tests
 * Tests for the music queue management service
 */

import { Result } from '../../../../src/core/Result';
import { ErrorCodes } from '../../../../src/core/ErrorCodes';

// Mock the MusicCacheFacade
const mockMusicCache = {
    getQueue: jest.fn(),
    getOrCreateQueue: jest.fn(),
    deleteQueue: jest.fn(),
    addTrack: jest.fn(),
    addTrackToFront: jest.fn(),
    addTracks: jest.fn(),
    removeTrack: jest.fn(),
    clearQueue: jest.fn(),
    clearTracks: jest.fn(),
    shuffleQueue: jest.fn(),
    unshuffleQueue: jest.fn(),
    setLoopMode: jest.fn(),
    cycleLoopMode: jest.fn(),
    getLoopCount: jest.fn(),
    incrementLoopCount: jest.fn(),
    resetLoopCount: jest.fn(),
    getNextTrack: jest.fn(),
    getCurrentTrack: jest.fn(),
    setCurrentTrack: jest.fn(),
    setVolume: jest.fn(),
    getVolume: jest.fn(),
    setAutoPlay: jest.fn(),
    isAutoPlayEnabled: jest.fn(),
    startSkipVote: jest.fn(),
    addSkipVote: jest.fn(),
    endSkipVote: jest.fn(),
    hasActiveSkipVote: jest.fn(),
    hasEnoughSkipVotes: jest.fn(),
    addLastPlayedTrack: jest.fn(),
    getLastPlayedTracks: jest.fn(),
    moveTrack: jest.fn(),
};

jest.mock('../../../../src/cache/music/MusicCacheFacade', () => ({
    default: mockMusicCache,
    __esModule: true,
}));

// Import after mocking
import { QueueService } from '../../../../src/services/music/queue/QueueService';

// Mock track factory
const createMockTrack = (overrides = {}) => ({
    id: `track-${Math.random().toString(36).substr(2, 9)}`,
    title: 'Test Track',
    artist: 'Test Artist',
    url: 'https://youtube.com/watch?v=test',
    duration: 180000,
    thumbnail: 'https://example.com/thumb.jpg',
    requesterId: '123456789',
    requesterName: 'TestUser',
    ...overrides,
});

// Mock queue factory
const createMockQueue = (overrides = {}) => ({
    tracks: [],
    currentTrack: null,
    loopMode: 'off' as const,
    isShuffled: false,
    volume: 100,
    autoPlay: false,
    voiceChannelId: '999888777',
    textChannelId: '111222333',
    ...overrides,
});

describe('QueueService', () => {
    let queueService: QueueService;
    const guildId = 'test-guild-123';

    beforeEach(() => {
        jest.clearAllMocks();
        queueService = new QueueService();
    });

    describe('getOrCreate()', () => {
        it('should get or create queue for guild', () => {
            const mockQueue = createMockQueue();
            mockMusicCache.getOrCreateQueue.mockReturnValue(mockQueue);

            const result = queueService.getOrCreate(guildId);

            expect(mockMusicCache.getOrCreateQueue).toHaveBeenCalledWith(guildId);
            expect(result).toBe(mockQueue);
        });
    });

    describe('get()', () => {
        it('should return queue if exists', () => {
            const mockQueue = createMockQueue();
            mockMusicCache.getQueue.mockReturnValue(mockQueue);

            const result = queueService.get(guildId);

            expect(result).toBe(mockQueue);
        });

        it('should return null if queue does not exist', () => {
            mockMusicCache.getQueue.mockReturnValue(null);

            const result = queueService.get(guildId);

            expect(result).toBeNull();
        });
    });

    describe('getTracks()', () => {
        it('should return tracks from queue', () => {
            const tracks = [createMockTrack(), createMockTrack()];
            mockMusicCache.getQueue.mockReturnValue(createMockQueue({ tracks }));

            const result = queueService.getTracks(guildId);

            expect(result).toEqual(tracks);
            expect(result).toHaveLength(2);
        });

        it('should return empty array if no queue', () => {
            mockMusicCache.getQueue.mockReturnValue(null);

            const result = queueService.getTracks(guildId);

            expect(result).toEqual([]);
        });
    });

    describe('getLength()', () => {
        it('should return queue length', () => {
            const tracks = [createMockTrack(), createMockTrack(), createMockTrack()];
            mockMusicCache.getQueue.mockReturnValue(createMockQueue({ tracks }));

            const result = queueService.getLength(guildId);

            expect(result).toBe(3);
        });
    });

    describe('isEmpty()', () => {
        it('should return true for empty queue', () => {
            mockMusicCache.getQueue.mockReturnValue(createMockQueue({ tracks: [] }));

            expect(queueService.isEmpty(guildId)).toBe(true);
        });

        it('should return false for non-empty queue', () => {
            mockMusicCache.getQueue.mockReturnValue(createMockQueue({ tracks: [createMockTrack()] }));

            expect(queueService.isEmpty(guildId)).toBe(false);
        });
    });

    describe('getCurrentTrack()', () => {
        it('should return current track', () => {
            const currentTrack = createMockTrack({ title: 'Now Playing' });
            mockMusicCache.getCurrentTrack.mockReturnValue(currentTrack);

            const result = queueService.getCurrentTrack(guildId);

            expect(result).toBe(currentTrack);
        });

        it('should return null if no current track', () => {
            mockMusicCache.getCurrentTrack.mockReturnValue(null);

            const result = queueService.getCurrentTrack(guildId);

            expect(result).toBeNull();
        });
    });

    describe('setCurrentTrack()', () => {
        it('should set current track', () => {
            const track = createMockTrack();

            queueService.setCurrentTrack(guildId, track);

            expect(mockMusicCache.setCurrentTrack).toHaveBeenCalledWith(guildId, track);
        });

        it('should allow setting to null', () => {
            queueService.setCurrentTrack(guildId, null);

            expect(mockMusicCache.setCurrentTrack).toHaveBeenCalledWith(guildId, null);
        });
    });

    describe('addTrack()', () => {
        it('should add track to queue successfully', () => {
            const track = createMockTrack();
            mockMusicCache.addTrack.mockReturnValue(1);
            mockMusicCache.getQueue.mockReturnValue(createMockQueue({ tracks: [track] }));

            const result = queueService.addTrack(guildId, track);

            expect(result.isOk()).toBe(true);
            expect(result.data?.position).toBe(1);
        });

        it('should return error when queue is full', () => {
            const track = createMockTrack();
            mockMusicCache.addTrack.mockReturnValue(false);

            const result = queueService.addTrack(guildId, track);

            expect(result.isErr()).toBe(true);
            expect(result.code).toBe(ErrorCodes.QUEUE_FULL);
        });
    });

    describe('addTrackToFront()', () => {
        it('should add track to front successfully', () => {
            const track = createMockTrack();
            mockMusicCache.addTrackToFront.mockReturnValue(1);

            const result = queueService.addTrackToFront(guildId, track);

            expect(result.isOk()).toBe(true);
            expect(result.data?.position).toBe(1);
        });

        it('should return error when queue is full', () => {
            const track = createMockTrack();
            mockMusicCache.addTrackToFront.mockReturnValue(false);

            const result = queueService.addTrackToFront(guildId, track);

            expect(result.isErr()).toBe(true);
            expect(result.code).toBe(ErrorCodes.QUEUE_FULL);
        });
    });

    describe('addTracks()', () => {
        it('should add multiple tracks', () => {
            const tracks = [createMockTrack(), createMockTrack()];
            mockMusicCache.addTracks.mockReturnValue(tracks);

            const result = queueService.addTracks(guildId, tracks);

            expect(result.isOk()).toBe(true);
            expect(result.data?.added).toBe(2);
        });
    });

    describe('removeTrack()', () => {
        it('should remove track at valid index', () => {
            const tracks = [createMockTrack(), createMockTrack()];
            const removedTrack = tracks[0];
            mockMusicCache.getQueue.mockReturnValue(createMockQueue({ tracks }));
            mockMusicCache.removeTrack.mockReturnValue(removedTrack);

            const result = queueService.removeTrack(guildId, 0);

            expect(result.isOk()).toBe(true);
            expect(result.data?.removed).toBe(removedTrack);
        });

        it('should return error for invalid index (negative)', () => {
            mockMusicCache.getQueue.mockReturnValue(createMockQueue({ tracks: [createMockTrack()] }));

            const result = queueService.removeTrack(guildId, -1);

            expect(result.isErr()).toBe(true);
            expect(result.code).toBe(ErrorCodes.INVALID_POSITION);
        });

        it('should return error for index out of bounds', () => {
            mockMusicCache.getQueue.mockReturnValue(createMockQueue({ tracks: [createMockTrack()] }));

            const result = queueService.removeTrack(guildId, 5);

            expect(result.isErr()).toBe(true);
            expect(result.code).toBe(ErrorCodes.INVALID_POSITION);
        });
    });

    describe('clear()', () => {
        it('should clear all tracks', () => {
            queueService.clear(guildId);

            expect(mockMusicCache.clearTracks).toHaveBeenCalledWith(guildId);
        });
    });

    describe('moveTrack()', () => {
        it('should move track successfully', () => {
            const tracks = [
                createMockTrack({ title: 'Track 1' }),
                createMockTrack({ title: 'Track 2' }),
                createMockTrack({ title: 'Track 3' }),
            ];
            const mockQueue = createMockQueue({ tracks: [...tracks] });
            mockMusicCache.getQueue.mockReturnValue(mockQueue);

            const result = queueService.moveTrack(guildId, 0, 2);

            expect(result.isOk()).toBe(true);
            expect(result.data?.from).toBe(0);
            expect(result.data?.to).toBe(2);
        });

        it('should return error when no queue exists', () => {
            mockMusicCache.getQueue.mockReturnValue(null);

            const result = queueService.moveTrack(guildId, 0, 1);

            expect(result.isErr()).toBe(true);
            expect(result.code).toBe(ErrorCodes.NO_QUEUE);
        });

        it('should return error for invalid source position', () => {
            mockMusicCache.getQueue.mockReturnValue(createMockQueue({ tracks: [createMockTrack()] }));

            const result = queueService.moveTrack(guildId, 5, 0);

            expect(result.isErr()).toBe(true);
            expect(result.code).toBe(ErrorCodes.INVALID_POSITION);
        });

        it('should return error for invalid destination position', () => {
            mockMusicCache.getQueue.mockReturnValue(createMockQueue({ tracks: [createMockTrack()] }));

            const result = queueService.moveTrack(guildId, 0, 5);

            expect(result.isErr()).toBe(true);
            expect(result.code).toBe(ErrorCodes.INVALID_POSITION);
        });
    });

    describe('getNextTrack()', () => {
        it('should return next track', () => {
            const nextTrack = createMockTrack({ title: 'Up Next' });
            mockMusicCache.getNextTrack.mockReturnValue(nextTrack);

            const result = queueService.getNextTrack(guildId);

            expect(result).toBe(nextTrack);
        });
    });

    describe('Loop Mode', () => {
        describe('getLoopMode()', () => {
            it('should return current loop mode', () => {
                mockMusicCache.getQueue.mockReturnValue(createMockQueue({ loopMode: 'queue' }));

                expect(queueService.getLoopMode(guildId)).toBe('queue');
            });

            it('should return off when no queue', () => {
                mockMusicCache.getQueue.mockReturnValue(null);

                expect(queueService.getLoopMode(guildId)).toBe('off');
            });
        });

        describe('setLoopMode()', () => {
            it('should set loop mode', () => {
                queueService.setLoopMode(guildId, 'track');

                expect(mockMusicCache.setLoopMode).toHaveBeenCalledWith(guildId, 'track');
            });
        });

        describe('cycleLoopMode()', () => {
            it('should cycle loop mode', () => {
                mockMusicCache.cycleLoopMode.mockReturnValue('queue');

                const result = queueService.cycleLoopMode(guildId);

                expect(result).toBe('queue');
            });
        });

        describe('getLoopCount()', () => {
            it('should return loop count', () => {
                mockMusicCache.getLoopCount.mockReturnValue(5);

                expect(queueService.getLoopCount(guildId)).toBe(5);
            });
        });

        describe('incrementLoopCount()', () => {
            it('should increment and return new count', () => {
                mockMusicCache.incrementLoopCount.mockReturnValue(6);

                expect(queueService.incrementLoopCount(guildId)).toBe(6);
            });
        });

        describe('resetLoopCount()', () => {
            it('should reset loop count', () => {
                queueService.resetLoopCount(guildId);

                expect(mockMusicCache.resetLoopCount).toHaveBeenCalledWith(guildId);
            });
        });
    });

    describe('Shuffle', () => {
        describe('isShuffled()', () => {
            it('should return shuffle status', () => {
                mockMusicCache.getQueue.mockReturnValue(createMockQueue({ isShuffled: true }));

                expect(queueService.isShuffled(guildId)).toBe(true);
            });

            it('should return false when no queue', () => {
                mockMusicCache.getQueue.mockReturnValue(null);

                expect(queueService.isShuffled(guildId)).toBe(false);
            });
        });

        describe('toggleShuffle()', () => {
            it('should shuffle when not shuffled', () => {
                mockMusicCache.getQueue.mockReturnValue(createMockQueue({ isShuffled: false }));

                queueService.toggleShuffle(guildId);

                expect(mockMusicCache.shuffleQueue).toHaveBeenCalledWith(guildId);
            });

            it('should unshuffle when shuffled', () => {
                mockMusicCache.getQueue.mockReturnValue(createMockQueue({ isShuffled: true }));

                queueService.toggleShuffle(guildId);

                expect(mockMusicCache.unshuffleQueue).toHaveBeenCalledWith(guildId);
            });

            it('should return false when no queue', () => {
                mockMusicCache.getQueue.mockReturnValue(null);

                expect(queueService.toggleShuffle(guildId)).toBe(false);
            });
        });
    });

    describe('Volume', () => {
        describe('getVolume()', () => {
            it('should return current volume', () => {
                mockMusicCache.getQueue.mockReturnValue(createMockQueue({ volume: 75 }));

                expect(queueService.getVolume(guildId)).toBe(75);
            });

            it('should return 100 when no queue', () => {
                mockMusicCache.getQueue.mockReturnValue(null);

                expect(queueService.getVolume(guildId)).toBe(100);
            });
        });

        describe('setVolume()', () => {
            it('should set volume', () => {
                const result = queueService.setVolume(guildId, 50);

                expect(mockMusicCache.setVolume).toHaveBeenCalledWith(guildId, 50);
                expect(result).toBe(50);
            });

            it('should clamp volume to max 200', () => {
                const result = queueService.setVolume(guildId, 300);

                expect(mockMusicCache.setVolume).toHaveBeenCalledWith(guildId, 200);
                expect(result).toBe(200);
            });

            it('should clamp volume to min 0', () => {
                const result = queueService.setVolume(guildId, -50);

                expect(mockMusicCache.setVolume).toHaveBeenCalledWith(guildId, 0);
                expect(result).toBe(0);
            });
        });
    });

    describe('Auto-Play', () => {
        describe('isAutoPlayEnabled()', () => {
            it('should return auto-play status', () => {
                mockMusicCache.getQueue.mockReturnValue(createMockQueue({ autoPlay: true }));

                expect(queueService.isAutoPlayEnabled(guildId)).toBe(true);
            });
        });

        describe('toggleAutoPlay()', () => {
            it('should toggle auto-play on', () => {
                const mockQueue = createMockQueue({ autoPlay: false });
                mockMusicCache.getOrCreateQueue.mockReturnValue(mockQueue);

                const result = queueService.toggleAutoPlay(guildId);

                expect(result).toBe(true);
                expect(mockQueue.autoPlay).toBe(true);
            });

            it('should toggle auto-play off', () => {
                const mockQueue = createMockQueue({ autoPlay: true });
                mockMusicCache.getOrCreateQueue.mockReturnValue(mockQueue);

                const result = queueService.toggleAutoPlay(guildId);

                expect(result).toBe(false);
                expect(mockQueue.autoPlay).toBe(false);
            });
        });
    });

    describe('Skip Vote', () => {
        describe('startSkipVote()', () => {
            it('should start skip vote', () => {
                queueService.startSkipVote(guildId, 'track-123');

                expect(mockMusicCache.startSkipVote).toHaveBeenCalledWith(guildId, 'track-123');
            });
        });

        describe('addSkipVote()', () => {
            it('should add vote', () => {
                mockMusicCache.addSkipVote.mockReturnValue({ added: true, voteCount: 2 });

                const result = queueService.addSkipVote(guildId, 'user-123');

                expect(result).toEqual({ added: true, voteCount: 2 });
            });
        });

        describe('endSkipVote()', () => {
            it('should end skip vote', () => {
                queueService.endSkipVote(guildId);

                expect(mockMusicCache.endSkipVote).toHaveBeenCalledWith(guildId);
            });
        });

        describe('isSkipVoteActive()', () => {
            it('should return skip vote status', () => {
                mockMusicCache.hasActiveSkipVote.mockReturnValue(true);

                expect(queueService.isSkipVoteActive(guildId)).toBe(true);
            });
        });

        describe('hasEnoughSkipVotes()', () => {
            it('should check if enough votes', () => {
                mockMusicCache.hasEnoughSkipVotes.mockReturnValue(true);

                expect(queueService.hasEnoughSkipVotes(guildId, 3)).toBe(true);
                expect(mockMusicCache.hasEnoughSkipVotes).toHaveBeenCalledWith(guildId, 3);
            });
        });
    });

    describe('getState()', () => {
        it('should return full queue state when queue exists', () => {
            const tracks = [createMockTrack()];
            const currentTrack = createMockTrack({ title: 'Current' });
            mockMusicCache.getQueue.mockReturnValue(createMockQueue({
                tracks,
                currentTrack,
                loopMode: 'track',
                isShuffled: true,
                volume: 80,
                autoPlay: true,
                voiceChannelId: 'voice-123',
                textChannelId: 'text-456',
            }));

            const state = queueService.getState(guildId);

            expect(state.exists).toBe(true);
            expect(state.tracks).toEqual(tracks);
            expect(state.trackCount).toBe(1);
            expect(state.currentTrack).toBe(currentTrack);
            expect(state.loopMode).toBe('track');
            expect(state.isShuffled).toBe(true);
            expect(state.volume).toBe(80);
            expect(state.autoPlay).toBe(true);
            expect(state.voiceChannelId).toBe('voice-123');
            expect(state.textChannelId).toBe('text-456');
        });

        it('should return default state when no queue', () => {
            mockMusicCache.getQueue.mockReturnValue(null);

            const state = queueService.getState(guildId);

            expect(state.exists).toBe(false);
            expect(state.tracks).toEqual([]);
            expect(state.currentTrack).toBeNull();
            expect(state.loopMode).toBe('off');
            expect(state.isShuffled).toBe(false);
            expect(state.volume).toBe(100);
            expect(state.autoPlay).toBe(false);
        });
    });

    describe('destroy()', () => {
        it('should delete queue', () => {
            queueService.destroy(guildId);

            expect(mockMusicCache.deleteQueue).toHaveBeenCalledWith(guildId);
        });
    });
});
