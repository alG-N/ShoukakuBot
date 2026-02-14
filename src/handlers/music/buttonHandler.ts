/**
 * Button Handler
 * Handles all button interactions for music controls
 * @module handlers/music/buttonHandler
 */

import { ButtonInteraction, TextChannel } from 'discord.js';
import { trackHandler, LoopMode } from './trackHandler.js';
import { playHandler } from './playHandler.js';
import musicCache from '../../cache/music/MusicCacheFacade.js';
import { checkSameVoiceChannel } from '../../middleware/voiceChannelCheck.js';
import { music } from '../../config/index.js';
import { logger } from '../../core/Logger.js';
import { musicFacade as musicService } from '../../services/music/core/MusicFacade.js';

// Use any for Track type - MusicFacade.Track and trackHandler.Track are different but runtime compatible
type Track = any;

const { minVotesRequired: MIN_VOTES_REQUIRED = 5 } = music.voting || {};
const SKIP_VOTE_TIMEOUT = 15000;
export interface NowPlayingOptions {
    volume: number;
    isPaused: boolean;
    loopMode: LoopMode;
    isShuffled: boolean;
    queueLength: number;
    nextTrack: Track | null;
    loopCount: number;
    voteSkipCount: number;
    voteSkipRequired: number;
    listenerCount: number;
}

export interface VoteResult {
    added: boolean;
    voteCount: number;
    required: number;
}

export interface VoteSkipStatus {
    count: number;
    required: number;
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
            case 'music_fav':
                return await this.handleButtonFavorite(interaction, guildId, parts[2]);
            case 'music_voteskip':
            case 'music_voteskip_add':
                return await this.handleButtonVoteSkip(interaction, guildId);
            case 'music_lyrics':
                return await this.handleButtonLyrics(interaction, guildId);
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

            await interaction.deferUpdate();
            
            await musicService.disableNowPlayingControls(guildId);
            
            const currentTrack = musicService.getCurrentTrack(guildId) as Track | null;
            const nextTrack = await musicService.skip(guildId);
            
            if (nextTrack) {
                await new Promise(resolve => setTimeout(resolve, 200));
                await musicService.sendNowPlayingEmbed(guildId);
            } else {
                const queue = musicCache.getQueue(guildId);
                if (queue?.textChannel) {
                    const channel = queue.textChannel as TextChannel;
                    await channel.send({
                        embeds: [trackHandler.createQueueFinishedEmbed(currentTrack)]
                    }).catch(() => {});
                }
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

        const embed = trackHandler.createQueueListEmbed(tracks, currentTrack, {
            loopMode: musicService.getLoopMode(guildId),
            isShuffled: musicService.isShuffled(guildId),
            volume: musicService.getVolume(guildId)
        });

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },

    async handleButtonFavorite(interaction: ButtonInteraction, guildId: string, targetUserId: string): Promise<void> {
        try {
            const currentTrack = musicService.getCurrentTrack(guildId) as Track | null;
            
            if (!currentTrack) {
                await interaction.reply({ content: '❌ Nothing is playing', ephemeral: true });
                return;
            }

            await interaction.deferUpdate();

            const userId = interaction.user.id;
            const isFavorited = await musicService.isFavorited(userId, currentTrack.url);

            if (isFavorited) {
                await musicService.removeFavorite(userId, currentTrack.url);
            } else {
                await musicService.addFavorite(userId, currentTrack);
            }

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
        } catch (error: unknown) {
            const err = error as { code?: number; message?: string };
            if (err.code === 10062 || err.code === 10008) {
                logger.debug('Button', 'Interaction expired or message deleted, ignoring...');
            } else {
                logger.error('Button', `Favorite button error: ${err.message}`);
            }
        }
    },

