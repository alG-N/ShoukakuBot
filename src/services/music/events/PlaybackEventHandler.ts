/**
 * Playback Event Handler
 * Handles player events via the event bus
 * Decouples event handling from service logic
 * @module services/music/events/PlaybackEventHandler
 */

import type { Message, ActionRowData, MessageActionRowComponentData, TextBasedChannel, TextChannel } from 'discord.js';
import musicEventBus from './MusicEventBus.js';
import { MusicEvents, type MusicTrack } from './MusicEvents.js';
import logger from '../../../core/Logger.js';
import musicCache from '../../../cache/music/MusicCacheFacade.js';
import type { MessageRef } from '../../../cache/music/QueueCache.js';
import trackHandler, { type Track, type LoopMode } from '../../../handlers/music/trackHandler.js';
import { TRACK_TRANSITION_DELAY } from '../../../config/features/music.js';
// TYPES
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MessageComponents = any[];
// TYPES
interface ServiceReferences {
    queueService?: QueueServiceLike;
    playbackService?: PlaybackServiceLike;
    voiceService?: VoiceServiceLike;
    autoPlayService?: AutoPlayServiceLike;
}

interface QueueServiceLike {
    getLoopMode(guildId: string): string;
    getCurrentTrack(guildId: string): MusicTrack | null;
    setCurrentTrack(guildId: string, track: MusicTrack | null): void;
    getTracks(guildId: string): MusicTrack[];
    getVolume(guildId: string): number;
    isShuffled(guildId: string): boolean;
    isAutoPlayEnabled(guildId: string): boolean;
    addTrack(guildId: string, track: MusicTrack): void;
    getNextTrack(guildId: string): MusicTrack | null;
    resetLoopCount(guildId: string): void;
}

interface PlaybackServiceLike {
    getPlayer(guildId: string): PlayerLike | null;
    acquireTransitionLock(guildId: string, timeout: number): Promise<boolean>;
    releaseTransitionLock(guildId: string): void;
}

interface VoiceServiceLike {
    setInactivityTimer(guildId: string, callback: () => void): void;
    clearInactivityTimer(guildId: string): void;
    getListenerCount(guildId: string, guild: unknown): number;
}

interface AutoPlayServiceLike {
    findSimilarTrack(guildId: string, lastTrack: MusicTrack): Promise<MusicTrack | null>;
}

interface PlayerLike {
    playTrack(options: { track: { encoded: string } }): Promise<void>;
}

interface EventData {
    guildId: string;
    reason?: string;
    error?: string;
    lastTrack?: MusicTrack | null;
    track?: MusicTrack | null;
    loopCount?: number;
    [key: string]: unknown;
}
// PLAYBACK EVENT HANDLER CLASS
class PlaybackEventHandler {
    /** Cleanup handlers per guild */
    private cleanupHandlers: Map<string, () => Promise<void> | void> = new Map();
    
    /** Whether global handlers are bound */
    private globalHandlersBound: boolean = false;
    
    /** Service references */
    private services: ServiceReferences = {};

    /**
     * Resolve a MessageRef to a full Discord Message via the queue's textChannel.
     */
    private async _resolveMessage(ref: MessageRef | null, guildId: string): Promise<Message | null> {
        if (!ref) return null;
        try {
            const queue = musicCache.getQueue(guildId) as any;
            const channel = queue?.textChannel as TextBasedChannel | null;
            if (!channel || !('messages' in channel)) return null;
            return await (channel as TextChannel).messages.fetch(ref.messageId);
        } catch {
            return null;
        }
    }

    /**
     * Initialize global event handlers
     * Call once at startup
     */
    initialize(services: ServiceReferences): void {
        if (this.globalHandlersBound) return;

        this.services = services;
        this._bindGlobalHandlers();
        this.globalHandlersBound = true;

        logger.info('PlaybackEventHandler', 'Initialized with global handlers');
    }

