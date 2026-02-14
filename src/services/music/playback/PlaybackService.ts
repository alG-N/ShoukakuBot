/**
 * Playback Service
 * Handles play, pause, skip, stop operations
 * Extracted from MusicService for single responsibility
 * @module services/music/playback/PlaybackService
 */

import lavalinkService from '../core/LavalinkService.js';
import { queueService } from '../queue/index.js';
import musicCache from '../../../cache/music/MusicCacheFacade.js';
import logger from '../../../core/Logger.js';
import { Result } from '../../../core/Result.js';
import { ErrorCodes } from '../../../core/ErrorCodes.js';
import { TRACK_TRANSITION_DELAY } from '../../../config/features/music.js';
import type { MusicTrack } from '../events/MusicEvents.js';
// TYPES
interface PlayerLike {
    paused: boolean;
    position: number;
    playTrack(options: { track: { encoded: string } }): Promise<void>;
    stopTrack(): Promise<void>;
    setPaused(paused: boolean): Promise<void>;
    seekTo(position: number): Promise<void>;
    setGlobalVolume(volume: number): Promise<void>;
}

interface PlaybackState {
    hasPlayer: boolean;
    isPlaying: boolean;
    isPaused: boolean;
    position: number;
    currentTrack: MusicTrack | null;
    volume: number;
}

interface PlayNextResult {
    track: MusicTrack | null;
    isLooped: boolean;
    queueEnded?: boolean;
}
// GUILD MUTEX CLASS
/**
 * Simple mutex implementation for guild-level locking
 * Prevents race conditions in track transitions
 */
class GuildMutex {
    private locks: Map<string, boolean> = new Map();

    async acquire(guildId: string, timeout: number = 5000): Promise<boolean> {
        const startTime = Date.now();
        
        while (this.locks.get(guildId)) {
            if (Date.now() - startTime > timeout) {
                logger.warn('PlaybackMutex', `Lock timeout for guild ${guildId}`);
                return false;
            }
            await new Promise(r => setTimeout(r, 50));
        }
        
        this.locks.set(guildId, true);
        return true;
    }

    release(guildId: string): void {
        this.locks.delete(guildId);
    }

    isLocked(guildId: string): boolean {
        return this.locks.get(guildId) === true;
    }
}
// PLAYBACK SERVICE CLASS
class PlaybackService {
    private transitionMutex: GuildMutex;

    constructor() {
        this.transitionMutex = new GuildMutex();
    }

    /**
     * Get player for guild
     */
    getPlayer(guildId: string): PlayerLike | null {
        return lavalinkService.getPlayer(guildId) as PlayerLike | null;
    }

    /**
     * Check if Lavalink is ready
     */
    isLavalinkReady(): boolean {
        return lavalinkService.isReady;
    }

    /**
     * Play a track
     */
    async playTrack(guildId: string, track: MusicTrack): Promise<Result<{ track: MusicTrack }>> {
        try {
            const player = this.getPlayer(guildId);
            if (!player) {
                return Result.err(ErrorCodes.NO_PLAYER, 'No player available.');
            }

            if (!track?.track?.encoded) {
                return Result.err(ErrorCodes.TRACK_NOT_FOUND, 'Invalid track data.');
            }

            // Set replacing flag if there's a current track to prevent exception handler
            const queue = musicCache.getQueue(guildId) as any;
            const hadCurrentTrack = !!queueService.getCurrentTrack(guildId);
            if (hadCurrentTrack && queue) {
                queue.isReplacing = true;
            }

            queueService.setCurrentTrack(guildId, track);
            
            try {
                // Shoukaku expects { track: { encoded: "..." } }
                await player.playTrack({ track: { encoded: track.track.encoded } });
            } finally {
                // Clear replacing flag after a delay
                if (queue) {
                    setTimeout(() => { queue.isReplacing = false; }, 1000);
                }
            }
            
            return Result.ok({ track });
        } catch (error) {
            logger.error('PlaybackService', `Play error: ${(error as Error).message}`);
            return Result.fromError(error as Error, ErrorCodes.LAVALINK_ERROR);
        }
    }

