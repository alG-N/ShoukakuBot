/**
 * Music Facade
 * Orchestrates all music sub-services.
 * Split into focused modules (Phase P):
 *   - MusicTypes.ts: Type definitions
 *   - MusicUserDataService.ts: Favorites, history, preferences
 *   - MusicNowPlayingManager.ts: Now-playing message lifecycle
 *   - MusicSkipVoteManager.ts: Skip vote lifecycle
 * @module services/music/MusicFacade
 */

import { ChatInputCommandInteraction, Message, Guild, GuildMember } from 'discord.js';
import { queueService, QueueService } from './queue/index.js';
import { playbackService, PlaybackService } from './playback/index.js';
import { voiceConnectionService, VoiceConnectionService } from './voice/index.js';
import { autoPlayService, AutoPlayService } from './autoplay/index.js';
import { musicEventBus, MusicEvents, playbackEventHandler } from './events/index.js';
import musicCache from '../../cache/music/MusicCacheFacade.js';
import trackHandler from '../../handlers/music/trackHandler.js';
import { TRACK_TRANSITION_DELAY } from '../../config/features/music.js';
import { updateMusicMetrics, musicTracksPlayedTotal } from '../../core/metrics.js';
import logger from '../../core/Logger.js';
import { MusicNowPlayingManager } from './MusicNowPlayingManager.js';
import { MusicUserDataService } from './MusicUserDataService.js';
import { MusicSkipVoteManager } from './MusicSkipVoteManager.js';

// Re-export all types from MusicTypes for backward compatibility
export type {
    Track, TrackInfo, PlayNextResult, SkipResult, VoteSkipResult,
    NowPlayingOptions, ControlButtonOptions, QueueState, MusicStats,
    LoopMode, PlayerEventHandlers
} from './MusicTypes.js';
import type {
    Track, PlayNextResult, SkipResult, VoteSkipResult,
    QueueState, MusicStats, LoopMode, PlayerEventHandlers
} from './MusicTypes.js';

// MusicFacade Class
export class MusicFacade {
    public readonly queueService: QueueService;
    public readonly playbackService: PlaybackService;
    public readonly voiceService: VoiceConnectionService;
    public readonly autoPlayService: AutoPlayService;
    public readonly eventBus: typeof musicEventBus;
    private eventHandlerInitialized: boolean;
    private readonly nowPlayingManager: MusicNowPlayingManager;
    private readonly userDataService: MusicUserDataService;
    private readonly skipVoteManager: MusicSkipVoteManager;

    constructor() {
        this.queueService = queueService;
        this.playbackService = playbackService;
        this.voiceService = voiceConnectionService;
        this.autoPlayService = autoPlayService;
        this.eventBus = musicEventBus;
        this.eventHandlerInitialized = false;
        this.nowPlayingManager = new MusicNowPlayingManager();
        this.userDataService = new MusicUserDataService();
        this.skipVoteManager = new MusicSkipVoteManager();
    }

    /**
     * Update music metrics (active players, queue size, voice connections)
     */
    updateMetrics(): void {
        try {
            // Get queue stats which includes active queues and total tracks
            const queueStats = musicCache.queueCache?.getStats?.() || { activeQueues: 0, totalTracks: 0 };
            
            updateMusicMetrics({
                activePlayers: queueStats.activeQueues,
                totalQueueSize: queueStats.totalTracks,
                voiceConnections: queueStats.activeQueues
            });
        } catch (error) {
            // Silently ignore metric update errors
        }
    }

    /**
     * Initialize the event handler with service references
     * Call this once after all services are ready
     */
    initializeEventHandler(): void {
        if (this.eventHandlerInitialized) return;

        playbackEventHandler.initialize({
            queueService,
            playbackService,
            voiceService: voiceConnectionService,
            autoPlayService
        });

        this.eventHandlerInitialized = true;
        logger.info('MusicFacade', 'Event handler initialized');
    }
    // QUEUE OPERATIONS (delegated to QueueService)
    getQueue(guildId: string): QueueState | null {
        return queueService.getOrCreate(guildId) as QueueState | null;
    }