    async handleButtonLyrics(interaction: ButtonInteraction, guildId: string): Promise<void> {
        const currentTrack = musicService.getCurrentTrack(guildId) as Track | null;
        
        if (!currentTrack) {
            await interaction.reply({ content: '❌ Nothing is playing', ephemeral: true });
            return;
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const lyrics = await this.fetchLyrics(currentTrack.title, currentTrack.author);
            
            if (!lyrics) {
                await interaction.editReply({
                    embeds: [trackHandler.createErrorEmbed(`No lyrics found for **${currentTrack.title}**`)]
                });
                return;
            }

            const embed = trackHandler.createLyricsEmbed(currentTrack, lyrics);
            await interaction.editReply({ embeds: [embed] });
        } catch (error: unknown) {
            const err = error as { message?: string };
            logger.error('Button', `Lyrics fetch error: ${err.message}`);
            await interaction.editReply({
                embeds: [trackHandler.createErrorEmbed('Failed to fetch lyrics. Please try again.')]
            });
        }
    },

    async fetchLyrics(title: string, artist?: string): Promise<string | null> {
        try {
            let cleanTitle = title;
            let cleanArtist = artist || '';
            
            if (title.includes(' - ')) {
                const parts = title.split(' - ');
                if (parts.length >= 2) {
                    cleanArtist = parts[0].trim();
                    cleanTitle = parts.slice(1).join(' - ').trim();
                }
            }
            
            cleanTitle = cleanTitle
                .replace(/\(.*?(official|video|lyrics|audio|music|hd|4k|visualizer|live|remix|cover|version|edit).*?\)/gi, '')
                .replace(/\[.*?(official|video|lyrics|audio|music|hd|4k|visualizer|live|remix|cover|version|edit).*?\]/gi, '')
                .replace(/\(feat\.?.*?\)/gi, '')
                .replace(/\[feat\.?.*?\]/gi, '')
                .replace(/ft\.?\s+.+$/gi, '')
                .replace(/feat\.?\s+.+$/gi, '')
                .replace(/official|video|lyrics|audio|hd|4k|visualizer/gi, '')
                .replace(/\s+/g, ' ')
                .trim();
            
            cleanArtist = cleanArtist
                ?.replace(/\s*-\s*Topic$/i, '')
                ?.replace(/VEVO$/i, '')
                ?.replace(/Official$/i, '')
                ?.trim() || '';

            logger.debug('Lyrics', `Searching for: "${cleanArtist}" - "${cleanTitle}"`);
            
            // Try LRCLIB first
            const lrclibResult = await this.fetchFromLrclib(cleanArtist, cleanTitle);
            if (lrclibResult) return lrclibResult;

            // Fallback to lyrics.ovh
            if (cleanArtist) {
                const response = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(cleanArtist)}/${encodeURIComponent(cleanTitle)}`);
                
                if (response.ok) {
                    const data = await response.json() as { lyrics?: string };
                    if (data.lyrics) {
                        return data.lyrics;
                    }
                }
            }

            const simplifiedTitle = cleanTitle
                .replace(/\(.*?\)/g, '')
                .replace(/\[.*?\]/g, '')
                .trim();
            
            if (simplifiedTitle !== cleanTitle) {
                const lrclibSimplified = await this.fetchFromLrclib(cleanArtist, simplifiedTitle);
                if (lrclibSimplified) return lrclibSimplified;
            }
            
            if (cleanArtist && simplifiedTitle !== cleanTitle) {
                const fallback1 = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(cleanArtist)}/${encodeURIComponent(simplifiedTitle)}`);
                if (fallback1.ok) {
                    const data = await fallback1.json() as { lyrics?: string };
                    if (data.lyrics) {
                        return data.lyrics;
                    }
                }
            }