    /**
     * Play next track from queue
     */
    async playNext(guildId: string): Promise<Result<PlayNextResult>> {
        try {
            const loopMode = queueService.getLoopMode(guildId);
            const currentTrack = queueService.getCurrentTrack(guildId);

            // Handle track loop mode - replay same track
            if (loopMode === 'track' && currentTrack) {
                const result = await this.playTrack(guildId, currentTrack);
                if (result.isErr()) return result as unknown as Result<PlayNextResult>;
                return Result.ok({ track: currentTrack, isLooped: true });
            }

            // Reset loop count when moving to next track
            queueService.resetLoopCount(guildId);

            // Get next track
            const nextTrack = queueService.getNextTrack(guildId);

            // If queue loop, add current track back to end
            if (loopMode === 'queue' && currentTrack) {
                queueService.addTrack(guildId, currentTrack);
            }

            if (!nextTrack) {
                // Queue empty
                return Result.ok({ track: null, isLooped: false, queueEnded: true });
            }

            const result = await this.playTrack(guildId, nextTrack);
            if (result.isErr()) return result as unknown as Result<PlayNextResult>;
            
            return Result.ok({ track: nextTrack, isLooped: false });
        } catch (error) {
            logger.error('PlaybackService', `PlayNext error: ${(error as Error).message}`);
            return Result.fromError(error as Error);
        }
    }

    /**
     * Skip current track
     */
    async skip(guildId: string, count: number = 1): Promise<Result<{ skipped: number; previousTrack: MusicTrack | null }>> {
        try {
            const player = this.getPlayer(guildId);
            if (!player) {
                return Result.err(ErrorCodes.NO_PLAYER, 'No player available.');
            }

            const currentTrack = queueService.getCurrentTrack(guildId);
            if (!currentTrack) {
                return Result.err(ErrorCodes.NO_TRACK, 'No track is playing.');
            }

            // End any active skip vote
            queueService.endSkipVote(guildId);

            // Skip multiple tracks if requested
            if (count > 1) {
                for (let i = 0; i < count - 1; i++) {
                    queueService.getNextTrack(guildId); // Discard tracks
                }
            }

            // Stop current track (will trigger 'end' event)
            await player.stopTrack();
            
            return Result.ok({ skipped: count, previousTrack: currentTrack });
        } catch (error) {
            logger.error('PlaybackService', `Skip error: ${(error as Error).message}`);
            return Result.fromError(error as Error);
        }
    }

    /**
     * Toggle pause/resume
     */
    async togglePause(guildId: string): Promise<Result<{ paused: boolean }>> {
        try {
            const player = this.getPlayer(guildId);
            if (!player) {
                return Result.err(ErrorCodes.NO_PLAYER, 'No player available.');
            }

            const newPausedState = !player.paused;
            await player.setPaused(newPausedState);
            
            return Result.ok({ paused: newPausedState });
        } catch (error) {
            logger.error('PlaybackService', `Toggle pause error: ${(error as Error).message}`);
            return Result.fromError(error as Error);
        }
    }

    /**
     * Set paused state
     */
    async setPaused(guildId: string, paused: boolean): Promise<Result<{ paused: boolean }>> {
        try {
            const player = this.getPlayer(guildId);
            if (!player) {
                return Result.err(ErrorCodes.NO_PLAYER, 'No player available.');
            }

            await player.setPaused(paused);
            return Result.ok({ paused });
        } catch (error) {
            logger.error('PlaybackService', `Set paused error: ${(error as Error).message}`);
            return Result.fromError(error as Error);
        }
    }

    /**
     * Check if paused
     */
    isPaused(guildId: string): boolean {
        const player = this.getPlayer(guildId);
        return player?.paused || false;
    }

    /**
     * Stop playback and clear queue
     */
    async stop(guildId: string): Promise<Result<{ stopped: boolean }>> {
        try {
            const player = this.getPlayer(guildId);
            if (player) {
                await player.stopTrack();
            }

            queueService.clear(guildId);
            queueService.setCurrentTrack(guildId, null);
            queueService.endSkipVote(guildId);

            return Result.ok({ stopped: true });
        } catch (error) {
            logger.error('PlaybackService', `Stop error: ${(error as Error).message}`);
            return Result.fromError(error as Error);
        }
    }

