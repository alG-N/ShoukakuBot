/**
 * Music Facade
 * Orchestrates all music sub-services
 * Provides backward-compatible API matching original MusicService
 * @module services/music/MusicFacade
 */

import { ChatInputCommandInteraction, Message, Guild, TextBasedChannel, ActionRowComponent } from 'discord.js';
import { queueService, QueueService } from './queue/index.js';
import { playbackService, PlaybackService } from './playback/index.js';
import { voiceConnectionService, VoiceConnectionService } from './voice/index.js';
import { autoPlayService, AutoPlayService } from './autoplay/index.js';
import { musicEventBus, MusicEvents, playbackEventHandler } from './events/index.js';
import musicCache from '../../cache/music/MusicCacheFacade.js';
import trackHandler from '../../handlers/music/trackHandler.js';
import { TRACK_TRANSITION_DELAY } from '../../config/features/music.js';
import { updateMusicMetrics, musicTracksPlayedTotal } from '../../core/metrics.js';
// Types
export interface Track {
    track: {
        encoded: string;
    };
    info?: TrackInfo;
    url?: string;
    requestedBy?: {
        id: string;
        username?: string;
    };
}

export interface TrackInfo {
    title: string;
    author?: string;
    duration?: number;
    uri?: string;
    artworkUrl?: string;
    sourceName?: string;
}

export interface PlayNextResult {
    track: Track;
    isLooped: boolean;
}

export interface SkipResult {
    skipped: number;
    previousTrack: Track | null;
}

export interface VoteSkipResult {
    success?: boolean;
    added?: boolean;
    voteCount?: number;
    required?: number;
    message?: string;
}

export interface NowPlayingOptions {
    volume: number;
    isPaused: boolean;
    loopMode: LoopMode;
    isShuffled: boolean;
    queueLength: number;
    nextTrack: Track | null;
    loopCount: number;
    voteSkipCount: number;
    voteSkipRequired: number;
    listenerCount: number;
}

export interface ControlButtonOptions {
    isPaused: boolean;
    loopMode: LoopMode;
    isShuffled: boolean;
    autoPlay: boolean;
    trackUrl: string;
    userId: string;
    listenerCount: number;
}

export interface QueueState {
    tracks: Track[];
    currentTrack: Track | null;
    volume: number;
    loopMode: LoopMode;
    isShuffled: boolean;
    autoPlay: boolean;
    isPaused: boolean;
    textChannel: TextBasedChannel | null;
    eventsBound: boolean;
    skipVoteActive: boolean;
    lastPlayedTracks: string[];
}

export interface MusicStats {
    queue: QueueService;
    playback: PlaybackService;
    voice: VoiceConnectionService;
    events: ReturnType<typeof musicEventBus.getStats>;
}

export type LoopMode = 'off' | 'track' | 'queue';

export interface PlayerEventHandlers {
    onStart: (data: unknown) => void;
    onEnd: (data: unknown) => void;
    onException: (data: unknown) => void;
    onStuck: (data: unknown) => void;
    onClosed: (data: unknown) => void;
}
// MusicFacade Class
export class MusicFacade {
    public readonly queueService: QueueService;
    public readonly playbackService: PlaybackService;
    public readonly voiceService: VoiceConnectionService;
    public readonly autoPlayService: AutoPlayService;
    public readonly eventBus: typeof musicEventBus;
    private eventHandlerInitialized: boolean;