    getQueueList(guildId: string): Track[] {
        return queueService.getTracks(guildId) as Track[];
    }

    getQueueLength(guildId: string): number {
        return queueService.getLength(guildId);
    }

    getCurrentTrack(guildId: string): Track | null {
        return queueService.getCurrentTrack(guildId) as Track | null;
    }

    addTrack(guildId: string, track: Track): number {
        const result = musicCache.addTrack(guildId, track);
        musicEventBus.emitEvent(MusicEvents.QUEUE_ADD, { guildId, track });
        this.updateMetrics();
        return result;
    }

    addTrackToFront(guildId: string, track: Track): number {
        const result = musicCache.addTrackToFront(guildId, track);
        musicEventBus.emitEvent(MusicEvents.QUEUE_ADD, { guildId, track, position: 'front' });
        this.updateMetrics();
        return result;
    }

    addTracks(guildId: string, tracks: Track[]): number {
        const result = musicCache.addTracks(guildId, tracks);
        musicEventBus.emitEvent(MusicEvents.QUEUE_ADD_MANY, { guildId, tracks, count: tracks.length });
        this.updateMetrics();
        return result;
    }

    removeTrack(guildId: string, index: number): any {
        const queue = musicCache.getQueue(guildId);
        const track = queue?.tracks?.[index];
        const result = musicCache.removeTrack(guildId, index);
        musicEventBus.emitEvent(MusicEvents.QUEUE_REMOVE, { guildId, track, index });
        this.updateMetrics();
        return result;
    }

    clearQueue(guildId: string): void {
        queueService.clear(guildId);
        musicEventBus.emitEvent(MusicEvents.QUEUE_CLEAR, { guildId });
        this.updateMetrics();
    }

    moveTrack(guildId: string, fromIndex: number, toIndex: number): boolean {
        const result = queueService.moveTrack(guildId, fromIndex, toIndex);
        if (result.isOk()) {
            musicEventBus.emitEvent(MusicEvents.QUEUE_MOVE, { guildId, fromIndex, toIndex });
        }
        return result.isOk();
    }
    // PLAYBACK OPERATIONS (delegated to PlaybackService)
    async playTrack(guildId: string, track: Track): Promise<Track> {
        const queue = musicCache.getQueue(guildId);
        
        // Set replacing flag if a track is already playing
        // This prevents the exception handler from skipping when we're just replacing
        if (queue && queue.currentTrack) {
            queue.isReplacing = true;
        }
        
        queueService.setCurrentTrack(guildId, track);
        const player = playbackService.getPlayer(guildId);
        if (!player) throw new Error('NO_PLAYER');
        
        // Handle both track.track.encoded (nested) and track.encoded (flat) structures
        const encoded = track?.track?.encoded || (track as unknown as { encoded?: string })?.encoded;
        if (!encoded) throw new Error('INVALID_TRACK');
        
        try {
            await player.playTrack({ track: { encoded } });
            // Track metrics - track played
            const source = track?.info?.sourceName || 'unknown';
            musicTracksPlayedTotal.inc({ source });
            this.updateMetrics();
        } finally {
            // Clear replacing flag after a short delay
            if (queue) {
                setTimeout(() => { queue.isReplacing = false; }, 1000);
            }
        }
        
        voiceConnectionService.clearInactivityTimer(guildId);
        return track;
    }

