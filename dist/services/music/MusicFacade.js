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
const index_js_1 = require("./queue/index.js");
const index_js_2 = require("./playback/index.js");
const index_js_3 = require("./voice/index.js");
const index_js_4 = require("./autoplay/index.js");
const index_js_5 = require("./events/index.js");
const MusicCacheFacade_js_1 = __importDefault(require("../../cache/music/MusicCacheFacade.js"));
const trackHandler_js_1 = __importDefault(require("../../handlers/music/trackHandler.js"));
const music_js_1 = require("../../config/features/music.js");
const metrics_js_1 = require("../../core/metrics.js");
// MusicFacade Class
class MusicFacade {
    queueService;
    playbackService;
    voiceService;
    autoPlayService;
    eventBus;
    eventHandlerInitialized;
    constructor() {
        this.queueService = index_js_1.queueService;
        this.playbackService = index_js_2.playbackService;
        this.voiceService = index_js_3.voiceConnectionService;
        this.autoPlayService = index_js_4.autoPlayService;
        this.eventBus = index_js_5.musicEventBus;
        this.eventHandlerInitialized = false;
    }
    /**
     * Update music metrics (active players, queue size, voice connections)
     */
    updateMetrics() {
        try {
            // Get queue stats which includes active queues and total tracks
            const queueStats = MusicCacheFacade_js_1.default.queueCache?.getStats?.() || { activeQueues: 0, totalTracks: 0 };
            (0, metrics_js_1.updateMusicMetrics)({
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
        index_js_5.playbackEventHandler.initialize({
            queueService: index_js_1.queueService,
            playbackService: index_js_2.playbackService,
            voiceService: index_js_3.voiceConnectionService,
            autoPlayService: index_js_4.autoPlayService
        });
        this.eventHandlerInitialized = true;
        console.log('[MusicFacade] Event handler initialized');
    }
    // QUEUE OPERATIONS (delegated to QueueService)
    getQueue(guildId) {
        return index_js_1.queueService.getOrCreate(guildId);
    }
    getQueueList(guildId) {
        return index_js_1.queueService.getTracks(guildId);
    }
    getQueueLength(guildId) {
        return index_js_1.queueService.getLength(guildId);
    }
    getCurrentTrack(guildId) {
        return index_js_1.queueService.getCurrentTrack(guildId);
    }
    addTrack(guildId, track) {
        const result = MusicCacheFacade_js_1.default.addTrack(guildId, track);
        index_js_5.musicEventBus.emitEvent(index_js_5.MusicEvents.QUEUE_ADD, { guildId, track });
        this.updateMetrics();
        return result;
    }
    addTrackToFront(guildId, track) {
        const result = MusicCacheFacade_js_1.default.addTrackToFront(guildId, track);
        index_js_5.musicEventBus.emitEvent(index_js_5.MusicEvents.QUEUE_ADD, { guildId, track, position: 'front' });
        this.updateMetrics();
        return result;
    }
    addTracks(guildId, tracks) {
        const result = MusicCacheFacade_js_1.default.addTracks(guildId, tracks);
        index_js_5.musicEventBus.emitEvent(index_js_5.MusicEvents.QUEUE_ADD_MANY, { guildId, tracks, count: tracks.length });
        this.updateMetrics();
        return result;
    }
    removeTrack(guildId, index) {
        const queue = MusicCacheFacade_js_1.default.getQueue(guildId);
        const track = queue?.tracks?.[index];
        const result = MusicCacheFacade_js_1.default.removeTrack(guildId, index);
        index_js_5.musicEventBus.emitEvent(index_js_5.MusicEvents.QUEUE_REMOVE, { guildId, track, index });
        this.updateMetrics();
        return result;
    }
    clearQueue(guildId) {
        index_js_1.queueService.clear(guildId);
        index_js_5.musicEventBus.emitEvent(index_js_5.MusicEvents.QUEUE_CLEAR, { guildId });
        this.updateMetrics();
    }
    moveTrack(guildId, fromIndex, toIndex) {
        const result = index_js_1.queueService.moveTrack(guildId, fromIndex, toIndex);
        if (result.isOk()) {
            index_js_5.musicEventBus.emitEvent(index_js_5.MusicEvents.QUEUE_MOVE, { guildId, fromIndex, toIndex });
        }
        return result.isOk();
    }
    // PLAYBACK OPERATIONS (delegated to PlaybackService)
    async playTrack(guildId, track) {
        // Cast: QueueCache returns typed queue but runtime adds dynamic fields (isReplacing, textChannel)
        const queue = MusicCacheFacade_js_1.default.getQueue(guildId);
        // Set replacing flag if a track is already playing
        // This prevents the exception handler from skipping when we're just replacing
        if (queue && queue.currentTrack) {
            queue.isReplacing = true;
        }
        index_js_1.queueService.setCurrentTrack(guildId, track);
        const player = index_js_2.playbackService.getPlayer(guildId);
        if (!player)
            throw new Error('NO_PLAYER');
        // Handle both track.track.encoded (nested) and track.encoded (flat) structures
        const encoded = track?.track?.encoded || track?.encoded;
        if (!encoded)
            throw new Error('INVALID_TRACK');
        try {
            await player.playTrack({ track: { encoded } });
            // Track metrics - track played
            // Cast: Track.info may have sourceName from Lavalink but not declared in our TrackInfo interface
            const source = track?.info?.sourceName || 'unknown';
            metrics_js_1.musicTracksPlayedTotal.inc({ source });
            this.updateMetrics();
        }
        finally {
            // Clear replacing flag after a short delay
            if (queue) {
                setTimeout(() => { queue.isReplacing = false; }, 1000);
            }
        }
        index_js_3.voiceConnectionService.clearInactivityTimer(guildId);
        return track;
    }
    async playNext(guildId) {
        const loopMode = index_js_1.queueService.getLoopMode(guildId);
        const currentTrack = index_js_1.queueService.getCurrentTrack(guildId);
        // Handle track loop mode
        if (loopMode === 'track' && currentTrack) {
            await this.playTrack(guildId, currentTrack);
            return { track: currentTrack, isLooped: true };
        }
        // Reset loop count
        MusicCacheFacade_js_1.default.resetLoopCount(guildId);
        // Get next track
        const nextTrack = MusicCacheFacade_js_1.default.getNextTrack(guildId);
        // Queue loop - add current back
        if (loopMode === 'queue' && currentTrack) {
            MusicCacheFacade_js_1.default.addTrack(guildId, currentTrack);
        }
        if (!nextTrack) {
            await this.handleQueueEnd(guildId);
            return null;
        }
        await this.playTrack(guildId, nextTrack);
        return { track: nextTrack, isLooped: false };
    }
    async skip(guildId, count = 1) {
        const player = index_js_2.playbackService.getPlayer(guildId);
        if (!player)
            throw new Error('NO_PLAYER');
        const currentTrack = index_js_1.queueService.getCurrentTrack(guildId);
        index_js_1.queueService.endSkipVote(guildId);
        // Skip multiple tracks by consuming them from the queue
        if (count > 1) {
            for (let i = 0; i < count - 1; i++) {
                MusicCacheFacade_js_1.default.getNextTrack(guildId);
            }
        }
        // Play the next track directly instead of just stopping
        // stopTrack() emits 'stopped' reason which the onEnd handler ignores,
        // so we need to advance the queue ourselves
        const result = await this.playNext(guildId);
        // If no next track (queue ended), playNext already handled cleanup
        // If playNext returned a result, the next track is now playing
        index_js_5.musicEventBus.emitEvent(index_js_5.MusicEvents.TRACK_SKIP, { guildId, count, previousTrack: currentTrack });
        return { skipped: count, previousTrack: currentTrack };
    }
    async togglePause(guildId) {
        const player = index_js_2.playbackService.getPlayer(guildId);
        if (!player)
            throw new Error('NO_PLAYER');
        const newState = !player.paused;
        await player.setPaused(newState);
        index_js_5.musicEventBus.emitEvent(newState ? index_js_5.MusicEvents.PLAYBACK_PAUSE : index_js_5.MusicEvents.PLAYBACK_RESUME, { guildId });
        return newState;
    }
    async setPaused(guildId, paused) {
        const player = index_js_2.playbackService.getPlayer(guildId);
        if (!player)
            throw new Error('NO_PLAYER');
        await player.setPaused(paused);
        index_js_5.musicEventBus.emitEvent(paused ? index_js_5.MusicEvents.PLAYBACK_PAUSE : index_js_5.MusicEvents.PLAYBACK_RESUME, { guildId });
    }
    async stop(guildId) {
        const player = index_js_2.playbackService.getPlayer(guildId);
        if (player)
            await player.stopTrack();
        index_js_1.queueService.clear(guildId);
        index_js_1.queueService.setCurrentTrack(guildId, null);
        index_js_1.queueService.endSkipVote(guildId);
        index_js_5.musicEventBus.emitEvent(index_js_5.MusicEvents.PLAYBACK_STOP, { guildId });
    }
    // LOOP/SHUFFLE OPERATIONS
    toggleLoop(guildId) {
        const newMode = index_js_1.queueService.cycleLoopMode(guildId);
        index_js_5.musicEventBus.emitEvent(index_js_5.MusicEvents.LOOP_CHANGE, { guildId, loopMode: newMode });
        return newMode;
    }
    setLoopMode(guildId, mode) {
        index_js_1.queueService.setLoopMode(guildId, mode);
        index_js_5.musicEventBus.emitEvent(index_js_5.MusicEvents.LOOP_CHANGE, { guildId, loopMode: mode });
    }
    getLoopMode(guildId) {
        return index_js_1.queueService.getLoopMode(guildId);
    }
    toggleShuffle(guildId) {
        const result = index_js_1.queueService.toggleShuffle(guildId);
        index_js_5.musicEventBus.emitEvent(index_js_5.MusicEvents.QUEUE_SHUFFLE, { guildId, isShuffled: result });
        return result;
    }
    isShuffled(guildId) {
        return index_js_1.queueService.isShuffled(guildId);
    }
    // VOLUME OPERATIONS
    async setVolume(guildId, volume) {
        const player = index_js_2.playbackService.getPlayer(guildId);
        if (!player)
            return 100;
        const clampedVolume = index_js_1.queueService.setVolume(guildId, volume);
        await player.setGlobalVolume(clampedVolume);
        index_js_5.musicEventBus.emitEvent(index_js_5.MusicEvents.VOLUME_CHANGE, { guildId, volume: clampedVolume });
        return clampedVolume;
    }
    getVolume(guildId) {
        return index_js_1.queueService.getVolume(guildId);
    }
    async adjustVolume(guildId, delta) {
        const current = this.getVolume(guildId);
        return this.setVolume(guildId, current + delta);
    }
    // VOICE CONNECTION OPERATIONS
    async connect(interaction) {
        const guildId = interaction.guild.id;
        // Cast: interaction.member is GuildMember | APIInteractionGuildMember — need .voice.channel
        const member = interaction.member;
        const voiceChannel = member?.voice?.channel;
        if (!voiceChannel)
            throw new Error('NO_VOICE_CHANNEL');
        const result = await index_js_3.voiceConnectionService.connect(interaction);
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
        index_js_3.voiceConnectionService.disconnect(guildId);
    }
    isConnected(guildId) {
        return index_js_3.voiceConnectionService.isConnected(guildId);
    }
    getVoiceChannelId(guildId) {
        return index_js_3.voiceConnectionService.getVoiceChannelId(guildId);
    }
    // PLAYER EVENTS
    bindPlayerEvents(guildId, interaction) {
        if (index_js_3.voiceConnectionService.areEventsBound(guildId))
            return;
        const player = index_js_2.playbackService.getPlayer(guildId);
        if (!player)
            return;
        // Cast: QueueService.get() returns typed queue but we need dynamic textChannel field
        const queue = index_js_1.queueService.get(guildId);
        if (queue) {
            queue.eventsBound = true;
            queue.textChannel = interaction.channel;
        }
        const handlers = {
            onStart: (_data) => {
                try {
                    index_js_3.voiceConnectionService.clearInactivityTimer(guildId);
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
                const lockAcquired = await index_js_2.playbackService.acquireTransitionLock(guildId, 3000);
                if (!lockAcquired)
                    return;
                try {
                    await new Promise(resolve => setTimeout(resolve, music_js_1.TRACK_TRANSITION_DELAY));
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
                    index_js_2.playbackService.releaseTransitionLock(guildId);
                }
            },
            onException: async (data) => {
                const excData = data;
                // Check if we're in the process of replacing a track
                // If so, ignore the exception as it's expected
                const queue = MusicCacheFacade_js_1.default.getQueue(guildId);
                if (queue?.isReplacing) {
                    console.log(`[MusicFacade] Ignoring exception during track replacement in guild ${guildId}`);
                    return;
                }
                console.error(`[MusicFacade] Track exception:`, excData?.message || 'Unknown error');
                const lockAcquired = await index_js_2.playbackService.acquireTransitionLock(guildId, 3000);
                if (!lockAcquired)
                    return;
                try {
                    await this.playNext(guildId);
                }
                catch (error) {
                    console.error(`[MusicFacade] Error handling exception:`, error.message);
                }
                finally {
                    index_js_2.playbackService.releaseTransitionLock(guildId);
                }
            },
            onStuck: async (_data) => {
                const lockAcquired = await index_js_2.playbackService.acquireTransitionLock(guildId, 3000);
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
                    index_js_2.playbackService.releaseTransitionLock(guildId);
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
        index_js_3.voiceConnectionService.bindPlayerEvents(guildId, handlers);
    }
    unbindPlayerEvents(guildId) {
        index_js_3.voiceConnectionService.unbindPlayerEvents(guildId);
    }
    // TIMERS & MONITORS
    setInactivityTimer(guildId, callback) {
        index_js_3.voiceConnectionService.setInactivityTimer(guildId, callback);
    }
    clearInactivityTimer(guildId) {
        index_js_3.voiceConnectionService.clearInactivityTimer(guildId);
    }
    startVCMonitor(guildId, guild) {
        index_js_3.voiceConnectionService.startVCMonitor(guildId, guild, () => this.cleanup(guildId));
    }
    stopVCMonitor(guildId) {
        index_js_3.voiceConnectionService.stopVCMonitor(guildId);
    }
    getListenerCount(guildId, guild) {
        return index_js_3.voiceConnectionService.getListenerCount(guildId, guild);
    }
    getListeners(guildId, guild) {
        return index_js_3.voiceConnectionService.getListeners(guildId, guild);
    }
    // AUTO-PLAY
    async handleQueueEnd(guildId, providedLastTrack = null) {
        const lastTrack = providedLastTrack || this.getCurrentTrack(guildId);
        // Cast: queue has runtime-added autoPlay, textChannel, lastPlayedTracks fields
        const queue = MusicCacheFacade_js_1.default.getQueue(guildId);
        // Check auto-play
        if (queue?.autoPlay && lastTrack) {
            console.log(`[AutoPlay] Queue ended, searching for similar tracks...`);
            try {
                const similarTrack = await index_js_4.autoPlayService.findSimilarTrack(guildId, lastTrack);
                if (similarTrack) {
                    console.log(`[AutoPlay] Found similar track: ${similarTrack.info?.title}`);
                    // Store in history
                    const trackInfo = lastTrack.info || lastTrack;
                    if (!queue.lastPlayedTracks)
                        queue.lastPlayedTracks = [];
                    // Cast: trackInfo is Track.info|Track — title access needs unification
                    queue.lastPlayedTracks.push(trackInfo.title);
                    if (queue.lastPlayedTracks.length > 10)
                        queue.lastPlayedTracks.shift();
                    // Play
                    MusicCacheFacade_js_1.default.setCurrentTrack(guildId, similarTrack);
                    await this.playTrack(guildId, similarTrack);
                    // Notify
                    if (queue?.textChannel) {
                        // Cast: trackHandler methods (createAutoPlayEmbed, createInfoEmbed) not in its TS interface
                        const autoPlayEmbed = trackHandler_js_1.default.createAutoPlayEmbed?.(similarTrack) ||
                            trackHandler_js_1.default.createInfoEmbed?.('🎵 Auto-Play', `Now playing: **${similarTrack.info?.title}**`);
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
        MusicCacheFacade_js_1.default.setCurrentTrack(guildId, null);
        await this.disableNowPlayingControls(guildId);
        if (queue?.textChannel) {
            // Cast: trackHandler methods not in TS interface (createQueueFinishedEmbed, createInfoEmbed)
            const finishedEmbed = trackHandler_js_1.default.createQueueFinishedEmbed?.(lastTrack) ||
                trackHandler_js_1.default.createInfoEmbed?.('Queue Finished', 'All songs have been played!') ||
                { description: '✅ Queue finished!' };
            await queue.textChannel.send({ embeds: [finishedEmbed] }).catch(() => { });
        }
        this.setInactivityTimer(guildId, () => this.cleanup(guildId));
    }
    findSimilarTrack(guildId, lastTrack) {
        return index_js_4.autoPlayService.findSimilarTrack(guildId, lastTrack);
    }
    toggleAutoPlay(guildId) {
        // Cast: queue has runtime autoPlay/loopMode fields not in typed interface
        const queue = MusicCacheFacade_js_1.default.getQueue(guildId);
        if (!queue)
            return false;
        queue.autoPlay = !queue.autoPlay;
        if (queue.autoPlay)
            queue.loopMode = 'off';
        index_js_5.musicEventBus.emitEvent(index_js_5.MusicEvents.AUTOPLAY_TOGGLE, { guildId, enabled: queue.autoPlay });
        return queue.autoPlay;
    }
    isAutoPlayEnabled(guildId) {
        return index_js_1.queueService.isAutoPlayEnabled(guildId);
    }
    // CLEANUP
    async cleanup(guildId) {
        index_js_5.musicEventBus.emitCleanup(guildId, 'manual');
        await MusicCacheFacade_js_1.default.clearNowPlayingMessage(guildId);
        this.stopVCMonitor(guildId);
        this.clearInactivityTimer(guildId);
        this.unbindPlayerEvents(guildId);
        index_js_5.musicEventBus.removeGuildListeners(guildId);
        this.disconnect(guildId);
        MusicCacheFacade_js_1.default.deleteQueue(guildId);
        index_js_5.musicEventBus.emitEvent(index_js_5.MusicEvents.CLEANUP_COMPLETE, { guildId });
    }
    // SKIP VOTE
    startSkipVote(guildId, userId, listenerCount) {
        const result = MusicCacheFacade_js_1.default.startSkipVote(guildId, userId, listenerCount);
        index_js_5.musicEventBus.emitEvent(index_js_5.MusicEvents.SKIPVOTE_START, { guildId, userId, listenerCount });
        return result;
    }
    addSkipVote(guildId, userId) {
        const result = MusicCacheFacade_js_1.default.addSkipVote(guildId, userId);
        index_js_5.musicEventBus.emitEvent(index_js_5.MusicEvents.SKIPVOTE_ADD, { guildId, userId });
        return result;
    }
    endSkipVote(guildId) {
        MusicCacheFacade_js_1.default.endSkipVote(guildId);
    }
    hasEnoughSkipVotes(guildId) {
        // Cast: hasEnoughSkipVotes returns boolean | { success } depending on implementation
        const result = MusicCacheFacade_js_1.default.hasEnoughSkipVotes(guildId);
        if (typeof result === 'boolean')
            return result;
        return result?.success ?? false;
    }
    isSkipVoteActive(guildId) {
        return MusicCacheFacade_js_1.default.getQueue(guildId)?.skipVoteActive || false;
    }
    // NOW PLAYING MESSAGE
    setNowPlayingMessage(guildId, message) {
        MusicCacheFacade_js_1.default.setNowPlayingMessage(guildId, message);
    }
    getNowPlayingMessage(guildId) {
        return MusicCacheFacade_js_1.default.getNowPlayingMessage(guildId);
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
                MusicCacheFacade_js_1.default.setNowPlayingMessage(guildId, null);
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
            // Cast: manually-constructed component objects don't match MessageActionRowComponentData
            await message.edit({ components: disabledRows });
        }
        catch (error) {
            if (error.code === 10008) {
                MusicCacheFacade_js_1.default.setNowPlayingMessage(guildId, null);
            }
        }
    }
    async sendNowPlayingEmbed(guildId) {
        // Cast: queue has runtime textChannel, isPaused fields not in typed interface
        const queue = MusicCacheFacade_js_1.default.getQueue(guildId);
        if (!queue?.textChannel)
            return;
        const currentTrack = this.getCurrentTrack(guildId);
        if (!currentTrack)
            return;
        try {
            await this.disableNowPlayingControls(guildId);
            const queueList = this.getQueueList(guildId);
            const listenerCount = this.getListenerCount(guildId, queue.textChannel?.guild);
            const voteSkipStatus = MusicCacheFacade_js_1.default.getVoteSkipStatus(guildId, listenerCount);
            // Cast: trackHandler methods (createNowPlayingEmbed, createControlButtons) not in TS interface
            const embed = trackHandler_js_1.default.createNowPlayingEmbed(currentTrack, {
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
            const rows = trackHandler_js_1.default.createControlButtons(guildId, {
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
        // Cast: queue has runtime textChannel, isPaused fields not in typed interface
        const queue = MusicCacheFacade_js_1.default.getQueue(guildId);
        if (!queue)
            return;
        try {
            const queueList = this.getQueueList(guildId);
            const listenerCount = this.getListenerCount(guildId, queue.textChannel?.guild);
            const voteSkipStatus = MusicCacheFacade_js_1.default.getVoteSkipStatus(guildId, listenerCount);
            // Cast: trackHandler methods (createNowPlayingEmbed, createControlButtons) not in TS interface
            const embed = trackHandler_js_1.default.createNowPlayingEmbed(currentTrack, {
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
            const rows = trackHandler_js_1.default.createControlButtons(guildId, {
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
                MusicCacheFacade_js_1.default.setNowPlayingMessage(guildId, null);
                await this.sendNowPlayingEmbed(guildId);
            }
        }
    }
    // USER DATA (favorites, history, preferences)
    async addFavorite(userId, track) {
        return MusicCacheFacade_js_1.default.addFavorite(userId, track);
    }
    async removeFavorite(userId, trackUrl) {
        return MusicCacheFacade_js_1.default.removeFavorite(userId, trackUrl);
    }
    async getFavorites(userId) {
        return MusicCacheFacade_js_1.default.getFavorites(userId);
    }
    async isFavorited(userId, trackUrl) {
        return MusicCacheFacade_js_1.default.isFavorited(userId, trackUrl);
    }
    async addToHistory(userId, track) {
        await MusicCacheFacade_js_1.default.addToHistory(userId, track);
    }
    async getHistory(userId, limit) {
        return MusicCacheFacade_js_1.default.getHistory(userId, limit);
    }
    async clearHistory(userId) {
        await MusicCacheFacade_js_1.default.clearHistory(userId);
    }
    async getPreferences(userId) {
        return MusicCacheFacade_js_1.default.getPreferences(userId);
    }
    async setPreferences(userId, prefs) {
        await MusicCacheFacade_js_1.default.setPreferences(userId, prefs);
    }
    getRecentlyPlayed(guildId) {
        return MusicCacheFacade_js_1.default.getRecentlyPlayed(guildId);
    }
    // LOOP COUNT
    getLoopCount(guildId) {
        return MusicCacheFacade_js_1.default.getLoopCount(guildId) || 0;
    }
    incrementLoopCount(guildId) {
        return MusicCacheFacade_js_1.default.incrementLoopCount(guildId);
    }
    resetLoopCount(guildId) {
        MusicCacheFacade_js_1.default.resetLoopCount(guildId);
    }
    // SEARCH
    search(query) {
        return index_js_2.playbackService.search(query);
    }
    async searchPlaylist(url) {
        const result = await index_js_2.playbackService.searchPlaylist(url);
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
    on(event, handler) {
        return index_js_5.musicEventBus.subscribe(event, handler);
    }
    /**
     * Subscribe to a guild-specific event
     * @param guildId
     * @param event - Event name from MusicEvents
     * @param handler - Event handler
     * @returns Unsubscribe function
     */
    onGuild(guildId, event, handler) {
        return index_js_5.musicEventBus.subscribeGuild(guildId, event, handler);
    }
    /**
     * Get event statistics
     */
    getEventStats() {
        return index_js_5.musicEventBus.getStats();
    }
    // UTILITIES
    getPlayer(guildId) {
        return index_js_2.playbackService.getPlayer(guildId);
    }
    isLavalinkReady() {
        return index_js_2.playbackService.isLavalinkReady();
    }
    getQueueState(guildId) {
        return index_js_1.queueService.getState(guildId);
    }
    getStats() {
        // Aggregate stats from services
        return {
            queue: index_js_1.queueService,
            playback: index_js_2.playbackService,
            voice: index_js_3.voiceConnectionService,
            events: index_js_5.musicEventBus.getStats()
        };
    }
    shutdownAll() {
        index_js_5.playbackEventHandler.shutdown();
        index_js_5.musicEventBus.shutdown();
        index_js_3.voiceConnectionService.shutdownAll();
    }
    // Expose transitionMutex for backward compatibility
    // Cast: transitionMutex is a private field on PlaybackService — exposed for legacy compat
    get transitionMutex() {
        return index_js_2.playbackService.transitionMutex;
    }
}
exports.MusicFacade = MusicFacade;
// Export singleton instance and class
exports.musicFacade = new MusicFacade();
exports.default = exports.musicFacade;
//# sourceMappingURL=MusicFacade.js.map