/**
 * Control Handler
 * Handles playback controls: stop, skip, pause, vote skip
 * @module handlers/music/controlHandler
 */

import { ChatInputCommandInteraction, Guild } from 'discord.js';
import { trackHandler, LoopMode } from './trackHandler.js';
import musicCache from '../../cache/music/MusicCacheFacade.js';
import { checkSameVoiceChannel } from '../../middleware/voiceChannelCheck.js';
import { music } from '../../config/index.js';
import { musicFacade as musicService } from '../../services/music/core/MusicFacade.js';
import logger from '../../core/Logger.js';

// Use any for Track type - different but runtime compatible
type Track = any;

// Import voting constants from config
const { minVotesRequired: MIN_VOTES_REQUIRED = 5 } = music.voting || {};
const SKIP_VOTE_TIMEOUT = 15000;
export interface VoteResult {
    added: boolean;
    voteCount: number;
    required: number;
}
export const controlHandler = {
    async handleStop(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
        if (!musicService.isConnected(guildId)) {
            await interaction.reply({
                embeds: [trackHandler.createErrorEmbed('Not connected to any voice channel')],
                ephemeral: true
            });
            return;
        }

        const botChannelId = musicService.getVoiceChannelId(guildId);
        if (!await checkSameVoiceChannel(interaction, botChannelId)) return;

        await musicService.cleanup(guildId);

        await interaction.reply({
            embeds: [trackHandler.createInfoEmbed('⏹️ Stopped', 'Stopped playback and left the channel.', 'success')]
        });
    },

    async handleSkip(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
        const currentTrack = musicService.getCurrentTrack(guildId) as Track | null;
        if (!currentTrack) {
            await interaction.reply({
                embeds: [trackHandler.createErrorEmbed('Nothing is playing')],
                ephemeral: true
            });
            return;
        }

        const botChannelId = musicService.getVoiceChannelId(guildId);
        if (!await checkSameVoiceChannel(interaction, botChannelId)) return;

        // Check if vote skip is needed
        const listenerCount = musicService.getListenerCount(guildId, interaction.guild);
        const prefs = await musicService.getPreferences(interaction.user.id);

        if (prefs.voteSkipEnabled && listenerCount >= MIN_VOTES_REQUIRED) {
            return await this.handleVoteSkip(interaction, guildId);
        }

        // Disable old now playing buttons first
        await musicService.disableNowPlayingControls(guildId);
        
        // Skip advances to the next track automatically
        const skipResult = await musicService.skip(guildId);
        
        // Reply with skip notification showing who skipped and why
        await interaction.reply({
            embeds: [trackHandler.createSkippedEmbed(currentTrack, interaction.user, 'manual')]
        });
        
        // Send new now playing embed if a new track is now playing
        // Skip if autoplay already sent the embed to avoid duplicates
        const newCurrentTrack = musicService.getCurrentTrack(guildId);
        if (newCurrentTrack && !skipResult.autoplayTriggered) {
            await new Promise(resolve => setTimeout(resolve, 200));
            await musicService.sendNowPlayingEmbed(guildId);
        }
    },

    async handleVoteSkip(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
        const queue = musicCache.getQueue(guildId);
        const listenerCount = musicService.getListenerCount(guildId, interaction.guild);
        const requiredVotes = musicCache.getRequiredVotes(listenerCount);

        if (musicService.isSkipVoteActive(guildId)) {
            const result = musicService.addSkipVote(guildId, interaction.user.id);
            if (!result?.added) {
                await interaction.reply({ content: '❌ You already voted!', ephemeral: true });
                return;
            }

            if (musicService.hasEnoughSkipVotes(guildId)) {
                musicService.endSkipVote(guildId);
                const skippedTrack = musicService.getCurrentTrack(guildId) as Track | null;
                await musicService.disableNowPlayingControls(guildId);
                const skipResult = await musicService.skip(guildId);
                
                await interaction.reply({
                    embeds: [trackHandler.createSkippedEmbed(skippedTrack, interaction.user, 'vote')]
                });
                
                // Send new now playing embed for the next track
                const newCurrentTrack = musicService.getCurrentTrack(guildId);
                if (newCurrentTrack && !skipResult.autoplayTriggered) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                    await musicService.sendNowPlayingEmbed(guildId);
                }
                return;
            }

            await interaction.reply({
                content: `🗳️ Vote added! **${result.voteCount}/${result.required}** votes`,
                ephemeral: true
            });
            return;
        }

        // Start new vote
        const voteResult = musicService.startSkipVote(guildId, interaction.user.id, listenerCount);
        const currentTrack = musicService.getCurrentTrack(guildId) as Track | null;

        const embed = trackHandler.createSkipVoteEmbed(currentTrack, voteResult.voteCount ?? 0, voteResult.required ?? 0, SKIP_VOTE_TIMEOUT);
        const row = trackHandler.createSkipVoteButton(guildId, voteResult.voteCount ?? 0, voteResult.required ?? 0);

        const response = await interaction.reply({ embeds: [embed], components: [row], withResponse: true });
        const message = response?.resource?.message || await interaction.fetchReply();

        // Set timeout via VoteCache (single source of truth for vote state)
        const voteTimeout = setTimeout(async () => {
            try {
                musicService.endSkipVote(guildId);
                await message.edit({
                    embeds: [trackHandler.createInfoEmbed('⏱️ Vote Expired', 'Not enough votes to skip.', 'warning')],
                    components: []
                }).catch(() => {});
            } catch (error) {
                logger.error('MusicControl', `Error in skip vote timeout: ${(error as Error).message}`);
            }
        }, SKIP_VOTE_TIMEOUT);
        musicCache.setSkipVoteTimeout(guildId, voteTimeout);
    },

    async handlePause(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
        if (!musicService.isConnected(guildId)) {
            await interaction.reply({
                embeds: [trackHandler.createErrorEmbed('Not connected to any voice channel')],
                ephemeral: true
            });
            return;
        }

        const botChannelId = musicService.getVoiceChannelId(guildId);
        if (!await checkSameVoiceChannel(interaction, botChannelId)) return;

        const isPaused = await musicService.togglePause(guildId);

        await interaction.reply({
            embeds: [trackHandler.createInfoEmbed(
                isPaused ? '⏸️ Paused' : '▶️ Resumed',
                isPaused ? 'Playback paused' : 'Playback resumed',
                'success'
            )]
        });
    },

    async handleVolume(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
        if (!musicService.isConnected(guildId)) {
            await interaction.reply({
                embeds: [trackHandler.createErrorEmbed('Not connected to any voice channel')],
                ephemeral: true
            });
            return;
        }

        const botChannelId = musicService.getVoiceChannelId(guildId);
        if (!await checkSameVoiceChannel(interaction, botChannelId)) return;

        const level = interaction.options.getInteger('level')!;
        const newVolume = await musicService.setVolume(guildId, level);

        await interaction.reply({
            embeds: [trackHandler.createInfoEmbed('🔊 Volume', `Volume set to **${newVolume}%**`, 'success')]
        });
    },

    async handleLoop(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
        if (!musicService.isConnected(guildId)) {
            await interaction.reply({
                embeds: [trackHandler.createErrorEmbed('Not connected to any voice channel')],
                ephemeral: true
            });
            return;
        }

        const mode = interaction.options.getString('mode') as LoopMode | null;
        let newMode: LoopMode;

        if (mode) {
            musicService.setLoopMode(guildId, mode);
            newMode = mode;
        } else {
            newMode = musicService.toggleLoop(guildId);
        }

        const modeDisplay: Record<LoopMode, string> = {
            'off': '➡️ Off',
            'track': '🔂 Track Loop',
            'queue': '🔁 Queue Loop'
        };

        await interaction.reply({
            embeds: [trackHandler.createInfoEmbed('🔁 Loop Mode', `Loop mode: **${modeDisplay[newMode]}**`, 'success')]
        });
    },

    async handleShuffle(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
        if (!musicService.isConnected(guildId)) {
            await interaction.reply({
                embeds: [trackHandler.createErrorEmbed('Not connected to any voice channel')],
                ephemeral: true
            });
            return;
        }

        const isShuffled = musicService.toggleShuffle(guildId);

        await interaction.reply({
            embeds: [trackHandler.createInfoEmbed(
                '🔀 Shuffle',
                isShuffled ? 'Queue shuffled!' : 'Queue restored to original order',
                'success'
            )]
        });
    },

    async handleSeek(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
        const timeStr = interaction.options.getString('time')!;
        const currentTrack = musicService.getCurrentTrack(guildId) as Track | null;

        if (!currentTrack) {
            await interaction.reply({
                embeds: [trackHandler.createErrorEmbed('Nothing is playing')],
                ephemeral: true
            });
            return;
        }

        const botChannelId = musicService.getVoiceChannelId(guildId);
        if (!await checkSameVoiceChannel(interaction, botChannelId)) return;

        // Parse time (supports "1:30", "90", "0:30", "1:30:00")
        let seconds: number;
        if (timeStr.includes(':')) {
            const parts = timeStr.split(':').map(p => parseInt(p) || 0);
            if (parts.some(p => isNaN(p) || p < 0)) {
                await interaction.reply({
                    embeds: [trackHandler.createErrorEmbed('Invalid time format. Use "1:30" or "90".')],
                    ephemeral: true
                });
                return;
            }
            if (parts.length === 2) {
                const [mins, secs] = parts;
                seconds = mins * 60 + secs;
            } else if (parts.length === 3) {
                const [hours, mins, secs] = parts;
                seconds = hours * 3600 + mins * 60 + secs;
            } else {
                seconds = NaN;
            }
        } else {
            seconds = parseInt(timeStr);
        }

        if (isNaN(seconds) || seconds < 0) {
            await interaction.reply({
                embeds: [trackHandler.createErrorEmbed('Invalid time format. Use "1:30" or "90".')],
                ephemeral: true
            });
            return;
        }

        if (seconds > currentTrack.lengthSeconds) {
            await interaction.reply({
                embeds: [trackHandler.createErrorEmbed('Cannot seek past the end of the track')],
                ephemeral: true
            });
            return;
        }

        const player = musicService.getPlayer(guildId);
        if (player) {
            await player.seekTo(seconds * 1000);
        }

        const { formatSecondsToTime: fmtDur } = await import('../../utils/music/index.js');
        await interaction.reply({
            embeds: [trackHandler.createInfoEmbed('⏩ Seeked', `Seeked to **${fmtDur(seconds)}**`, 'success')]
        });
    },

    async handleAutoPlay(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
        const isEnabled = musicService.toggleAutoPlay(guildId);
        
        const embed = trackHandler.createInfoEmbed(
            isEnabled ? '🎵 Auto-Play Enabled' : '🎵 Auto-Play Disabled',
            isEnabled 
                ? 'When the queue ends, similar tracks will be automatically added and played.'
                : 'Auto-play has been disabled. The bot will stop when the queue ends.',
            isEnabled ? 'success' : 'warning'
        );

        await interaction.reply({ embeds: [embed] });
    }
};

export default controlHandler;

