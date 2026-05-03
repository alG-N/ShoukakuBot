/**
 * Play Handler
 * Handles play, playlist, and related functionality
 * @module handlers/music/playHandler
 */

import { ChatInputCommandInteraction, Guild, ButtonInteraction, TextChannel } from 'discord.js';
import { trackHandler } from './trackHandler.js';
import musicCache from '../../cache/music/MusicCacheFacade.js';
import { checkVoiceChannelSync, checkVoicePermissionsSync } from '../../middleware/voiceChannelCheck.js';
import { music } from '../../config/index.js';
import { musicFacade as musicService } from '../../services/music/core/musicFacade.js';
import logger from '../../core/observability/Logger.js';
import type { Track } from '../../types/music/track.js';
import type { VoteSkipStatus } from '../../types/music/vote.js';
import type { PendingLongTrack, PlaylistData } from '../../types/music/handlers.js';

const CONFIRMATION_TIMEOUT = music.timeouts?.confirmation || 60000;
// Store pending long track confirmations (internal only — not used externally despite prior export)
const pendingLongTracks = new Map<string, PendingLongTrack>();
export const playHandler = {
    
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
            const prefs = await musicService.getPreferences(userId);
            if (trackData.lengthSeconds > prefs.maxTrackDuration) {
                return await this.handleLongTrackConfirmation(interaction, trackData, guildId, prefs.maxTrackDuration);
            }

            // Add track
            const currentTrack = musicService.getCurrentTrack(guildId) as Track | null;

            musicService.addTrack(guildId, trackData);

            // Add to user history
            await musicService.addToHistory(userId, trackData);

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
                const embed = trackHandler.createQueuedEmbed(trackData, position, interaction.user);

                await interaction.editReply({ embeds: [embed] });
                
                await this.refreshNowPlayingMessage(guildId, interaction.user.id, interaction.guild);
            }
        } catch (error) {
            logger.error('Play', `Error: ${(error as Error).message}`);
            let errorMessage = error instanceof Error ? error.message : 'Failed to play track';
            
            // Provide user-friendly messages for known errors
            if (errorMessage === 'NO_PLAYER') {
                errorMessage = 'Failed to connect to the music player. Please try again.';
                // Clean up orphaned connection/queue state
                musicService.cleanup(guildId).catch(() => {});
            } else if (errorMessage === 'NO_RESULTS' && query.includes('spotify.com')) {
                errorMessage = 'Could not resolve this Spotify track. The track may be unavailable or region-restricted.';
            } else if (errorMessage === 'NO_RESULTS') {
                errorMessage = `No results found for: \`${query}\``;
            } else if (/bad request|rest request failed/i.test(errorMessage)) {
                errorMessage = 'Music server returned an error. Please try again in a moment.';
                // Clean up so next attempt starts fresh
                musicService.cleanup(guildId).catch(() => {});
            }
            
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

            // If the URL contains an index parameter, rotate the playlist so
            // the track at that position plays first (e.g. &index=12 → start from track 12)
            if (!shouldShuffle) {
                try {
                    const url = new URL(query);
                    const indexParam = url.searchParams.get('index');
                    if (indexParam) {
                        const startIndex = Math.max(0, parseInt(indexParam, 10) - 1);
                        if (!isNaN(startIndex) && startIndex > 0 && startIndex < tracks.length) {
                            tracks = [...tracks.slice(startIndex), ...tracks.slice(0, startIndex)];
                        }
                    }
                } catch {
                    // Not a valid URL or no index param — use default order
                }
            }

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

                    // Show playlist info as the interaction reply
                    const playlistEmbed = trackHandler.createPlaylistEmbed(
                        playlistData.name,
                        playlistData.tracks.length,
                        interaction.user,
                        nextTrack
                    );
                    await interaction.editReply({ embeds: [playlistEmbed] });

                    // Send a proper now-playing embed with controls in the channel
                    const listenerCount = musicService.getListenerCount(guildId, interaction.guild!);
                    const voteSkipStatus = musicCache.getVoteSkipStatus(guildId, listenerCount) as VoteSkipStatus;

                    const nowPlayingEmbed = trackHandler.createNowPlayingEmbed(nextTrack, {
                        volume: musicService.getVolume(guildId),
                        queueLength: musicService.getQueueLength(guildId),
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

                    const channel = interaction.channel;
                    if (channel && 'send' in channel) {
                        const nowPlayingMsg = await channel.send({ embeds: [nowPlayingEmbed], components: rows });
                        musicService.setNowPlayingMessage(guildId, nowPlayingMsg);
                    }

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
            logger.error('Play', `Playlist error: ${(error as Error).message}`);
            let errorMessage = error instanceof Error ? error.message : 'Failed to load playlist';
            
            // User-friendly messages for Spotify playlist errors
            if (errorMessage === 'NO_RESULTS' && query.includes('spotify.com')) {
                errorMessage = 'Could not load this Spotify playlist. The playlist may be private, empty, or the Spotify service may be temporarily unavailable.';
            } else if (errorMessage === 'NO_RESULTS') {
                errorMessage = 'No tracks found in this playlist.';
            } else if (errorMessage === 'NOT_A_PLAYLIST') {
                errorMessage = 'This URL does not appear to be a valid playlist.';
            }
            
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
            logger.error('Play', `Error handling long track button: ${(error as Error).message}`);
            await interaction.editReply({
                content: '❌ An error occurred. Please try again.',
                embeds: [],
                components: []
            }).catch(() => {});
        }
    },

    async refreshNowPlayingMessage(guildId: string, userId: string, guild: Guild | null = null): Promise<void> {
        try {
            const nowPlayingRef = musicService.getNowPlayingMessageRef(guildId);
            if (!nowPlayingRef) return;

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

            // Resolve the MessageRef to a full Message, then edit
            const channel = (queue as any)?.textChannel as TextChannel | null;
            if (channel && 'messages' in channel) {
                const msg = await channel.messages.fetch(nowPlayingRef.messageId).catch(() => null);
                if (msg) {
                    await msg.edit({ embeds: [embed], components: rows }).catch(() => {});
                }
            }
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


