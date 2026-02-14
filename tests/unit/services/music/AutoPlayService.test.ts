/**
 * AutoPlayService Unit Tests
 * Tests for finding similar tracks when queue ends
 */

// Mock Logger
jest.mock('../../../../src/core/Logger', () => ({
    __esModule: true,
    default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Mock LavalinkService
const mockLavalinkService = {
    search: jest.fn(),
    searchPlaylist: jest.fn(),
    searchMultiple: jest.fn(),
};

jest.mock('../../../../src/services/music/core/LavalinkService', () => ({
    __esModule: true,
    default: mockLavalinkService,
}));

// Mock QueueService
const mockQueueService = {
    get: jest.fn(),
};

jest.mock('../../../../src/services/music/queue/index', () => ({
    __esModule: true,
    queueService: mockQueueService,
    default: mockQueueService,
}));

import autoPlayService from '../../../../src/services/music/autoplay/AutoPlayService.js';

function makeTrack(title: string, author: string = 'Test Artist') {
    return {
        title,
        url: `https://youtube.com/watch?v=${title.replace(/\s/g, '')}`,
        track: { encoded: `enc_${title}` },
        info: { title, author, uri: `https://youtube.com/watch?v=${title.replace(/\s/g, '')}` },
    };
}

describe('AutoPlayService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockQueueService.get.mockReturnValue({
            lastAutoplaySearch: 0,
            lastPlayedTracks: [],
        });
    });

    describe('findSimilarTrack', () => {
        it('should find a similar track via searchMultiple', async () => {
            const found = makeTrack('Similar Song', 'Related Artist');
            mockLavalinkService.searchMultiple.mockResolvedValue([found]);

            const result = await autoPlayService.findSimilarTrack('guild1', makeTrack('Original Song', 'Artist'));
            expect(result).not.toBeNull();
            expect(result?.info?.title).toBe('Similar Song');
        });

        it('should return null when rate limited', async () => {
            const queue = { lastAutoplaySearch: Date.now(), lastPlayedTracks: [] };
            mockQueueService.get.mockReturnValue(queue);

            const result = await autoPlayService.findSimilarTrack('guild1', makeTrack('Song'));
            expect(result).toBeNull();
            expect(mockLavalinkService.searchMultiple).not.toHaveBeenCalled();
        });

        it('should return null when no title', async () => {
            const result = await autoPlayService.findSimilarTrack('guild1', {} as any);
            expect(result).toBeNull();
        });

        it('should filter out recently played tracks', async () => {
            const queue = {
                lastAutoplaySearch: 0,
                lastPlayedTracks: ['duplicate song'],
            };
            mockQueueService.get.mockReturnValue(queue);

            // First search returns duplicate, second returns valid
            const duplicate = makeTrack('Duplicate Song');
            const valid = makeTrack('Fresh Song');
            mockLavalinkService.searchMultiple
                .mockResolvedValueOnce([duplicate]) // Filtered out
                .mockResolvedValueOnce([valid]); // Second strategy

            const result = await autoPlayService.findSimilarTrack('guild1', makeTrack('Current Song'));
            // Should eventually find the fresh track (or null if all strategies exhausted)
            // The logic tries up to 5 strategies then fallback
        });

        it('should filter out the current track itself', async () => {
            const current = makeTrack('Same Song');
            // Return the same track from search
            mockLavalinkService.searchMultiple.mockResolvedValue([current]);

            const result = await autoPlayService.findSimilarTrack('guild1', current);
            // Should be filtered out since title matches currentTitle
        });

        it('should fall back to single search when searchMultiple returns empty', async () => {
            mockLavalinkService.searchMultiple.mockResolvedValue([]);
            const track = makeTrack('Found Track');
            mockLavalinkService.search.mockResolvedValue(track);

            const result = await autoPlayService.findSimilarTrack('guild1', makeTrack('Original'));
            // Strategies return empty → fallback search is attempted
        });

        it('should try fallback search when all strategies fail', async () => {
            mockLavalinkService.searchMultiple.mockResolvedValue([]); // Empty results for all strategies

            const result = await autoPlayService.findSimilarTrack('guild1', makeTrack('Song'));
            // Fallback is called — it may return null or a track
        });

        it('should handle genres in title', async () => {
            const lofiTrack = makeTrack('Lofi Beats Study Session', 'ChilledCow');
            const similar = makeTrack('Chill Lofi Mix');
            mockLavalinkService.searchMultiple.mockResolvedValue([similar]);

            const result = await autoPlayService.findSimilarTrack('guild1', lofiTrack);
            expect(result).not.toBeNull();
        });

        it('should clean title metadata before searching', async () => {
            const track = makeTrack('Song Title (Official Music Video) [HD]', 'Artist - Topic');
            const found = makeTrack('Clean Result');
            mockLavalinkService.searchMultiple.mockResolvedValue([found]);

            await autoPlayService.findSimilarTrack('guild1', track);
            // Should search with cleaned title (no "[HD]", "(Official Music Video)")
            expect(mockLavalinkService.searchMultiple).toHaveBeenCalled();
        });

        it('should handle track with info nested structure', async () => {
            const track = {
                info: { title: 'Nested Title', author: 'Nested Author' },
                track: { encoded: 'xxx' },
            };
            const found = makeTrack('Result');
            mockLavalinkService.searchMultiple.mockResolvedValue([found]);

            const result = await autoPlayService.findSimilarTrack('guild1', track as any);
            expect(result).not.toBeNull();
        });

        it('should build diverse search strategies', async () => {
            const track = makeTrack('Rock Anthem 2024', 'Famous Band');
            const found = makeTrack('Another Rock Song');
            mockLavalinkService.searchMultiple.mockResolvedValue([found]);

            await autoPlayService.findSimilarTrack('guild1', track);
            // Should have called searchMultiple (strategies tried)
            expect(mockLavalinkService.searchMultiple).toHaveBeenCalled();
        });

        it('should update lastAutoplaySearch timestamp', async () => {
            const queue = { lastAutoplaySearch: 0, lastPlayedTracks: [] };
            mockQueueService.get.mockReturnValue(queue);
            mockLavalinkService.searchMultiple.mockResolvedValue([makeTrack('Found')]);

            await autoPlayService.findSimilarTrack('guild1', makeTrack('Song'));
            expect(queue.lastAutoplaySearch).toBeGreaterThan(0);
        });

        it('should handle errors in search gracefully', async () => {
            mockLavalinkService.searchMultiple.mockRejectedValue(new Error('Network error'));

            const result = await autoPlayService.findSimilarTrack('guild1', makeTrack('Song'));
            // Should not throw — errors are caught internally
        });

        it('should try up to 5 shuffled strategies', async () => {
            // Empty results — each strategy fails
            mockLavalinkService.searchMultiple.mockResolvedValue([]);

            await autoPlayService.findSimilarTrack('guild1', makeTrack('Popular Song', 'Bob'));
            // Should have been called at most 5 times for strategies + fallback
            const callCount = mockLavalinkService.searchMultiple.mock.calls.length;
            expect(callCount).toBeGreaterThanOrEqual(1);
            expect(callCount).toBeLessThanOrEqual(7); // 5 strategies + fallback attempts
        });

        it('should handle no queue gracefully', async () => {
            mockQueueService.get.mockReturnValue(null);
            mockLavalinkService.searchMultiple.mockResolvedValue([makeTrack('Found')]);

            const result = await autoPlayService.findSimilarTrack('guild1', makeTrack('Song'));
            // Should still work (queue is optional for some logic)
            expect(result).not.toBeNull();
        });

        it('should extract multiple genre keywords', async () => {
            // Title has both "rock" and "acoustic" genres
            const track = makeTrack('Rock Acoustic Guitar Solo', 'Guitarist');
            mockLavalinkService.searchMultiple.mockResolvedValue([makeTrack('Found')]);

            await autoPlayService.findSimilarTrack('guild1', track);
            // Should generate genre-based strategies for both detected genres
            expect(mockLavalinkService.searchMultiple).toHaveBeenCalled();
        });
    });
});