    /**
     * Bind global event handlers
     */
    private _bindGlobalHandlers(): void {
        // NOTE: TRACK_END is handled by MusicFacade.bindPlayerEvents() to avoid double handling
        // Do NOT subscribe to TRACK_END here as it causes race conditions and double-skipping
        
        // Track error - skip to next
        musicEventBus.subscribe(MusicEvents.TRACK_ERROR, async (data) => {
            await this._handleTrackError(data as EventData);
        });

        // Track stuck - skip to next
        musicEventBus.subscribe(MusicEvents.TRACK_STUCK, async (data) => {
            await this._handleTrackStuck(data as EventData);
        });

        // Voice closed - cleanup
        musicEventBus.subscribe(MusicEvents.VOICE_CLOSED, async (data) => {
            await this._handleVoiceClosed(data as EventData);
        });

        // Queue end - handle auto-play or inactivity
        musicEventBus.subscribe(MusicEvents.QUEUE_END, async (data) => {
            await this._handleQueueEnd(data as EventData);
        });

        // Cleanup start - perform cleanup
        musicEventBus.subscribe(MusicEvents.CLEANUP_START, async (data) => {
            await this._handleCleanup(data as EventData);
        });

        // Now playing send
        musicEventBus.subscribe(MusicEvents.NOWPLAYING_SEND, async (data) => {
            await this._handleNowPlayingSend(data as EventData);
        });

        // Now playing update
        musicEventBus.subscribe(MusicEvents.NOWPLAYING_UPDATE, async (data) => {
            await this._handleNowPlayingUpdate(data as EventData);
        });

        // Now playing disable
        musicEventBus.subscribe(MusicEvents.NOWPLAYING_DISABLE, async (data) => {
            await this._handleNowPlayingDisable(data as EventData);
        });
    }

    /**
     * Set cleanup handler for a guild
     */
    setCleanupHandler(guildId: string, handler: () => Promise<void> | void): void {
        this.cleanupHandlers.set(guildId, handler);
    }

    /**
     * Handle track end event
     */
    private async _handleTrackEnd(data: EventData): Promise<void> {
        const { guildId, reason } = data;
        
        // Skip if replaced or stopped manually
        if (reason === 'replaced' || reason === 'stopped') return;

        const { playbackService, queueService } = this.services;
        if (!playbackService || !queueService) return;

        // Acquire transition lock
        const lockAcquired = await playbackService.acquireTransitionLock(guildId, 3000);
        if (!lockAcquired) return;

        try {
            // Delay for smooth transition
            await new Promise(resolve => setTimeout(resolve, TRACK_TRANSITION_DELAY));

            const loopMode = queueService.getLoopMode(guildId);
            const currentTrack = queueService.getCurrentTrack(guildId);

            // Handle track loop
            if (loopMode === 'track' && currentTrack) {
                await this._playTrack(guildId, currentTrack);
                const loopCount = musicCache.incrementLoopCount(guildId);
                musicEventBus.emitNowPlayingUpdate(guildId, { loopCount });
                return;
            }

            // Reset loop count
            musicCache.resetLoopCount(guildId);

            // Get next track
            const nextTrack = musicCache.getNextTrack(guildId);

            // Queue loop - add current back to end
            if (loopMode === 'queue' && currentTrack) {
                musicCache.addTrack(guildId, currentTrack);
            }

            if (!nextTrack) {
                // Queue ended
                musicEventBus.emitQueueEnd(guildId, currentTrack);
                return;
            }

            // Play next track
            await this._playTrack(guildId, nextTrack);
            
            // Disable old now playing and send new
            musicEventBus.emitEvent(MusicEvents.NOWPLAYING_DISABLE, { guildId });
            musicEventBus.emitNowPlayingSend(guildId, nextTrack);

        } catch (error) {
            const err = error as Error;
            logger.error('PlaybackEventHandler', `Error in track end handler: ${err.message}`);
            musicEventBus.emitEvent(MusicEvents.ERROR, { guildId, error: err });
        } finally {
            playbackService.releaseTransitionLock(guildId);
        }
    }