    async playNext(guildId: string): Promise<PlayNextResult | null> {
        const loopMode = queueService.getLoopMode(guildId);
        const currentTrack = queueService.getCurrentTrack(guildId) as Track | null;

        // Handle track loop mode
        if (loopMode === 'track' && currentTrack) {
            await this.playTrack(guildId, currentTrack);
            return { track: currentTrack, isLooped: true };
        }

        // Reset loop count
        musicCache.resetLoopCount(guildId);

        // Get next track
        const nextTrack = musicCache.getNextTrack(guildId) as Track | null;

        // Queue loop - add current back
        if (loopMode === 'queue' && currentTrack) {
            musicCache.addTrack(guildId, currentTrack);
        }

        if (!nextTrack) {
            await this.handleQueueEnd(guildId);
            return null;
        }

        await this.playTrack(guildId, nextTrack);
        return { track: nextTrack, isLooped: false };
    }

    async skip(guildId: string, count: number = 1): Promise<SkipResult> {
        const player = playbackService.getPlayer(guildId);
        if (!player) throw new Error('NO_PLAYER');

        const currentTrack = queueService.getCurrentTrack(guildId) as Track | null;
        queueService.endSkipVote(guildId);

        // Skip multiple tracks by consuming them from the queue
        if (count > 1) {
            for (let i = 0; i < count - 1; i++) {
                musicCache.getNextTrack(guildId);
            }
        }

        // Stop the current track first to ensure it actually stops
        await player.stopTrack();

        // Play the next track
        const result = await this.playNext(guildId);

        // If no next track (queue ended), playNext already handled cleanup

        musicEventBus.emitEvent(MusicEvents.TRACK_SKIP, { guildId, count, previousTrack: currentTrack });
        return { skipped: count, previousTrack: currentTrack };
    }

    async togglePause(guildId: string): Promise<boolean> {
        const player = playbackService.getPlayer(guildId);
        if (!player) throw new Error('NO_PLAYER');
        
        const newState = !player.paused;
        await player.setPaused(newState);
        
        musicEventBus.emitEvent(newState ? MusicEvents.PLAYBACK_PAUSE : MusicEvents.PLAYBACK_RESUME, { guildId });
        return newState;
    }

    async setPaused(guildId: string, paused: boolean): Promise<void> {
        const player = playbackService.getPlayer(guildId);
        if (!player) throw new Error('NO_PLAYER');
        await player.setPaused(paused);
        musicEventBus.emitEvent(paused ? MusicEvents.PLAYBACK_PAUSE : MusicEvents.PLAYBACK_RESUME, { guildId });
    }

    async stop(guildId: string): Promise<void> {
        const player = playbackService.getPlayer(guildId);
        if (player) await player.stopTrack();
        
        queueService.clear(guildId);
        queueService.setCurrentTrack(guildId, null);
        queueService.endSkipVote(guildId);
        musicEventBus.emitEvent(MusicEvents.PLAYBACK_STOP, { guildId });
    }
    // LOOP/SHUFFLE OPERATIONS
    toggleLoop(guildId: string): LoopMode {
        const newMode = queueService.cycleLoopMode(guildId) as LoopMode;
        musicEventBus.emitEvent(MusicEvents.LOOP_CHANGE, { guildId, loopMode: newMode });
        return newMode;
    }

    setLoopMode(guildId: string, mode: LoopMode): void {
        queueService.setLoopMode(guildId, mode);
        musicEventBus.emitEvent(MusicEvents.LOOP_CHANGE, { guildId, loopMode: mode });
    }

    getLoopMode(guildId: string): LoopMode {
        return queueService.getLoopMode(guildId) as LoopMode;
    }

    toggleShuffle(guildId: string): boolean {
        const result = queueService.toggleShuffle(guildId);
        musicEventBus.emitEvent(MusicEvents.QUEUE_SHUFFLE, { guildId, isShuffled: result });
        return result;
    }

    isShuffled(guildId: string): boolean {
        return queueService.isShuffled(guildId);
    }
    // VOLUME OPERATIONS
    async setVolume(guildId: string, volume: number): Promise<number> {
        const player = playbackService.getPlayer(guildId);
        if (!player) return 100;

        const clampedVolume = queueService.setVolume(guildId, volume);
        await player.setGlobalVolume(clampedVolume);
        musicEventBus.emitEvent(MusicEvents.VOLUME_CHANGE, { guildId, volume: clampedVolume });
        return clampedVolume;
    }

