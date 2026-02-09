"use strict";
/**
 * Control Handler
 * Handles playback controls: stop, skip, pause, vote skip
 * @module handlers/music/controlHandler
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.controlHandler = void 0;
const trackHandler_js_1 = require("./trackHandler.js");
const MusicCacheFacade_js_1 = __importDefault(require("../../cache/music/MusicCacheFacade.js"));
const voiceChannelCheck_js_1 = require("../../middleware/voiceChannelCheck.js");
const index_js_1 = require("../../config/index.js");
const MusicFacade_js_1 = require("../../services/music/MusicFacade.js");
// Import voting constants from config
const { minVotesRequired: MIN_VOTES_REQUIRED = 5 } = index_js_1.music.voting || {};
const SKIP_VOTE_TIMEOUT = 15000;
exports.controlHandler = {
    async handleStop(interaction, guildId) {
        if (!MusicFacade_js_1.musicFacade.isConnected(guildId)) {
            await interaction.reply({
                embeds: [trackHandler_js_1.trackHandler.createErrorEmbed('Not connected to any voice channel')],
                ephemeral: true
            });
            return;
        }
        const botChannelId = MusicFacade_js_1.musicFacade.getVoiceChannelId(guildId);
        if (!await (0, voiceChannelCheck_js_1.checkSameVoiceChannel)(interaction, botChannelId))
            return;
        await MusicFacade_js_1.musicFacade.cleanup(guildId);
        await interaction.reply({
            embeds: [trackHandler_js_1.trackHandler.createInfoEmbed('⏹️ Stopped', 'Stopped playback and left the channel.', 'success')]
        });
    },
    async handleSkip(interaction, guildId) {
        const currentTrack = MusicFacade_js_1.musicFacade.getCurrentTrack(guildId);
        if (!currentTrack) {
            await interaction.reply({
                embeds: [trackHandler_js_1.trackHandler.createErrorEmbed('Nothing is playing')],
                ephemeral: true
            });
            return;
        }
        const botChannelId = MusicFacade_js_1.musicFacade.getVoiceChannelId(guildId);
        if (!await (0, voiceChannelCheck_js_1.checkSameVoiceChannel)(interaction, botChannelId))
            return;
        // Check if vote skip is needed
        const listenerCount = MusicFacade_js_1.musicFacade.getListenerCount(guildId, interaction.guild);
        const prefs = await MusicFacade_js_1.musicFacade.getPreferences(interaction.user.id);
        if (prefs.voteSkipEnabled && listenerCount >= MIN_VOTES_REQUIRED) {
            return await this.handleVoteSkip(interaction, guildId);
        }
        // Disable old now playing buttons first
        await MusicFacade_js_1.musicFacade.disableNowPlayingControls(guildId);
        // Skip advances to the next track automatically
        await MusicFacade_js_1.musicFacade.skip(guildId);
        // Reply first to acknowledge the skip
        await interaction.reply({
            embeds: [trackHandler_js_1.trackHandler.createInfoEmbed('⏭️ Skipped', `Skipped: **${currentTrack.title}**`, 'success')]
        });
        // Send new now playing embed if a new track is now playing
        const newCurrentTrack = MusicFacade_js_1.musicFacade.getCurrentTrack(guildId);
        if (newCurrentTrack) {
            await new Promise(resolve => setTimeout(resolve, 200));
            await MusicFacade_js_1.musicFacade.sendNowPlayingEmbed(guildId);
        }
    },
    async handleVoteSkip(interaction, guildId) {
        const queue = MusicCacheFacade_js_1.default.getQueue(guildId);
        const listenerCount = MusicFacade_js_1.musicFacade.getListenerCount(guildId, interaction.guild);
        const requiredVotes = MusicCacheFacade_js_1.default.getRequiredVotes(listenerCount);
        if (MusicFacade_js_1.musicFacade.isSkipVoteActive(guildId)) {
            const result = MusicFacade_js_1.musicFacade.addSkipVote(guildId, interaction.user.id);
            if (!result?.added) {
                await interaction.reply({ content: '❌ You already voted!', ephemeral: true });
                return;
            }
            if (MusicFacade_js_1.musicFacade.hasEnoughSkipVotes(guildId)) {
                MusicFacade_js_1.musicFacade.endSkipVote(guildId);
                await MusicFacade_js_1.musicFacade.skip(guildId);
                await interaction.reply({
                    embeds: [trackHandler_js_1.trackHandler.createInfoEmbed('⏭️ Vote Skip Passed', 'Skipping to next track!', 'success')]
                });
                return;
            }
            await interaction.reply({
                content: `🗳️ Vote added! **${result.voteCount}/${result.required}** votes`,
                ephemeral: true
            });
            return;
        }
        // Start new vote
        const voteResult = MusicFacade_js_1.musicFacade.startSkipVote(guildId, interaction.user.id, listenerCount);
        const currentTrack = MusicFacade_js_1.musicFacade.getCurrentTrack(guildId);
        const embed = trackHandler_js_1.trackHandler.createSkipVoteEmbed(currentTrack, voteResult.voteCount ?? 0, voteResult.required ?? 0, SKIP_VOTE_TIMEOUT);
        const row = trackHandler_js_1.trackHandler.createSkipVoteButton(guildId, voteResult.voteCount ?? 0, voteResult.required ?? 0);
        const response = await interaction.reply({ embeds: [embed], components: [row], withResponse: true });
        const message = response?.resource?.message || await interaction.fetchReply();
        // Set timeout
        const queue2 = MusicCacheFacade_js_1.default.getQueue(guildId);
        if (queue2) {
            if (queue2.skipVoteTimeout)
                clearTimeout(queue2.skipVoteTimeout);
            queue2.skipVoteTimeout = setTimeout(async () => {
                try {
                    MusicFacade_js_1.musicFacade.endSkipVote(guildId);
                    await message.edit({
                        embeds: [trackHandler_js_1.trackHandler.createInfoEmbed('⏱️ Vote Expired', 'Not enough votes to skip.', 'warning')],
                        components: []
                    }).catch(() => { });
                }
                catch (error) {
                    console.error('Error in skip vote timeout:', error);
                }
            }, SKIP_VOTE_TIMEOUT);
        }
    },
    async handlePause(interaction, guildId) {
        if (!MusicFacade_js_1.musicFacade.isConnected(guildId)) {
            await interaction.reply({
                embeds: [trackHandler_js_1.trackHandler.createErrorEmbed('Not connected to any voice channel')],
                ephemeral: true
            });
            return;
        }
        const botChannelId = MusicFacade_js_1.musicFacade.getVoiceChannelId(guildId);
        if (!await (0, voiceChannelCheck_js_1.checkSameVoiceChannel)(interaction, botChannelId))
            return;
        const isPaused = await MusicFacade_js_1.musicFacade.togglePause(guildId);
        await interaction.reply({
            embeds: [trackHandler_js_1.trackHandler.createInfoEmbed(isPaused ? '⏸️ Paused' : '▶️ Resumed', isPaused ? 'Playback paused' : 'Playback resumed', 'success')]
        });
    },
    async handleVolume(interaction, guildId) {
        if (!MusicFacade_js_1.musicFacade.isConnected(guildId)) {
            await interaction.reply({
                embeds: [trackHandler_js_1.trackHandler.createErrorEmbed('Not connected to any voice channel')],
                ephemeral: true
            });
            return;
        }
        const botChannelId = MusicFacade_js_1.musicFacade.getVoiceChannelId(guildId);
        if (!await (0, voiceChannelCheck_js_1.checkSameVoiceChannel)(interaction, botChannelId))
            return;
        const level = interaction.options.getInteger('level');
        const newVolume = await MusicFacade_js_1.musicFacade.setVolume(guildId, level);
        await interaction.reply({
            embeds: [trackHandler_js_1.trackHandler.createInfoEmbed('🔊 Volume', `Volume set to **${newVolume}%**`, 'success')]
        });
    },
    async handleLoop(interaction, guildId) {
        if (!MusicFacade_js_1.musicFacade.isConnected(guildId)) {
            await interaction.reply({
                embeds: [trackHandler_js_1.trackHandler.createErrorEmbed('Not connected to any voice channel')],
                ephemeral: true
            });
            return;
        }
        const mode = interaction.options.getString('mode');
        let newMode;
        if (mode) {
            MusicFacade_js_1.musicFacade.setLoopMode(guildId, mode);
            newMode = mode;
        }
        else {
            newMode = MusicFacade_js_1.musicFacade.toggleLoop(guildId);
        }
        const modeDisplay = {
            'off': '➡️ Off',
            'track': '🔂 Track Loop',
            'queue': '🔁 Queue Loop'
        };
        await interaction.reply({
            embeds: [trackHandler_js_1.trackHandler.createInfoEmbed('🔁 Loop Mode', `Loop mode: **${modeDisplay[newMode]}**`, 'success')]
        });
    },
    async handleShuffle(interaction, guildId) {
        if (!MusicFacade_js_1.musicFacade.isConnected(guildId)) {
            await interaction.reply({
                embeds: [trackHandler_js_1.trackHandler.createErrorEmbed('Not connected to any voice channel')],
                ephemeral: true
            });
            return;
        }
        const isShuffled = MusicFacade_js_1.musicFacade.toggleShuffle(guildId);
        await interaction.reply({
            embeds: [trackHandler_js_1.trackHandler.createInfoEmbed('🔀 Shuffle', isShuffled ? 'Queue shuffled!' : 'Queue restored to original order', 'success')]
        });
    },
    async handleSeek(interaction, guildId) {
        const timeStr = interaction.options.getString('time');
        const currentTrack = MusicFacade_js_1.musicFacade.getCurrentTrack(guildId);
        if (!currentTrack) {
            await interaction.reply({
                embeds: [trackHandler_js_1.trackHandler.createErrorEmbed('Nothing is playing')],
                ephemeral: true
            });
            return;
        }
        const botChannelId = MusicFacade_js_1.musicFacade.getVoiceChannelId(guildId);
        if (!await (0, voiceChannelCheck_js_1.checkSameVoiceChannel)(interaction, botChannelId))
            return;
        // Parse time (supports "1:30", "90", "0:30", "1:30:00")
        let seconds;
        if (timeStr.includes(':')) {
            const parts = timeStr.split(':').map(p => parseInt(p) || 0);
            if (parts.some(p => isNaN(p) || p < 0)) {
                await interaction.reply({
                    embeds: [trackHandler_js_1.trackHandler.createErrorEmbed('Invalid time format. Use "1:30" or "90".')],
                    ephemeral: true
                });
                return;
            }
            if (parts.length === 2) {
                const [mins, secs] = parts;
                seconds = mins * 60 + secs;
            }
            else if (parts.length === 3) {
                const [hours, mins, secs] = parts;
                seconds = hours * 3600 + mins * 60 + secs;
            }
            else {
                seconds = NaN;
            }
        }
        else {
            seconds = parseInt(timeStr);
        }
        if (isNaN(seconds) || seconds < 0) {
            await interaction.reply({
                embeds: [trackHandler_js_1.trackHandler.createErrorEmbed('Invalid time format. Use "1:30" or "90".')],
                ephemeral: true
            });
            return;
        }
        if (seconds > currentTrack.lengthSeconds) {
            await interaction.reply({
                embeds: [trackHandler_js_1.trackHandler.createErrorEmbed('Cannot seek past the end of the track')],
                ephemeral: true
            });
            return;
        }
        const player = MusicFacade_js_1.musicFacade.getPlayer(guildId);
        if (player) {
            await player.seekTo(seconds * 1000);
        }
        const { formatSecondsToTime: fmtDur } = await import('../../utils/music/index.js');
        await interaction.reply({
            embeds: [trackHandler_js_1.trackHandler.createInfoEmbed('⏩ Seeked', `Seeked to **${fmtDur(seconds)}**`, 'success')]
        });
    },
    async handleAutoPlay(interaction, guildId) {
        const isEnabled = MusicFacade_js_1.musicFacade.toggleAutoPlay(guildId);
        const embed = trackHandler_js_1.trackHandler.createInfoEmbed(isEnabled ? '🎵 Auto-Play Enabled' : '🎵 Auto-Play Disabled', isEnabled
            ? 'When the queue ends, similar tracks will be automatically added and played.'
            : 'Auto-play has been disabled. The bot will stop when the queue ends.', isEnabled ? 'success' : 'warning');
        await interaction.reply({ embeds: [embed] });
    }
};
exports.default = exports.controlHandler;
//# sourceMappingURL=controlHandler.js.map