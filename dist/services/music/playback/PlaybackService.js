"use strict";
/**
 * Playback Service
 * Handles play, pause, skip, stop operations
 * Extracted from MusicService for single responsibility
 * @module services/music/playback/PlaybackService
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlaybackService = void 0;
const LavalinkService_js_1 = __importDefault(require("../LavalinkService.js"));
const index_js_1 = require("../queue/index.js");
const MusicCacheFacade_js_1 = __importDefault(require("../../../cache/music/MusicCacheFacade.js"));
const Result_js_1 = require("../../../core/Result.js");
const ErrorCodes_js_1 = require("../../../core/ErrorCodes.js");
// GUILD MUTEX CLASS
/**
 * Simple mutex implementation for guild-level locking
 * Prevents race conditions in track transitions
 */
class GuildMutex {
    locks = new Map();
    async acquire(guildId, timeout = 5000) {
        const startTime = Date.now();
        while (this.locks.get(guildId)) {
            if (Date.now() - startTime > timeout) {
                console.warn(`[PlaybackMutex] Lock timeout for guild ${guildId}`);
                return false;
            }
            await new Promise(r => setTimeout(r, 50));
        }
        this.locks.set(guildId, true);
        return true;
    }
    release(guildId) {
        this.locks.delete(guildId);
    }
    isLocked(guildId) {
        return this.locks.get(guildId) === true;
    }
}
// PLAYBACK SERVICE CLASS
class PlaybackService {
    transitionMutex;
    constructor() {
        this.transitionMutex = new GuildMutex();
    }
    /**
     * Get player for guild
     */
    getPlayer(guildId) {
        return LavalinkService_js_1.default.getPlayer(guildId);
    }
    /**
     * Check if Lavalink is ready
     */
    isLavalinkReady() {
        return LavalinkService_js_1.default.isReady;
    }
    /**
     * Play a track
     */
    async playTrack(guildId, track) {
        try {
            const player = this.getPlayer(guildId);
            if (!player) {
                return Result_js_1.Result.err(ErrorCodes_js_1.ErrorCodes.NO_PLAYER, 'No player available.');
            }
            if (!track?.track?.encoded) {
                return Result_js_1.Result.err(ErrorCodes_js_1.ErrorCodes.TRACK_NOT_FOUND, 'Invalid track data.');
            }
            // Set replacing flag if there's a current track to prevent exception handler
            const queue = MusicCacheFacade_js_1.default.getQueue(guildId);
            const hadCurrentTrack = !!index_js_1.queueService.getCurrentTrack(guildId);
            if (hadCurrentTrack && queue) {
                queue.isReplacing = true;
            }
            index_js_1.queueService.setCurrentTrack(guildId, track);
            try {
                // Shoukaku expects { track: { encoded: "..." } }
                await player.playTrack({ track: { encoded: track.track.encoded } });
            }
            finally {
                // Clear replacing flag after a delay
                if (queue) {
                    setTimeout(() => { queue.isReplacing = false; }, 1000);
                }
            }
            return Result_js_1.Result.ok({ track });
        }
        catch (error) {
            console.error('[PlaybackService] Play error:', error);
            return Result_js_1.Result.fromError(error, ErrorCodes_js_1.ErrorCodes.LAVALINK_ERROR);
        }
    }
    /**
     * Play next track from queue
     */
    async playNext(guildId) {
        try {
            const loopMode = index_js_1.queueService.getLoopMode(guildId);
            const currentTrack = index_js_1.queueService.getCurrentTrack(guildId);
            // Handle track loop mode - replay same track
            if (loopMode === 'track' && currentTrack) {
                const result = await this.playTrack(guildId, currentTrack);
                if (result.isErr())
                    return result;
                return Result_js_1.Result.ok({ track: currentTrack, isLooped: true });
            }
            // Reset loop count when moving to next track
            index_js_1.queueService.resetLoopCount(guildId);
            // Get next track
            const nextTrack = index_js_1.queueService.getNextTrack(guildId);
            // If queue loop, add current track back to end
            if (loopMode === 'queue' && currentTrack) {
                index_js_1.queueService.addTrack(guildId, currentTrack);
            }
            if (!nextTrack) {
                // Queue empty
                return Result_js_1.Result.ok({ track: null, isLooped: false, queueEnded: true });
            }
            const result = await this.playTrack(guildId, nextTrack);
            if (result.isErr())
                return result;
            return Result_js_1.Result.ok({ track: nextTrack, isLooped: false });
        }
        catch (error) {
            console.error('[PlaybackService] PlayNext error:', error);
            return Result_js_1.Result.fromError(error);
        }
    }
    /**
     * Skip current track
     */
    async skip(guildId, count = 1) {
        try {
            const player = this.getPlayer(guildId);
            if (!player) {
                return Result_js_1.Result.err(ErrorCodes_js_1.ErrorCodes.NO_PLAYER, 'No player available.');
            }
            const currentTrack = index_js_1.queueService.getCurrentTrack(guildId);
            if (!currentTrack) {
                return Result_js_1.Result.err(ErrorCodes_js_1.ErrorCodes.NO_TRACK, 'No track is playing.');
            }
            // End any active skip vote
            index_js_1.queueService.endSkipVote(guildId);
            // Skip multiple tracks if requested
            if (count > 1) {
                for (let i = 0; i < count - 1; i++) {
                    index_js_1.queueService.getNextTrack(guildId); // Discard tracks
                }
            }
            // Stop current track (will trigger 'end' event)
            await player.stopTrack();
            return Result_js_1.Result.ok({ skipped: count, previousTrack: currentTrack });
        }
        catch (error) {
            console.error('[PlaybackService] Skip error:', error);
            return Result_js_1.Result.fromError(error);
        }
    }
    /**
     * Toggle pause/resume
     */
    async togglePause(guildId) {
        try {
            const player = this.getPlayer(guildId);
            if (!player) {
                return Result_js_1.Result.err(ErrorCodes_js_1.ErrorCodes.NO_PLAYER, 'No player available.');
            }
            const newPausedState = !player.paused;
            await player.setPaused(newPausedState);
            return Result_js_1.Result.ok({ paused: newPausedState });
        }
        catch (error) {
            console.error('[PlaybackService] Toggle pause error:', error);
            return Result_js_1.Result.fromError(error);
        }
    }
    /**
     * Set paused state
     */
    async setPaused(guildId, paused) {
        try {
            const player = this.getPlayer(guildId);
            if (!player) {
                return Result_js_1.Result.err(ErrorCodes_js_1.ErrorCodes.NO_PLAYER, 'No player available.');
            }
            await player.setPaused(paused);
            return Result_js_1.Result.ok({ paused });
        }
        catch (error) {
            console.error('[PlaybackService] Set paused error:', error);
            return Result_js_1.Result.fromError(error);
        }
    }
    /**
     * Check if paused
     */
    isPaused(guildId) {
        const player = this.getPlayer(guildId);
        return player?.paused || false;
    }
    /**
     * Stop playback and clear queue
     */
    async stop(guildId) {
        try {
            const player = this.getPlayer(guildId);
            if (player) {
                await player.stopTrack();
            }
            index_js_1.queueService.clear(guildId);
            index_js_1.queueService.setCurrentTrack(guildId, null);
            index_js_1.queueService.endSkipVote(guildId);
            return Result_js_1.Result.ok({ stopped: true });
        }
        catch (error) {
            console.error('[PlaybackService] Stop error:', error);
            return Result_js_1.Result.fromError(error);
        }
    }
    /**
     * Seek to position
     */
    async seek(guildId, position) {
        try {
            const player = this.getPlayer(guildId);
            if (!player) {
                return Result_js_1.Result.err(ErrorCodes_js_1.ErrorCodes.NO_PLAYER, 'No player available.');
            }
            const currentTrack = index_js_1.queueService.getCurrentTrack(guildId);
            if (!currentTrack) {
                return Result_js_1.Result.err(ErrorCodes_js_1.ErrorCodes.NO_TRACK, 'No track is playing.');
            }
            const duration = currentTrack.info?.length || currentTrack.track?.info?.length || 0;
            const clampedPosition = Math.max(0, Math.min(position, duration));
            await player.seekTo(clampedPosition);
            return Result_js_1.Result.ok({ position: clampedPosition });
        }
        catch (error) {
            console.error('[PlaybackService] Seek error:', error);
            return Result_js_1.Result.fromError(error);
        }
    }
    /**
     * Get current position
     */
    getPosition(guildId) {
        const player = this.getPlayer(guildId);
        return player?.position || 0;
    }
    /**
     * Set volume
     */
    async setVolume(guildId, volume) {
        try {
            const player = this.getPlayer(guildId);
            if (!player) {
                return Result_js_1.Result.err(ErrorCodes_js_1.ErrorCodes.NO_PLAYER, 'No player available.');
            }
            const clampedVolume = index_js_1.queueService.setVolume(guildId, volume);
            await player.setGlobalVolume(clampedVolume);
            return Result_js_1.Result.ok({ volume: clampedVolume });
        }
        catch (error) {
            console.error('[PlaybackService] Set volume error:', error);
            return Result_js_1.Result.fromError(error);
        }
    }
    /**
     * Adjust volume by delta
     */
    async adjustVolume(guildId, delta) {
        const currentVolume = index_js_1.queueService.getVolume(guildId);
        return this.setVolume(guildId, currentVolume + delta);
    }
    /**
     * Search for tracks
     */
    async search(query, requester) {
        try {
            const result = await LavalinkService_js_1.default.search(query, requester);
            if (!result) {
                return Result_js_1.Result.err(ErrorCodes_js_1.ErrorCodes.NO_RESULTS, 'No results found.');
            }
            return Result_js_1.Result.ok({ tracks: [result] });
        }
        catch (error) {
            console.error('[PlaybackService] Search error:', error);
            return Result_js_1.Result.fromError(error, ErrorCodes_js_1.ErrorCodes.SEARCH_FAILED);
        }
    }
    /**
     * Search for playlist
     */
    async searchPlaylist(url, requester) {
        try {
            const result = await LavalinkService_js_1.default.searchPlaylist(url, requester);
            if (!result || result.tracks?.length === 0) {
                return Result_js_1.Result.err(ErrorCodes_js_1.ErrorCodes.PLAYLIST_ERROR, 'Could not load playlist.');
            }
            return Result_js_1.Result.ok({
                playlistName: result.playlistName,
                tracks: result.tracks
            });
        }
        catch (error) {
            console.error('[PlaybackService] Search playlist error:', error);
            return Result_js_1.Result.fromError(error, ErrorCodes_js_1.ErrorCodes.PLAYLIST_ERROR);
        }
    }
    /**
     * Get playback state
     */
    getState(guildId) {
        const player = this.getPlayer(guildId);
        const currentTrack = index_js_1.queueService.getCurrentTrack(guildId);
        return {
            hasPlayer: !!player,
            isPlaying: !!(player && !player.paused && currentTrack),
            isPaused: player?.paused || false,
            position: player?.position || 0,
            currentTrack,
            volume: index_js_1.queueService.getVolume(guildId)
        };
    }
    /**
     * Acquire transition lock
     */
    async acquireTransitionLock(guildId, timeout = 3000) {
        return this.transitionMutex.acquire(guildId, timeout);
    }
    /**
     * Release transition lock
     */
    releaseTransitionLock(guildId) {
        this.transitionMutex.release(guildId);
    }
    /**
     * Check if transition is locked
     */
    isTransitionLocked(guildId) {
        return this.transitionMutex.isLocked(guildId);
    }
}
exports.PlaybackService = PlaybackService;
// Export singleton instance and class
const playbackService = new PlaybackService();
exports.default = playbackService;
//# sourceMappingURL=PlaybackService.js.map