    /**
     * Seek to position
     */
    async seek(guildId: string, position: number): Promise<Result<{ position: number }>> {
        try {
            const player = this.getPlayer(guildId);
            if (!player) {
                return Result.err(ErrorCodes.NO_PLAYER, 'No player available.');
            }

            const currentTrack = queueService.getCurrentTrack(guildId);
            if (!currentTrack) {
                return Result.err(ErrorCodes.NO_TRACK, 'No track is playing.');
            }

            const duration = currentTrack.info?.length || currentTrack.track?.info?.length || 0;
            const clampedPosition = Math.max(0, Math.min(position, duration));

            await player.seekTo(clampedPosition);
            return Result.ok({ position: clampedPosition });
        } catch (error) {
            logger.error('PlaybackService', `Seek error: ${(error as Error).message}`);
            return Result.fromError(error as Error);
        }
    }

    /**
     * Get current position
     */
    getPosition(guildId: string): number {
        const player = this.getPlayer(guildId);
        return player?.position || 0;
    }

    /**
     * Set volume
     */
    async setVolume(guildId: string, volume: number): Promise<Result<{ volume: number }>> {
        try {
            const player = this.getPlayer(guildId);
            if (!player) {
                return Result.err(ErrorCodes.NO_PLAYER, 'No player available.');
            }

            const clampedVolume = queueService.setVolume(guildId, volume);
            await player.setGlobalVolume(clampedVolume);

            return Result.ok({ volume: clampedVolume });
        } catch (error) {
            logger.error('PlaybackService', `Set volume error: ${(error as Error).message}`);
            return Result.fromError(error as Error);
        }
    }

    /**
     * Adjust volume by delta
     */
    async adjustVolume(guildId: string, delta: number): Promise<Result<{ volume: number }>> {
        const currentVolume = queueService.getVolume(guildId);
        return this.setVolume(guildId, currentVolume + delta);
    }

    /**
     * Search for tracks
     */
    async search(query: string, requester?: unknown): Promise<Result<{ tracks: MusicTrack[] }>> {
        try {
            const result = await lavalinkService.search(query, requester);
            if (!result) {
                return Result.err(ErrorCodes.NO_RESULTS, 'No results found.');
            }
            return Result.ok({ tracks: [result as unknown as MusicTrack] });
        } catch (error) {
            logger.error('PlaybackService', `Search error: ${(error as Error).message}`);
            return Result.fromError(error as Error, ErrorCodes.SEARCH_FAILED);
        }
    }

    /**
     * Search for playlist
     */
    async searchPlaylist(url: string, requester?: unknown): Promise<Result<{ playlistName: string; tracks: MusicTrack[] }>> {
        try {
            const result = await lavalinkService.searchPlaylist(url, requester);
            if (!result || result.tracks?.length === 0) {
                return Result.err(ErrorCodes.PLAYLIST_ERROR, 'Could not load playlist.');
            }
            return Result.ok({
                playlistName: result.playlistName,
                tracks: result.tracks as unknown as MusicTrack[]
            });
        } catch (error) {
            logger.error('PlaybackService', `Search playlist error: ${(error as Error).message}`);
            return Result.fromError(error as Error, ErrorCodes.PLAYLIST_ERROR);
        }
    }

    /**
     * Get playback state
     */
    getState(guildId: string): PlaybackState {
        const player = this.getPlayer(guildId);
        const currentTrack = queueService.getCurrentTrack(guildId);

        return {
            hasPlayer: !!player,
            isPlaying: !!(player && !player.paused && currentTrack),
            isPaused: player?.paused || false,
            position: player?.position || 0,
            currentTrack,
            volume: queueService.getVolume(guildId)
        };
    }

    /**
     * Acquire transition lock
     */
    async acquireTransitionLock(guildId: string, timeout: number = 3000): Promise<boolean> {
        return this.transitionMutex.acquire(guildId, timeout);
    }

    /**
     * Release transition lock
     */
    releaseTransitionLock(guildId: string): void {
        this.transitionMutex.release(guildId);
    }

    /**
     * Check if transition is locked
     */
    isTransitionLocked(guildId: string): boolean {
        return this.transitionMutex.isLocked(guildId);
    }

    /**
     * Expose transition mutex for backward compatibility
     */
    getTransitionMutex(): GuildMutex {
        return this.transitionMutex;
    }
}

// Export singleton instance and class
const playbackService = new PlaybackService();

export { PlaybackService };
export type { PlaybackState, PlayNextResult };
export default playbackService;