    getVolume(guildId: string): number {
        return queueService.getVolume(guildId);
    }

    async adjustVolume(guildId: string, delta: number): Promise<number> {
        const current = this.getVolume(guildId);
        return this.setVolume(guildId, current + delta);
    }
    // VOICE CONNECTION OPERATIONS
    async connect(interaction: ChatInputCommandInteraction): Promise<any> {
        const guildId = interaction.guild!.id;
        const member = interaction.member as GuildMember;
        const voiceChannel = member?.voice?.channel;

        if (!voiceChannel) throw new Error('NO_VOICE_CHANNEL');

        const result = await voiceConnectionService.connect(interaction);
        if (result.isErr()) throw new Error(result.code);

        // Initialize event handler if not done
        this.initializeEventHandler();

        // Bind events after connection (now uses event bus internally)
        this.bindPlayerEvents(guildId, interaction);
        
        // Update metrics on connect
        this.updateMetrics();
        
        return result.data!.player;
    }

    disconnect(guildId: string): void {
        voiceConnectionService.disconnect(guildId);
    }

    isConnected(guildId: string): boolean {
        return voiceConnectionService.isConnected(guildId);
    }

    getVoiceChannelId(guildId: string): string | null {
        return voiceConnectionService.getVoiceChannelId(guildId);
    }
    // PLAYER EVENTS
    bindPlayerEvents(guildId: string, interaction: ChatInputCommandInteraction): void {
        if (voiceConnectionService.areEventsBound(guildId)) return;

        const player = playbackService.getPlayer(guildId);
        if (!player) return;

        const queue = queueService.get(guildId);
        if (queue) {
            queue.eventsBound = true;
            queue.textChannel = interaction.channel;
        }

        const handlers: PlayerEventHandlers = {
            onStart: (_data: unknown) => {
                try {
                    voiceConnectionService.clearInactivityTimer(guildId);
                    // Update metrics when track starts
                    this.updateMetrics();
                } catch (error: any) {
                    logger.error('MusicFacade', `Error in start handler: ${error.message}`, error);
                }
            },

            onEnd: async (data: unknown) => {
                const endData = data as { reason?: string } | undefined;
                if (endData?.reason === 'replaced' || endData?.reason === 'stopped') return;

                const lockAcquired = await playbackService.acquireTransitionLock(guildId, 3000);
                if (!lockAcquired) return;

                try {
                    await new Promise(resolve => setTimeout(resolve, TRACK_TRANSITION_DELAY));

                    const result = await this.playNext(guildId);
                    if (result) {
                        if (result.isLooped) {
                            const loopCount = this.incrementLoopCount(guildId);
                            await this.updateNowPlayingForLoop(guildId, loopCount);
                        } else {
                            await this.disableNowPlayingControls(guildId);
                            await this.sendNowPlayingEmbed(guildId);
                        }
                    }
                } catch (error: any) {
                    logger.error('MusicFacade', `Error in end handler: ${error.message}`, error);
                } finally {
                    playbackService.releaseTransitionLock(guildId);
                }
            },

            onException: async (data: unknown) => {
                const excData = data as { message?: string } | undefined;
                
                // Check if we're in the process of replacing a track
                // If so, ignore the exception as it's expected
                const queue = musicCache.getQueue(guildId);
                if (queue?.isReplacing) {
                    logger.info('MusicFacade', `Ignoring exception during track replacement in guild ${guildId}`);
                    return;
                }
                
                logger.error('MusicFacade', `Track exception: ${excData?.message || 'Unknown error'}`);

                const lockAcquired = await playbackService.acquireTransitionLock(guildId, 3000);
                if (!lockAcquired) return;

                try {
                    await this.playNext(guildId);
                } catch (error: any) {
                    logger.error('MusicFacade', `Error handling exception: ${error.message}`, error);
                } finally {
                    playbackService.releaseTransitionLock(guildId);
                }
            },

            onStuck: async (_data: unknown) => {
                const lockAcquired = await playbackService.acquireTransitionLock(guildId, 3000);
                if (!lockAcquired) return;

                try {
                    logger.warn('MusicFacade', `Track stuck in guild ${guildId}, skipping...`);
                    await this.playNext(guildId);
                } catch (error: any) {
                    logger.error('MusicFacade', `Error in stuck handler: ${error.message}`, error);
                } finally {
                    playbackService.releaseTransitionLock(guildId);
                }
            },

            onClosed: async (_data: unknown) => {
                try {
                    await this.cleanup(guildId);
                } catch (error: any) {
                    logger.error('MusicFacade', `Error in closed handler: ${error.message}`, error);
                }
            }
        };

        voiceConnectionService.bindPlayerEvents(guildId, handlers);
    }