    /**
     * Handle track error event
     */
    private async _handleTrackError(data: EventData): Promise<void> {
        const { guildId, error } = data;
        
        // Check if we're replacing a track - if so, ignore the error
        const queue = musicCache.getQueue(guildId) as any;
        if (queue?.isReplacing) {
            logger.info('PlaybackEventHandler', `Ignoring track error during replacement in guild ${guildId}`);
            return;
        }
        
        logger.error('PlaybackEventHandler', `Track error in guild ${guildId}: ${error}`);

        const { playbackService } = this.services;
        if (!playbackService) return;

        const lockAcquired = await playbackService.acquireTransitionLock(guildId, 3000);
        if (!lockAcquired) return;

        try {
            // Try to play next track
            const nextTrack = musicCache.getNextTrack(guildId);
            if (nextTrack) {
                await this._playTrack(guildId, nextTrack);
                musicEventBus.emitNowPlayingSend(guildId, nextTrack);
            } else {
                musicEventBus.emitQueueEnd(guildId, null);
            }
        } catch (err) {
            const error = err as Error;
            logger.error('PlaybackEventHandler', `Error handling track error: ${error.message}`);
        } finally {
            playbackService.releaseTransitionLock(guildId);
        }
    }

    /**
     * Handle track stuck event
     */
    private async _handleTrackStuck(data: EventData): Promise<void> {
        const { guildId } = data;
        logger.warn('PlaybackEventHandler', `Track stuck in guild ${guildId}, skipping...`);

        // Same handling as error
        await this._handleTrackError(data);
    }

    /**
     * Handle voice closed event
     */
    private async _handleVoiceClosed(data: EventData): Promise<void> {
        const { guildId } = data;
        logger.info('PlaybackEventHandler', `Voice closed in guild ${guildId}`);
        
        musicEventBus.emitCleanup(guildId, 'voice_closed');
    }

    /**
     * Handle queue end event
     */
    private async _handleQueueEnd(data: EventData): Promise<void> {
        const { guildId, lastTrack } = data;
        const queue = musicCache.getQueue(guildId);

        // Try auto-play if enabled
        if (queue?.autoPlay && lastTrack) {
            logger.info('PlaybackEventHandler', 'Queue ended, trying auto-play...');

            try {
                const { autoPlayService } = this.services;
                if (!autoPlayService) throw new Error('AutoPlayService not available');

                const similarTrack = await autoPlayService.findSimilarTrack(guildId, lastTrack);

                if (similarTrack) {
                    logger.info('PlaybackEventHandler', `Auto-play found: ${similarTrack.info?.title}`);

                    // Track history
                    const trackInfo = lastTrack.info || lastTrack;
                    if (!queue.lastPlayedTracks) queue.lastPlayedTracks = [];
                    queue.lastPlayedTracks.push(trackInfo.title || '');
                    if (queue.lastPlayedTracks.length > 10) queue.lastPlayedTracks.shift();

                    // Play the track
                    musicCache.setCurrentTrack(guildId, similarTrack);
                    await this._playTrack(guildId, similarTrack);

                    // Emit auto-play found event
                    musicEventBus.emitEvent(MusicEvents.AUTOPLAY_FOUND, {
                        guildId,
                        track: similarTrack,
                        basedOn: lastTrack
                    });

                    // Send notification
                    if (queue?.textChannel && 'send' in queue.textChannel) {
                        const embed = (trackHandler as unknown as { createAutoPlayEmbed?: (track: MusicTrack) => Record<string, unknown> }).createAutoPlayEmbed?.(similarTrack) ||
                            { description: `🎵 Auto-Play: **${similarTrack.info?.title}**` };
                        await queue.textChannel.send({ embeds: [embed] }).catch(() => {});
                    }

                    musicEventBus.emitNowPlayingSend(guildId, similarTrack);
                    return;
                }
            } catch (err) {
                const error = err as Error;
                logger.error('PlaybackEventHandler', `Auto-play error: ${error.message}`);
                musicEventBus.emitEvent(MusicEvents.AUTOPLAY_FAILED, { guildId, error: error.message });
                // Auto-play failed, but don't show queue finished - will retry or user can add songs
                return;
            }
        }

        // No auto-play enabled, show finished message
        musicCache.setCurrentTrack(guildId, null);
        musicEventBus.emitEvent(MusicEvents.NOWPLAYING_DISABLE, { guildId });

        if (queue?.textChannel && 'send' in queue.textChannel) {
            const embed = (trackHandler as unknown as { createQueueFinishedEmbed?: (track: MusicTrack | null) => Record<string, unknown> }).createQueueFinishedEmbed?.(lastTrack || null) ||
                { description: '✅ Queue finished!' };
            await queue.textChannel.send({ embeds: [embed] }).catch(() => {});
        }

        // Start inactivity timer
        const { voiceService } = this.services;
        if (voiceService) {
            voiceService.setInactivityTimer(guildId, () => {
                musicEventBus.emitCleanup(guildId, 'inactivity');
            });
        }
    }

