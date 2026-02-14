/**
 * QueueCache Unit Tests
 * Tests for the in-memory music queue cache
 */

// Mock Logger
jest.mock('../../../../src/core/Logger', () => ({
    __esModule: true,
    default: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    },
}));

// Mock constants
jest.mock('../../../../src/constants', () => ({
    __esModule: true,
    CACHE_LIMITS: {
        MAX_GUILDS: 5, // Small limit for testing eviction
        MAX_QUEUE_SIZE: 10,
        MAX_QUEUE_TRACK_DURATION: 3 * 60 * 60 * 1000,
        MAX_USER_SESSIONS: 5000,
        MAX_USER_HISTORY: 100,
        MAX_USER_FAVORITES: 200,
        MAX_PLAYLIST_CACHE: 100,
        MAX_RECENTLY_PLAYED: 50,
        MAX_API_CACHE_ENTRIES: 1000,
        MAX_SNIPE_MESSAGES: 50,
    },
}));

import { queueCache, MusicTrack, MusicQueue, MessageRef } from '../../../../src/cache/music/QueueCache.js';

// Helper to create a test track
function makeTrack(title: string, url?: string): MusicTrack {
    return {
        title,
        url: url || `https://youtube.com/watch?v=${title.replace(/\s/g, '')}`,
        author: 'Test Artist',
        track: { encoded: `encoded_${title}` },
        info: { title, author: 'Test Artist', uri: url },
    };
}

