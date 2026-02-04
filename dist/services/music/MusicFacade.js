"use strict";
/**
 * Music Facade
 * Orchestrates all music sub-services
 * Provides backward-compatible API matching original MusicService
 * @module services/music/MusicFacade
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.musicFacade = exports.MusicFacade = void 0;
const queue_1 = require("./queue");
const playback_1 = require("./playback");
const voice_1 = require("./voice");
const autoplay_1 = require("./autoplay");
const events_1 = require("./events");
const MusicCacheFacade_1 = __importDefault(require("../../cache/music/MusicCacheFacade"));
const trackHandler_1 = __importDefault(require("../../handlers/music/trackHandler"));
const music_1 = require("../../config/features/music");
const metrics_1 = require("../../core/metrics");
// MusicFacade Class
class MusicFacade {
    queueService;
    playbackService;
    voiceService;
    autoPlayService;
    eventBus;
    eventHandlerInitialized;
    constructor() {
        this.queueService = queue_1.queueService;
        this.playbackService = playback_1.playbackService;
        this.voiceService = voice_1.voiceConnectionService;
        this.autoPlayService = autoplay_1.autoPlayService;
        this.eventBus = events_1.musicEventBus;
        this.eventHandlerInitialized = false;
    }
    /**
     * Update music metrics (active players, queue size, voice connections)
     */
    updateMetrics() {
        try {
            // Get queue stats which includes active queues and total tracks
            const queueStats = MusicCacheFacade_1.default.queueCache?.getStats?.() || { activeQueues: 0, totalTracks: 0 };
            (0, metrics_1.updateMusicMetrics)({
                activePlayers: queueStats.activeQueues,
                totalQueueSize: queueStats.totalTracks,
                voiceConnections: queueStats.activeQueues
            });
        }
        catch (error) {
            // Silently ignore metric update errors
        }
    }
    /**
     * Initialize the event handler with service references
     * Call this once after all services are ready
     */
    initializeEventHandler() {
        if (this.eventHandlerInitialized)
            return;
        events_1.playbackEventHandler.initialize({
            queueService: queue_1.queueService,
            playbackService: playback_1.playbackService,
            voiceService: voice_1.voiceConnectionService,
            autoPlayService: autoplay_1.autoPlayService
        });
        this.eventHandlerInitialized = true;
        console.log('[MusicFacade] Event handler initialized');
    }
    // QUEUE OPERATIONS (delegated to QueueService)
    getQueue(guildId) {
        return queue_1.queueService.getOrCreate(guildId);
    }
    getQueueList(guildId) {
        return queue_1.queueService.getTracks(guildId);
    }
    getQueueLength(guildId) {
        return queue_1.queueService.getLength(guildId);
    }
    getCurrentTrack(guildId) {
        return queue_1.queueService.getCurrentTrack(guildId);
    }
    addTrack(guildId, track) {
        const result = MusicCacheFacade_1.default.addTrack(guildId, track);
        events_1.musicEventBus.emitEvent(events_1.MusicEvents.QUEUE_ADD, { guildId, track });
        this.updateMetrics();
        return result;
    }
    addTrackToFront(guildId, track) {
        const result = MusicCacheFacade_1.default.addTrackToFront(guildId, track);
        events_1.musicEventBus.emitEvent(events_1.MusicEvents.QUEUE_ADD, { guildId, track, position: 'front' });
        this.updateMetrics();
        return result;
    }
    addTracks(guildId, tracks) {
        const result = MusicCacheFacade_1.default.addTracks(guildId, tracks);
        events_1.musicEventBus.emitEvent(events_1.MusicEvents.QUEUE_ADD_MANY, { guildId, tracks, count: tracks.length });
        this.updateMetrics();
        return result;
    }
    removeTrack(guildId, index) {
        const queue = MusicCacheFacade_1.default.getQueue(guildId);
        const track = queue?.tracks?.[index];
        const result = MusicCacheFacade_1.default.removeTrack(guildId, index);
        events_1.musicEventBus.emitEvent(events_1.MusicEvents.QUEUE_REMOVE, { guildId, track, index });
        this.updateMetrics();
        return result;
    }
    clearQueue(guildId) {
        queue_1.queueService.clear(guildId);
        events_1.musicEventBus.emitEvent(events_1.MusicEvents.QUEUE_CLEAR, { guildId });
        this.updateMetrics();
    }
    moveTrack(guildId, fromIndex, toIndex) {
        const result = queue_1.queueService.moveTrack(guildId, fromIndex, toIndex);
        if (result.isOk()) {
            events_1.musicEventBus.emitEvent(events_1.MusicEvents.QUEUE_MOVE, { guildId, fromIndex, toIndex });
        }
        return result.isOk();
    }
    // PLAYBACK OPERATIONS (delegated to PlaybackService)
    async playTrack(guildId, track) {
        const queue = MusicCacheFacade_1.default.getQueue(guildId);
        // Set replacing flag if a track is already playing
        // This prevents the exception handler from skipping when we're just replacing
        if (queue && queue.currentTrack) {
            queue.isReplacing = true;
        }
        queue_1.queueService.setCurrentTrack(guildId, track);
        const player = playback_1.playbackService.getPlayer(guildId);
        if (!player)
            throw new Error('NO_PLAYER');
        // Handle both track.track.encoded (nested) and track.encoded (flat) structures
        const encoded = track?.track?.encoded || track?.encoded;
        if (!encoded)
            throw new Error('INVALID_TRACK');
        try {
            await player.playTrack({ track: { encoded } });
            // Track metrics - track played
            const source = track?.info?.sourceName || 'unknown';
            metrics_1.musicTracksPlayedTotal.inc({ source });
            this.updateMetrics();
        }
        finally {
            // Clear replacing flag after a short delay
            if (queue) {
                setTimeout(() => { queue.isReplacing = false; }, 1000);
            }
        }
        voice_1.voiceConnectionService.clearInactivityTimer(guildId);
        return track;
    }
    async playNext(guildId) {
        const loopMode = queue_1.queueService.getLoopMode(guildId);
        const currentTrack = queue_1.queueService.getCurrentTrack(guildId);
        // Handle track loop mode
        if (loopMode === 'track' && currentTrack) {
            await this.playTrack(guildId, currentTrack);
            return { track: currentTrack, isLooped: true };
        }
        // Reset loop count
        MusicCacheFacade_1.default.resetLoopCount(guildId);
        // Get next track
        const nextTrack = MusicCacheFacade_1.default.getNextTrack(guildId);
        // Queue loop - add current back
        if (loopMode === 'queue' && currentTrack) {
            MusicCacheFacade_1.default.addTrack(guildId, currentTrack);
        }
        if (!nextTrack) {
            await this.handleQueueEnd(guildId);
            return null;
        }
        await this.playTrack(guildId, nextTrack);
        return { track: nextTrack, isLooped: false };
    }
    async skip(guildId, count = 1) {
        const player = playback_1.playbackService.getPlayer(guildId);
        if (!player)
            throw new Error('NO_PLAYER');
        const currentTrack = queue_1.queueService.getCurrentTrack(guildId);
        queue_1.queueService.endSkipVote(guildId);
        // Skip multiple
        if (count > 1) {
            for (let i = 0; i < count - 1; i++) {
                MusicCacheFacade_1.default.getNextTrack(guildId);
            }
        }
        await player.stopTrack();
        events_1.musicEventBus.emitEvent(events_1.MusicEvents.TRACK_SKIP, { guildId, count, previousTrack: currentTrack });
        return { skipped: count, previousTrack: currentTrack };
    }
    async togglePause(guildId) {
        const player = playback_1.playbackService.getPlayer(guildId);
        if (!player)
            throw new Error('NO_PLAYER');
        const newState = !player.paused;
        await player.setPaused(newState);
        events_1.musicEventBus.emitEvent(newState ? events_1.MusicEvents.PLAYBACK_PAUSE : events_1.MusicEvents.PLAYBACK_RESUME, { guildId });
        return newState;
    }
    async setPaused(guildId, paused) {
        const player = playback_1.playbackService.getPlayer(guildId);
        if (!player)
            throw new Error('NO_PLAYER');
        await player.setPaused(paused);
        events_1.musicEventBus.emitEvent(paused ? events_1.MusicEvents.PLAYBACK_PAUSE : events_1.MusicEvents.PLAYBACK_RESUME, { guildId });
    }
    async stop(guildId) {
        const player = playback_1.playbackService.getPlayer(guildId);
        if (player)
            await player.stopTrack();
        queue_1.queueService.clear(guildId);
        queue_1.queueService.setCurrentTrack(guildId, null);
        queue_1.queueService.endSkipVote(guildId);
        events_1.musicEventBus.emitEvent(events_1.MusicEvents.PLAYBACK_STOP, { guildId });
    }
    // LOOP/SHUFFLE OPERATIONS
    toggleLoop(guildId) {
        const newMode = queue_1.queueService.cycleLoopMode(guildId);
        events_1.musicEventBus.emitEvent(events_1.MusicEvents.LOOP_CHANGE, { guildId, loopMode: newMode });
        return newMode;
    }
    setLoopMode(guildId, mode) {
        queue_1.queueService.setLoopMode(guildId, mode);
        events_1.musicEventBus.emitEvent(events_1.MusicEvents.LOOP_CHANGE, { guildId, loopMode: mode });
    }
    getLoopMode(guildId) {
        return queue_1.queueService.getLoopMode(guildId);
    }
    toggleShuffle(guildId) {
        const result = queue_1.queueService.toggleShuffle(guildId);
        events_1.musicEventBus.emitEvent(events_1.MusicEvents.QUEUE_SHUFFLE, { guildId, isShuffled: result });
        return result;
    }
    isShuffled(guildId) {
        return queue_1.queueService.isShuffled(guildId);
    }
    // VOLUME OPERATIONS
    async setVolume(guildId, volume) {
        const player = playback_1.playbackService.getPlayer(guildId);
        if (!player)
            return 100;
        const clampedVolume = queue_1.queueService.setVolume(guildId, volume);
        await player.setGlobalVolume(clampedVolume);
        events_1.musicEventBus.emitEvent(events_1.MusicEvents.VOLUME_CHANGE, { guildId, volume: clampedVolume });
        return clampedVolume;
    }
    getVolume(guildId) {
        return queue_1.queueService.getVolume(guildId);
    }
    async adjustVolume(guildId, delta) {
        const current = this.getVolume(guildId);
        return this.setVolume(guildId, current + delta);
    }
    // VOICE CONNECTION OPERATIONS
    async connect(interaction) {
        const guildId = interaction.guild.id;
        const member = interaction.member;
        const voiceChannel = member?.voice?.channel;
        if (!voiceChannel)
            throw new Error('NO_VOICE_CHANNEL');
        const result = await voice_1.voiceConnectionService.connect(interaction);
        if (result.isErr())
            throw new Error(result.code);
        // Initialize event handler if not done
        this.initializeEventHandler();
        // Bind events after connection (now uses event bus internally)
        this.bindPlayerEvents(guildId, interaction);
        // Update metrics on connect
        this.updateMetrics();
        return result.data.player;
    }
    disconnect(guildId) {
        voice_1.voiceConnectionService.disconnect(guildId);
    }
    isConnected(guildId) {
        return voice_1.voiceConnectionService.isConnected(guildId);
    }
    getVoiceChannelId(guildId) {
        return voice_1.voiceConnectionService.getVoiceChannelId(guildId);
    }
    // PLAYER EVENTS
    bindPlayerEvents(guildId, interaction) {
        if (voice_1.voiceConnectionService.areEventsBound(guildId))
            return;
        const player = playback_1.playbackService.getPlayer(guildId);
        if (!player)
            return;
        const queue = queue_1.queueService.get(guildId);
        if (queue) {
            queue.eventsBound = true;
            queue.textChannel = interaction.channel;
        }
        const handlers = {
            onStart: (_data) => {
                try {
                    voice_1.voiceConnectionService.clearInactivityTimer(guildId);
                    // Update metrics when track starts
                    this.updateMetrics();
                }
                catch (error) {
                    console.error(`[MusicFacade] Error in start handler:`, error.message);
                }
            },
            onEnd: async (data) => {
                const endData = data;
                if (endData?.reason === 'replaced' || endData?.reason === 'stopped')
                    return;
                const lockAcquired = await playback_1.playbackService.acquireTransitionLock(guildId, 3000);
                if (!lockAcquired)
                    return;
                try {
                    await new Promise(resolve => setTimeout(resolve, music_1.TRACK_TRANSITION_DELAY));
                    const result = await this.playNext(guildId);
                    if (result) {
                        if (result.isLooped) {
                            const loopCount = this.incrementLoopCount(guildId);
                            await this.updateNowPlayingForLoop(guildId, loopCount);
                        }
                        else {
                            await this.disableNowPlayingControls(guildId);
                            await this.sendNowPlayingEmbed(guildId);
                        }
                    }
                }
                catch (error) {
                    console.error(`[MusicFacade] Error in end handler:`, error.message);
                }
                finally {
                    playback_1.playbackService.releaseTransitionLock(guildId);
                }
            },
            onException: async (data) => {
                const excData = data;
                // Check if we're in the process of replacing a track
                // If so, ignore the exception as it's expected
                const queue = MusicCacheFacade_1.default.getQueue(guildId);
                if (queue?.isReplacing) {
                    console.log(`[MusicFacade] Ignoring exception during track replacement in guild ${guildId}`);
                    return;
                }
                console.error(`[MusicFacade] Track exception:`, excData?.message || 'Unknown error');
                const lockAcquired = await playback_1.playbackService.acquireTransitionLock(guildId, 3000);
                if (!lockAcquired)
                    return;
                try {
                    await this.playNext(guildId);
                }
                catch (error) {
                    console.error(`[MusicFacade] Error handling exception:`, error.message);
                }
                finally {
                    playback_1.playbackService.releaseTransitionLock(guildId);
                }
            },
            onStuck: async (_data) => {
                const lockAcquired = await playback_1.playbackService.acquireTransitionLock(guildId, 3000);
                if (!lockAcquired)
                    return;
                try {
                    console.warn(`[MusicFacade] Track stuck in guild ${guildId}, skipping...`);
                    await this.playNext(guildId);
                }
                catch (error) {
                    console.error(`[MusicFacade] Error in stuck handler:`, error.message);
                }
                finally {
                    playback_1.playbackService.releaseTransitionLock(guildId);
                }
            },
            onClosed: async (_data) => {
                try {
                    await this.cleanup(guildId);
                }
                catch (error) {
                    console.error(`[MusicFacade] Error in closed handler:`, error.message);
                }
            }
        };
        voice_1.voiceConnectionService.bindPlayerEvents(guildId, handlers);
    }
    unbindPlayerEvents(guildId) {
        voice_1.voiceConnectionService.unbindPlayerEvents(guildId);
    }
    // TIMERS & MONITORS
    setInactivityTimer(guildId, callback) {
        voice_1.voiceConnectionService.setInactivityTimer(guildId, callback);
    }
    clearInactivityTimer(guildId) {
        voice_1.voiceConnectionService.clearInactivityTimer(guildId);
    }
    startVCMonitor(guildId, guild) {
        voice_1.voiceConnectionService.startVCMonitor(guildId, guild, () => this.cleanup(guildId));
    }
    stopVCMonitor(guildId) {
        voice_1.voiceConnectionService.stopVCMonitor(guildId);
    }
    getListenerCount(guildId, guild) {
        return voice_1.voiceConnectionService.getListenerCount(guildId, guild);
    }
    getListeners(guildId, guild) {
        return voice_1.voiceConnectionService.getListeners(guildId, guild);
    }
    // AUTO-PLAY
    async handleQueueEnd(guildId, providedLastTrack = null) {
        const lastTrack = providedLastTrack || this.getCurrentTrack(guildId);
        const queue = MusicCacheFacade_1.default.getQueue(guildId);
        // Check auto-play
        if (queue?.autoPlay && lastTrack) {
            console.log(`[AutoPlay] Queue ended, searching for similar tracks...`);
            try {
                const similarTrack = await autoplay_1.autoPlayService.findSimilarTrack(guildId, lastTrack);
                if (similarTrack) {
                    console.log(`[AutoPlay] Found similar track: ${similarTrack.info?.title}`);
                    // Store in history
                    const trackInfo = lastTrack.info || lastTrack;
                    if (!queue.lastPlayedTracks)
                        queue.lastPlayedTracks = [];
                    queue.lastPlayedTracks.push(trackInfo.title);
                    if (queue.lastPlayedTracks.length > 10)
                        queue.lastPlayedTracks.shift();
                    // Play
                    MusicCacheFacade_1.default.setCurrentTrack(guildId, similarTrack);
                    await this.playTrack(guildId, similarTrack);
                    // Notify
                    if (queue?.textChannel) {
                        const autoPlayEmbed = trackHandler_1.default.createAutoPlayEmbed?.(similarTrack) ||
                            trackHandler_1.default.createInfoEmbed?.('🎵 Auto-Play', `Now playing: **${similarTrack.info?.title}**`);
                        await queue.textChannel.send({ embeds: [autoPlayEmbed] }).catch(() => { });
                    }
                    await this.sendNowPlayingEmbed(guildId);
                    return;
                }
            }
            catch (error) {
                console.error(`[AutoPlay] Error:`, error.message);
            }
        }
        // Original queue end logic
        MusicCacheFacade_1.default.setCurrentTrack(guildId, null);
        await this.disableNowPlayingControls(guildId);
        if (queue?.textChannel) {
            const finishedEmbed = trackHandler_1.default.createQueueFinishedEmbed?.(lastTrack) ||
                trackHandler_1.default.createInfoEmbed?.('Queue Finished', 'All songs have been played!') ||
                { description: '✅ Queue finished!' };
            await queue.textChannel.send({ embeds: [finishedEmbed] }).catch(() => { });
        }
        this.setInactivityTimer(guildId, () => this.cleanup(guildId));
    }
    findSimilarTrack(guildId, lastTrack) {
        return autoplay_1.autoPlayService.findSimilarTrack(guildId, lastTrack);
    }
    toggleAutoPlay(guildId) {
        const queue = MusicCacheFacade_1.default.getQueue(guildId);
        if (!queue)
            return false;
        queue.autoPlay = !queue.autoPlay;
        if (queue.autoPlay)
            queue.loopMode = 'off';
        events_1.musicEventBus.emitEvent(events_1.MusicEvents.AUTOPLAY_TOGGLE, { guildId, enabled: queue.autoPlay });
        return queue.autoPlay;
    }
    isAutoPlayEnabled(guildId) {
        return queue_1.queueService.isAutoPlayEnabled(guildId);
    }
    // CLEANUP
    async cleanup(guildId) {
        events_1.musicEventBus.emitCleanup(guildId, 'manual');
        await MusicCacheFacade_1.default.clearNowPlayingMessage(guildId);
        this.stopVCMonitor(guildId);
        this.clearInactivityTimer(guildId);
        this.unbindPlayerEvents(guildId);
        events_1.musicEventBus.removeGuildListeners(guildId);
        this.disconnect(guildId);
        MusicCacheFacade_1.default.deleteQueue(guildId);
        events_1.musicEventBus.emitEvent(events_1.MusicEvents.CLEANUP_COMPLETE, { guildId });
    }
    // SKIP VOTE
    startSkipVote(guildId, userId, listenerCount) {
        const result = MusicCacheFacade_1.default.startSkipVote(guildId, userId, listenerCount);
        events_1.musicEventBus.emitEvent(events_1.MusicEvents.SKIPVOTE_START, { guildId, userId, listenerCount });
        return result;
    }
    addSkipVote(guildId, userId) {
        const result = MusicCacheFacade_1.default.addSkipVote(guildId, userId);
        events_1.musicEventBus.emitEvent(events_1.MusicEvents.SKIPVOTE_ADD, { guildId, userId });
        return result;
    }
    endSkipVote(guildId) {
        MusicCacheFacade_1.default.endSkipVote(guildId);
    }
    hasEnoughSkipVotes(guildId) {
        const result = MusicCacheFacade_1.default.hasEnoughSkipVotes(guildId);
        if (typeof result === 'boolean')
            return result;
        return result?.success ?? false;
    }
    isSkipVoteActive(guildId) {
        return MusicCacheFacade_1.default.getQueue(guildId)?.skipVoteActive || false;
    }
    // NOW PLAYING MESSAGE
    setNowPlayingMessage(guildId, message) {
        MusicCacheFacade_1.default.setNowPlayingMessage(guildId, message);
    }
    getNowPlayingMessage(guildId) {
        return MusicCacheFacade_1.default.getNowPlayingMessage(guildId);
    }
    async updateNowPlayingMessage(guildId, payload) {
        const message = this.getNowPlayingMessage(guildId);
        if (!message)
            return null;
        try {
            await message.edit(payload);
            return message;
        }
        catch (error) {
            if (error.code === 10008) {
                MusicCacheFacade_1.default.setNowPlayingMessage(guildId, null);
            }
            return null;
        }
    }
    async disableNowPlayingControls(guildId) {
        const message = this.getNowPlayingMessage(guildId);
        if (!message?.components?.length)
            return;
        try {
            const disabledRows = message.components.map((row) => ({
                type: row.type,
                components: row.components.map((c) => ({
                    ...c.data,
                    disabled: true
                }))
            }));
            await message.edit({ components: disabledRows });
        }
        catch (error) {
            if (error.code === 10008) {
                MusicCacheFacade_1.default.setNowPlayingMessage(guildId, null);
            }
        }
    }
    async sendNowPlayingEmbed(guildId) {
        const queue = MusicCacheFacade_1.default.getQueue(guildId);
        if (!queue?.textChannel)
            return;
        const currentTrack = this.getCurrentTrack(guildId);
        if (!currentTrack)
            return;
        try {
            await this.disableNowPlayingControls(guildId);
            const queueList = this.getQueueList(guildId);
            const listenerCount = this.getListenerCount(guildId, queue.textChannel?.guild);
            const voteSkipStatus = MusicCacheFacade_1.default.getVoteSkipStatus(guildId, listenerCount);
            const embed = trackHandler_1.default.createNowPlayingEmbed(currentTrack, {
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
            const rows = trackHandler_1.default.createControlButtons(guildId, {
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
        }
        catch (error) {
            // Silent fail
        }
    }
    async updateNowPlayingForLoop(guildId, loopCount) {
        const message = this.getNowPlayingMessage(guildId);
        if (!message)
            return;
        const currentTrack = this.getCurrentTrack(guildId);
        if (!currentTrack)
            return;
        const queue = MusicCacheFacade_1.default.getQueue(guildId);
        if (!queue)
            return;
        try {
            const queueList = this.getQueueList(guildId);
            const listenerCount = this.getListenerCount(guildId, queue.textChannel?.guild);
            const voteSkipStatus = MusicCacheFacade_1.default.getVoteSkipStatus(guildId, listenerCount);
            const embed = trackHandler_1.default.createNowPlayingEmbed(currentTrack, {
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
            const rows = trackHandler_1.default.createControlButtons(guildId, {
                isPaused: queue.isPaused || false,
                loopMode: this.getLoopMode(guildId),
                isShuffled: this.isShuffled(guildId),
                autoPlay: this.isAutoPlayEnabled(guildId),
                trackUrl: currentTrack.url,
                userId: currentTrack.requestedBy?.id || '',
                listenerCount: listenerCount
            });
            await message.edit({ embeds: [embed], components: rows });
        }
        catch (error) {
            if (error.code === 10008) {
                MusicCacheFacade_1.default.setNowPlayingMessage(guildId, null);
                await this.sendNowPlayingEmbed(guildId);
            }
        }
    }
    // USER DATA (favorites, history, preferences)
    addFavorite(userId, track) {
        return MusicCacheFacade_1.default.addFavorite(userId, track);
    }
    removeFavorite(userId, trackUrl) {
        return MusicCacheFacade_1.default.removeFavorite(userId, trackUrl);
    }
    getFavorites(userId) {
        return MusicCacheFacade_1.default.getFavorites(userId);
    }
    isFavorited(userId, trackUrl) {
        return MusicCacheFacade_1.default.isFavorited(userId, trackUrl);
    }
    addToHistory(userId, track) {
        MusicCacheFacade_1.default.addToHistory(userId, track);
    }
    getHistory(userId, limit) {
        return MusicCacheFacade_1.default.getHistory(userId, limit);
    }
    clearHistory(userId) {
        MusicCacheFacade_1.default.clearHistory(userId);
    }
    getPreferences(userId) {
        return MusicCacheFacade_1.default.getPreferences(userId);
    }
    setPreferences(userId, prefs) {
        MusicCacheFacade_1.default.setPreferences(userId, prefs);
    }
    getRecentlyPlayed(guildId) {
        return MusicCacheFacade_1.default.getRecentlyPlayed(guildId);
    }
    // LOOP COUNT
    getLoopCount(guildId) {
        return MusicCacheFacade_1.default.getLoopCount(guildId) || 0;
    }
    incrementLoopCount(guildId) {
        return MusicCacheFacade_1.default.incrementLoopCount(guildId);
    }
    resetLoopCount(guildId) {
        MusicCacheFacade_1.default.resetLoopCount(guildId);
    }
    // SEARCH
    search(query) {
        return playback_1.playbackService.search(query);
    }
    searchPlaylist(url) {
        return playback_1.playbackService.searchPlaylist(url);
    }
    // EVENT BUS ACCESS
    /**
     * Subscribe to a music event
     * @param event - Event name from MusicEvents
     * @param handler - Event handler
     * @returns Unsubscribe function
     */
    on(event, handler) {
        return events_1.musicEventBus.subscribe(event, handler);
    }
    /**
     * Subscribe to a guild-specific event
     * @param guildId
     * @param event - Event name from MusicEvents
     * @param handler - Event handler
     * @returns Unsubscribe function
     */
    onGuild(guildId, event, handler) {
        return events_1.musicEventBus.subscribeGuild(guildId, event, handler);
    }
    /**
     * Get event statistics
     */
    getEventStats() {
        return events_1.musicEventBus.getStats();
    }
    // UTILITIES
    getPlayer(guildId) {
        return playback_1.playbackService.getPlayer(guildId);
    }
    isLavalinkReady() {
        return playback_1.playbackService.isLavalinkReady();
    }
    getQueueState(guildId) {
        return queue_1.queueService.getState(guildId);
    }
    getStats() {
        // Aggregate stats from services
        return {
            queue: queue_1.queueService,
            playback: playback_1.playbackService,
            voice: voice_1.voiceConnectionService,
            events: events_1.musicEventBus.getStats()
        };
    }
    shutdownAll() {
        events_1.playbackEventHandler.shutdown();
        events_1.musicEventBus.shutdown();
        voice_1.voiceConnectionService.shutdownAll();
    }
    // Expose transitionMutex for backward compatibility
    get transitionMutex() {
        return playback_1.playbackService.transitionMutex;
    }
}
exports.MusicFacade = MusicFacade;
// Export singleton instance and class
exports.musicFacade = new MusicFacade();
exports.default = exports.musicFacade;
//# sourceMappingURL=MusicFacade.js.map