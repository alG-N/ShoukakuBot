"use strict";
/**
 * Queue Handler
 * Handles queue viewing and management
 * @module handlers/music/queueHandler
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.queueHandler = void 0;
const trackHandler_js_1 = require("./trackHandler.js");
const MusicCacheFacade_js_1 = __importDefault(require("../../cache/music/MusicCacheFacade.js"));
const voiceChannelCheck_js_1 = require("../../middleware/voiceChannelCheck.js");
const MusicFacade_js_1 = require("../../services/music/MusicFacade.js");
exports.queueHandler = {
    async handleQueue(interaction, guildId) {
        const tracks = MusicFacade_js_1.musicFacade.getQueueList(guildId);
        const currentTrack = MusicFacade_js_1.musicFacade.getCurrentTrack(guildId);
        const page = interaction.options.getInteger('page') || 1;
        const embed = trackHandler_js_1.trackHandler.createQueueListEmbed(tracks, currentTrack, {
            page,
            loopMode: MusicFacade_js_1.musicFacade.getLoopMode(guildId),
            isShuffled: MusicFacade_js_1.musicFacade.isShuffled(guildId),
            volume: MusicFacade_js_1.musicFacade.getVolume(guildId)
        });
        const totalPages = Math.ceil(tracks.length / 10) || 1;
        const row = trackHandler_js_1.trackHandler.createQueuePaginationButtons(guildId, page, totalPages);
        await interaction.reply({ embeds: [embed], components: [row] });
    },
    async handleNowPlaying(interaction, guildId) {
        const currentTrack = MusicFacade_js_1.musicFacade.getCurrentTrack(guildId);
        if (!currentTrack) {
            await interaction.reply({
                embeds: [trackHandler_js_1.trackHandler.createErrorEmbed('Nothing is currently playing')],
                ephemeral: true
            });
            return;
        }
        const queueList = MusicFacade_js_1.musicFacade.getQueueList(guildId);
        const nextTrack = queueList.length > 0 ? queueList[0] : null;
        const listenerCount = MusicFacade_js_1.musicFacade.getListenerCount(guildId, interaction.guild);
        const voteSkipStatus = MusicCacheFacade_js_1.default.getVoteSkipStatus(guildId, listenerCount);
        const embed = trackHandler_js_1.trackHandler.createNowPlayingEmbed(currentTrack, {
            volume: MusicFacade_js_1.musicFacade.getVolume(guildId),
            isPaused: MusicCacheFacade_js_1.default.getQueue(guildId)?.isPaused || false,
            loopMode: MusicFacade_js_1.musicFacade.getLoopMode(guildId),
            isShuffled: MusicFacade_js_1.musicFacade.isShuffled(guildId),
            queueLength: queueList.length,
            nextTrack,
            loopCount: MusicFacade_js_1.musicFacade.getLoopCount(guildId),
            voteSkipCount: voteSkipStatus.count,
            voteSkipRequired: voteSkipStatus.required
        });
        const rows = trackHandler_js_1.trackHandler.createControlButtons(guildId, {
            isPaused: MusicCacheFacade_js_1.default.getQueue(guildId)?.isPaused || false,
            loopMode: MusicFacade_js_1.musicFacade.getLoopMode(guildId),
            isShuffled: MusicFacade_js_1.musicFacade.isShuffled(guildId),
            trackUrl: currentTrack.url,
            userId: interaction.user.id,
            listenerCount: listenerCount
        });
        await interaction.reply({ embeds: [embed], components: rows });
    },
    async handleRemove(interaction, guildId) {
        const position = interaction.options.getInteger('position');
        const tracks = MusicFacade_js_1.musicFacade.getQueueList(guildId);
        if (position > tracks.length) {
            await interaction.reply({
                embeds: [trackHandler_js_1.trackHandler.createErrorEmbed(`Invalid position. Queue only has ${tracks.length} tracks.`)],
                ephemeral: true
            });
            return;
        }
        const botChannelId = MusicFacade_js_1.musicFacade.getVoiceChannelId(guildId);
        if (!await (0, voiceChannelCheck_js_1.checkSameVoiceChannel)(interaction, botChannelId))
            return;
        const removed = MusicFacade_js_1.musicFacade.removeTrack(guildId, position - 1);
        await interaction.reply({
            embeds: [trackHandler_js_1.trackHandler.createInfoEmbed('🗑️ Removed', `Removed: **${removed?.title || 'Unknown'}**`, 'success')]
        });
    },
    async handleMove(interaction, guildId) {
        const from = interaction.options.getInteger('from');
        const to = interaction.options.getInteger('to');
        const tracks = MusicFacade_js_1.musicFacade.getQueueList(guildId);
        if (from > tracks.length || to > tracks.length) {
            await interaction.reply({
                embeds: [trackHandler_js_1.trackHandler.createErrorEmbed(`Invalid position. Queue only has ${tracks.length} tracks.`)],
                ephemeral: true
            });
            return;
        }
        const botChannelId = MusicFacade_js_1.musicFacade.getVoiceChannelId(guildId);
        if (!await (0, voiceChannelCheck_js_1.checkSameVoiceChannel)(interaction, botChannelId))
            return;
        const success = MusicFacade_js_1.musicFacade.moveTrack(guildId, from - 1, to - 1);
        if (success) {
            await interaction.reply({
                embeds: [trackHandler_js_1.trackHandler.createInfoEmbed('📝 Moved', `Moved track from position ${from} to ${to}`, 'success')]
            });
        }
        else {
            await interaction.reply({
                embeds: [trackHandler_js_1.trackHandler.createErrorEmbed('Failed to move track')],
                ephemeral: true
            });
        }
    },
    async handleClear(interaction, guildId) {
        const botChannelId = MusicFacade_js_1.musicFacade.getVoiceChannelId(guildId);
        if (!await (0, voiceChannelCheck_js_1.checkSameVoiceChannel)(interaction, botChannelId))
            return;
        const cleared = MusicFacade_js_1.musicFacade.getQueueLength(guildId);
        MusicFacade_js_1.musicFacade.clearQueue(guildId);
        await interaction.reply({
            embeds: [trackHandler_js_1.trackHandler.createInfoEmbed('🗑️ Queue Cleared', `Removed **${cleared}** tracks from queue`, 'success')]
        });
    },
    async handleRecent(interaction, guildId) {
        const recent = MusicFacade_js_1.musicFacade.getRecentlyPlayed(guildId);
        if (recent.length === 0) {
            await interaction.reply({
                embeds: [trackHandler_js_1.trackHandler.createInfoEmbed('📜 Recently Played', 'No recently played tracks in this server.')],
                ephemeral: true
            });
            return;
        }
        const recentText = recent.map((track, i) => {
            const timeAgo = this._timeAgo(track.playedAt || Date.now());
            return `\`${i + 1}.\` **${track.title}** - ${timeAgo}`;
        }).join('\n');
        const embed = trackHandler_js_1.trackHandler.createInfoEmbed('📜 Recently Played', recentText);
        await interaction.reply({ embeds: [embed] });
    },
    _timeAgo(timestamp) {
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        if (seconds < 60)
            return 'just now';
        if (seconds < 3600)
            return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400)
            return `${Math.floor(seconds / 3600)}h ago`;
        return `${Math.floor(seconds / 86400)}d ago`;
    }
};
exports.default = exports.queueHandler;
//# sourceMappingURL=queueHandler.js.map