    unbindPlayerEvents(guildId: string): void {
        voiceConnectionService.unbindPlayerEvents(guildId);
    }
    // TIMERS & MONITORS
    setInactivityTimer(guildId: string, callback: () => void): void {
        voiceConnectionService.setInactivityTimer(guildId, callback);
    }

    clearInactivityTimer(guildId: string): void {
        voiceConnectionService.clearInactivityTimer(guildId);
    }

    startVCMonitor(guildId: string, guild: Guild): void {
        voiceConnectionService.startVCMonitor(guildId, guild, () => this.cleanup(guildId));
    }

    stopVCMonitor(guildId: string): void {
        voiceConnectionService.stopVCMonitor(guildId);
    }

    getListenerCount(guildId: string, guild?: Guild | null): number {
        return voiceConnectionService.getListenerCount(guildId, guild!);
    }

    getListeners(guildId: string, guild?: Guild | null): any[] {
        return voiceConnectionService.getListeners(guildId, guild!);
    }
    // AUTO-PLAY
    async handleQueueEnd(guildId: string, providedLastTrack: Track | null = null): Promise<void> {
        const lastTrack = providedLastTrack || this.getCurrentTrack(guildId);
        const queue = musicCache.getQueue(guildId);

        // Check auto-play
        if (queue?.autoPlay && lastTrack) {
            logger.info('AutoPlay', 'Queue ended, searching for similar tracks...');

            try {
                const similarTrack = await autoPlayService.findSimilarTrack(guildId, lastTrack);

                if (similarTrack) {
                    logger.info('AutoPlay', `Found similar track: ${similarTrack.info?.title}`);

                    // Store in history
                    const trackTitle = lastTrack.info?.title || 'Unknown';
                    if (!queue.lastPlayedTracks) queue.lastPlayedTracks = [];
                    queue.lastPlayedTracks.push(trackTitle);
                    if (queue.lastPlayedTracks.length > 10) queue.lastPlayedTracks.shift();

                    // Play
                    musicCache.setCurrentTrack(guildId, similarTrack);
                    await this.playTrack(guildId, similarTrack as Track);

                    // Notify
                    if (queue?.textChannel) {
                        const autoPlayEmbed = trackHandler.createInfoEmbed('🎵 Auto-Play', `Now playing: **${similarTrack.info?.title}**`);
                        await queue.textChannel.send({ embeds: [autoPlayEmbed] }).catch(() => {});
                    }

                    await this.sendNowPlayingEmbed(guildId);
                    return;
                }
            } catch (error: any) {
                logger.error('AutoPlay', `Error: ${error.message}`, error);
            }
        }

        // Original queue end logic
        musicCache.setCurrentTrack(guildId, null);
        await this.disableNowPlayingControls(guildId);

        // Stop the player to ensure music actually stops
        const player = playbackService.getPlayer(guildId);
        if (player) {
            try { await player.stopTrack(); } catch (e) { /* already stopped */ }
        }

        if (queue?.textChannel) {
            const finishedEmbed = trackHandler.createQueueFinishedEmbed(lastTrack as any);
            await queue.textChannel.send({ embeds: [finishedEmbed] }).catch(() => {});
        }

        this.setInactivityTimer(guildId, () => this.cleanup(guildId));
    }

