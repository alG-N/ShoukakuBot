"use strict";
/**
 * Playback Event Handler
 * Handles player events via the event bus
 * Decouples event handling from service logic
 * @module services/music/events/PlaybackEventHandler
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlaybackEventHandler = void 0;
const MusicEventBus_js_1 = __importDefault(require("./MusicEventBus.js"));
const MusicEvents_js_1 = require("./MusicEvents.js");
const MusicCacheFacade_js_1 = __importDefault(require("../../../repositories/music/MusicCacheFacade.js"));
const trackHandler_js_1 = __importDefault(require("../../../handlers/music/trackHandler.js"));
const music_js_1 = require("../../../config/features/music.js");
// PLAYBACK EVENT HANDLER CLASS
class PlaybackEventHandler {
    /** Cleanup handlers per guild */
    cleanupHandlers = new Map();
    /** Whether global handlers are bound */
    globalHandlersBound = false;
    /** Service references */
    services = {};
    /**
     * Initialize global event handlers
     * Call once at startup
     */
    initialize(services) {
        if (this.globalHandlersBound)
            return;
        this.services = services;
        this._bindGlobalHandlers();
        this.globalHandlersBound = true;
        console.log('[PlaybackEventHandler] Initialized with global handlers');
    }
    /**
     * Bind global event handlers
     */
    _bindGlobalHandlers() {
        // Track end - handle queue progression
        MusicEventBus_js_1.default.subscribe(MusicEvents_js_1.MusicEvents.TRACK_END, async (data) => {
            await this._handleTrackEnd(data);
        });
        // Track error - skip to next
        MusicEventBus_js_1.default.subscribe(MusicEvents_js_1.MusicEvents.TRACK_ERROR, async (data) => {
            await this._handleTrackError(data);
        });
        // Track stuck - skip to next
        MusicEventBus_js_1.default.subscribe(MusicEvents_js_1.MusicEvents.TRACK_STUCK, async (data) => {
            await this._handleTrackStuck(data);
        });
        // Voice closed - cleanup
        MusicEventBus_js_1.default.subscribe(MusicEvents_js_1.MusicEvents.VOICE_CLOSED, async (data) => {
            await this._handleVoiceClosed(data);
        });
        // Queue end - handle auto-play or inactivity
        MusicEventBus_js_1.default.subscribe(MusicEvents_js_1.MusicEvents.QUEUE_END, async (data) => {
            await this._handleQueueEnd(data);
        });
        // Cleanup start - perform cleanup
        MusicEventBus_js_1.default.subscribe(MusicEvents_js_1.MusicEvents.CLEANUP_START, async (data) => {
            await this._handleCleanup(data);
        });
        // Now playing send
        MusicEventBus_js_1.default.subscribe(MusicEvents_js_1.MusicEvents.NOWPLAYING_SEND, async (data) => {
            await this._handleNowPlayingSend(data);
        });
        // Now playing update
        MusicEventBus_js_1.default.subscribe(MusicEvents_js_1.MusicEvents.NOWPLAYING_UPDATE, async (data) => {
            await this._handleNowPlayingUpdate(data);
        });
        // Now playing disable
        MusicEventBus_js_1.default.subscribe(MusicEvents_js_1.MusicEvents.NOWPLAYING_DISABLE, async (data) => {
            await this._handleNowPlayingDisable(data);
        });
    }
    /**
     * Set cleanup handler for a guild
     */
    setCleanupHandler(guildId, handler) {
        this.cleanupHandlers.set(guildId, handler);
    }
    /**
     * Handle track end event
     */
    async _handleTrackEnd(data) {
        const { guildId, reason } = data;
        // Skip if replaced or stopped manually
        if (reason === 'replaced' || reason === 'stopped')
            return;
        const { playbackService, queueService } = this.services;
        if (!playbackService || !queueService)
            return;
        // Acquire transition lock
        const lockAcquired = await playbackService.acquireTransitionLock(guildId, 3000);
        if (!lockAcquired)
            return;
        try {
            // Delay for smooth transition
            await new Promise(resolve => setTimeout(resolve, music_js_1.TRACK_TRANSITION_DELAY));
            const loopMode = queueService.getLoopMode(guildId);
            const currentTrack = queueService.getCurrentTrack(guildId);
            // Handle track loop
            if (loopMode === 'track' && currentTrack) {
                await this._playTrack(guildId, currentTrack);
                const loopCount = MusicCacheFacade_js_1.default.incrementLoopCount(guildId);
                MusicEventBus_js_1.default.emitNowPlayingUpdate(guildId, { loopCount });
                return;
            }
            // Reset loop count
            MusicCacheFacade_js_1.default.resetLoopCount(guildId);
            // Get next track
            const nextTrack = MusicCacheFacade_js_1.default.getNextTrack(guildId);
            // Queue loop - add current back to end
            if (loopMode === 'queue' && currentTrack) {
                MusicCacheFacade_js_1.default.addTrack(guildId, currentTrack);
            }
            if (!nextTrack) {
                // Queue ended
                MusicEventBus_js_1.default.emitQueueEnd(guildId, currentTrack);
                return;
            }
            // Play next track
            await this._playTrack(guildId, nextTrack);
            // Disable old now playing and send new
            MusicEventBus_js_1.default.emitEvent(MusicEvents_js_1.MusicEvents.NOWPLAYING_DISABLE, { guildId });
            MusicEventBus_js_1.default.emitNowPlayingSend(guildId, nextTrack);
        }
        catch (error) {
            const err = error;
            console.error(`[PlaybackEventHandler] Error in track end handler:`, err.message);
            MusicEventBus_js_1.default.emitEvent(MusicEvents_js_1.MusicEvents.ERROR, { guildId, error: err });
        }
        finally {
            playbackService.releaseTransitionLock(guildId);
        }
    }
    /**
     * Handle track error event
     */
    async _handleTrackError(data) {
        const { guildId, error } = data;
        console.error(`[PlaybackEventHandler] Track error in guild ${guildId}:`, error);
        const { playbackService } = this.services;
        if (!playbackService)
            return;
        const lockAcquired = await playbackService.acquireTransitionLock(guildId, 3000);
        if (!lockAcquired)
            return;
        try {
            // Try to play next track
            const nextTrack = MusicCacheFacade_js_1.default.getNextTrack(guildId);
            if (nextTrack) {
                await this._playTrack(guildId, nextTrack);
                MusicEventBus_js_1.default.emitNowPlayingSend(guildId, nextTrack);
            }
            else {
                MusicEventBus_js_1.default.emitQueueEnd(guildId, null);
            }
        }
        catch (err) {
            const error = err;
            console.error(`[PlaybackEventHandler] Error handling track error:`, error.message);
        }
        finally {
            playbackService.releaseTransitionLock(guildId);
        }
    }
    /**
     * Handle track stuck event
     */
    async _handleTrackStuck(data) {
        const { guildId } = data;
        console.warn(`[PlaybackEventHandler] Track stuck in guild ${guildId}, skipping...`);
        // Same handling as error
        await this._handleTrackError(data);
    }
    /**
     * Handle voice closed event
     */
    async _handleVoiceClosed(data) {
        const { guildId } = data;
        console.log(`[PlaybackEventHandler] Voice closed in guild ${guildId}`);
        MusicEventBus_js_1.default.emitCleanup(guildId, 'voice_closed');
    }
    /**
     * Handle queue end event
     */
    async _handleQueueEnd(data) {
        const { guildId, lastTrack } = data;
        const queue = MusicCacheFacade_js_1.default.getQueue(guildId);
        // Try auto-play if enabled
        if (queue?.autoPlay && lastTrack) {
            console.log(`[PlaybackEventHandler] Queue ended, trying auto-play...`);
            try {
                const { autoPlayService } = this.services;
                if (!autoPlayService)
                    throw new Error('AutoPlayService not available');
                const similarTrack = await autoPlayService.findSimilarTrack(guildId, lastTrack);
                if (similarTrack) {
                    console.log(`[PlaybackEventHandler] Auto-play found: ${similarTrack.info?.title}`);
                    // Track history
                    const trackInfo = lastTrack.info || lastTrack;
                    if (!queue.lastPlayedTracks)
                        queue.lastPlayedTracks = [];
                    queue.lastPlayedTracks.push(trackInfo.title || '');
                    if (queue.lastPlayedTracks.length > 10)
                        queue.lastPlayedTracks.shift();
                    // Play the track
                    MusicCacheFacade_js_1.default.setCurrentTrack(guildId, similarTrack);
                    await this._playTrack(guildId, similarTrack);
                    // Emit auto-play found event
                    MusicEventBus_js_1.default.emitEvent(MusicEvents_js_1.MusicEvents.AUTOPLAY_FOUND, {
                        guildId,
                        track: similarTrack,
                        basedOn: lastTrack
                    });
                    // Send notification
                    if (queue?.textChannel && 'send' in queue.textChannel) {
                        const embed = trackHandler_js_1.default.createAutoPlayEmbed?.(similarTrack) ||
                            { description: `🎵 Auto-Play: **${similarTrack.info?.title}**` };
                        await queue.textChannel.send({ embeds: [embed] }).catch(() => { });
                    }
                    MusicEventBus_js_1.default.emitNowPlayingSend(guildId, similarTrack);
                    return;
                }
            }
            catch (err) {
                const error = err;
                console.error(`[PlaybackEventHandler] Auto-play error:`, error.message);
                MusicEventBus_js_1.default.emitEvent(MusicEvents_js_1.MusicEvents.AUTOPLAY_FAILED, { guildId, error: error.message });
                // Auto-play failed, but don't show queue finished - will retry or user can add songs
                return;
            }
        }
        // No auto-play enabled, show finished message
        MusicCacheFacade_js_1.default.setCurrentTrack(guildId, null);
        MusicEventBus_js_1.default.emitEvent(MusicEvents_js_1.MusicEvents.NOWPLAYING_DISABLE, { guildId });
        if (queue?.textChannel && 'send' in queue.textChannel) {
            const embed = trackHandler_js_1.default.createQueueFinishedEmbed?.(lastTrack || null) ||
                { description: '✅ Queue finished!' };
            await queue.textChannel.send({ embeds: [embed] }).catch(() => { });
        }
        // Start inactivity timer
        const { voiceService } = this.services;
        if (voiceService) {
            voiceService.setInactivityTimer(guildId, () => {
                MusicEventBus_js_1.default.emitCleanup(guildId, 'inactivity');
            });
        }
    }
    /**
     * Handle cleanup event
     */
    async _handleCleanup(data) {
        const { guildId, reason } = data;
        console.log(`[PlaybackEventHandler] Cleanup for guild ${guildId}, reason: ${reason}`);
        try {
            // Call registered cleanup handler
            const handler = this.cleanupHandlers.get(guildId);
            if (handler) {
                await handler();
                this.cleanupHandlers.delete(guildId);
            }
            // Remove guild event listeners
            MusicEventBus_js_1.default.removeGuildListeners(guildId);
            // Emit complete
            MusicEventBus_js_1.default.emitEvent(MusicEvents_js_1.MusicEvents.CLEANUP_COMPLETE, { guildId, reason });
        }
        catch (err) {
            const error = err;
            console.error(`[PlaybackEventHandler] Cleanup error:`, error.message);
        }
    }
    /**
     * Handle now playing send event
     */
    async _handleNowPlayingSend(data) {
        const { guildId, track } = data;
        const queue = MusicCacheFacade_js_1.default.getQueue(guildId);
        if (!queue?.textChannel || !track)
            return;
        const { queueService, voiceService } = this.services;
        if (!queueService)
            return;
        try {
            // Disable previous
            await this._disableNowPlaying(guildId);
            // Build embed
            const queueList = queueService.getTracks(guildId);
            const listenerCount = voiceService?.getListenerCount(guildId, queue.textChannel.guild) || 0;
            const voteSkipStatus = MusicCacheFacade_js_1.default.getVoteSkipStatus(guildId, listenerCount);
            const embed = trackHandler_js_1.default.createNowPlayingEmbed(track, {
                volume: queueService.getVolume(guildId),
                isPaused: queue.isPaused || false,
                loopMode: queueService.getLoopMode(guildId),
                isShuffled: queueService.isShuffled(guildId),
                queueLength: queueList.length,
                nextTrack: queueList[0] || null,
                loopCount: 0,
                voteSkipCount: voteSkipStatus.count,
                voteSkipRequired: voteSkipStatus.required,
                listenerCount
            });
            const rows = trackHandler_js_1.default.createControlButtons(guildId, {
                isPaused: queue.isPaused || false,
                loopMode: queueService.getLoopMode(guildId),
                isShuffled: queueService.isShuffled(guildId),
                autoPlay: queueService.isAutoPlayEnabled(guildId),
                trackUrl: track.url || '',
                userId: track.requestedBy?.id || '',
                listenerCount
            });
            if ('send' in queue.textChannel) {
                const message = await queue.textChannel.send({ embeds: [embed], components: rows });
                MusicCacheFacade_js_1.default.setNowPlayingMessage(guildId, message);
            }
        }
        catch {
            // Silent fail
        }
    }
    /**
     * Handle now playing update event
     */
    async _handleNowPlayingUpdate(data) {
        const { guildId, loopCount } = data;
        const message = MusicCacheFacade_js_1.default.getNowPlayingMessage(guildId);
        if (!message)
            return;
        const { queueService, voiceService } = this.services;
        if (!queueService)
            return;
        const queue = MusicCacheFacade_js_1.default.getQueue(guildId);
        const currentTrack = queueService.getCurrentTrack(guildId);
        if (!queue || !currentTrack)
            return;
        try {
            const queueList = queueService.getTracks(guildId);
            const listenerCount = voiceService?.getListenerCount(guildId, queue.textChannel?.guild) || 0;
            const voteSkipStatus = MusicCacheFacade_js_1.default.getVoteSkipStatus(guildId, listenerCount);
            const embed = trackHandler_js_1.default.createNowPlayingEmbed(currentTrack, {
                volume: queueService.getVolume(guildId),
                isPaused: queue.isPaused || false,
                loopMode: queueService.getLoopMode(guildId),
                isShuffled: queueService.isShuffled(guildId),
                queueLength: queueList.length,
                nextTrack: queueList[0] || null,
                loopCount: loopCount || 0,
                voteSkipCount: voteSkipStatus.count,
                voteSkipRequired: voteSkipStatus.required,
                listenerCount
            });
            const rows = trackHandler_js_1.default.createControlButtons(guildId, {
                isPaused: queue.isPaused || false,
                loopMode: queueService.getLoopMode(guildId),
                isShuffled: queueService.isShuffled(guildId),
                autoPlay: queueService.isAutoPlayEnabled(guildId),
                trackUrl: currentTrack.url || '',
                userId: currentTrack.requestedBy?.id || '',
                listenerCount
            });
            if ('edit' in message) {
                await message.edit({ embeds: [embed], components: rows });
            }
        }
        catch (err) {
            const error = err;
            if (error.code === 10008) {
                MusicCacheFacade_js_1.default.setNowPlayingMessage(guildId, null);
            }
        }
    }
    /**
     * Handle now playing disable event
     */
    async _handleNowPlayingDisable(data) {
        const { guildId } = data;
        await this._disableNowPlaying(guildId);
    }
    /**
     * Disable now playing controls
     */
    async _disableNowPlaying(guildId) {
        const message = MusicCacheFacade_js_1.default.getNowPlayingMessage(guildId);
        if (!message?.components?.length)
            return;
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const disabledRows = message.components.map((row) => ({
                type: row.type,
                components: row.components.map((c) => ({
                    ...c.data,
                    disabled: true
                }))
            }));
            await message.edit({ components: disabledRows });
        }
        catch (err) {
            const error = err;
            if (error.code === 10008) {
                MusicCacheFacade_js_1.default.setNowPlayingMessage(guildId, null);
            }
        }
    }
    /**
     * Play a track (helper)
     */
    async _playTrack(guildId, track) {
        const { playbackService, queueService, voiceService } = this.services;
        if (!playbackService)
            throw new Error('PlaybackService not available');
        queueService?.setCurrentTrack(guildId, track);
        const player = playbackService.getPlayer(guildId);
        if (!player)
            throw new Error('NO_PLAYER');
        if (!track?.track?.encoded)
            throw new Error('INVALID_TRACK');
        await player.playTrack({ track: { encoded: track.track.encoded } });
        voiceService?.clearInactivityTimer(guildId);
        return track;
    }
    /**
     * Shutdown handler
     */
    shutdown() {
        this.cleanupHandlers.clear();
        this.globalHandlersBound = false;
        console.log('[PlaybackEventHandler] Shutdown complete');
    }
}
exports.PlaybackEventHandler = PlaybackEventHandler;
// Export singleton and class
const playbackEventHandler = new PlaybackEventHandler();
exports.default = playbackEventHandler;
//# sourceMappingURL=PlaybackEventHandler.js.map