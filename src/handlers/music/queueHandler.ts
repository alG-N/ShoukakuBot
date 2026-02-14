/**
 * Queue Handler
 * Handles queue viewing and management
 * @module handlers/music/queueHandler
 */

import { ChatInputCommandInteraction } from 'discord.js';
import { trackHandler } from './trackHandler.js';
import musicCache from '../../cache/music/MusicCacheFacade.js';
import { checkSameVoiceChannel } from '../../middleware/voiceChannelCheck.js';
import { musicFacade as musicService } from '../../services/music/core/MusicFacade.js';

// Use any for Track type since MusicFacade.Track and trackHandler.Track have different structures
// but are compatible at runtime
type Track = any;
export const queueHandler = {
    async handleQueue(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
        const tracks = musicService.getQueueList(guildId) as Track[];
        const currentTrack = musicService.getCurrentTrack(guildId) as Track | null;
        const page = interaction.options.getInteger('page') || 1;

        const embed = trackHandler.createQueueListEmbed(tracks, currentTrack, {
            page,
            loopMode: musicService.getLoopMode(guildId),
            isShuffled: musicService.isShuffled(guildId),
            volume: musicService.getVolume(guildId)
        });

        const totalPages = Math.ceil(tracks.length / 10) || 1;
        const row = trackHandler.createQueuePaginationButtons(guildId, page, totalPages);

        await interaction.reply({ embeds: [embed], components: [row] });
    },

    async handleNowPlaying(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
        const currentTrack = musicService.getCurrentTrack(guildId) as Track | null;

        if (!currentTrack) {
            await interaction.reply({
                embeds: [trackHandler.createErrorEmbed('Nothing is currently playing')],
                ephemeral: true
            });
            return;
        }

        const queueList = musicService.getQueueList(guildId) as Track[];
        const nextTrack = queueList.length > 0 ? queueList[0] : null;
        const listenerCount = musicService.getListenerCount(guildId, interaction.guild);
        const voteSkipStatus = musicCache.getVoteSkipStatus(guildId, listenerCount);

        const embed = trackHandler.createNowPlayingEmbed(currentTrack, {
            volume: musicService.getVolume(guildId),
            isPaused: musicCache.getQueue(guildId)?.isPaused || false,
            loopMode: musicService.getLoopMode(guildId),
            isShuffled: musicService.isShuffled(guildId),
            queueLength: queueList.length,
            nextTrack,
            loopCount: musicService.getLoopCount(guildId),
            voteSkipCount: voteSkipStatus.count,
            voteSkipRequired: voteSkipStatus.required
        });

        const rows = trackHandler.createControlButtons(guildId, {
            isPaused: musicCache.getQueue(guildId)?.isPaused || false,
            loopMode: musicService.getLoopMode(guildId),
            isShuffled: musicService.isShuffled(guildId),
            trackUrl: currentTrack.url,
            userId: interaction.user.id,
            listenerCount: listenerCount
        });

        await interaction.reply({ embeds: [embed], components: rows });
    },

    async handleRemove(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
        const position = interaction.options.getInteger('position')!;
        const tracks = musicService.getQueueList(guildId) as Track[];

        if (position > tracks.length) {
            await interaction.reply({
                embeds: [trackHandler.createErrorEmbed(`Invalid position. Queue only has ${tracks.length} tracks.`)],
                ephemeral: true
            });
            return;
        }

        const botChannelId = musicService.getVoiceChannelId(guildId);
        if (!await checkSameVoiceChannel(interaction, botChannelId)) return;

        const removed = musicService.removeTrack(guildId, position - 1) as Track | null;

        await interaction.reply({
            embeds: [trackHandler.createInfoEmbed('🗑️ Removed', `Removed: **${removed?.title || 'Unknown'}**`, 'success')]
        });
    },

    async handleMove(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
        const from = interaction.options.getInteger('from')!;
        const to = interaction.options.getInteger('to')!;
        const tracks = musicService.getQueueList(guildId) as Track[];

        if (from > tracks.length || to > tracks.length) {
            await interaction.reply({
                embeds: [trackHandler.createErrorEmbed(`Invalid position. Queue only has ${tracks.length} tracks.`)],
                ephemeral: true
            });
            return;
        }

        const botChannelId = musicService.getVoiceChannelId(guildId);
        if (!await checkSameVoiceChannel(interaction, botChannelId)) return;

        const success = musicService.moveTrack(guildId, from - 1, to - 1) as boolean;

        if (success) {
            await interaction.reply({
                embeds: [trackHandler.createInfoEmbed('📝 Moved', `Moved track from position ${from} to ${to}`, 'success')]
            });
        } else {
            await interaction.reply({
                embeds: [trackHandler.createErrorEmbed('Failed to move track')],
                ephemeral: true
            });
        }
    },

    async handleClear(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
        const botChannelId = musicService.getVoiceChannelId(guildId);
        if (!await checkSameVoiceChannel(interaction, botChannelId)) return;

        const cleared = musicService.getQueueLength(guildId) as number;
        musicService.clearQueue(guildId);

        await interaction.reply({
            embeds: [trackHandler.createInfoEmbed('🗑️ Queue Cleared', `Removed **${cleared}** tracks from queue`, 'success')]
        });
    },

    async handleRecent(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
        const recent = musicService.getRecentlyPlayed(guildId) as Track[];

        if (recent.length === 0) {
            await interaction.reply({
                embeds: [trackHandler.createInfoEmbed('📜 Recently Played', 'No recently played tracks in this server.')],
                ephemeral: true
            });
            return;
        }

        const recentText = recent.map((track, i) => {
            const timeAgo = this._timeAgo(track.playedAt || Date.now());
            return `\`${i + 1}.\` **${track.title}** - ${timeAgo}`;
        }).join('\n');

        const embed = trackHandler.createInfoEmbed('📜 Recently Played', recentText);
        await interaction.reply({ embeds: [embed] });
    },

    _timeAgo(timestamp: number): string {
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        if (seconds < 60) return 'just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        return `${Math.floor(seconds / 86400)}d ago`;
    }
};

export default queueHandler;

