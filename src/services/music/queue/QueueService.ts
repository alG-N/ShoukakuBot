/**
 * Queue Service
 * Handles queue CRUD operations
 * Extracted from MusicService for single responsibility
 * @module services/music/queue/QueueService
 */

import { Result } from '../../../core/Result.js';
import { ErrorCodes } from '../../../core/ErrorCodes.js';
import type { MusicTrack } from '../events/MusicEvents.js';
import musicCacheImport from '../../../cache/music/MusicCacheFacade.js';

// Type assertion for the imported cache
const musicCache = musicCacheImport as unknown as MusicCacheFacade;
// TYPES
interface MusicCacheFacade {
    getQueue: (guildId: string) => MusicQueue | null;
    getOrCreateQueue: (guildId: string) => MusicQueue;
    deleteQueue: (guildId: string) => void;
    addTrack: (guildId: string, track: MusicTrack) => number | false;
    addTrackToFront: (guildId: string, track: MusicTrack) => number | false;
    addTracks: (guildId: string, tracks: MusicTrack[]) => MusicTrack[];
    removeTrack: (guildId: string, index: number) => MusicTrack | null;
    clearQueue: (guildId: string) => void;
    clearTracks: (guildId: string) => void;
    shuffleQueue: (guildId: string) => boolean;
    unshuffleQueue: (guildId: string) => boolean;
    setLoopMode: (guildId: string, mode: string) => void;
    cycleLoopMode: (guildId: string) => string;
    getLoopCount: (guildId: string) => number;
    incrementLoopCount: (guildId: string) => number;
    resetLoopCount: (guildId: string) => void;
    getNextTrack: (guildId: string) => MusicTrack | null;
    getCurrentTrack: (guildId: string) => MusicTrack | null;
    setCurrentTrack: (guildId: string, track: MusicTrack | null) => void;
    setVolume: (guildId: string, volume: number) => void;
    getVolume: (guildId: string) => number;
    setAutoPlay: (guildId: string, enabled: boolean) => void;
    isAutoPlayEnabled: (guildId: string) => boolean;
    startSkipVote: (guildId: string, trackId: string) => void;
    addSkipVote: (guildId: string, odId: string) => { added: boolean; voteCount: number; required?: number; message?: string } | null;
    endSkipVote: (guildId: string) => void;
    hasActiveSkipVote: (guildId: string) => boolean;
    hasEnoughSkipVotes: (guildId: string, requiredVotes: number) => boolean;
    addLastPlayedTrack: (guildId: string, trackId: string) => void;
    getLastPlayedTracks: (guildId: string) => string[];
    moveTrack: (guildId: string, from: number, to: number) => boolean;
}

interface MusicQueue {
    tracks: MusicTrack[];
    currentTrack: MusicTrack | null;
    loopMode: 'off' | 'track' | 'queue';
    isShuffled: boolean;
    volume: number;
    autoPlay: boolean;
    voiceChannelId?: string;
    textChannelId?: string;
    textChannel?: unknown;
    isPaused?: boolean;
    eventsBound?: boolean;
    lastAutoplaySearch?: number;
    lastPlayedTracks?: string[];
}

interface QueueState {
    exists: boolean;
    tracks: MusicTrack[];
    trackCount?: number;
    currentTrack: MusicTrack | null;
    loopMode: string;
    isShuffled: boolean;
    volume: number;
    autoPlay: boolean;
    voiceChannelId?: string;
    textChannelId?: string;
}
// QUEUE SERVICE CLASS
class QueueService {
    /**
     * Get or create queue for a guild
     */
    getOrCreate(guildId: string): MusicQueue {
        return musicCache.getOrCreateQueue(guildId);
    }

    /**
     * Get queue for a guild
     */
    get(guildId: string): MusicQueue | null {
        return musicCache.getQueue(guildId);
    }

    /**
     * Get tracks in queue
     */
    getTracks(guildId: string): MusicTrack[] {
        const queue = musicCache.getQueue(guildId);
        return queue?.tracks || [];
    }

    /**
     * Get queue length
     */
    getLength(guildId: string): number {
        return this.getTracks(guildId).length;
    }

    /**
     * Check if queue is empty
     */
    isEmpty(guildId: string): boolean {
        return this.getLength(guildId) === 0;
    }

    /**
     * Get current track
     */
    getCurrentTrack(guildId: string): MusicTrack | null {
        return musicCache.getCurrentTrack(guildId);
    }

    /**
     * Set current track
     */
    setCurrentTrack(guildId: string, track: MusicTrack | null): void {
        musicCache.setCurrentTrack(guildId, track);
    }

    /**
     * Add track to end of queue
     */
    addTrack(guildId: string, track: MusicTrack): Result<{ position: number }> {
        try {
            const result = musicCache.addTrack(guildId, track);
            if (result === false) {
                return Result.err(ErrorCodes.QUEUE_FULL, 'Queue is full.');
            }
            return Result.ok({ position: this.getLength(guildId) });
        } catch (error) {
            return Result.fromError(error as Error);
        }
    }

    /**
     * Add track to front of queue (priority)
     */
    addTrackToFront(guildId: string, track: MusicTrack): Result<{ position: number }> {
        try {
            const result = musicCache.addTrackToFront(guildId, track);
            if (result === false || result === 0) {
                return Result.err(ErrorCodes.QUEUE_FULL, 'Queue is full.');
            }
            return Result.ok({ position: 1 });
        } catch (error) {
            return Result.fromError(error as Error);
        }
    }