    /**
     * Handle cleanup event
     */
    private async _handleCleanup(data: EventData): Promise<void> {
        const { guildId, reason } = data;
        logger.info('PlaybackEventHandler', `Cleanup for guild ${guildId}, reason: ${reason}`);

        try {
            // Call registered cleanup handler
            const handler = this.cleanupHandlers.get(guildId);
            if (handler) {
                await handler();
                this.cleanupHandlers.delete(guildId);
            }

            // Remove guild event listeners
            musicEventBus.removeGuildListeners(guildId);

            // Emit complete
            musicEventBus.emitEvent(MusicEvents.CLEANUP_COMPLETE, { guildId, reason });
        } catch (err) {
            const error = err as Error;
            logger.error('PlaybackEventHandler', `Cleanup error: ${error.message}`);
        }
    }

    /**
     * Handle now playing send event
     */
    private async _handleNowPlayingSend(data: EventData): Promise<void> {
        const { guildId, track } = data;
        const queue = musicCache.getQueue(guildId);
        if (!queue?.textChannel || !track) return;

        const { queueService, voiceService } = this.services;
        if (!queueService) return;

        try {
            // Disable previous
            await this._disableNowPlaying(guildId);

            // Build embed
            const queueList = queueService.getTracks(guildId);
            const listenerCount = voiceService?.getListenerCount(guildId, (queue.textChannel as { guild?: unknown }).guild) || 0;
            const voteSkipStatus = musicCache.getVoteSkipStatus(guildId, listenerCount);

            const embed = trackHandler.createNowPlayingEmbed(track as unknown as Track, {
                volume: queueService.getVolume(guildId),
                isPaused: queue.isPaused || false,
                loopMode: queueService.getLoopMode(guildId) as unknown as LoopMode,
                isShuffled: queueService.isShuffled(guildId),
                queueLength: queueList.length,
                nextTrack: (queueList[0] as unknown as Track) || null,
                loopCount: 0,
                voteSkipCount: voteSkipStatus.count,
                voteSkipRequired: voteSkipStatus.required,
                listenerCount
            });

            const rows = trackHandler.createControlButtons(guildId, {
                isPaused: queue.isPaused || false,
                loopMode: queueService.getLoopMode(guildId) as unknown as LoopMode,
                isShuffled: queueService.isShuffled(guildId),
                autoPlay: queueService.isAutoPlayEnabled(guildId),
                trackUrl: track.url || '',
                userId: (track.requestedBy as { id?: string })?.id || '',
                listenerCount
            });

            if ('send' in queue.textChannel) {
                const message = await queue.textChannel.send({ embeds: [embed], components: rows });
                musicCache.setNowPlayingMessage(guildId, message);
            }
        } catch {
            // Silent fail
        }
    }

