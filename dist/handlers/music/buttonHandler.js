"use strict";
/**
 * Button Handler
 * Handles all button interactions for music controls
 * @module handlers/music/buttonHandler
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buttonHandler = void 0;
const trackHandler_js_1 = require("./trackHandler.js");
const playHandler_js_1 = require("./playHandler.js");
const MusicCacheFacade_js_1 = __importDefault(require("../../cache/music/MusicCacheFacade.js"));
const voiceChannelCheck_js_1 = require("../../middleware/voiceChannelCheck.js");
const index_js_1 = require("../../config/index.js");
const Logger_js_1 = require("../../core/Logger.js");
const MusicFacade_js_1 = require("../../services/music/MusicFacade.js");
const { minVotesRequired: MIN_VOTES_REQUIRED = 5 } = index_js_1.music.voting || {};
const SKIP_VOTE_TIMEOUT = 15000;
/**
 * Build now playing embed options consistently
 */
function buildNowPlayingOptions(guildId, interaction) {
    const queue = MusicCacheFacade_js_1.default.getQueue(guildId);
    const queueList = MusicFacade_js_1.musicFacade.getQueueList(guildId);
    const listenerCount = MusicFacade_js_1.musicFacade.getListenerCount(guildId, interaction.guild);
    const voteSkipStatus = MusicCacheFacade_js_1.default.getVoteSkipStatus(guildId, listenerCount);
    return {
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
    };
}
exports.buttonHandler = {
    async handleButton(interaction) {
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
            const botChannelId = MusicFacade_js_1.musicFacade.getVoiceChannelId(guildId);
            if (!await (0, voiceChannelCheck_js_1.checkSameVoiceChannel)(interaction, botChannelId))
                return;
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
                Logger_js_1.logger.warn('Button', `Unknown music button: ${action}`);
        }
    },
    async handleButtonPause(interaction, guildId) {
        try {
            await interaction.deferUpdate();
            await MusicFacade_js_1.musicFacade.togglePause(guildId);
            const currentTrack = MusicFacade_js_1.musicFacade.getCurrentTrack(guildId);
            if (currentTrack) {
                const options = buildNowPlayingOptions(guildId, interaction);
                const embed = trackHandler_js_1.trackHandler.createNowPlayingEmbed(currentTrack, options);
                const rows = trackHandler_js_1.trackHandler.createControlButtons(guildId, {
                    isPaused: options.isPaused,
                    loopMode: options.loopMode,
                    isShuffled: options.isShuffled,
                    autoPlay: MusicFacade_js_1.musicFacade.isAutoPlayEnabled(guildId),
                    trackUrl: currentTrack.url,
                    userId: interaction.user.id,
                    listenerCount: options.listenerCount
                });
                await interaction.editReply({ embeds: [embed], components: rows });
            }
        }
        catch (error) {
            const err = error;
            if (err.code === 10062 || err.code === 10008) {
                Logger_js_1.logger.debug('Button', 'Interaction expired or message deleted, ignoring...');
            }
            else {
                Logger_js_1.logger.error('Button', `Pause button error: ${err.message}`);
            }
        }
    },
    async handleButtonStop(interaction, guildId) {
        try {
            await interaction.deferUpdate();
            await MusicFacade_js_1.musicFacade.cleanup(guildId);
            try {
                await interaction.editReply({
                    embeds: [trackHandler_js_1.trackHandler.createStoppedByUserEmbed(interaction.user)],
                    components: []
                });
            }
            catch (editError) {
                const err = editError;
                if (err.code === 10008 || err.code === 10062) {
                    try {
                        const channel = interaction.channel;
                        await channel?.send({
                            embeds: [trackHandler_js_1.trackHandler.createStoppedByUserEmbed(interaction.user)]
                        });
                    }
                    catch {
                        // Channel might not be accessible
                    }
                }
            }
        }
        catch (error) {
            const err = error;
            Logger_js_1.logger.error('Button', `Stop button error: ${err.message}`);
            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: 'Playback stopped.', ephemeral: true });
                }
            }
            catch {
                // Ignore if we can't respond
            }
        }
    },
    async handleButtonSkip(interaction, guildId) {
        try {
            const listenerCount = MusicFacade_js_1.musicFacade.getListenerCount(guildId, interaction.guild);
            if (listenerCount >= MIN_VOTES_REQUIRED) {
                return await this.handleButtonVoteSkip(interaction, guildId);
            }
            await interaction.deferUpdate();
            await MusicFacade_js_1.musicFacade.disableNowPlayingControls(guildId);
            const currentTrack = MusicFacade_js_1.musicFacade.getCurrentTrack(guildId);
            const nextTrack = await MusicFacade_js_1.musicFacade.skip(guildId);
            if (nextTrack) {
                await new Promise(resolve => setTimeout(resolve, 200));
                await MusicFacade_js_1.musicFacade.sendNowPlayingEmbed(guildId);
            }
            else {
                const queue = MusicCacheFacade_js_1.default.getQueue(guildId);
                if (queue?.textChannel) {
                    const channel = queue.textChannel;
                    await channel.send({
                        embeds: [trackHandler_js_1.trackHandler.createQueueFinishedEmbed(currentTrack)]
                    }).catch(() => { });
                }
            }
        }
        catch (error) {
            const err = error;
            Logger_js_1.logger.error('Button', `Skip button error: ${err.message}`);
        }
    },
    async handleButtonLoop(interaction, guildId) {
        try {
            await interaction.deferUpdate();
            MusicFacade_js_1.musicFacade.toggleLoop(guildId);
            const currentTrack = MusicFacade_js_1.musicFacade.getCurrentTrack(guildId);
            if (currentTrack) {
                const options = buildNowPlayingOptions(guildId, interaction);
                const embed = trackHandler_js_1.trackHandler.createNowPlayingEmbed(currentTrack, options);
                const rows = trackHandler_js_1.trackHandler.createControlButtons(guildId, {
                    isPaused: options.isPaused,
                    loopMode: options.loopMode,
                    isShuffled: options.isShuffled,
                    autoPlay: MusicFacade_js_1.musicFacade.isAutoPlayEnabled(guildId),
                    trackUrl: currentTrack.url,
                    userId: interaction.user.id,
                    listenerCount: options.listenerCount
                });
                await interaction.editReply({ embeds: [embed], components: rows });
            }
        }
        catch (error) {
            const err = error;
            if (err.code === 10062 || err.code === 10008) {
                Logger_js_1.logger.debug('Button', 'Interaction expired or message deleted, ignoring...');
            }
            else {
                Logger_js_1.logger.error('Button', `Loop button error: ${err.message}`);
            }
        }
    },
    async handleButtonShuffle(interaction, guildId) {
        try {
            await interaction.deferUpdate();
            MusicFacade_js_1.musicFacade.toggleShuffle(guildId);
            const currentTrack = MusicFacade_js_1.musicFacade.getCurrentTrack(guildId);
            if (currentTrack) {
                const options = buildNowPlayingOptions(guildId, interaction);
                const embed = trackHandler_js_1.trackHandler.createNowPlayingEmbed(currentTrack, options);
                const rows = trackHandler_js_1.trackHandler.createControlButtons(guildId, {
                    isPaused: options.isPaused,
                    loopMode: options.loopMode,
                    isShuffled: options.isShuffled,
                    autoPlay: MusicFacade_js_1.musicFacade.isAutoPlayEnabled(guildId),
                    trackUrl: currentTrack.url,
                    userId: interaction.user.id,
                    listenerCount: options.listenerCount
                });
                await interaction.editReply({ embeds: [embed], components: rows });
            }
        }
        catch (error) {
            const err = error;
            if (err.code === 10062 || err.code === 10008) {
                Logger_js_1.logger.debug('Button', 'Interaction expired or message deleted, ignoring...');
            }
            else {
                Logger_js_1.logger.error('Button', `Shuffle button error: ${err.message}`);
            }
        }
    },
    async handleButtonAutoplay(interaction, guildId) {
        try {
            await interaction.deferUpdate();
            const isEnabled = MusicFacade_js_1.musicFacade.toggleAutoPlay(guildId);
            const currentTrack = MusicFacade_js_1.musicFacade.getCurrentTrack(guildId);
            if (currentTrack) {
                const options = buildNowPlayingOptions(guildId, interaction);
                const embed = trackHandler_js_1.trackHandler.createNowPlayingEmbed(currentTrack, options);
                const rows = trackHandler_js_1.trackHandler.createControlButtons(guildId, {
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
        }
        catch (error) {
            const err = error;
            if (err.code === 10062 || err.code === 10008) {
                Logger_js_1.logger.debug('Button', 'Interaction expired or message deleted, ignoring...');
            }
            else {
                Logger_js_1.logger.error('Button', `Autoplay button error: ${err.message}`);
            }
        }
    },
    async handleButtonVolume(interaction, guildId, delta) {
        try {
            await interaction.deferUpdate();
            await MusicFacade_js_1.musicFacade.adjustVolume(guildId, delta);
            const currentTrack = MusicFacade_js_1.musicFacade.getCurrentTrack(guildId);
            if (currentTrack) {
                const options = buildNowPlayingOptions(guildId, interaction);
                const embed = trackHandler_js_1.trackHandler.createNowPlayingEmbed(currentTrack, options);
                const rows = trackHandler_js_1.trackHandler.createControlButtons(guildId, {
                    isPaused: options.isPaused,
                    loopMode: options.loopMode,
                    isShuffled: options.isShuffled,
                    autoPlay: MusicFacade_js_1.musicFacade.isAutoPlayEnabled(guildId),
                    trackUrl: currentTrack.url,
                    userId: interaction.user.id,
                    listenerCount: options.listenerCount
                });
                await interaction.editReply({ embeds: [embed], components: rows });
            }
        }
        catch (error) {
            const err = error;
            if (err.code === 10062 || err.code === 10008) {
                Logger_js_1.logger.debug('Button', 'Interaction expired or message deleted, ignoring...');
            }
            else {
                Logger_js_1.logger.error('Button', `Volume button error: ${err.message}`);
            }
        }
    },
    async handleButtonQueue(interaction, guildId) {
        const tracks = MusicFacade_js_1.musicFacade.getQueueList(guildId);
        const currentTrack = MusicFacade_js_1.musicFacade.getCurrentTrack(guildId);
        const embed = trackHandler_js_1.trackHandler.createQueueListEmbed(tracks, currentTrack, {
            loopMode: MusicFacade_js_1.musicFacade.getLoopMode(guildId),
            isShuffled: MusicFacade_js_1.musicFacade.isShuffled(guildId),
            volume: MusicFacade_js_1.musicFacade.getVolume(guildId)
        });
        await interaction.reply({ embeds: [embed], ephemeral: true });
    },
    async handleButtonFavorite(interaction, guildId, targetUserId) {
        try {
            const currentTrack = MusicFacade_js_1.musicFacade.getCurrentTrack(guildId);
            if (!currentTrack) {
                await interaction.reply({ content: '❌ Nothing is playing', ephemeral: true });
                return;
            }
            await interaction.deferUpdate();
            const userId = interaction.user.id;
            const isFavorited = MusicFacade_js_1.musicFacade.isFavorited(userId, currentTrack.url);
            if (isFavorited) {
                MusicFacade_js_1.musicFacade.removeFavorite(userId, currentTrack.url);
            }
            else {
                MusicFacade_js_1.musicFacade.addFavorite(userId, currentTrack);
            }
            const options = buildNowPlayingOptions(guildId, interaction);
            const embed = trackHandler_js_1.trackHandler.createNowPlayingEmbed(currentTrack, options);
            const rows = trackHandler_js_1.trackHandler.createControlButtons(guildId, {
                isPaused: options.isPaused,
                loopMode: options.loopMode,
                isShuffled: options.isShuffled,
                autoPlay: MusicFacade_js_1.musicFacade.isAutoPlayEnabled(guildId),
                trackUrl: currentTrack.url,
                userId: interaction.user.id,
                listenerCount: options.listenerCount
            });
            await interaction.editReply({ embeds: [embed], components: rows });
        }
        catch (error) {
            const err = error;
            if (err.code === 10062 || err.code === 10008) {
                Logger_js_1.logger.debug('Button', 'Interaction expired or message deleted, ignoring...');
            }
            else {
                Logger_js_1.logger.error('Button', `Favorite button error: ${err.message}`);
            }
        }
    },
    async handleButtonLyrics(interaction, guildId) {
        const currentTrack = MusicFacade_js_1.musicFacade.getCurrentTrack(guildId);
        if (!currentTrack) {
            await interaction.reply({ content: '❌ Nothing is playing', ephemeral: true });
            return;
        }
        await interaction.deferReply({ ephemeral: true });
        try {
            const lyrics = await this.fetchLyrics(currentTrack.title, currentTrack.author);
            if (!lyrics) {
                await interaction.editReply({
                    embeds: [trackHandler_js_1.trackHandler.createErrorEmbed(`No lyrics found for **${currentTrack.title}**`)]
                });
                return;
            }
            const embed = trackHandler_js_1.trackHandler.createLyricsEmbed(currentTrack, lyrics);
            await interaction.editReply({ embeds: [embed] });
        }
        catch (error) {
            const err = error;
            Logger_js_1.logger.error('Button', `Lyrics fetch error: ${err.message}`);
            await interaction.editReply({
                embeds: [trackHandler_js_1.trackHandler.createErrorEmbed('Failed to fetch lyrics. Please try again.')]
            });
        }
    },
    async fetchLyrics(title, artist) {
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
            Logger_js_1.logger.debug('Lyrics', `Searching for: "${cleanArtist}" - "${cleanTitle}"`);
            // Try LRCLIB first
            const lrclibResult = await this.fetchFromLrclib(cleanArtist, cleanTitle);
            if (lrclibResult)
                return lrclibResult;
            // Fallback to lyrics.ovh
            if (cleanArtist) {
                const response = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(cleanArtist)}/${encodeURIComponent(cleanTitle)}`);
                if (response.ok) {
                    const data = await response.json();
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
                if (lrclibSimplified)
                    return lrclibSimplified;
            }
            if (cleanArtist && simplifiedTitle !== cleanTitle) {
                const fallback1 = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(cleanArtist)}/${encodeURIComponent(simplifiedTitle)}`);
                if (fallback1.ok) {
                    const data = await fallback1.json();
                    if (data.lyrics) {
                        return data.lyrics;
                    }
                }
            }
            if (artist && artist !== cleanArtist) {
                const origArtist = artist.replace(/\s*-\s*Topic$/i, '').replace(/VEVO$/i, '').trim();
                const fallback2 = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(origArtist)}/${encodeURIComponent(simplifiedTitle)}`);
                if (fallback2.ok) {
                    const data = await fallback2.json();
                    if (data.lyrics) {
                        return data.lyrics;
                    }
                }
            }
            return null;
        }
        catch (error) {
            const err = error;
            Logger_js_1.logger.error('Lyrics', `Lyrics API error: ${err.message}`);
            return null;
        }
    },
    async fetchFromLrclib(artist, title) {
        try {
            const url = new URL('https://lrclib.net/api/get');
            url.searchParams.set('track_name', title);
            if (artist)
                url.searchParams.set('artist_name', artist);
            const response = await fetch(url.toString(), {
                headers: { 'User-Agent': 'FumoBOT/1.0' }
            });
            if (response.ok) {
                const data = await response.json();
                if (data.plainLyrics)
                    return data.plainLyrics;
                if (data.syncedLyrics) {
                    return data.syncedLyrics.replace(/\[\d{2}:\d{2}\.\d{2,3}\]/g, '').trim();
                }
            }
            return null;
        }
        catch {
            return null;
        }
    },
    async handleButtonVoteSkip(interaction, guildId) {
        const queue = MusicCacheFacade_js_1.default.getQueue(guildId);
        const listenerCount = MusicFacade_js_1.musicFacade.getListenerCount(guildId, interaction.guild);
        if (listenerCount < MIN_VOTES_REQUIRED) {
            await interaction.deferUpdate();
            const skippedTrack = MusicFacade_js_1.musicFacade.getCurrentTrack(guildId);
            await MusicFacade_js_1.musicFacade.skip(guildId);
            const channel = interaction.channel;
            await channel.send({
                embeds: [trackHandler_js_1.trackHandler.createInfoEmbed('⏭️ Track Skipped', skippedTrack ? `**${skippedTrack.title}** was skipped by ${interaction.user.tag}` : `Track skipped by ${interaction.user.tag}`, 'success')]
            }).catch(() => { });
            return;
        }
        if (MusicFacade_js_1.musicFacade.isSkipVoteActive(guildId)) {
            const result = MusicFacade_js_1.musicFacade.addSkipVote(guildId, interaction.user.id);
            if (!result.added) {
                await interaction.reply({ content: '❌ You already voted!', ephemeral: true });
                return;
            }
            if (MusicFacade_js_1.musicFacade.hasEnoughSkipVotes(guildId)) {
                MusicFacade_js_1.musicFacade.endSkipVote(guildId);
                const skippedTrack = MusicFacade_js_1.musicFacade.getCurrentTrack(guildId);
                await MusicFacade_js_1.musicFacade.skip(guildId);
                await interaction.update({
                    embeds: [trackHandler_js_1.trackHandler.createInfoEmbed('⏭️ Skipped!', `**${skippedTrack?.title || 'Track'}** was skipped by vote!`, 'success')],
                    components: []
                });
                return;
            }
            const required = MusicCacheFacade_js_1.default.getRequiredVotes(queue?.skipVoteListenerCount || listenerCount);
            await interaction.reply({
                content: `🗳️ Vote added! **${result.voteCount}/${required}**`,
                ephemeral: true
            });
            return;
        }
        // Start new vote
        const voteResult = MusicFacade_js_1.musicFacade.startSkipVote(guildId, interaction.user.id, listenerCount);
        const currentTrack = MusicFacade_js_1.musicFacade.getCurrentTrack(guildId);
        const embed = trackHandler_js_1.trackHandler.createSkipVoteEmbed(currentTrack, voteResult.voteCount, voteResult.required, SKIP_VOTE_TIMEOUT);
        const row = trackHandler_js_1.trackHandler.createSkipVoteButton(guildId, voteResult.voteCount, voteResult.required);
        await interaction.reply({ embeds: [embed], components: [row] });
        const q = MusicCacheFacade_js_1.default.getQueue(guildId);
        if (q) {
            if (q.skipVoteTimeout)
                clearTimeout(q.skipVoteTimeout);
            q.skipVoteTimeout = setTimeout(async () => {
                try {
                    MusicFacade_js_1.musicFacade.endSkipVote(guildId);
                }
                catch (error) {
                    const err = error;
                    Logger_js_1.logger.error('Button', `Skip vote timeout error: ${err.message}`);
                }
            }, SKIP_VOTE_TIMEOUT);
        }
    },
    async handleButtonQueuePage(interaction, guildId, pageAction) {
        await interaction.deferUpdate();
    },
    async handleButtonConfirm(interaction, guildId, action, choice) {
        // Route longtrack to playHandler
        if (action === 'longtrack') {
            return await playHandler_js_1.playHandler.handleLongTrackButton(interaction, guildId, choice);
        }
        try {
            await interaction.deferUpdate();
            const confirmed = choice === 'yes';
            switch (action) {
                case 'clear_queue':
                    if (confirmed) {
                        const queue = MusicCacheFacade_js_1.default.getQueue(guildId);
                        if (queue) {
                            queue.tracks = [];
                            await interaction.editReply({
                                content: '✅ Queue has been cleared!',
                                embeds: [],
                                components: []
                            });
                        }
                    }
                    else {
                        await interaction.editReply({
                            content: '❌ Action cancelled.',
                            embeds: [],
                            components: []
                        });
                    }
                    break;
                case 'stop':
                    if (confirmed) {
                        await MusicFacade_js_1.musicFacade.cleanup(guildId);
                        await interaction.editReply({
                            content: '⏹️ Music stopped and queue cleared.',
                            embeds: [],
                            components: []
                        });
                    }
                    else {
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
        }
        catch (error) {
            const err = error;
            Logger_js_1.logger.error('Button', `Confirm button error: ${err.message}`);
        }
    }
};
exports.default = exports.buttonHandler;
//# sourceMappingURL=buttonHandler.js.map