    findSimilarTrack(guildId: string, lastTrack: Track): Promise<any> {
        return autoPlayService.findSimilarTrack(guildId, lastTrack);
    }

    toggleAutoPlay(guildId: string): boolean {
        const queue = musicCache.getQueue(guildId);
        if (!queue) return false;

        queue.autoPlay = !queue.autoPlay;
        if (queue.autoPlay) queue.loopMode = 'off';
        
        musicEventBus.emitEvent(MusicEvents.AUTOPLAY_TOGGLE, { guildId, enabled: queue.autoPlay });
        return queue.autoPlay;
    }

    isAutoPlayEnabled(guildId: string): boolean {
        return queueService.isAutoPlayEnabled(guildId);
    }
    // CLEANUP
    async cleanup(guildId: string): Promise<void> {
        musicEventBus.emitCleanup(guildId, 'manual');
        
        // Try to delete the now-playing message from Discord before clearing ref
        const ref = this.getNowPlayingMessageRef(guildId);
        if (ref) {
            const message = await this._resolveMessage(ref, guildId);
            if (message) {
                await message.delete().catch(() => {});
            }
        }
        musicCache.clearNowPlayingMessage(guildId);
        this.stopVCMonitor(guildId);
        this.clearInactivityTimer(guildId);
        this.unbindPlayerEvents(guildId);
        musicEventBus.removeGuildListeners(guildId);
        this.disconnect(guildId);
        musicCache.deleteQueue(guildId);
        
        musicEventBus.emitEvent(MusicEvents.CLEANUP_COMPLETE, { guildId });
    }
    // SKIP VOTE (delegated to MusicSkipVoteManager)
    startSkipVote(guildId: string, userId: string, listenerCount: number): VoteSkipResult {
        return this.skipVoteManager.startSkipVote(guildId, userId, listenerCount);
    }

    addSkipVote(guildId: string, userId: string): VoteSkipResult | null {
        return this.skipVoteManager.addSkipVote(guildId, userId);
    }

    endSkipVote(guildId: string): void {
        this.skipVoteManager.endSkipVote(guildId);
    }

    hasEnoughSkipVotes(guildId: string): boolean {
        return this.skipVoteManager.hasEnoughSkipVotes(guildId);
    }

    isSkipVoteActive(guildId: string): boolean {
        return this.skipVoteManager.isSkipVoteActive(guildId);
    }
    // NOW PLAYING MESSAGE (delegated to MusicNowPlayingManager)

    private async _resolveMessage(ref: any, guildId: string): Promise<Message | null> {
        return this.nowPlayingManager.resolveMessage(ref, guildId);
    }

    setNowPlayingMessage(guildId: string, message: Message): void {
        this.nowPlayingManager.setNowPlayingMessage(guildId, message);
    }

    getNowPlayingMessageRef(guildId: string): any {
        return this.nowPlayingManager.getNowPlayingMessageRef(guildId);
    }

    /** @deprecated Use getNowPlayingMessageRef() + _resolveMessage() */
    getNowPlayingMessage(guildId: string): any {
        return this.nowPlayingManager.getNowPlayingMessage(guildId);
    }

    async updateNowPlayingMessage(guildId: string, payload: any): Promise<Message | null> {
        return this.nowPlayingManager.updateNowPlayingMessage(guildId, payload);
    }

    async disableNowPlayingControls(guildId: string): Promise<void> {
        return this.nowPlayingManager.disableNowPlayingControls(guildId);
    }

    async sendNowPlayingEmbed(guildId: string): Promise<void> {
        return this.nowPlayingManager.sendNowPlayingEmbed(guildId);
    }

