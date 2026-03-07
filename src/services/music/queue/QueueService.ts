import { Result } from '../../../core/Result.js';
import { ErrorCodes } from '../../../core/ErrorCodes.js';
import type { MusicTrack } from '../../../types/music/events.js';
import type { MusicQueue, QueueState } from '../../../types/music/queue.js';
import musicCacheImport from '../../../cache/music/MusicCacheFacade.js';
import type { MusicCacheFacade } from '../../../types/music/queue-service.js';

const musicCache = musicCacheImport as unknown as MusicCacheFacade;

class QueueService {
    getOrCreate(guildId: string): MusicQueue {
        return musicCache.getOrCreateQueue(guildId);
    }

    get(guildId: string): MusicQueue | null {
        return musicCache.getQueue(guildId);
    }

    getTracks(guildId: string): MusicTrack[] {
        const queue = musicCache.getQueue(guildId);
        return queue?.tracks || [];
    }

    getLength(guildId: string): number {
        return this.getTracks(guildId).length;
    }

    isEmpty(guildId: string): boolean {
        return this.getLength(guildId) === 0;
    }

    getCurrentTrack(guildId: string): MusicTrack | null {
        return musicCache.getCurrentTrack(guildId);
    }

    setCurrentTrack(guildId: string, track: MusicTrack | null): void {
        musicCache.setCurrentTrack(guildId, track);
    }

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

    addTracks(guildId: string, tracks: MusicTrack[]): Result<{ added: number }> {
        try {
            const added = musicCache.addTracks(guildId, tracks);
            return Result.ok({ added: added?.length || tracks.length });
        } catch (error) {
            return Result.fromError(error as Error);
        }
    }

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

    clear(guildId: string): void {
        musicCache.clearTracks(guildId);
    }

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

    getNextTrack(guildId: string): MusicTrack | null {
        return musicCache.getNextTrack(guildId);
    }

    getLoopMode(guildId: string): 'off' | 'track' | 'queue' {
        const queue = musicCache.getQueue(guildId);
        return queue?.loopMode || 'off';
    }

    setLoopMode(guildId: string, mode: 'off' | 'track' | 'queue'): void {
        musicCache.setLoopMode(guildId, mode);
    }

    cycleLoopMode(guildId: string): string {
        return musicCache.cycleLoopMode(guildId);
    }

    getLoopCount(guildId: string): number {
        return musicCache.getLoopCount(guildId) || 0;
    }

    incrementLoopCount(guildId: string): number {
        return musicCache.incrementLoopCount(guildId);
    }

    resetLoopCount(guildId: string): void {
        musicCache.resetLoopCount(guildId);
    }

    isShuffled(guildId: string): boolean {
        return musicCache.getQueue(guildId)?.isShuffled || false;
    }

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
    getVolume(guildId: string): number {
        return musicCache.getQueue(guildId)?.volume || 100;
    }

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
export { type MusicQueue, type QueueState };
export default queueService;





