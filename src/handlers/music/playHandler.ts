/**
 * Play Handler
 * Handles play, playlist, and related functionality
 * @module handlers/music/playHandler
 */

import { ChatInputCommandInteraction, MessageFlags, Guild, ButtonInteraction, TextChannel } from 'discord.js';
import { trackHandler } from './trackHandler.js';
import musicCache from '../../cache/music/MusicCacheFacade.js';
import { checkVoiceChannelSync, checkVoicePermissionsSync } from '../../middleware/voiceChannelCheck.js';
import { music } from '../../config/index.js';
import { musicFacade as musicService } from '../../services/music/MusicFacade.js';

// Use any for Track type - different but runtime compatible
type Track = any;

// Import voting constants from config
const { minVotesRequired: MIN_VOTES_REQUIRED = 5 } = music.voting || {};
const CONFIRMATION_TIMEOUT = music.timeouts?.confirmation || 60000;
export interface PendingLongTrack {
    trackData: Track;
    guildId: string;
    userId: string;
    channelId: string;
    guild: Guild;
    expiresAt: number;
}

export interface PlaylistData {
    name: string;
    tracks: Track[];
}

export interface VoteSkipStatus {
    count: number;
    required: number;
}
// Store pending long track confirmations
export const pendingLongTracks = new Map<string, PendingLongTrack>();
export const playHandler = {
    // Expose pendingLongTracks for buttonHandler
    pendingLongTracks,
    
    async handlePlay(interaction: ChatInputCommandInteraction, guildId: string, userId: string): Promise<void> {
        // IMMEDIATELY defer to prevent interaction timeout (3s limit)
        await interaction.deferReply();
        
        // Voice channel checks
        const voiceCheck = checkVoiceChannelSync(interaction);
        if (!voiceCheck.valid) {
            await interaction.editReply({
                embeds: [trackHandler.createInfoEmbed("❌ No Voice Channel", voiceCheck.error!)],
            });
            return;
        }

        const permCheck = checkVoicePermissionsSync(interaction);
        if (!permCheck.valid) {
            await interaction.editReply({
                embeds: [trackHandler.createInfoEmbed("❌ Missing Permissions", permCheck.error!)],
            });
            return;
        }

        // Check Lavalink
        if (!musicService.isLavalinkReady()) {
            let ready = false;
            for (let i = 0; i < 6; i++) {
                await new Promise(r => setTimeout(r, 500));
                if (musicService.isLavalinkReady()) {
                    ready = true;
                    break;
                }
            }
            
            if (!ready) {
                await interaction.editReply({
                    embeds: [trackHandler.createErrorEmbed('Music service is not available. Please try again later.')]
                });
                return;
            }
        }

        const query = interaction.options.getString('query')!;
        const shouldShuffle = interaction.options.getBoolean('shuffle') || false;
        const priority = interaction.options.getBoolean('priority') || false;

        try {
            // Connect to voice
            await musicService.connect(interaction);

            // Check if playlist
            if (this.isPlaylistUrl(query)) {
                return await this.handlePlaylistAdd(interaction, query, guildId, shouldShuffle);
            }

            // Single track - search returns Result<{ tracks: Track[] }>
            const searchResult = await musicService.search(query);
            
            // Handle Result wrapper - Result uses .data not .value
            let trackData: Track | null = null;
            if (searchResult && typeof searchResult === 'object') {
                // If it's a Result object with isOk() method
                if (typeof searchResult.isOk === 'function') {
                    if (searchResult.isOk() && searchResult.data?.tracks?.[0]) {
                        trackData = searchResult.data.tracks[0];
                    }
                } else if (searchResult.tracks?.[0]) {
                    // Direct result with tracks array
                    trackData = searchResult.tracks[0];
                } else if (searchResult.track || searchResult.encoded) {
                    // Direct track object from LavalinkService
                    trackData = searchResult;
                }
            }

            if (!trackData) {
                await interaction.editReply({
                    embeds: [trackHandler.createErrorEmbed(`No results found for: \`${query}\``)]
                });
                return;
            }

            // Check duration
            const prefs = musicService.getPreferences(userId);
            if (trackData.lengthSeconds > prefs.maxTrackDuration) {
                return await this.handleLongTrackConfirmation(interaction, trackData, guildId, prefs.maxTrackDuration);
            }

            // Add track
            const currentTrack = musicService.getCurrentTrack(guildId) as Track | null;
            
            if (priority && currentTrack) {
                // Priority requires vote if 5+ listeners
                const listenerCount = musicService.getListenerCount(guildId, interaction.guild);
                if (listenerCount >= MIN_VOTES_REQUIRED) {
                    return await this.handlePriorityVote(interaction, trackData, guildId);
                }
                musicService.addTrackToFront(guildId, trackData);
            } else {
                musicService.addTrack(guildId, trackData);
            }

            // Add to user history
            musicService.addToHistory(userId, trackData);

            // Start playing if nothing is playing
            if (!currentTrack) {
                const queue = musicService.getQueueList(guildId) as Track[];
                const nextTrack = queue[0];
                if (nextTrack) {
                    musicService.removeTrack(guildId, 0);
                    await musicService.playTrack(guildId, nextTrack);

                    const listenerCount = musicService.getListenerCount(guildId, interaction.guild!);
                    const voteSkipStatus = musicCache.getVoteSkipStatus(guildId, listenerCount) as VoteSkipStatus;

                    const embed = trackHandler.createNowPlayingEmbed(nextTrack, {
                        volume: musicService.getVolume(guildId),
                        queueLength: musicService.getQueueLength(guildId),
                        voteSkipCount: voteSkipStatus.count,
                        voteSkipRequired: voteSkipStatus.required,
                        listenerCount: listenerCount
                    });
                    const rows = trackHandler.createControlButtons(guildId, {
                        trackUrl: nextTrack.url,
                        userId,
                        autoPlay: musicService.isAutoPlayEnabled(guildId),
                        listenerCount: listenerCount
                    });

                    const message = await interaction.editReply({ embeds: [embed], components: rows });
                    musicService.setNowPlayingMessage(guildId, message);
                    
                    musicService.startVCMonitor(guildId, interaction.guild!);
                }
            } else {
                const position = musicService.getQueueLength(guildId);
                const embed = priority && position === 1
                    ? trackHandler.createPriorityQueuedEmbed(trackData, interaction.user)
                    : trackHandler.createQueuedEmbed(trackData, position, interaction.user);

                await interaction.editReply({ embeds: [embed] });
                
                await this.refreshNowPlayingMessage(guildId, interaction.user.id, interaction.guild);
            }
        } catch (error) {
            console.error('[Play Error]', error);
            const errorMessage = error instanceof Error ? error.message : 'Failed to play track';
            await interaction.editReply({
                embeds: [trackHandler.createErrorEmbed(errorMessage)]
            });
        }
    },

    async handlePlaylistAdd(interaction: ChatInputCommandInteraction, query: string, guildId: string, shouldShuffle: boolean): Promise<void> {
        try {
            const playlistData = await musicService.searchPlaylist(query) as PlaylistData | null;

            if (!playlistData || playlistData.tracks.length === 0) {
                await interaction.editReply({
                    embeds: [trackHandler.createErrorEmbed('No tracks found in playlist')]
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

            musicService.addTracks(guildId, tracks);

            const currentTrack = musicService.getCurrentTrack(guildId) as Track | null;
            if (!currentTrack) {
                const queue = musicService.getQueueList(guildId) as Track[];
                const nextTrack = queue[0];
                if (nextTrack) {
                    musicService.removeTrack(guildId, 0);
                    await musicService.playTrack(guildId, nextTrack);

                    const embed = trackHandler.createPlaylistEmbed(
                        playlistData.name,
                        playlistData.tracks.length,
                        interaction.user,
                        nextTrack
                    );

                    const message = await interaction.editReply({ embeds: [embed] });
                    musicService.setNowPlayingMessage(guildId, message);
                    musicService.startVCMonitor(guildId, interaction.guild!);
                }
            } else {
                const embed = trackHandler.createPlaylistEmbed(
                    playlistData.name,
                    playlistData.tracks.length,
                    interaction.user,
                    tracks[0]
                );
                await interaction.editReply({ embeds: [embed] });
                
                await this.refreshNowPlayingMessage(guildId, interaction.user.id, interaction.guild);
            }
        } catch (error) {
            console.error('[Playlist Error]', error);
            const errorMessage = error instanceof Error ? error.message : 'Failed to load playlist';
            await interaction.editReply({
                embeds: [trackHandler.createErrorEmbed(errorMessage)]
            });
        }
    },

    async handleLongTrackConfirmation(interaction: ChatInputCommandInteraction, trackData: Track, guildId: string, maxDuration: number): Promise<void> {
        const confirmId = `${guildId}_${Date.now()}`;
        
        pendingLongTracks.set(confirmId, {
            trackData,
            guildId,
            userId: interaction.user.id,
            channelId: interaction.channel?.id || '',
            guild: interaction.guild!,
            expiresAt: Date.now() + CONFIRMATION_TIMEOUT
        });
        
        setTimeout(() => {
            pendingLongTracks.delete(confirmId);
        }, CONFIRMATION_TIMEOUT + 1000);
        
        const embed = trackHandler.createLongVideoConfirmEmbed(trackData, maxDuration);
        const row = trackHandler.createConfirmButtons(confirmId, 'longtrack');

        await interaction.editReply({ embeds: [embed], components: [row] });
    },

    async handleLongTrackButton(interaction: ButtonInteraction, confirmId: string, answer: string): Promise<void> {
        const pending = pendingLongTracks.get(confirmId);
        
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
        
        pendingLongTracks.delete(confirmId);
        
        const { trackData, guildId, guild } = pending;
        
        try {
            if (answer === 'yes') {
                await interaction.deferUpdate();
                
                musicService.addTrack(guildId, trackData);
                
                const currentTrack = musicService.getCurrentTrack(guildId) as Track | null;
                if (!currentTrack) {
                    const queue = musicService.getQueueList(guildId) as Track[];
                    const nextTrack = queue[0];
                    if (nextTrack) {
                        musicService.removeTrack(guildId, 0);
                        
                        await interaction.editReply({ 
                            content: '✅ **Track added!** Starting playback...',
                            embeds: [], 
                            components: [] 
                        });

                        await musicService.playTrack(guildId, nextTrack);

                        const queueList = musicService.getQueueList(guildId) as Track[];
                        const listenerCount = musicService.getListenerCount(guildId, guild);
                        const voteSkipStatus = musicCache.getVoteSkipStatus(guildId, listenerCount) as VoteSkipStatus;

                        const embed = trackHandler.createNowPlayingEmbed(nextTrack, {
                            volume: musicService.getVolume(guildId),
                            queueLength: queueList.length,
                            nextTrack: queueList[0] || null,
                            voteSkipCount: voteSkipStatus.count,
                            voteSkipRequired: voteSkipStatus.required,
                            listenerCount: listenerCount
                        });
                        const rows = trackHandler.createControlButtons(guildId, {
                            trackUrl: nextTrack.url,
                            userId: interaction.user.id,
                            autoPlay: musicService.isAutoPlayEnabled(guildId),
                            listenerCount: listenerCount
                        });

                        const channel = interaction.channel as TextChannel;
                        const nowPlayingMessage = await channel.send({ embeds: [embed], components: rows });
                        musicService.setNowPlayingMessage(guildId, nowPlayingMessage);
                        
                        musicService.startVCMonitor(guildId, guild);
                    }
                } else {
                    const position = musicService.getQueueLength(guildId);
                    const queuedEmbed = trackHandler.createQueuedEmbed(trackData, position, interaction.user);
                    await interaction.editReply({ embeds: [queuedEmbed], components: [] });
                }
            } else {
                await interaction.update({
                    embeds: [trackHandler.createInfoEmbed('❌ Cancelled', 'Track was not added.')],
                    components: []
                });
            }
        } catch (error) {
            console.error('[Play] Error handling long track button:', error);
            await interaction.editReply({
                content: '❌ An error occurred. Please try again.',
                embeds: [],
                components: []
            }).catch(() => {});
        }
    },

    async handlePriorityVote(interaction: ChatInputCommandInteraction, trackData: Track, guildId: string): Promise<void> {
        const embed = trackHandler.createInfoEmbed(
            '🗳️ Vote Required',
            `Priority play requires ${MIN_VOTES_REQUIRED} votes.\nThis feature is coming soon!`
        );
        await interaction.editReply({ embeds: [embed] });
    },

    async refreshNowPlayingMessage(guildId: string, userId: string, guild: Guild | null = null): Promise<void> {
        try {
            const nowPlayingMsg = musicService.getNowPlayingMessage(guildId);
            if (!nowPlayingMsg) return;

            const currentTrack = musicService.getCurrentTrack(guildId) as Track | null;
            if (!currentTrack) return;

            const queue = musicCache.getQueue(guildId);
            const queueList = musicService.getQueueList(guildId) as Track[];
            const listenerCount = guild ? musicService.getListenerCount(guildId, guild) : 0;
            const voteSkipStatus = musicCache.getVoteSkipStatus(guildId, listenerCount) as VoteSkipStatus;

            const embed = trackHandler.createNowPlayingEmbed(currentTrack, {
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
            });

            const rows = trackHandler.createControlButtons(guildId, {
                isPaused: queue?.isPaused || false,
                loopMode: musicService.getLoopMode(guildId),
                isShuffled: musicService.isShuffled(guildId),
                autoPlay: musicService.isAutoPlayEnabled(guildId),
                trackUrl: currentTrack.url,
                userId: userId,
                listenerCount: listenerCount
            });

            await nowPlayingMsg.edit({ embeds: [embed], components: rows }).catch(() => {});
        } catch {
            // Silently ignore errors
        }
    },

    isPlaylistUrl(query: string): boolean {
        if (query.includes('youtube.com') && query.includes('list=')) return true;
        if (query.includes('spotify.com/playlist/')) return true;
        if (query.includes('spotify.com/album/')) return true;
        return false;
    }
};

export default playHandler;