            if (artist && artist !== cleanArtist) {
                const origArtist = artist.replace(/\s*-\s*Topic$/i, '').replace(/VEVO$/i, '').trim();
                const fallback2 = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(origArtist)}/${encodeURIComponent(simplifiedTitle)}`);
                if (fallback2.ok) {
                    const data = await fallback2.json() as { lyrics?: string };
                    if (data.lyrics) {
                        return data.lyrics;
                    }
                }
            }

            return null;
        } catch (error: unknown) {
            const err = error as { message?: string };
            logger.error('Lyrics', `Lyrics API error: ${err.message}`);
            return null;
        }
    },

    async fetchFromLrclib(artist: string, title: string): Promise<string | null> {
        try {
            const url = new URL('https://lrclib.net/api/get');
            url.searchParams.set('track_name', title);
            if (artist) url.searchParams.set('artist_name', artist);
            
            const response = await fetch(url.toString(), {
                headers: { 'User-Agent': 'FumoBOT/1.0' }
            });
            
            if (response.ok) {
                const data = await response.json() as { plainLyrics?: string; syncedLyrics?: string };
                if (data.plainLyrics) return data.plainLyrics;
                if (data.syncedLyrics) {
                    return data.syncedLyrics.replace(/\[\d{2}:\d{2}\.\d{2,3}\]/g, '').trim();
                }
            }
            return null;
        } catch {
            return null;
        }
    },

    async handleButtonVoteSkip(interaction: ButtonInteraction, guildId: string): Promise<void> {
        const queue = musicCache.getQueue(guildId);
        const listenerCount = musicService.getListenerCount(guildId, interaction.guild);

        if (listenerCount < MIN_VOTES_REQUIRED) {
            await interaction.deferUpdate();
            
            const skippedTrack = musicService.getCurrentTrack(guildId) as Track | null;
            await musicService.skip(guildId);
            
            const channel = interaction.channel as TextChannel;
            await channel.send({
                embeds: [trackHandler.createInfoEmbed(
                    '⏭️ Track Skipped',
                    skippedTrack ? `**${skippedTrack.title}** was skipped by ${interaction.user.tag}` : `Track skipped by ${interaction.user.tag}`,
                    'success'
                )]
            }).catch(() => {});
            
            return;
        }

        if (musicService.isSkipVoteActive(guildId)) {
            const result = musicService.addSkipVote(guildId, interaction.user.id) as VoteResult;
            
            if (!result.added) {
                await interaction.reply({ content: '❌ You already voted!', ephemeral: true });
                return;
            }

            if (musicService.hasEnoughSkipVotes(guildId)) {
                musicService.endSkipVote(guildId);
                const skippedTrack = musicService.getCurrentTrack(guildId) as Track | null;
                await musicService.skip(guildId);
                
                await interaction.update({
                    embeds: [trackHandler.createInfoEmbed('⏭️ Skipped!', `**${skippedTrack?.title || 'Track'}** was skipped by vote!`, 'success')],
                    components: []
                });
                return;
            }

            const required = musicCache.getRequiredVotes(musicCache.getSkipVoteListenerCount(guildId) || listenerCount);
            await interaction.reply({
                content: `🗳️ Vote added! **${result.voteCount}/${required}**`,
                ephemeral: true
            });
            return;
        }

        // Start new vote
        const voteResult = musicService.startSkipVote(guildId, interaction.user.id, listenerCount) as VoteResult;
        const currentTrack = musicService.getCurrentTrack(guildId) as Track | null;

        const embed = trackHandler.createSkipVoteEmbed(currentTrack, voteResult.voteCount, voteResult.required, SKIP_VOTE_TIMEOUT);
        const row = trackHandler.createSkipVoteButton(guildId, voteResult.voteCount, voteResult.required);

        await interaction.reply({ embeds: [embed], components: [row] });

        // Set timeout via VoteCache (single source of truth for vote state)
        const voteTimeout = setTimeout(async () => {
            try {
                musicService.endSkipVote(guildId);
            } catch (error: unknown) {
                const err = error as { message?: string };
                logger.error('Button', `Skip vote timeout error: ${err.message}`);
            }
        }, SKIP_VOTE_TIMEOUT);
        musicCache.setSkipVoteTimeout(guildId, voteTimeout);
    },

    async handleButtonQueuePage(interaction: ButtonInteraction, guildId: string, pageAction: string): Promise<void> {
        await interaction.deferUpdate();
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