    /**
     * Handle now playing update event
     */
    private async _handleNowPlayingUpdate(data: EventData): Promise<void> {
        const { guildId, loopCount } = data;
        const ref = musicCache.getNowPlayingMessage(guildId);
        const message = await this._resolveMessage(ref, guildId);
        if (!message) return;

        const { queueService, voiceService } = this.services;
        if (!queueService) return;

        const queue = musicCache.getQueue(guildId);
        const currentTrack = queueService.getCurrentTrack(guildId);
        if (!queue || !currentTrack) return;

        try {
            const queueList = queueService.getTracks(guildId);
            const listenerCount = voiceService?.getListenerCount(guildId, (queue.textChannel as { guild?: unknown })?.guild) || 0;
            const voteSkipStatus = musicCache.getVoteSkipStatus(guildId, listenerCount);

            const embed = trackHandler.createNowPlayingEmbed(currentTrack as Parameters<typeof trackHandler.createNowPlayingEmbed>[0], {
                volume: queueService.getVolume(guildId),
                isPaused: queue.isPaused || false,
                loopMode: queueService.getLoopMode(guildId) as unknown as LoopMode,
                isShuffled: queueService.isShuffled(guildId),
                queueLength: queueList.length,
                nextTrack: (queueList[0] as unknown as Track) || null,
                loopCount: loopCount || 0,
                voteSkipCount: voteSkipStatus.count,
                voteSkipRequired: voteSkipStatus.required,
                listenerCount
            });

            const rows = trackHandler.createControlButtons(guildId, {
                isPaused: queue.isPaused || false,
                loopMode: queueService.getLoopMode(guildId) as unknown as LoopMode,
                isShuffled: queueService.isShuffled(guildId),
                autoPlay: queueService.isAutoPlayEnabled(guildId),
                trackUrl: currentTrack.url || '',
                userId: (currentTrack.requestedBy as { id?: string })?.id || '',
                listenerCount
            }) as MessageComponents;

            await message.edit({ embeds: [embed], components: rows });
        } catch (err) {
            const error = err as { code?: number };
            if (error.code === 10008) {
                musicCache.setNowPlayingMessage(guildId, null);
            }
        }
    }

    /**
     * Handle now playing disable event
     */
    private async _handleNowPlayingDisable(data: EventData): Promise<void> {
        const { guildId } = data;
        await this._disableNowPlaying(guildId);
    }

    /**
     * Disable now playing controls
     */
    private async _disableNowPlaying(guildId: string): Promise<void> {
        const ref = musicCache.getNowPlayingMessage(guildId);
        const message = await this._resolveMessage(ref, guildId);
        if (!message?.components?.length) return;

        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const disabledRows = message.components.map((row: any) => ({
                type: row.type,
                components: row.components.map((c: { data: Record<string, unknown> }) => ({
                    ...c.data,
                    disabled: true
                }))
            })) as MessageComponents;

            await message.edit({ components: disabledRows });
        } catch (err) {
            const error = err as { code?: number };
            if (error.code === 10008) {
                musicCache.setNowPlayingMessage(guildId, null);
            }
        }
    }

    /**
     * Play a track (helper)
     */
    private async _playTrack(guildId: string, track: MusicTrack): Promise<MusicTrack> {
        const { playbackService, queueService, voiceService } = this.services;
        if (!playbackService) throw new Error('PlaybackService not available');

        // Set replacing flag if there's a current track
        const queue = musicCache.getQueue(guildId) as any;
        const hadCurrentTrack = !!queueService?.getCurrentTrack(guildId);
        if (hadCurrentTrack && queue) {
            queue.isReplacing = true;
        }

        queueService?.setCurrentTrack(guildId, track);
        
        const player = playbackService.getPlayer(guildId);
        if (!player) throw new Error('NO_PLAYER');
        if (!track?.track?.encoded) throw new Error('INVALID_TRACK');

        try {
            await player.playTrack({ track: { encoded: track.track.encoded } });
        } finally {
            // Clear replacing flag after a delay
            if (queue) {
                setTimeout(() => { queue.isReplacing = false; }, 1000);
            }
        }
        
        voiceService?.clearInactivityTimer(guildId);

        return track;
    }

    /**
     * Shutdown handler
     */
    shutdown(): void {
        this.cleanupHandlers.clear();
        this.globalHandlersBound = false;
        logger.info('PlaybackEventHandler', 'Shutdown complete');
    }
}

// Export singleton and class
const playbackEventHandler = new PlaybackEventHandler();

export { PlaybackEventHandler };
export default playbackEventHandler;