describe('QueueCache', () => {
    beforeEach(() => {
        // Clear all queues before each test
        queueCache.shutdown();
        jest.clearAllMocks();
    });

    describe('getOrCreate', () => {
        it('should create a default queue for a new guild', () => {
            const queue = queueCache.getOrCreate('guild1');
            expect(queue).toBeDefined();
            expect(queue.guildId).toBe('guild1');
            expect(queue.tracks).toEqual([]);
            expect(queue.currentTrack).toBeNull();
            expect(queue.volume).toBe(100);
            expect(queue.loopMode).toBe('off');
            expect(queue.isShuffled).toBe(false);
            expect(queue.isPaused).toBe(false);
            expect(queue.autoPlay).toBe(false);
            expect(queue.nowPlayingMessage).toBeNull();
            expect(queue.eventsBound).toBe(false);
        });

        it('should return existing queue for known guild', () => {
            const queue1 = queueCache.getOrCreate('guild1');
            queue1.volume = 50;
            const queue2 = queueCache.getOrCreate('guild1');
            expect(queue2.volume).toBe(50);
            expect(queue2).toBe(queue1);
        });

        it('should update lastAccessed on get', () => {
            const queue = queueCache.getOrCreate('guild1');
            const before = queue.lastAccessed;
            // Small delay
            jest.advanceTimersByTime?.(10);
            const queue2 = queueCache.getOrCreate('guild1');
            expect(queue2.lastAccessed).toBeGreaterThanOrEqual(before);
        });

        it('should evict oldest inactive queue when at capacity', () => {
            // MAX_GUILDS is 5 in our mock
            for (let i = 0; i < 5; i++) {
                const q = queueCache.getOrCreate(`guild${i}`);
                // Make guild0 the oldest by giving it a very old lastAccessed
                if (i === 0) {
                    q.lastAccessed = 1000;
                }
            }

            // Should be at capacity
            expect(queueCache.getStats().totalQueues).toBe(5);

            // Creating a 6th should evict guild0 (oldest inactive)
            queueCache.getOrCreate('guild5');
            expect(queueCache.get('guild0')).toBeNull(); // guild0 evicted
            expect(queueCache.getStats().totalQueues).toBe(5);
        });

        it('should not evict queues with a currentTrack (active)', () => {
            for (let i = 0; i < 5; i++) {
                const q = queueCache.getOrCreate(`guild${i}`);
                q.lastAccessed = 1000 + i;
            }
            // Make the oldest one active
            queueCache.getOrCreate('guild0').currentTrack = makeTrack('Active Song');
            queueCache.getOrCreate('guild0').lastAccessed = 1;

            // Create 6th — should evict guild1 (oldest inactive), not guild0
            queueCache.getOrCreate('guild5');
            expect(queueCache.get('guild0')).not.toBeNull(); // still exists (active)
            expect(queueCache.get('guild1')).toBeNull(); // evicted (oldest inactive)
        });
    });

    describe('get', () => {
        it('should return null for unknown guild', () => {
            expect(queueCache.get('unknown')).toBeNull();
        });

        it('should return queue for known guild', () => {
            queueCache.getOrCreate('guild1');
            expect(queueCache.get('guild1')).not.toBeNull();
        });
    });

    describe('update', () => {
        it('should update queue properties', () => {
            queueCache.getOrCreate('guild1');
            const updated = queueCache.update('guild1', { volume: 50, isPaused: true });
            expect(updated?.volume).toBe(50);
            expect(updated?.isPaused).toBe(true);
        });

        it('should return null for unknown guild', () => {
            expect(queueCache.update('unknown', { volume: 50 })).toBeNull();
        });

        it('should update updatedAt timestamp', () => {
            const queue = queueCache.getOrCreate('guild1');
            const before = queue.updatedAt;
            queueCache.update('guild1', { volume: 75 });
            expect(queue.updatedAt).toBeGreaterThanOrEqual(before);
        });
    });

    describe('delete', () => {
        it('should remove queue', () => {
            queueCache.getOrCreate('guild1');
            expect(queueCache.delete('guild1')).toBe(true);
            expect(queueCache.get('guild1')).toBeNull();
        });

        it('should return false for unknown guild', () => {
            expect(queueCache.delete('unknown')).toBe(false);
        });

        it('should clear inactivity timer', () => {
            const queue = queueCache.getOrCreate('guild1');
            const timer = setTimeout(() => {}, 10000);
            queue.inactivityTimer = timer;
            const clearSpy = jest.spyOn(global, 'clearTimeout');
            queueCache.delete('guild1');
            expect(clearSpy).toHaveBeenCalledWith(timer);
            clearSpy.mockRestore();
        });

        it('should clear vcMonitorInterval', () => {
            const queue = queueCache.getOrCreate('guild1');
            const interval = setInterval(() => {}, 10000);
            queue.vcMonitorInterval = interval;
            const clearSpy = jest.spyOn(global, 'clearInterval');
            queueCache.delete('guild1');
            expect(clearSpy).toHaveBeenCalledWith(interval);
            clearSpy.mockRestore();
        });

        it('should null out message references', () => {
            const queue = queueCache.getOrCreate('guild1');
            queue.nowPlayingMessage = { messageId: '123', channelId: '456' };
            queue.controlsMessage = { messageId: '789', channelId: '012' };
            queueCache.delete('guild1');
            expect(queue.nowPlayingMessage).toBeNull();
            expect(queue.controlsMessage).toBeNull();
        });
    });

    describe('has', () => {
        it('should return true for existing queue', () => {
            queueCache.getOrCreate('guild1');
            expect(queueCache.has('guild1')).toBe(true);
        });

        it('should return false for non-existent queue', () => {
            expect(queueCache.has('unknown')).toBe(false);
        });
    });

    describe('getActiveGuildIds', () => {
        it('should return all guild IDs', () => {
            queueCache.getOrCreate('guild1');
            queueCache.getOrCreate('guild2');
            const ids = queueCache.getActiveGuildIds();
            expect(ids).toContain('guild1');
            expect(ids).toContain('guild2');
            expect(ids.length).toBe(2);
        });
    });

    describe('addTrack', () => {
        it('should add track to queue', () => {
            const track = makeTrack('Song 1');
            const result = queueCache.addTrack('guild1', track);
            expect(result.success).toBe(true);
            expect(result.position).toBe(1);
        });

        it('should add track to end', () => {
            queueCache.addTrack('guild1', makeTrack('Song 1'));
            queueCache.addTrack('guild1', makeTrack('Song 2'));
            const queue = queueCache.get('guild1')!;
            expect(queue.tracks[0].title).toBe('Song 1');
            expect(queue.tracks[1].title).toBe('Song 2');
        });

        it('should also add to originalTracks', () => {
            queueCache.addTrack('guild1', makeTrack('Song 1'));
            const queue = queueCache.get('guild1')!;
            expect(queue.originalTracks.length).toBe(1);
        });

        it('should reject when queue is full', () => {
            // MAX_QUEUE_SIZE = 10
            for (let i = 0; i < 10; i++) {
                queueCache.addTrack('guild1', makeTrack(`Song ${i}`));
            }
            const result = queueCache.addTrack('guild1', makeTrack('Overflow'));
            expect(result.success).toBe(false);
            expect(result.reason).toBe('QUEUE_FULL');
            expect(result.maxSize).toBe(10);
        });
    });

    describe('addTrackToFront', () => {
        it('should add track to beginning', () => {
            queueCache.addTrack('guild1', makeTrack('Song 1'));
            queueCache.addTrackToFront('guild1', makeTrack('Priority'));
            const queue = queueCache.get('guild1')!;
            expect(queue.tracks[0].title).toBe('Priority');
            expect(queue.tracks[1].title).toBe('Song 1');
        });

        it('should return position 1', () => {
            const result = queueCache.addTrackToFront('guild1', makeTrack('Priority'));
            expect(result.position).toBe(1);
        });

        it('should reject when queue is full', () => {
            for (let i = 0; i < 10; i++) {
                queueCache.addTrack('guild1', makeTrack(`Song ${i}`));
            }
            const result = queueCache.addTrackToFront('guild1', makeTrack('Overflow'));
            expect(result.success).toBe(false);
            expect(result.reason).toBe('QUEUE_FULL');
        });
    });

    describe('addTracks', () => {
        it('should add multiple tracks', () => {
            const tracks = [makeTrack('A'), makeTrack('B'), makeTrack('C')];
            const result = queueCache.addTracks('guild1', tracks);
            expect(result.success).toBe(true);
            expect(result.added).toBe(3);
            expect(result.skipped).toBe(0);
        });

        it('should partially add when hitting limit', () => {
            // Fill to 8
            for (let i = 0; i < 8; i++) {
                queueCache.addTrack('guild1', makeTrack(`Song ${i}`));
            }
            // Try to add 5 more (only 2 slots available)
            const tracks = [makeTrack('A'), makeTrack('B'), makeTrack('C'), makeTrack('D'), makeTrack('E')];
            const result = queueCache.addTracks('guild1', tracks);
            expect(result.added).toBe(2);
            expect(result.skipped).toBe(3);
            expect(result.totalLength).toBe(10);
        });
    });

    describe('removeTrack', () => {
        it('should remove track at index', () => {
            queueCache.addTrack('guild1', makeTrack('Song 0'));
            queueCache.addTrack('guild1', makeTrack('Song 1'));
            queueCache.addTrack('guild1', makeTrack('Song 2'));
            const removed = queueCache.removeTrack('guild1', 1);
            expect(removed?.title).toBe('Song 1');
            expect(queueCache.get('guild1')!.tracks.length).toBe(2);
        });

        it('should return null for invalid index', () => {
            queueCache.addTrack('guild1', makeTrack('Song'));
            expect(queueCache.removeTrack('guild1', -1)).toBeNull();
            expect(queueCache.removeTrack('guild1', 5)).toBeNull();
        });

        it('should return null for unknown guild', () => {
            expect(queueCache.removeTrack('unknown', 0)).toBeNull();
        });
    });

    describe('clearTracks', () => {
        it('should clear all tracks', () => {
            queueCache.addTrack('guild1', makeTrack('A'));
            queueCache.addTrack('guild1', makeTrack('B'));
            queueCache.clearTracks('guild1');
            const queue = queueCache.get('guild1')!;
            expect(queue.tracks).toEqual([]);
            expect(queue.originalTracks).toEqual([]);
            expect(queue.currentTrack).toBeNull();
            expect(queue.position).toBe(0);
        });

        it('should do nothing for unknown guild', () => {
            // Should not throw
            expect(() => queueCache.clearTracks('unknown')).not.toThrow();
        });
    });

    describe('getNextTrack', () => {
        it('should return and remove the first track', () => {
            queueCache.addTrack('guild1', makeTrack('Song 1'));
            queueCache.addTrack('guild1', makeTrack('Song 2'));
            const next = queueCache.getNextTrack('guild1');
            expect(next?.title).toBe('Song 1');
            expect(queueCache.get('guild1')!.tracks.length).toBe(1);
        });

        it('should return null for empty queue', () => {
            queueCache.getOrCreate('guild1');
            expect(queueCache.getNextTrack('guild1')).toBeNull();
        });

        it('should return null for unknown guild', () => {
            expect(queueCache.getNextTrack('unknown')).toBeNull();
        });
    });

    describe('shuffle / unshuffle', () => {
        it('should set isShuffled to true', () => {
            queueCache.addTrack('guild1', makeTrack('A'));
            queueCache.addTrack('guild1', makeTrack('B'));
            queueCache.addTrack('guild1', makeTrack('C'));
            queueCache.shuffle('guild1');
            expect(queueCache.get('guild1')!.isShuffled).toBe(true);
        });

        it('should unshuffle and restore original order', () => {
            queueCache.addTrack('guild1', makeTrack('A'));
            queueCache.addTrack('guild1', makeTrack('B'));
            queueCache.addTrack('guild1', makeTrack('C'));
            queueCache.shuffle('guild1');
            queueCache.unshuffle('guild1');
            const queue = queueCache.get('guild1')!;
            expect(queue.isShuffled).toBe(false);
            expect(queue.tracks.map(t => t.title)).toEqual(['A', 'B', 'C']);
        });

        it('should not throw for unknown guild', () => {
            expect(() => queueCache.shuffle('unknown')).not.toThrow();
            expect(() => queueCache.unshuffle('unknown')).not.toThrow();
        });
    });

    describe('setCurrentTrack / getCurrentTrack', () => {
        it('should set and get current track', () => {
            queueCache.getOrCreate('guild1');
            const track = makeTrack('Playing');
            queueCache.setCurrentTrack('guild1', track);
            expect(queueCache.getCurrentTrack('guild1')?.title).toBe('Playing');
        });

        it('should set to null', () => {
            queueCache.getOrCreate('guild1');
            queueCache.setCurrentTrack('guild1', makeTrack('X'));
            queueCache.setCurrentTrack('guild1', null);
            expect(queueCache.getCurrentTrack('guild1')).toBeNull();
        });

        it('should return null for unknown guild', () => {
            expect(queueCache.getCurrentTrack('unknown')).toBeNull();
        });
    });

    describe('togglePause', () => {
        it('should toggle pause state', () => {
            queueCache.getOrCreate('guild1');
            expect(queueCache.togglePause('guild1')).toBe(true);
            expect(queueCache.togglePause('guild1')).toBe(false);
        });

        it('should return false for unknown guild', () => {
            expect(queueCache.togglePause('unknown')).toBe(false);
        });
    });

    describe('loop mode', () => {
        it('should set loop mode', () => {
            queueCache.getOrCreate('guild1');
            queueCache.setLoopMode('guild1', 'track');
            expect(queueCache.get('guild1')!.loopMode).toBe('track');
        });

        it('should reset loopCount when changing mode', () => {
            const queue = queueCache.getOrCreate('guild1');
            queue.loopCount = 5;
            queueCache.setLoopMode('guild1', 'queue');
            expect(queue.loopCount).toBe(0);
        });

        it('should cycle modes off → track → queue → off', () => {
            queueCache.getOrCreate('guild1');
            expect(queueCache.cycleLoopMode('guild1')).toBe('track');
            expect(queueCache.cycleLoopMode('guild1')).toBe('queue');
            expect(queueCache.cycleLoopMode('guild1')).toBe('off');
        });

        it('should return off for unknown guild', () => {
            expect(queueCache.cycleLoopMode('unknown')).toBe('off');
        });
    });

    describe('setVolume', () => {
        it('should set volume', () => {
            queueCache.getOrCreate('guild1');
            expect(queueCache.setVolume('guild1', 75)).toBe(75);
        });

        it('should clamp volume 0-200', () => {
            queueCache.getOrCreate('guild1');
            expect(queueCache.setVolume('guild1', -10)).toBe(0);
            expect(queueCache.setVolume('guild1', 300)).toBe(200);
        });

        it('should return 100 for unknown guild', () => {
            expect(queueCache.setVolume('unknown', 50)).toBe(100);
        });
    });

    describe('nowPlayingMessage', () => {
        it('should store MessageRef', () => {
            queueCache.getOrCreate('guild1');
            const ref: MessageRef = { messageId: '123', channelId: '456' };
            queueCache.setNowPlayingMessage('guild1', ref);
            expect(queueCache.getNowPlayingMessage('guild1')).toEqual(ref);
        });

        it('should accept Discord Message-like object (with .id)', () => {
            queueCache.getOrCreate('guild1');
            queueCache.setNowPlayingMessage('guild1', { id: 'msg1', channelId: 'ch1' });
            expect(queueCache.getNowPlayingMessage('guild1')).toEqual({
                messageId: 'msg1',
                channelId: 'ch1',
            });
        });

        it('should clear message', () => {
            queueCache.getOrCreate('guild1');
            queueCache.setNowPlayingMessage('guild1', { messageId: '123', channelId: '456' });
            queueCache.clearNowPlayingMessage('guild1');
            expect(queueCache.getNowPlayingMessage('guild1')).toBeNull();
        });

        it('should set to null', () => {
            queueCache.getOrCreate('guild1');
            queueCache.setNowPlayingMessage('guild1', { messageId: '123', channelId: '456' });
            queueCache.setNowPlayingMessage('guild1', null);
            expect(queueCache.getNowPlayingMessage('guild1')).toBeNull();
        });

        it('should return null for unknown guild', () => {
            expect(queueCache.getNowPlayingMessage('unknown')).toBeNull();
        });
    });

    describe('cleanup', () => {
        it('should remove stale queues (>1 hour inactive)', () => {
            const queue = queueCache.getOrCreate('guild1');
            // Make it stale
            queue.lastAccessed = Date.now() - 2 * 60 * 60 * 1000; // 2 hours ago
            queueCache.cleanup();
            expect(queueCache.get('guild1')).toBeNull();
        });

        it('should not remove active queues (with currentTrack)', () => {
            const queue = queueCache.getOrCreate('guild1');
            queue.lastAccessed = Date.now() - 2 * 60 * 60 * 1000;
            queue.currentTrack = makeTrack('Active');
            queueCache.cleanup();
            expect(queueCache.get('guild1')).not.toBeNull();
        });

        it('should not remove recent queues', () => {
            queueCache.getOrCreate('guild1');
            queueCache.cleanup();
            expect(queueCache.get('guild1')).not.toBeNull();
        });
    });

    describe('getStats', () => {
        it('should return correct stats', () => {
            queueCache.getOrCreate('guild1');
            queueCache.addTrack('guild1', makeTrack('A'));
            queueCache.addTrack('guild1', makeTrack('B'));
            const q = queueCache.getOrCreate('guild2');
            q.currentTrack = makeTrack('Playing');

            const stats = queueCache.getStats();
            expect(stats.totalQueues).toBe(2);
            expect(stats.activeQueues).toBe(1); // guild2 has currentTrack
            expect(stats.totalTracks).toBe(2); // guild1 has 2 tracks
            expect(stats.maxGuilds).toBe(5);
            expect(stats.maxQueueSize).toBe(10);
        });
    });

    describe('shutdown', () => {
        it('should clear all queues', () => {
            queueCache.getOrCreate('guild1');
            queueCache.getOrCreate('guild2');
            queueCache.shutdown();
            expect(queueCache.getStats().totalQueues).toBe(0);
        });

        it('should clear timers on shutdown', () => {
            const queue = queueCache.getOrCreate('guild1');
            queue.inactivityTimer = setTimeout(() => {}, 60000);
            const clearSpy = jest.spyOn(global, 'clearTimeout');
            queueCache.shutdown();
            expect(clearSpy).toHaveBeenCalled();
            clearSpy.mockRestore();
        });
    });
});
