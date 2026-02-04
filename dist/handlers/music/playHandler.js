"use strict";
/**
 * Play Handler
 * Handles play, playlist, and related functionality
 * @module handlers/music/playHandler
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.playHandler = exports.pendingLongTracks = void 0;
const trackHandler_js_1 = require("./trackHandler.js");
const MusicCacheFacade_js_1 = __importDefault(require("../../cache/music/MusicCacheFacade.js"));
const voiceChannelCheck_js_1 = require("../../middleware/voiceChannelCheck.js");
const index_js_1 = require("../../config/index.js");
const MusicFacade_js_1 = require("../../services/music/MusicFacade.js");
// Import voting constants from config
const { minVotesRequired: MIN_VOTES_REQUIRED = 5 } = index_js_1.music.voting || {};
const CONFIRMATION_TIMEOUT = index_js_1.music.timeouts?.confirmation || 60000;
// Store pending long track confirmations
exports.pendingLongTracks = new Map();
exports.playHandler = {
    // Expose pendingLongTracks for buttonHandler
    pendingLongTracks: exports.pendingLongTracks,
    async handlePlay(interaction, guildId, userId) {
        // IMMEDIATELY defer to prevent interaction timeout (3s limit)
        await interaction.deferReply();
        // Voice channel checks
        const voiceCheck = (0, voiceChannelCheck_js_1.checkVoiceChannelSync)(interaction);
        if (!voiceCheck.valid) {
            await interaction.editReply({
                embeds: [trackHandler_js_1.trackHandler.createInfoEmbed("❌ No Voice Channel", voiceCheck.error)],
            });
            return;
        }
        const permCheck = (0, voiceChannelCheck_js_1.checkVoicePermissionsSync)(interaction);
        if (!permCheck.valid) {
            await interaction.editReply({
                embeds: [trackHandler_js_1.trackHandler.createInfoEmbed("❌ Missing Permissions", permCheck.error)],
            });
            return;
        }
        // Check Lavalink
        if (!MusicFacade_js_1.musicFacade.isLavalinkReady()) {
            let ready = false;
            for (let i = 0; i < 6; i++) {
                await new Promise(r => setTimeout(r, 500));
                if (MusicFacade_js_1.musicFacade.isLavalinkReady()) {
                    ready = true;
                    break;
                }
            }
            if (!ready) {
                await interaction.editReply({
                    embeds: [trackHandler_js_1.trackHandler.createErrorEmbed('Music service is not available. Please try again later.')]
                });
                return;
            }
        }
        const query = interaction.options.getString('query');
        const shouldShuffle = interaction.options.getBoolean('shuffle') || false;
        const priority = interaction.options.getBoolean('priority') || false;
        try {
            // Connect to voice
            await MusicFacade_js_1.musicFacade.connect(interaction);
            // Check if playlist
            if (this.isPlaylistUrl(query)) {
                return await this.handlePlaylistAdd(interaction, query, guildId, shouldShuffle);
            }
            // Single track - search returns Result<{ tracks: Track[] }>
            const searchResult = await MusicFacade_js_1.musicFacade.search(query);
            // Handle Result wrapper - Result uses .data not .value
            let trackData = null;
            if (searchResult && typeof searchResult === 'object') {
                // If it's a Result object with isOk() method
                if (typeof searchResult.isOk === 'function') {
                    if (searchResult.isOk() && searchResult.data?.tracks?.[0]) {
                        trackData = searchResult.data.tracks[0];
                    }
                }
                else if (searchResult.tracks?.[0]) {
                    // Direct result with tracks array
                    trackData = searchResult.tracks[0];
                }
                else if (searchResult.track || searchResult.encoded) {
                    // Direct track object from LavalinkService
                    trackData = searchResult;
                }
            }
            if (!trackData) {
                await interaction.editReply({
                    embeds: [trackHandler_js_1.trackHandler.createErrorEmbed(`No results found for: \`${query}\``)]
                });
                return;
            }
            // Check duration
            const prefs = MusicFacade_js_1.musicFacade.getPreferences(userId);
            if (trackData.lengthSeconds > prefs.maxTrackDuration) {
                return await this.handleLongTrackConfirmation(interaction, trackData, guildId, prefs.maxTrackDuration);
            }
            // Add track
            const currentTrack = MusicFacade_js_1.musicFacade.getCurrentTrack(guildId);
            if (priority && currentTrack) {
                // Priority requires vote if 5+ listeners
                const listenerCount = MusicFacade_js_1.musicFacade.getListenerCount(guildId, interaction.guild);
                if (listenerCount >= MIN_VOTES_REQUIRED) {
                    return await this.handlePriorityVote(interaction, trackData, guildId);
                }
                MusicFacade_js_1.musicFacade.addTrackToFront(guildId, trackData);
            }
            else {
                MusicFacade_js_1.musicFacade.addTrack(guildId, trackData);
            }
            // Add to user history
            MusicFacade_js_1.musicFacade.addToHistory(userId, trackData);
            // Start playing if nothing is playing
            if (!currentTrack) {
                const queue = MusicFacade_js_1.musicFacade.getQueueList(guildId);
                const nextTrack = queue[0];
                if (nextTrack) {
                    MusicFacade_js_1.musicFacade.removeTrack(guildId, 0);
                    await MusicFacade_js_1.musicFacade.playTrack(guildId, nextTrack);
                    const listenerCount = MusicFacade_js_1.musicFacade.getListenerCount(guildId, interaction.guild);
                    const voteSkipStatus = MusicCacheFacade_js_1.default.getVoteSkipStatus(guildId, listenerCount);
                    const embed = trackHandler_js_1.trackHandler.createNowPlayingEmbed(nextTrack, {
                        volume: MusicFacade_js_1.musicFacade.getVolume(guildId),
                        queueLength: MusicFacade_js_1.musicFacade.getQueueLength(guildId),
                        voteSkipCount: voteSkipStatus.count,
                        voteSkipRequired: voteSkipStatus.required,
                        listenerCount: listenerCount
                    });
                    const rows = trackHandler_js_1.trackHandler.createControlButtons(guildId, {
                        trackUrl: nextTrack.url,
                        userId,
                        autoPlay: MusicFacade_js_1.musicFacade.isAutoPlayEnabled(guildId),
                        listenerCount: listenerCount
                    });
                    const message = await interaction.editReply({ embeds: [embed], components: rows });
                    MusicFacade_js_1.musicFacade.setNowPlayingMessage(guildId, message);
                    MusicFacade_js_1.musicFacade.startVCMonitor(guildId, interaction.guild);
                }
            }
            else {
                const position = MusicFacade_js_1.musicFacade.getQueueLength(guildId);
                const embed = priority && position === 1
                    ? trackHandler_js_1.trackHandler.createPriorityQueuedEmbed(trackData, interaction.user)
                    : trackHandler_js_1.trackHandler.createQueuedEmbed(trackData, position, interaction.user);
                await interaction.editReply({ embeds: [embed] });
                await this.refreshNowPlayingMessage(guildId, interaction.user.id, interaction.guild);
            }
        }
        catch (error) {
            console.error('[Play Error]', error);
            const errorMessage = error instanceof Error ? error.message : 'Failed to play track';
            await interaction.editReply({
                embeds: [trackHandler_js_1.trackHandler.createErrorEmbed(errorMessage)]
            });
        }
    },
    async handlePlaylistAdd(interaction, query, guildId, shouldShuffle) {
        try {
            const playlistData = await MusicFacade_js_1.musicFacade.searchPlaylist(query);
            if (!playlistData || playlistData.tracks.length === 0) {
                await interaction.editReply({
                    embeds: [trackHandler_js_1.trackHandler.createErrorEmbed('No tracks found in playlist')]
                });
                return;
            }
            let tracks = playlistData.tracks;
            if (shouldShuffle) {
                for (let i = tracks.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
                }
            }
            MusicFacade_js_1.musicFacade.addTracks(guildId, tracks);
            const currentTrack = MusicFacade_js_1.musicFacade.getCurrentTrack(guildId);
            if (!currentTrack) {
                const queue = MusicFacade_js_1.musicFacade.getQueueList(guildId);
                const nextTrack = queue[0];
                if (nextTrack) {
                    MusicFacade_js_1.musicFacade.removeTrack(guildId, 0);
                    await MusicFacade_js_1.musicFacade.playTrack(guildId, nextTrack);
                    const embed = trackHandler_js_1.trackHandler.createPlaylistEmbed(playlistData.name, playlistData.tracks.length, interaction.user, nextTrack);
                    const message = await interaction.editReply({ embeds: [embed] });
                    MusicFacade_js_1.musicFacade.setNowPlayingMessage(guildId, message);
                    MusicFacade_js_1.musicFacade.startVCMonitor(guildId, interaction.guild);
                }
            }
            else {
                const embed = trackHandler_js_1.trackHandler.createPlaylistEmbed(playlistData.name, playlistData.tracks.length, interaction.user, tracks[0]);
                await interaction.editReply({ embeds: [embed] });
                await this.refreshNowPlayingMessage(guildId, interaction.user.id, interaction.guild);
            }
        }
        catch (error) {
            console.error('[Playlist Error]', error);
            const errorMessage = error instanceof Error ? error.message : 'Failed to load playlist';
            await interaction.editReply({
                embeds: [trackHandler_js_1.trackHandler.createErrorEmbed(errorMessage)]
            });
        }
    },
    async handleLongTrackConfirmation(interaction, trackData, guildId, maxDuration) {
        const confirmId = `${guildId}_${Date.now()}`;
        exports.pendingLongTracks.set(confirmId, {
            trackData,
            guildId,
            userId: interaction.user.id,
            channelId: interaction.channel?.id || '',
            guild: interaction.guild,
            expiresAt: Date.now() + CONFIRMATION_TIMEOUT
        });
        setTimeout(() => {
            exports.pendingLongTracks.delete(confirmId);
        }, CONFIRMATION_TIMEOUT + 1000);
        const embed = trackHandler_js_1.trackHandler.createLongVideoConfirmEmbed(trackData, maxDuration);
        const row = trackHandler_js_1.trackHandler.createConfirmButtons(confirmId, 'longtrack');
        await interaction.editReply({ embeds: [embed], components: [row] });
    },
    async handleLongTrackButton(interaction, confirmId, answer) {
        const pending = exports.pendingLongTracks.get(confirmId);
        if (!pending) {
            await interaction.reply({
                content: '⏱️ This confirmation has expired. Please use `/music play` again.',
                ephemeral: true
            });
            return;
        }
        if (pending.userId !== interaction.user.id) {
            await interaction.reply({
                content: '❌ Only the person who requested this track can confirm.',
                ephemeral: true
            });
            return;
        }
        exports.pendingLongTracks.delete(confirmId);
        const { trackData, guildId, guild } = pending;
        try {
            if (answer === 'yes') {
                await interaction.deferUpdate();
                MusicFacade_js_1.musicFacade.addTrack(guildId, trackData);
                const currentTrack = MusicFacade_js_1.musicFacade.getCurrentTrack(guildId);
                if (!currentTrack) {
                    const queue = MusicFacade_js_1.musicFacade.getQueueList(guildId);
                    const nextTrack = queue[0];
                    if (nextTrack) {
                        MusicFacade_js_1.musicFacade.removeTrack(guildId, 0);
                        await interaction.editReply({
                            content: '✅ **Track added!** Starting playback...',
                            embeds: [],
                            components: []
                        });
                        await MusicFacade_js_1.musicFacade.playTrack(guildId, nextTrack);
                        const queueList = MusicFacade_js_1.musicFacade.getQueueList(guildId);
                        const listenerCount = MusicFacade_js_1.musicFacade.getListenerCount(guildId, guild);
                        const voteSkipStatus = MusicCacheFacade_js_1.default.getVoteSkipStatus(guildId, listenerCount);
                        const embed = trackHandler_js_1.trackHandler.createNowPlayingEmbed(nextTrack, {
                            volume: MusicFacade_js_1.musicFacade.getVolume(guildId),
                            queueLength: queueList.length,
                            nextTrack: queueList[0] || null,
                            voteSkipCount: voteSkipStatus.count,
                            voteSkipRequired: voteSkipStatus.required,
                            listenerCount: listenerCount
                        });
                        const rows = trackHandler_js_1.trackHandler.createControlButtons(guildId, {
                            trackUrl: nextTrack.url,
                            userId: interaction.user.id,
                            autoPlay: MusicFacade_js_1.musicFacade.isAutoPlayEnabled(guildId),
                            listenerCount: listenerCount
                        });
                        const channel = interaction.channel;
                        const nowPlayingMessage = await channel.send({ embeds: [embed], components: rows });
                        MusicFacade_js_1.musicFacade.setNowPlayingMessage(guildId, nowPlayingMessage);
                        MusicFacade_js_1.musicFacade.startVCMonitor(guildId, guild);
                    }
                }
                else {
                    const position = MusicFacade_js_1.musicFacade.getQueueLength(guildId);
                    const queuedEmbed = trackHandler_js_1.trackHandler.createQueuedEmbed(trackData, position, interaction.user);
                    await interaction.editReply({ embeds: [queuedEmbed], components: [] });
                }
            }
            else {
                await interaction.update({
                    embeds: [trackHandler_js_1.trackHandler.createInfoEmbed('❌ Cancelled', 'Track was not added.')],
                    components: []
                });
            }
        }
        catch (error) {
            console.error('[Play] Error handling long track button:', error);
            await interaction.editReply({
                content: '❌ An error occurred. Please try again.',
                embeds: [],
                components: []
            }).catch(() => { });
        }
    },
    async handlePriorityVote(interaction, trackData, guildId) {
        const embed = trackHandler_js_1.trackHandler.createInfoEmbed('🗳️ Vote Required', `Priority play requires ${MIN_VOTES_REQUIRED} votes.\nThis feature is coming soon!`);
        await interaction.editReply({ embeds: [embed] });
    },
    async refreshNowPlayingMessage(guildId, userId, guild = null) {
        try {
            const nowPlayingMsg = MusicFacade_js_1.musicFacade.getNowPlayingMessage(guildId);
            if (!nowPlayingMsg)
                return;
            const currentTrack = MusicFacade_js_1.musicFacade.getCurrentTrack(guildId);
            if (!currentTrack)
                return;
            const queue = MusicCacheFacade_js_1.default.getQueue(guildId);
            const queueList = MusicFacade_js_1.musicFacade.getQueueList(guildId);
            const listenerCount = guild ? MusicFacade_js_1.musicFacade.getListenerCount(guildId, guild) : 0;
            const voteSkipStatus = MusicCacheFacade_js_1.default.getVoteSkipStatus(guildId, listenerCount);
            const embed = trackHandler_js_1.trackHandler.createNowPlayingEmbed(currentTrack, {
                volume: MusicFacade_js_1.musicFacade.getVolume(guildId),
                isPaused: queue?.isPaused || false,
                loopMode: MusicFacade_js_1.musicFacade.getLoopMode(guildId),
                isShuffled: MusicFacade_js_1.musicFacade.isShuffled(guildId),
                queueLength: queueList.length,
                nextTrack: queueList[0] || null,
                loopCount: MusicFacade_js_1.musicFacade.getLoopCount(guildId),
                voteSkipCount: voteSkipStatus.count,
                voteSkipRequired: voteSkipStatus.required,
                listenerCount: listenerCount
            });
            const rows = trackHandler_js_1.trackHandler.createControlButtons(guildId, {
                isPaused: queue?.isPaused || false,
                loopMode: MusicFacade_js_1.musicFacade.getLoopMode(guildId),
                isShuffled: MusicFacade_js_1.musicFacade.isShuffled(guildId),
                autoPlay: MusicFacade_js_1.musicFacade.isAutoPlayEnabled(guildId),
                trackUrl: currentTrack.url,
                userId: userId,
                listenerCount: listenerCount
            });
            await nowPlayingMsg.edit({ embeds: [embed], components: rows }).catch(() => { });
        }
        catch {
            // Silently ignore errors
        }
    },
    isPlaylistUrl(query) {
        if (query.includes('youtube.com') && query.includes('list='))
            return true;
        if (query.includes('spotify.com/playlist/'))
            return true;
        if (query.includes('spotify.com/album/'))
            return true;
        return false;
    }
};
exports.default = exports.playHandler;
//# sourceMappingURL=playHandler.js.map