    async updateNowPlayingForLoop(guildId: string, loopCount: number): Promise<void> {
        return this.nowPlayingManager.updateNowPlayingForLoop(guildId, loopCount);
    }
    // USER DATA (delegated to MusicUserDataService)
    async addFavorite(userId: string, track: Track): Promise<any> {
        return this.userDataService.addFavorite(userId, track);
    }

    async removeFavorite(userId: string, trackUrl: string): Promise<any> {
        return this.userDataService.removeFavorite(userId, trackUrl);
    }

    async getFavorites(userId: string): Promise<any[]> {
        return this.userDataService.getFavorites(userId);
    }

    async isFavorited(userId: string, trackUrl: string): Promise<boolean> {
        return this.userDataService.isFavorited(userId, trackUrl);
    }

    async addToHistory(userId: string, track: Track): Promise<void> {
        return this.userDataService.addToHistory(userId, track);
    }

    async getHistory(userId: string, limit?: number): Promise<any[]> {
        return this.userDataService.getHistory(userId, limit);
    }

    async clearHistory(userId: string): Promise<void> {
        return this.userDataService.clearHistory(userId);
    }

    async getPreferences(userId: string): Promise<any> {
        return this.userDataService.getPreferences(userId);
    }

    async setPreferences(userId: string, prefs: any): Promise<void> {
        return this.userDataService.setPreferences(userId, prefs);
    }

    getRecentlyPlayed(guildId: string): any[] {
        return this.userDataService.getRecentlyPlayed(guildId);
    }
    // LOOP COUNT
    getLoopCount(guildId: string): number {
        return musicCache.getLoopCount(guildId) || 0;
    }

    incrementLoopCount(guildId: string): number {
        return musicCache.incrementLoopCount(guildId);
    }

    resetLoopCount(guildId: string): void {
        musicCache.resetLoopCount(guildId);
    }
    // SEARCH
    search(query: string): Promise<any> {
        return playbackService.search(query);
    }

    async searchPlaylist(url: string): Promise<{ playlistName: string; tracks: any[] } | null> {
        const result = await playbackService.searchPlaylist(url);
        if (result.isOk() && result.data) {
            return result.data;
        }
        return null;
    }
    // EVENT BUS ACCESS
    /**
     * Subscribe to a music event
     * @param event - Event name from MusicEvents
     * @param handler - Event handler
     * @returns Unsubscribe function
     */
    on(event: string, handler: (...args: any[]) => void): () => void {
        return musicEventBus.subscribe(event, handler);
    }

    /**
     * Subscribe to a guild-specific event
     * @param guildId 
     * @param event - Event name from MusicEvents
     * @param handler - Event handler
     * @returns Unsubscribe function
     */
    onGuild(guildId: string, event: string, handler: (...args: any[]) => void): () => void {
        return musicEventBus.subscribeGuild(guildId, event, handler);
    }

    /**
     * Get event statistics
     */
    getEventStats(): ReturnType<typeof musicEventBus.getStats> {
        return musicEventBus.getStats();
    }
    // UTILITIES
    getPlayer(guildId: string): any {
        return playbackService.getPlayer(guildId);
    }

    isLavalinkReady(): boolean {
        return playbackService.isLavalinkReady();
    }

    getQueueState(guildId: string): any {
        return queueService.getState(guildId);
    }

    getStats(): MusicStats {
        // Aggregate stats from services
        return {
            queue: queueService,
            playback: playbackService,
            voice: voiceConnectionService,
            events: musicEventBus.getStats()
        };
    }

    shutdownAll(): void {
        playbackEventHandler.shutdown();
        musicEventBus.shutdown();
        voiceConnectionService.shutdownAll();
    }

    // Expose transitionMutex for backward compatibility
    get transitionMutex() {
        return playbackService.getTransitionMutex();
    }
}

// Export singleton instance and class
export const musicFacade = new MusicFacade();
export default musicFacade;