    constructor() {
        this.queueService = queueService;
        this.playbackService = playbackService;
        this.voiceService = voiceConnectionService;
        this.autoPlayService = autoPlayService;
        this.eventBus = musicEventBus;
        this.eventHandlerInitialized = false;
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
        console.log('[MusicFacade] Event handler initialized');
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
        // Cast: QueueCache returns typed queue but runtime adds dynamic fields (isReplacing, textChannel)
        const queue = musicCache.getQueue(guildId) as any;
        
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
            // Cast: Track.info may have sourceName from Lavalink but not declared in our TrackInfo interface
            const source = (track as any)?.info?.sourceName || 'unknown';
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
        // Cast: interaction.member is GuildMember | APIInteractionGuildMember — need .voice.channel
        const member = interaction.member as any;
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

        // Cast: QueueService.get() returns typed queue but we need dynamic textChannel field
        const queue = queueService.get(guildId) as any;
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
                    console.error(`[MusicFacade] Error in start handler:`, error.message);
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
                    console.error(`[MusicFacade] Error in end handler:`, error.message);
                } finally {
                    playbackService.releaseTransitionLock(guildId);
                }
            },

            onException: async (data: unknown) => {
                const excData = data as { message?: string } | undefined;
                
                // Check if we're in the process of replacing a track
                // If so, ignore the exception as it's expected
                const queue = musicCache.getQueue(guildId) as any;
                if (queue?.isReplacing) {
                    console.log(`[MusicFacade] Ignoring exception during track replacement in guild ${guildId}`);
                    return;
                }
                
                console.error(`[MusicFacade] Track exception:`, excData?.message || 'Unknown error');

                const lockAcquired = await playbackService.acquireTransitionLock(guildId, 3000);
                if (!lockAcquired) return;

                try {
                    await this.playNext(guildId);
                } catch (error: any) {
                    console.error(`[MusicFacade] Error handling exception:`, error.message);
                } finally {
                    playbackService.releaseTransitionLock(guildId);
                }
            },

            onStuck: async (_data: unknown) => {
                const lockAcquired = await playbackService.acquireTransitionLock(guildId, 3000);
                if (!lockAcquired) return;

                try {
                    console.warn(`[MusicFacade] Track stuck in guild ${guildId}, skipping...`);
                    await this.playNext(guildId);
                } catch (error: any) {
                    console.error(`[MusicFacade] Error in stuck handler:`, error.message);
                } finally {
                    playbackService.releaseTransitionLock(guildId);
                }
            },

            onClosed: async (_data: unknown) => {
                try {
                    await this.cleanup(guildId);
                } catch (error: any) {
                    console.error(`[MusicFacade] Error in closed handler:`, error.message);
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
        // Cast: queue has runtime-added autoPlay, textChannel, lastPlayedTracks fields
        const queue = musicCache.getQueue(guildId) as any;

        // Check auto-play
        if (queue?.autoPlay && lastTrack) {
            console.log(`[AutoPlay] Queue ended, searching for similar tracks...`);

            try {
                const similarTrack = await autoPlayService.findSimilarTrack(guildId, lastTrack);

                if (similarTrack) {
                    console.log(`[AutoPlay] Found similar track: ${similarTrack.info?.title}`);

                    // Store in history
                    const trackInfo = lastTrack.info || lastTrack;
                    if (!queue.lastPlayedTracks) queue.lastPlayedTracks = [];
                    // Cast: trackInfo is Track.info|Track — title access needs unification
                    queue.lastPlayedTracks.push((trackInfo as any).title);
                    if (queue.lastPlayedTracks.length > 10) queue.lastPlayedTracks.shift();

                    // Play
                    musicCache.setCurrentTrack(guildId, similarTrack);
                    await this.playTrack(guildId, similarTrack as Track);

                    // Notify
                    if (queue?.textChannel) {
                        // Cast: trackHandler methods (createAutoPlayEmbed, createInfoEmbed) not in its TS interface
                        const autoPlayEmbed = (trackHandler as any).createAutoPlayEmbed?.(similarTrack) ||
                            (trackHandler as any).createInfoEmbed?.('🎵 Auto-Play', `Now playing: **${similarTrack.info?.title}**`);
                        await queue.textChannel.send({ embeds: [autoPlayEmbed] }).catch(() => {});
                    }

                    await this.sendNowPlayingEmbed(guildId);
                    return;
                }
            } catch (error: any) {
                console.error(`[AutoPlay] Error:`, error.message);
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
            // Cast: trackHandler methods not in TS interface (createQueueFinishedEmbed, createInfoEmbed)
            const finishedEmbed = (trackHandler as any).createQueueFinishedEmbed?.(lastTrack) ||
                (trackHandler as any).createInfoEmbed?.('Queue Finished', 'All songs have been played!') ||
                { description: '✅ Queue finished!' };

            await queue.textChannel.send({ embeds: [finishedEmbed] }).catch(() => {});
        }

        this.setInactivityTimer(guildId, () => this.cleanup(guildId));
    }

    findSimilarTrack(guildId: string, lastTrack: Track): Promise<any> {
        return autoPlayService.findSimilarTrack(guildId, lastTrack);
    }

    toggleAutoPlay(guildId: string): boolean {
        // Cast: queue has runtime autoPlay/loopMode fields not in typed interface
        const queue = musicCache.getQueue(guildId) as any;
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
        
        await musicCache.clearNowPlayingMessage(guildId);
        this.stopVCMonitor(guildId);
        this.clearInactivityTimer(guildId);
        this.unbindPlayerEvents(guildId);
        musicEventBus.removeGuildListeners(guildId);
        this.disconnect(guildId);
        musicCache.deleteQueue(guildId);
        
        musicEventBus.emitEvent(MusicEvents.CLEANUP_COMPLETE, { guildId });
    }
    // SKIP VOTE
    startSkipVote(guildId: string, userId: string, listenerCount: number): VoteSkipResult {
        const result = musicCache.startSkipVote(guildId, userId, listenerCount);
        musicEventBus.emitEvent(MusicEvents.SKIPVOTE_START, { guildId, userId, listenerCount });
        return result as VoteSkipResult;
    }

    addSkipVote(guildId: string, userId: string): VoteSkipResult | null {
        const result = musicCache.addSkipVote(guildId, userId);
        musicEventBus.emitEvent(MusicEvents.SKIPVOTE_ADD, { guildId, userId });
        return result as VoteSkipResult | null;
    }

    endSkipVote(guildId: string): void {
        musicCache.endSkipVote(guildId);
    }

    hasEnoughSkipVotes(guildId: string): boolean {
        // Cast: hasEnoughSkipVotes returns boolean | { success } depending on implementation
        const result = musicCache.hasEnoughSkipVotes(guildId) as any;
        if (typeof result === 'boolean') return result;
        return result?.success ?? false;
    }

    isSkipVoteActive(guildId: string): boolean {
        return musicCache.getQueue(guildId)?.skipVoteActive || false;
    }
    // NOW PLAYING MESSAGE
    setNowPlayingMessage(guildId: string, message: Message): void {
        musicCache.setNowPlayingMessage(guildId, message);
    }

    getNowPlayingMessage(guildId: string): Message | null {
        return musicCache.getNowPlayingMessage(guildId);
    }

    async updateNowPlayingMessage(guildId: string, payload: any): Promise<Message | null> {
        const message = this.getNowPlayingMessage(guildId);
        if (!message) return null;

        try {
            await message.edit(payload);
            return message;
        } catch (error: any) {
            if (error.code === 10008) {
                musicCache.setNowPlayingMessage(guildId, null);
            }
            return null;
        }
    }

    async disableNowPlayingControls(guildId: string): Promise<void> {
        const message = this.getNowPlayingMessage(guildId);
        if (!message?.components?.length) return;

        try {
            const disabledRows = message.components.map((row: any) => ({
                type: row.type,
                components: row.components.map((c: any) => ({
                    ...c.data,
                    disabled: true
                }))
            }));

            // Cast: manually-constructed component objects don't match MessageActionRowComponentData
            await message.edit({ components: disabledRows as any });
        } catch (error: any) {
            if (error.code === 10008) {
                musicCache.setNowPlayingMessage(guildId, null);
            }
        }
    }

    async sendNowPlayingEmbed(guildId: string): Promise<void> {
        // Cast: queue has runtime textChannel, isPaused fields not in typed interface
        const queue = musicCache.getQueue(guildId) as any;
        if (!queue?.textChannel) return;

        const currentTrack = this.getCurrentTrack(guildId);
        if (!currentTrack) return;

        try {
            await this.disableNowPlayingControls(guildId);

            const queueList = this.getQueueList(guildId);
            const listenerCount = this.getListenerCount(guildId, queue.textChannel?.guild);
            const voteSkipStatus = musicCache.getVoteSkipStatus(guildId, listenerCount);

            // Cast: trackHandler methods (createNowPlayingEmbed, createControlButtons) not in TS interface
            const embed = (trackHandler as any).createNowPlayingEmbed(currentTrack, {
                volume: this.getVolume(guildId),
                isPaused: queue.isPaused || false,
                loopMode: this.getLoopMode(guildId),
                isShuffled: this.isShuffled(guildId),
                queueLength: queueList.length,
                nextTrack: queueList[0] || null,
                loopCount: 0,
                voteSkipCount: voteSkipStatus.count,
                voteSkipRequired: voteSkipStatus.required,
                listenerCount: listenerCount
            });

            const rows = (trackHandler as any).createControlButtons(guildId, {
                isPaused: queue.isPaused || false,
                loopMode: this.getLoopMode(guildId),
                isShuffled: this.isShuffled(guildId),
                autoPlay: this.isAutoPlayEnabled(guildId),
                trackUrl: currentTrack.url,
                userId: currentTrack.requestedBy?.id || '',
                listenerCount: listenerCount
            });

            const nowMessage = await queue.textChannel.send({ embeds: [embed], components: rows });
            this.setNowPlayingMessage(guildId, nowMessage);
        } catch (error) {
            // Silent fail
        }
    }

    async updateNowPlayingForLoop(guildId: string, loopCount: number): Promise<void> {
        const message = this.getNowPlayingMessage(guildId);
        if (!message) return;

        const currentTrack = this.getCurrentTrack(guildId);
        if (!currentTrack) return;

        // Cast: queue has runtime textChannel, isPaused fields not in typed interface
        const queue = musicCache.getQueue(guildId) as any;
        if (!queue) return;

        try {
            const queueList = this.getQueueList(guildId);
            const listenerCount = this.getListenerCount(guildId, queue.textChannel?.guild);
            const voteSkipStatus = musicCache.getVoteSkipStatus(guildId, listenerCount);

            // Cast: trackHandler methods (createNowPlayingEmbed, createControlButtons) not in TS interface
            const embed = (trackHandler as any).createNowPlayingEmbed(currentTrack, {
                volume: this.getVolume(guildId),
                isPaused: queue.isPaused || false,
                loopMode: this.getLoopMode(guildId),
                isShuffled: this.isShuffled(guildId),
                queueLength: queueList.length,
                nextTrack: queueList[0] || null,
                loopCount: loopCount,
                voteSkipCount: voteSkipStatus.count,
                voteSkipRequired: voteSkipStatus.required,
                listenerCount: listenerCount
            });

            const rows = (trackHandler as any).createControlButtons(guildId, {
                isPaused: queue.isPaused || false,
                loopMode: this.getLoopMode(guildId),
                isShuffled: this.isShuffled(guildId),
                autoPlay: this.isAutoPlayEnabled(guildId),
                trackUrl: currentTrack.url,
                userId: currentTrack.requestedBy?.id || '',
                listenerCount: listenerCount
            });

            await message.edit({ embeds: [embed], components: rows });
        } catch (error: any) {
            if (error.code === 10008) {
                musicCache.setNowPlayingMessage(guildId, null);
                await this.sendNowPlayingEmbed(guildId);
            }
        }
    }
    // USER DATA (favorites, history, preferences)
    async addFavorite(userId: string, track: Track): Promise<any> {
        return musicCache.addFavorite(userId, track);
    }

    async removeFavorite(userId: string, trackUrl: string): Promise<any> {
        return musicCache.removeFavorite(userId, trackUrl);
    }

    async getFavorites(userId: string): Promise<any[]> {
        return musicCache.getFavorites(userId);
    }

    async isFavorited(userId: string, trackUrl: string): Promise<boolean> {
        return musicCache.isFavorited(userId, trackUrl);
    }

    async addToHistory(userId: string, track: Track): Promise<void> {
        await musicCache.addToHistory(userId, track);
    }

    async getHistory(userId: string, limit?: number): Promise<any[]> {
        return musicCache.getHistory(userId, limit);
    }

    async clearHistory(userId: string): Promise<void> {
        await musicCache.clearHistory(userId);
    }

    async getPreferences(userId: string): Promise<any> {
        return musicCache.getPreferences(userId);
    }

    async setPreferences(userId: string, prefs: any): Promise<void> {
        await musicCache.setPreferences(userId, prefs);
    }

    getRecentlyPlayed(guildId: string): any[] {
        return musicCache.getRecentlyPlayed(guildId);
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
    // Cast: transitionMutex is a private field on PlaybackService — exposed for legacy compat
    get transitionMutex(): any {
        return (playbackService as any).transitionMutex;
    }
}

// Export singleton instance and class
export const musicFacade = new MusicFacade();
export default musicFacade;


