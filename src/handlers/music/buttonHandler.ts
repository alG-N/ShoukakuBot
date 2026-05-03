/**
 * Button Handler
 * Handles all button interactions for music controls
 * @module handlers/music/buttonHandler
 */

import { ButtonInteraction, Message, TextChannel } from 'discord.js';
import { trackHandler } from './trackHandler.js';
import { playHandler } from './playHandler.js';
import musicCache from '../../cache/music/MusicCacheFacade.js';
import { checkSameVoiceChannel } from '../../middleware/voiceChannelCheck.js';
import { music } from '../../config/index.js';
import { logger } from '../../core/observability/Logger.js';
import { musicFacade as musicService } from '../../services/music/core/musicFacade.js';
import type { Track } from '../../types/music/track.js';
import type { NowPlayingOptions } from '../../types/music/playback.js';
import type { VoteResult, VoteSkipStatus } from '../../types/music/vote.js';

const { minVotesRequired: MIN_VOTES_REQUIRED = 5 } = music.voting || {};
const SKIP_VOTE_TIMEOUT = 15000;

function parseQueuePageFromFooter(interaction: ButtonInteraction): number {
    const footerText = interaction.message.embeds[0]?.footer?.text || '';
    const match = footerText.match(/Page\s+(\d+)\s*\/\s*(\d+)/i);
    const parsed = Number.parseInt(match?.[1] || '', 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

async function resolveSkipVoteMessage(interaction: ButtonInteraction, guildId: string): Promise<Message | null> {
    const ref = musicCache.getSkipVoteMessage(guildId);
    if (!ref) return null;

    if (interaction.message.id === ref.messageId) {
        return interaction.message as Message;
    }

    const currentChannel = interaction.channel;
    if (currentChannel && 'id' in currentChannel && currentChannel.id === ref.channelId && 'messages' in currentChannel) {
        return await (currentChannel as TextChannel).messages.fetch(ref.messageId).catch(() => null);
    }

    const fetchedChannel = await interaction.client.channels.fetch(ref.channelId).catch(() => null);
    if (!fetchedChannel || !('messages' in fetchedChannel)) return null;

    return await (fetchedChannel as TextChannel).messages.fetch(ref.messageId).catch(() => null);
}
/**
 * Build now playing embed options consistently
 */
function buildNowPlayingOptions(guildId: string, interaction: ButtonInteraction): NowPlayingOptions {
    const queue = musicCache.getQueue(guildId);
    const queueList = musicService.getQueueList(guildId) as Track[];
    const listenerCount = musicService.getListenerCount(guildId, interaction.guild);
    const voteSkipStatus = musicCache.getVoteSkipStatus(guildId, listenerCount) as VoteSkipStatus;
    
    return {
        volume: musicService.getVolume(guildId),
        isPaused: queue?.isPaused || false,
        loopMode: musicService.getLoopMode(guildId),
        isShuffled: musicService.isShuffled(guildId),
        queueLength: queueList.length,
        nextTrack: queueList[0] || null,
        loopCount: musicService.getLoopCount(guildId),
        voteSkipCount: voteSkipStatus.count,
        voteSkipRequired: voteSkipStatus.required,
        listenerCount: listenerCount
    };
}
export const buttonHandler = {
    async handleButton(interaction: ButtonInteraction): Promise<void> {
        const parts = interaction.customId.split(':');
        const action = parts[0];
        const guildId = parts[1];

        // Voice channel check for most actions
        const voiceRequiredActions = [
            'music_pause', 'music_stop', 'music_skip', 'music_loop',
            'music_shuffle', 'music_voldown', 'music_volup', 'music_voteskip',
            'music_voteskip_add', 'music_autoplay'
        ];

        if (voiceRequiredActions.includes(action)) {
            const botChannelId = musicService.getVoiceChannelId(guildId);
            if (!await checkSameVoiceChannel(interaction, botChannelId)) return;
        }

        switch (action) {
            case 'music_pause':
                return await this.handleButtonPause(interaction, guildId);
            case 'music_stop':
                return await this.handleButtonStop(interaction, guildId);
            case 'music_skip':
                return await this.handleButtonSkip(interaction, guildId);
            case 'music_loop':
                return await this.handleButtonLoop(interaction, guildId);
            case 'music_shuffle':
                return await this.handleButtonShuffle(interaction, guildId);
            case 'music_autoplay':
                return await this.handleButtonAutoplay(interaction, guildId);
            case 'music_voldown':
                return await this.handleButtonVolume(interaction, guildId, -10);
            case 'music_volup':
                return await this.handleButtonVolume(interaction, guildId, 10);
            case 'music_queue':
                return await this.handleButtonQueue(interaction, guildId);
            case 'music_voteskip':
            case 'music_voteskip_add':
                return await this.handleButtonVoteSkip(interaction, guildId);
            case 'music_qpage':
                return await this.handleButtonQueuePage(interaction, guildId, parts[2]);
            case 'music_confirm':
                return await this.handleButtonConfirm(interaction, guildId, parts[2], parts[3]);
            default:
                logger.warn('Button', `Unknown music button: ${action}`);
        }
    },

    async handleButtonPause(interaction: ButtonInteraction, guildId: string): Promise<void> {
        try {
            await interaction.deferUpdate();
            
            await musicService.togglePause(guildId);
            
            const currentTrack = musicService.getCurrentTrack(guildId) as Track | null;
            if (currentTrack) {
                const options = buildNowPlayingOptions(guildId, interaction);
                const embed = trackHandler.createNowPlayingEmbed(currentTrack, options);

                const rows = trackHandler.createControlButtons(guildId, {
                    isPaused: options.isPaused,
                    loopMode: options.loopMode,
                    isShuffled: options.isShuffled,
                    autoPlay: musicService.isAutoPlayEnabled(guildId),
                    trackUrl: currentTrack.url,
                    userId: interaction.user.id,
                    listenerCount: options.listenerCount
                });

                await interaction.editReply({ embeds: [embed], components: rows });
            }
        } catch (error: unknown) {
            const err = error as { code?: number; message?: string };
            if (err.code === 10062 || err.code === 10008) {
                logger.debug('Button', 'Interaction expired or message deleted, ignoring...');
            } else {
                logger.error('Button', `Pause button error: ${err.message}`);
            }
        }
    },

    async handleButtonStop(interaction: ButtonInteraction, guildId: string): Promise<void> {
        try {
            await interaction.deferUpdate();
            
            await musicService.cleanup(guildId);
            
            try {
                await interaction.editReply({
                    embeds: [trackHandler.createStoppedByUserEmbed(interaction.user)],
                    components: []
                });
            } catch (editError: unknown) {
                const err = editError as { code?: number };
                if (err.code === 10008 || err.code === 10062) {
                    try {
                        const channel = interaction.channel as TextChannel;
                        await channel?.send({
                            embeds: [trackHandler.createStoppedByUserEmbed(interaction.user)]
                        });
                    } catch {
                        // Channel might not be accessible
                    }
                }
            }
        } catch (error: unknown) {
            const err = error as { message?: string };
            logger.error('Button', `Stop button error: ${err.message}`);
            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: 'Playback stopped.', ephemeral: true });
                }
            } catch {
                // Ignore if we can't respond
            }
        }
    },

    async handleButtonSkip(interaction: ButtonInteraction, guildId: string): Promise<void> {
        try {
            const listenerCount = musicService.getListenerCount(guildId, interaction.guild);
            
            if (listenerCount >= MIN_VOTES_REQUIRED) {
                return await this.handleButtonVoteSkip(interaction, guildId);
            }

            const currentTrack = musicService.getCurrentTrack(guildId) as Track | null;
            
            // Fire-and-forget: don't block skip on Discord API edit
            musicService.disableNowPlayingControls(guildId).catch(() => {});
            
            // Run skip and deferUpdate in parallel
            const [skipResult] = await Promise.all([
                musicService.skip(guildId),
                interaction.deferUpdate()
            ]);

            const nextTrack = musicService.getCurrentTrack(guildId);

            // Send skip notification in channel
            const queue = musicCache.getQueue(guildId);
            if (queue?.textChannel) {
                const channel = queue.textChannel as TextChannel;
                await channel.send({
                    embeds: [trackHandler.createSkippedEmbed(currentTrack, interaction.user, 'manual')]
                }).catch(() => {});
            }
            
            // Queue Complete is already sent by MusicFacade.handleQueueEnd()
            if (nextTrack && !skipResult.autoplayTriggered) {
                await musicService.sendNowPlayingEmbed(guildId);
            }
        } catch (error: unknown) {
            const err = error as { message?: string };
            logger.error('Button', `Skip button error: ${err.message}`);
        }
    },

    async handleButtonLoop(interaction: ButtonInteraction, guildId: string): Promise<void> {
        try {
            await interaction.deferUpdate();
            
            musicService.toggleLoop(guildId);
            
            const currentTrack = musicService.getCurrentTrack(guildId) as Track | null;
            if (currentTrack) {
                const options = buildNowPlayingOptions(guildId, interaction);
                const embed = trackHandler.createNowPlayingEmbed(currentTrack, options);

                const rows = trackHandler.createControlButtons(guildId, {
                    isPaused: options.isPaused,
                    loopMode: options.loopMode,
                    isShuffled: options.isShuffled,
                    autoPlay: musicService.isAutoPlayEnabled(guildId),
                    trackUrl: currentTrack.url,
                    userId: interaction.user.id,
                    listenerCount: options.listenerCount
                });

                await interaction.editReply({ embeds: [embed], components: rows });
            }
        } catch (error: unknown) {
            const err = error as { code?: number; message?: string };
            if (err.code === 10062 || err.code === 10008) {
                logger.debug('Button', 'Interaction expired or message deleted, ignoring...');
            } else {
                logger.error('Button', `Loop button error: ${err.message}`);
            }
        }
    },

    async handleButtonShuffle(interaction: ButtonInteraction, guildId: string): Promise<void> {
        try {
            await interaction.deferUpdate();
            
            musicService.toggleShuffle(guildId);
            
            const currentTrack = musicService.getCurrentTrack(guildId) as Track | null;
            if (currentTrack) {
                const options = buildNowPlayingOptions(guildId, interaction);
                const embed = trackHandler.createNowPlayingEmbed(currentTrack, options);

                const rows = trackHandler.createControlButtons(guildId, {
                    isPaused: options.isPaused,
                    loopMode: options.loopMode,
                    isShuffled: options.isShuffled,
                    autoPlay: musicService.isAutoPlayEnabled(guildId),
                    trackUrl: currentTrack.url,
                    userId: interaction.user.id,
                    listenerCount: options.listenerCount
                });

                await interaction.editReply({ embeds: [embed], components: rows });
            }
        } catch (error: unknown) {
            const err = error as { code?: number; message?: string };
            if (err.code === 10062 || err.code === 10008) {
                logger.debug('Button', 'Interaction expired or message deleted, ignoring...');
            } else {
                logger.error('Button', `Shuffle button error: ${err.message}`);
            }
        }
    },

    async handleButtonAutoplay(interaction: ButtonInteraction, guildId: string): Promise<void> {
        try {
            await interaction.deferUpdate();
            
            const isEnabled = musicService.toggleAutoPlay(guildId);
            
            const currentTrack = musicService.getCurrentTrack(guildId) as Track | null;
            if (currentTrack) {
                const options = buildNowPlayingOptions(guildId, interaction);
                const embed = trackHandler.createNowPlayingEmbed(currentTrack, options);

                const rows = trackHandler.createControlButtons(guildId, {
                    isPaused: options.isPaused,
                    loopMode: options.loopMode,
                    isShuffled: options.isShuffled,
                    autoPlay: isEnabled,
                    trackUrl: currentTrack.url,
                    userId: interaction.user.id,
                    listenerCount: options.listenerCount
                });

                await interaction.editReply({ embeds: [embed], components: rows });
            }
        } catch (error: unknown) {
            const err = error as { code?: number; message?: string };
            if (err.code === 10062 || err.code === 10008) {
                logger.debug('Button', 'Interaction expired or message deleted, ignoring...');
            } else {
                logger.error('Button', `Autoplay button error: ${err.message}`);
            }
        }
    },

    async handleButtonVolume(interaction: ButtonInteraction, guildId: string, delta: number): Promise<void> {
        try {
            await interaction.deferUpdate();
            
            await musicService.adjustVolume(guildId, delta);
            
            const currentTrack = musicService.getCurrentTrack(guildId) as Track | null;
            if (currentTrack) {
                const options = buildNowPlayingOptions(guildId, interaction);
                const embed = trackHandler.createNowPlayingEmbed(currentTrack, options);

                const rows = trackHandler.createControlButtons(guildId, {
                    isPaused: options.isPaused,
                    loopMode: options.loopMode,
                    isShuffled: options.isShuffled,
                    autoPlay: musicService.isAutoPlayEnabled(guildId),
                    trackUrl: currentTrack.url,
                    userId: interaction.user.id,
                    listenerCount: options.listenerCount
                });

                await interaction.editReply({ embeds: [embed], components: rows });
            }
        } catch (error: unknown) {
            const err = error as { code?: number; message?: string };
            if (err.code === 10062 || err.code === 10008) {
                logger.debug('Button', 'Interaction expired or message deleted, ignoring...');
            } else {
                logger.error('Button', `Volume button error: ${err.message}`);
            }
        }
    },

    async handleButtonQueue(interaction: ButtonInteraction, guildId: string): Promise<void> {
        const tracks = musicService.getQueueList(guildId) as Track[];
        const currentTrack = musicService.getCurrentTrack(guildId) as Track | null;
        const totalPages = Math.ceil(tracks.length / 10) || 1;

        const embed = trackHandler.createQueueListEmbed(tracks, currentTrack, {
            loopMode: musicService.getLoopMode(guildId),
            isShuffled: musicService.isShuffled(guildId),
            volume: musicService.getVolume(guildId)
        });

        const row = trackHandler.createQueuePaginationButtons(guildId, 1, totalPages);

        await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    },

    async handleButtonVoteSkip(interaction: ButtonInteraction, guildId: string): Promise<void> {
        const listenerCount = musicService.getListenerCount(guildId, interaction.guild);

        if (listenerCount < MIN_VOTES_REQUIRED) {
            const skippedTrack = musicService.getCurrentTrack(guildId) as Track | null;
            musicService.disableNowPlayingControls(guildId).catch(() => {});
            
            // Run skip and deferUpdate in parallel for instant audio cutoff
            const [skipResult] = await Promise.all([
                musicService.skip(guildId),
                interaction.deferUpdate()
            ]);
            
            const channel = interaction.channel as TextChannel;
            await channel.send({
                embeds: [trackHandler.createSkippedEmbed(skippedTrack, interaction.user, 'manual')]
            }).catch(() => {});

            // Send new now playing embed for the next track
            const nextTrack = musicService.getCurrentTrack(guildId) as Track | null;
            if (nextTrack && !skipResult.autoplayTriggered) {
                await musicService.sendNowPlayingEmbed(guildId);
            }
            
            return;
        }

        if (musicService.isSkipVoteActive(guildId)) {
            const result = musicService.addSkipVote(guildId, interaction.user.id) as VoteResult;
            
            if (!result.added) {
                await interaction.reply({ content: '❌ You already voted!', ephemeral: true });
                return;
            }

            const voteSession = musicCache.voteCache.getSkipVoteSession(guildId);
            const voteMessage = await resolveSkipVoteMessage(interaction, guildId);

            if (musicService.hasEnoughSkipVotes(guildId)) {
                await interaction.deferUpdate();
                musicService.endSkipVote(guildId);
                const skippedTrack = musicService.getCurrentTrack(guildId) as Track | null;
                musicService.disableNowPlayingControls(guildId).catch(() => {});
                const skipResult = await musicService.skip(guildId);
                
                await voteMessage?.edit({
                    embeds: [trackHandler.createSkippedEmbed(skippedTrack, interaction.user, 'vote')],
                    components: []
                }).catch(() => {});

                // Send new now playing embed for the next track
                const nextTrack = musicService.getCurrentTrack(guildId) as Track | null;
                if (nextTrack && !skipResult.autoplayTriggered) {
                    await musicService.sendNowPlayingEmbed(guildId);
                }
                return;
            }

            await interaction.deferUpdate();
            const required = musicCache.getRequiredVotes(musicCache.getSkipVoteListenerCount(guildId) || listenerCount);
            const currentTrack = musicService.getCurrentTrack(guildId) as Track | null;
            const remainingMs = Math.max(0, SKIP_VOTE_TIMEOUT - (Date.now() - (voteSession?.startedAt ?? Date.now())));

            if (voteMessage) {
                await voteMessage.edit({
                    embeds: [trackHandler.createSkipVoteEmbed(currentTrack, result.voteCount, required, remainingMs)],
                    components: [trackHandler.createSkipVoteButton(guildId, result.voteCount, required)]
                }).catch(() => {});
            }

            await interaction.followUp({
                content: `🗳️ Vote added! **${result.voteCount}/${required}**`,
                ephemeral: true
            }).catch(() => {});
            return;
        }

        // Start new vote
        const voteResult = musicService.startSkipVote(guildId, interaction.user.id, listenerCount) as VoteResult;
        const currentTrack = musicService.getCurrentTrack(guildId) as Track | null;

        const embed = trackHandler.createSkipVoteEmbed(currentTrack, voteResult.voteCount, voteResult.required, SKIP_VOTE_TIMEOUT);
        const row = trackHandler.createSkipVoteButton(guildId, voteResult.voteCount, voteResult.required);

        const response = await interaction.reply({ embeds: [embed], components: [row], withResponse: true });
        const voteMessage = response?.resource?.message || await interaction.fetchReply();
        musicCache.setSkipVoteMessage(guildId, voteMessage);

        // Set timeout via VoteCache (single source of truth for vote state)
        const voteTimeout = setTimeout(async () => {
            try {
                musicService.endSkipVote(guildId);

                await voteMessage.edit({
                    embeds: [trackHandler.createInfoEmbed('⏱️ Vote Expired', 'Not enough votes to skip.', 'warning')],
                    components: []
                }).catch(() => {});
            } catch (error: unknown) {
                const err = error as { message?: string };
                logger.error('Button', `Skip vote timeout error: ${err.message}`);
            }
        }, SKIP_VOTE_TIMEOUT);
        musicCache.setSkipVoteTimeout(guildId, voteTimeout);
    },

    async handleButtonQueuePage(interaction: ButtonInteraction, guildId: string, pageAction: string): Promise<void> {
        try {
            await interaction.deferUpdate();

            const tracks = musicService.getQueueList(guildId) as Track[];
            const currentTrack = musicService.getCurrentTrack(guildId) as Track | null;
            const totalPages = Math.ceil(tracks.length / 10) || 1;
            const currentPage = Math.min(parseQueuePageFromFooter(interaction), totalPages);

            let nextPage = currentPage;
            switch (pageAction) {
                case 'first':
                    nextPage = 1;
                    break;
                case 'prev':
                    nextPage = Math.max(1, currentPage - 1);
                    break;
                case 'next':
                    nextPage = Math.min(totalPages, currentPage + 1);
                    break;
                case 'last':
                    nextPage = totalPages;
                    break;
                case 'info':
                default:
                    return;
            }

            const embed = trackHandler.createQueueListEmbed(tracks, currentTrack, {
                page: nextPage,
                loopMode: musicService.getLoopMode(guildId),
                isShuffled: musicService.isShuffled(guildId),
                volume: musicService.getVolume(guildId)
            });

            const row = trackHandler.createQueuePaginationButtons(guildId, nextPage, totalPages);
            await interaction.editReply({ embeds: [embed], components: [row] });
        } catch (error: unknown) {
            const err = error as { code?: number; message?: string };
            if (err.code === 10062 || err.code === 10008) {
                logger.debug('Button', 'Queue pagination interaction expired or message deleted, ignoring...');
            } else {
                logger.error('Button', `Queue pagination button error: ${err.message}`);
            }
        }
    },

    async handleButtonConfirm(interaction: ButtonInteraction, guildId: string, action: string, choice: string): Promise<void> {
        // Route longtrack to playHandler
        if (action === 'longtrack') {
            return await playHandler.handleLongTrackButton(interaction, guildId, choice);
        }
        
        try {
            await interaction.deferUpdate();
            
            const confirmed = choice === 'yes';
            
            switch (action) {
                case 'clear_queue':
                    if (confirmed) {
                        const queue = musicCache.getQueue(guildId);
                        if (queue) {
                            queue.tracks = [];
                            await interaction.editReply({
                                content: '✅ Queue has been cleared!',
                                embeds: [],
                                components: []
                            });
                        }
                    } else {
                        await interaction.editReply({
                            content: '❌ Action cancelled.',
                            embeds: [],
                            components: []
                        });
                    }
                    break;
                    
                case 'stop':
                    if (confirmed) {
                        await musicService.cleanup(guildId);
                        await interaction.editReply({
                            content: '⏹️ Music stopped and queue cleared.',
                            embeds: [],
                            components: []
                        });
                    } else {
                        await interaction.editReply({
                            content: '❌ Action cancelled.',
                            embeds: [],
                            components: []
                        });
                    }
                    break;
                    
                default:
                    await interaction.editReply({
                        content: confirmed ? '✅ Confirmed!' : '❌ Cancelled.',
                        embeds: [],
                        components: []
                    });
            }
        } catch (error: unknown) {
            const err = error as { message?: string };
            logger.error('Button', `Confirm button error: ${err.message}`);
        }
    }
};

export default buttonHandler;