    /**
     * Add multiple tracks
     */
    addTracks(guildId: string, tracks: MusicTrack[]): Result<{ added: number }> {
        try {
            const added = musicCache.addTracks(guildId, tracks);
            return Result.ok({ added: added?.length || tracks.length });
        } catch (error) {
            return Result.fromError(error as Error);
        }
    }

    /**
     * Remove track at index
     */
    removeTrack(guildId: string, index: number): Result<{ removed: MusicTrack | null }> {
        try {
            const tracks = this.getTracks(guildId);
            if (index < 0 || index >= tracks.length) {
                return Result.err(ErrorCodes.INVALID_POSITION, 'Invalid track position.');
            }
            const removed = musicCache.removeTrack(guildId, index);
            return Result.ok({ removed });
        } catch (error) {
            return Result.fromError(error as Error);
        }
    }

    /**
     * Clear all tracks from queue
     */
    clear(guildId: string): void {
        musicCache.clearTracks(guildId);
    }

    /**
     * Move track from one position to another
     */
    moveTrack(guildId: string, fromIndex: number, toIndex: number): Result<{ track: MusicTrack; from: number; to: number }> {
        const queue = musicCache.getQueue(guildId);
        if (!queue) {
            return Result.err(ErrorCodes.NO_QUEUE, 'No queue exists.');
        }

        if (fromIndex < 0 || fromIndex >= queue.tracks.length) {
            return Result.err(ErrorCodes.INVALID_POSITION, 'Invalid source position.');
        }
        if (toIndex < 0 || toIndex >= queue.tracks.length) {
            return Result.err(ErrorCodes.INVALID_POSITION, 'Invalid destination position.');
        }

        const [track] = queue.tracks.splice(fromIndex, 1);
        queue.tracks.splice(toIndex, 0, track);
        
        return Result.ok({ track, from: fromIndex, to: toIndex });
    }

    /**
     * Get next track from queue
     */
    getNextTrack(guildId: string): MusicTrack | null {
        return musicCache.getNextTrack(guildId);
    }
    // LOOP MODE
    /**
     * Get loop mode
     */
    getLoopMode(guildId: string): 'off' | 'track' | 'queue' {
        const queue = musicCache.getQueue(guildId);
        return queue?.loopMode || 'off';
    }

    /**
     * Set loop mode
     */
    setLoopMode(guildId: string, mode: 'off' | 'track' | 'queue'): void {
        musicCache.setLoopMode(guildId, mode);
    }

    /**
     * Cycle through loop modes
     */
    cycleLoopMode(guildId: string): string {
        return musicCache.cycleLoopMode(guildId);
    }

    /**
     * Get loop count for current track
     */
    getLoopCount(guildId: string): number {
        return musicCache.getLoopCount(guildId) || 0;
    }

    /**
     * Increment loop count
     */
    incrementLoopCount(guildId: string): number {
        return musicCache.incrementLoopCount(guildId);
    }

    /**
     * Reset loop count
     */
    resetLoopCount(guildId: string): void {
        musicCache.resetLoopCount(guildId);
    }
    // SHUFFLE
    /**
     * Check if queue is shuffled
     */
    isShuffled(guildId: string): boolean {
        return musicCache.getQueue(guildId)?.isShuffled || false;
    }

    /**
     * Toggle shuffle
     */
    toggleShuffle(guildId: string): boolean {
        const queue = musicCache.getQueue(guildId);
        if (!queue) return false;

        if (queue.isShuffled) {
            musicCache.unshuffleQueue(guildId);
        } else {
            musicCache.shuffleQueue(guildId);
        }

        return queue.isShuffled;
    }
    // VOLUME
    /**
     * Get volume
     */
    getVolume(guildId: string): number {
        return musicCache.getQueue(guildId)?.volume || 100;
    }

    /**
     * Set volume in cache
     */
    setVolume(guildId: string, volume: number): number {
        const clampedVolume = Math.max(0, Math.min(200, volume));
        musicCache.setVolume(guildId, clampedVolume);
        return clampedVolume;
    }
    // AUTO-PLAY
    /**
     * Check if auto-play is enabled
     */
    isAutoPlayEnabled(guildId: string): boolean {
        return musicCache.getQueue(guildId)?.autoPlay || false;
    }

    /**
     * Toggle auto-play
     */
    toggleAutoPlay(guildId: string): boolean {
        const queue = this.getOrCreate(guildId);
        queue.autoPlay = !queue.autoPlay;
        return queue.autoPlay;
    }
    // SKIP VOTE
    /**
     * Start skip vote
     */
    startSkipVote(guildId: string, trackId: string): void {
        musicCache.startSkipVote(guildId, trackId);
    }

    /**
     * Add vote to skip
     */
    addSkipVote(guildId: string, odId: string): { added: boolean; voteCount: number; required?: number; message?: string } | null {
        return musicCache.addSkipVote(guildId, odId) as { added: boolean; voteCount: number; required?: number; message?: string } | null;
    }

    /**
     * End skip vote
     */
    endSkipVote(guildId: string): void {
        musicCache.endSkipVote(guildId);
    }

    /**
     * Check if skip vote is active
     */
    isSkipVoteActive(guildId: string): boolean {
        return musicCache.hasActiveSkipVote(guildId);
    }

    /**
     * Check if enough skip votes
     */
    hasEnoughSkipVotes(guildId: string, requiredVotes: number): boolean {
        return musicCache.hasEnoughSkipVotes(guildId, requiredVotes);
    }
    // STATE
    /**
     * Get full queue state
     */
    getState(guildId: string): QueueState {
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
    destroy(guildId: string): void {
        musicCache.deleteQueue(guildId);
    }
}

// Export singleton instance and class
const queueService = new QueueService();

export { QueueService };
export type { MusicQueue, QueueState };
export default queueService;

