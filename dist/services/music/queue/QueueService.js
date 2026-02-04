"use strict";
/**
 * Queue Service
 * Handles queue CRUD operations
 * Extracted from MusicService for single responsibility
 * @module services/music/queue/QueueService
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueService = void 0;
const Result_js_1 = require("../../../core/Result.js");
const ErrorCodes_js_1 = require("../../../core/ErrorCodes.js");
const MusicCacheFacade_js_1 = __importDefault(require("../../../cache/music/MusicCacheFacade.js"));
// Type assertion for the imported cache
const musicCache = MusicCacheFacade_js_1.default;
// QUEUE SERVICE CLASS
class QueueService {
    /**
     * Get or create queue for a guild
     */
    getOrCreate(guildId) {
        return musicCache.getOrCreateQueue(guildId);
    }
    /**
     * Get queue for a guild
     */
    get(guildId) {
        return musicCache.getQueue(guildId);
    }
    /**
     * Get tracks in queue
     */
    getTracks(guildId) {
        const queue = musicCache.getQueue(guildId);
        return queue?.tracks || [];
    }
    /**
     * Get queue length
     */
    getLength(guildId) {
        return this.getTracks(guildId).length;
    }
    /**
     * Check if queue is empty
     */
    isEmpty(guildId) {
        return this.getLength(guildId) === 0;
    }
    /**
     * Get current track
     */
    getCurrentTrack(guildId) {
        return musicCache.getCurrentTrack(guildId);
    }
    /**
     * Set current track
     */
    setCurrentTrack(guildId, track) {
        musicCache.setCurrentTrack(guildId, track);
    }
    /**
     * Add track to end of queue
     */
    addTrack(guildId, track) {
        try {
            const result = musicCache.addTrack(guildId, track);
            if (result === false) {
                return Result_js_1.Result.err(ErrorCodes_js_1.ErrorCodes.QUEUE_FULL, 'Queue is full.');
            }
            return Result_js_1.Result.ok({ position: this.getLength(guildId) });
        }
        catch (error) {
            return Result_js_1.Result.fromError(error);
        }
    }
    /**
     * Add track to front of queue (priority)
     */
    addTrackToFront(guildId, track) {
        try {
            const result = musicCache.addTrackToFront(guildId, track);
            if (result === false || result === 0) {
                return Result_js_1.Result.err(ErrorCodes_js_1.ErrorCodes.QUEUE_FULL, 'Queue is full.');
            }
            return Result_js_1.Result.ok({ position: 1 });
        }
        catch (error) {
            return Result_js_1.Result.fromError(error);
        }
    }
    /**
     * Add multiple tracks
     */
    addTracks(guildId, tracks) {
        try {
            const added = musicCache.addTracks(guildId, tracks);
            return Result_js_1.Result.ok({ added: added?.length || tracks.length });
        }
        catch (error) {
            return Result_js_1.Result.fromError(error);
        }
    }
    /**
     * Remove track at index
     */
    removeTrack(guildId, index) {
        try {
            const tracks = this.getTracks(guildId);
            if (index < 0 || index >= tracks.length) {
                return Result_js_1.Result.err(ErrorCodes_js_1.ErrorCodes.INVALID_POSITION, 'Invalid track position.');
            }
            const removed = musicCache.removeTrack(guildId, index);
            return Result_js_1.Result.ok({ removed });
        }
        catch (error) {
            return Result_js_1.Result.fromError(error);
        }
    }
    /**
     * Clear all tracks from queue
     */
    clear(guildId) {
        musicCache.clearTracks(guildId);
    }
    /**
     * Move track from one position to another
     */
    moveTrack(guildId, fromIndex, toIndex) {
        const queue = musicCache.getQueue(guildId);
        if (!queue) {
            return Result_js_1.Result.err(ErrorCodes_js_1.ErrorCodes.NO_QUEUE, 'No queue exists.');
        }
        if (fromIndex < 0 || fromIndex >= queue.tracks.length) {
            return Result_js_1.Result.err(ErrorCodes_js_1.ErrorCodes.INVALID_POSITION, 'Invalid source position.');
        }
        if (toIndex < 0 || toIndex >= queue.tracks.length) {
            return Result_js_1.Result.err(ErrorCodes_js_1.ErrorCodes.INVALID_POSITION, 'Invalid destination position.');
        }
        const [track] = queue.tracks.splice(fromIndex, 1);
        queue.tracks.splice(toIndex, 0, track);
        return Result_js_1.Result.ok({ track, from: fromIndex, to: toIndex });
    }
    /**
     * Get next track from queue
     */
    getNextTrack(guildId) {
        return musicCache.getNextTrack(guildId);
    }
    // LOOP MODE
    /**
     * Get loop mode
     */
    getLoopMode(guildId) {
        const queue = musicCache.getQueue(guildId);
        return queue?.loopMode || 'off';
    }
    /**
     * Set loop mode
     */
    setLoopMode(guildId, mode) {
        musicCache.setLoopMode(guildId, mode);
    }
    /**
     * Cycle through loop modes
     */
    cycleLoopMode(guildId) {
        return musicCache.cycleLoopMode(guildId);
    }
    /**
     * Get loop count for current track
     */
    getLoopCount(guildId) {
        return musicCache.getLoopCount(guildId) || 0;
    }
    /**
     * Increment loop count
     */
    incrementLoopCount(guildId) {
        return musicCache.incrementLoopCount(guildId);
    }
    /**
     * Reset loop count
     */
    resetLoopCount(guildId) {
        musicCache.resetLoopCount(guildId);
    }
    // SHUFFLE
    /**
     * Check if queue is shuffled
     */
    isShuffled(guildId) {
        return musicCache.getQueue(guildId)?.isShuffled || false;
    }
    /**
     * Toggle shuffle
     */
    toggleShuffle(guildId) {
        const queue = musicCache.getQueue(guildId);
        if (!queue)
            return false;
        if (queue.isShuffled) {
            musicCache.unshuffleQueue(guildId);
        }
        else {
            musicCache.shuffleQueue(guildId);
        }
        return queue.isShuffled;
    }
    // VOLUME
    /**
     * Get volume
     */
    getVolume(guildId) {
        return musicCache.getQueue(guildId)?.volume || 100;
    }
    /**
     * Set volume in cache
     */
    setVolume(guildId, volume) {
        const clampedVolume = Math.max(0, Math.min(200, volume));
        musicCache.setVolume(guildId, clampedVolume);
        return clampedVolume;
    }
    // AUTO-PLAY
    /**
     * Check if auto-play is enabled
     */
    isAutoPlayEnabled(guildId) {
        return musicCache.getQueue(guildId)?.autoPlay || false;
    }
    /**
     * Toggle auto-play
     */
    toggleAutoPlay(guildId) {
        const queue = this.getOrCreate(guildId);
        queue.autoPlay = !queue.autoPlay;
        return queue.autoPlay;
    }
    // SKIP VOTE
    /**
     * Start skip vote
     */
    startSkipVote(guildId, trackId) {
        musicCache.startSkipVote(guildId, trackId);
    }
    /**
     * Add vote to skip
     */
    addSkipVote(guildId, odId) {
        return musicCache.addSkipVote(guildId, odId);
    }
    /**
     * End skip vote
     */
    endSkipVote(guildId) {
        musicCache.endSkipVote(guildId);
    }
    /**
     * Check if skip vote is active
     */
    isSkipVoteActive(guildId) {
        return musicCache.hasActiveSkipVote(guildId);
    }
    /**
     * Check if enough skip votes
     */
    hasEnoughSkipVotes(guildId, requiredVotes) {
        return musicCache.hasEnoughSkipVotes(guildId, requiredVotes);
    }
    // STATE
    /**
     * Get full queue state
     */
    getState(guildId) {
        const queue = musicCache.getQueue(guildId);
        if (!queue) {
            return {
                exists: false,
                tracks: [],
                currentTrack: null,
                loopMode: 'off',
                isShuffled: false,
                volume: 100,
                autoPlay: false
            };
        }
        return {
            exists: true,
            tracks: queue.tracks || [],
            trackCount: queue.tracks?.length || 0,
            currentTrack: queue.currentTrack,
            loopMode: queue.loopMode || 'off',
            isShuffled: queue.isShuffled || false,
            volume: queue.volume || 100,
            autoPlay: queue.autoPlay || false,
            voiceChannelId: queue.voiceChannelId,
            textChannelId: queue.textChannelId
        };
    }
    /**
     * Destroy queue completely
     */
    destroy(guildId) {
        musicCache.deleteQueue(guildId);
    }
}
exports.QueueService = QueueService;
// Export singleton instance and class
const queueService = new QueueService();
exports.default = queueService;
//# sourceMappingURL=QueueService.js.map