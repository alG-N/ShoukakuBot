"use strict";
/**
 * Track Handler
 * Creates embeds, buttons, and handles track display
 * Enhanced UI with rich visuals and descriptive controls
 * @module handlers/music/trackHandler
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrackHandler = exports.trackHandler = exports.LOOP_DISPLAY = exports.COLORS = void 0;
const discord_js_1 = require("discord.js");
const MusicCacheFacade_js_1 = __importDefault(require("../../cache/music/MusicCacheFacade.js"));
const index_js_1 = require("../../utils/music/index.js");
/**
 * Enhanced color scheme
 */
exports.COLORS = {
    playing: '#1DB954', // Spotify green
    paused: '#FFA500', // Warm orange
    stopped: '#DC143C', // Crimson
    queued: '#9B59B6', // Amethyst purple
    info: '#5865F2', // Discord blurple
    error: '#ED4245', // Discord red
    warning: '#FEE75C', // Discord yellow
    success: '#57F287', // Discord green
    lyrics: '#E91E63', // Pink for lyrics
    favorites: '#FF6B9D', // Soft pink for favorites
    history: '#3498DB' // Sky blue for history
};
/**
 * Loop mode display configuration
 */
exports.LOOP_DISPLAY = {
    'off': { emoji: '➡️', text: 'Off', label: 'No Repeat' },
    'track': { emoji: '🔂', text: 'Song', label: 'Repeat Song' },
    'queue': { emoji: '🔁', text: 'Queue', label: 'Repeat All' }
};
/**
 * Source platform styling
 */
const SOURCE_PLATFORM = {
    youtube: { emoji: '🔴', name: 'YouTube', color: '#FF0000' },
    soundcloud: { emoji: '🟠', name: 'SoundCloud', color: '#FF5500' },
    spotify: { emoji: '🟢', name: 'Spotify', color: '#1DB954' },
    unknown: { emoji: '🎵', name: 'Music', color: exports.COLORS.info }
};
/**
 * Decorative elements for embeds
 */
const DECORATIONS = {
    line: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    dotLine: '• • • • • • • • • • • • • • • • • • • •',
    sparkle: '✨',
    music: '🎵',
    disc: '💿'
};
// NOW PLAYING as emoji letters
const NOW_PLAYING_EMOJI = '🇳 🇴 🇼  🇵 🇱 🇦 🇾 🇮 🇳 🇬';
const PAUSED_EMOJI = '⏸️ 🇵 🇦 🇺 🇸 🇪 🇩';
class TrackHandler {
    /**
     * Get source info for a track
     */
    _getSourceInfo(track) {
        const source = (track?.source?.toLowerCase() || 'unknown');
        return SOURCE_PLATFORM[source] || SOURCE_PLATFORM.unknown;
    }
    /**
     * Create a visual progress bar
     */
    _createMusicBar(current, total, length = 15) {
        const progress = Math.min(current / total, 1);
        const filled = Math.round(progress * length);
        const empty = length - filled;
        const slider = '🔘';
        if (filled === 0)
            return `${slider}${'▬'.repeat(length)}`;
        if (filled === length)
            return `${'▬'.repeat(length)}${slider}`;
        return `${'▬'.repeat(filled)}${slider}${'▬'.repeat(empty)}`;
    }
    /**
     * Create volume bar visual
     */
    _createVolumeBar(volume, length = 8) {
        const maxVol = 200;
        const filled = Math.round((volume / maxVol) * length);
        return '▰'.repeat(Math.min(filled, length)) + '▱'.repeat(Math.max(0, length - filled));
    }
    /**
     * Truncate string to specified length
     */
    _truncate(str, length) {
        if (!str)
            return 'Unknown';
        return str.length > length ? str.substring(0, length - 3) + '...' : str;
    }
    /**
     * Create progress bar for votes/progress
     */
    _createProgressBar(current, max, length = 10) {
        const filled = Math.round((current / max) * length);
        const empty = length - filled;
        return '🟩'.repeat(filled) + '⬜'.repeat(empty) + ` ${Math.round((current / max) * 100)}%`;
    }
    /**
     * Get time ago string
     */
    _timeAgo(timestamp) {
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        if (seconds < 60)
            return 'just now';
        if (seconds < 3600)
            return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400)
            return `${Math.floor(seconds / 3600)}h ago`;
        if (seconds < 604800)
            return `${Math.floor(seconds / 86400)}d ago`;
        return `${Math.floor(seconds / 604800)}w ago`;
    }
    /**
     * Create now playing embed - Clean version with 3 fields per row
     */
    createNowPlayingEmbed(track, options = {}) {
        const { volume = 100, isPaused = false, loopMode = 'off', isShuffled = false, queueLength = 0, position = 0, player = null, requester = null, nextTrack = null, loopCount = 0, voteSkipCount = 0, voteSkipRequired = 0 } = options;
        const sourceInfo = this._getSourceInfo(track);
        const color = isPaused ? exports.COLORS.paused : exports.COLORS.playing;
        const loopInfo = exports.LOOP_DISPLAY[loopMode];
        // Status icon
        let statusIcon = isPaused ? PAUSED_EMOJI : `${DECORATIONS.disc} ${NOW_PLAYING_EMOJI}`;
        if (loopMode === 'track' && loopCount > 0) {
            statusIcon = `🔂 ${NOW_PLAYING_EMOJI} (Looped ${loopCount}x)`;
        }
        const embed = new discord_js_1.EmbedBuilder()
            .setColor(color)
            .setAuthor({ name: statusIcon })
            .setTitle(track.title)
            .setURL(track.url);
        // Search type text
        const searchTypeText = track.searchedByLink
            ? '[Link]'
            : track.originalQuery
                ? `[🔍 ${this._truncate(track.originalQuery, 20)}]`
                : '[Search]';
        // Row 1: Artist, Duration, Source
        embed.addFields({ name: '🎤 Artist', value: track.author || 'Unknown Artist', inline: true }, { name: '⏱️ Duration', value: (0, index_js_1.formatSecondsToTime)(track.lengthSeconds), inline: true }, { name: `${sourceInfo.emoji} Source`, value: `${sourceInfo.name} ${searchTypeText}`, inline: true });
        // Row 2: Volume, Playback, Shuffle
        const volBar = this._createVolumeBar(volume);
        embed.addFields({ name: '🔊 Volume', value: `${volBar} ${volume}%`, inline: true }, { name: '🔁 Playback', value: `${loopInfo.emoji} ${loopInfo.label}`, inline: true }, { name: '🔀 Shuffle', value: isShuffled ? '✅ On' : '➡️ Off', inline: true });
        // Row 3: Looped count, Vote-skip, Queue size
        let loopedText = '—';
        if (loopMode === 'track') {
            loopedText = loopCount > 0 ? `🔂 ${loopCount}x` : '🔂 Active';
        }
        else if (loopMode === 'queue') {
            loopedText = '🔁 Queue';
        }
        const voteSkipText = voteSkipRequired <= 1
            ? '✅ Skippable'
            : `${voteSkipCount} / ${voteSkipRequired}`;
        const queueSizeText = queueLength > 0
            ? `${queueLength} song${queueLength !== 1 ? 's' : ''}`
            : 'Empty';
        embed.addFields({ name: '🔂 Looped', value: loopedText, inline: true }, { name: '🗳️ Vote-skip', value: voteSkipText, inline: true }, { name: '📋 Queue', value: queueSizeText, inline: true });
        // Up Next info
        if (nextTrack) {
            embed.addFields({
                name: '⏭️ Up Next',
                value: `${this._truncate(nextTrack.title, 50)} • ${nextTrack.author || 'Unknown'}`,
                inline: false
            });
        }
        // Thumbnail
        if (track.thumbnail) {
            embed.setThumbnail(track.thumbnail);
        }
        // Footer with requester info
        if (track.requestedBy) {
            const displayName = 'displayName' in track.requestedBy
                ? track.requestedBy.displayName
                : track.requestedBy.username;
            const avatarUrl = track.requestedBy.displayAvatarURL?.() || undefined;
            embed.setFooter({
                text: `Requested by ${displayName}`,
                iconURL: avatarUrl
            });
        }
        embed.setTimestamp();
        return embed;
    }
    /**
     * Create control buttons - Clean with labels
     */
    createControlButtons(guildId, options = {}) {
        const { isPaused = false, loopMode = 'off', isShuffled = false, trackUrl = null, userId = '', autoPlay = false } = options;
        const rows = [];
        const loopInfo = exports.LOOP_DISPLAY[loopMode];
        // Row 1: Main playback controls
        const controlRow = new discord_js_1.ActionRowBuilder();
        controlRow.addComponents(new discord_js_1.ButtonBuilder()
            .setCustomId(`music_pause:${guildId}`)
            .setLabel(isPaused ? 'Resume' : 'Pause')
            .setEmoji(isPaused ? '▶️' : '⏸️')
            .setStyle(isPaused ? discord_js_1.ButtonStyle.Success : discord_js_1.ButtonStyle.Primary), new discord_js_1.ButtonBuilder()
            .setCustomId(`music_stop:${guildId}`)
            .setLabel('Stop')
            .setEmoji('⏹️')
            .setStyle(discord_js_1.ButtonStyle.Danger), new discord_js_1.ButtonBuilder()
            .setCustomId(`music_skip:${guildId}`)
            .setLabel('Skip')
            .setEmoji('⏭️')
            .setStyle(discord_js_1.ButtonStyle.Secondary), new discord_js_1.ButtonBuilder()
            .setCustomId(`music_loop:${guildId}`)
            .setLabel(loopInfo.text)
            .setEmoji(loopInfo.emoji)
            .setStyle(loopMode !== 'off' ? discord_js_1.ButtonStyle.Success : discord_js_1.ButtonStyle.Secondary)
            .setDisabled(autoPlay), new discord_js_1.ButtonBuilder()
            .setCustomId(`music_shuffle:${guildId}`)
            .setLabel('Shuffle')
            .setEmoji('🔀')
            .setStyle(isShuffled ? discord_js_1.ButtonStyle.Success : discord_js_1.ButtonStyle.Secondary)
            .setDisabled(autoPlay));
        rows.push(controlRow);
        // Row 2: Volume, queue and autoplay controls
        const volumeRow = new discord_js_1.ActionRowBuilder();
        volumeRow.addComponents(new discord_js_1.ButtonBuilder()
            .setCustomId(`music_voldown:${guildId}`)
            .setLabel('-10')
            .setEmoji('🔉')
            .setStyle(discord_js_1.ButtonStyle.Secondary), new discord_js_1.ButtonBuilder()
            .setCustomId(`music_volup:${guildId}`)
            .setLabel('+10')
            .setEmoji('🔊')
            .setStyle(discord_js_1.ButtonStyle.Secondary), new discord_js_1.ButtonBuilder()
            .setCustomId(`music_queue:${guildId}`)
            .setLabel('Queue')
            .setEmoji('📋')
            .setStyle(discord_js_1.ButtonStyle.Primary), new discord_js_1.ButtonBuilder()
            .setCustomId(`music_autoplay:${guildId}`)
            .setLabel('Autoplay')
            .setEmoji('🎵')
            .setStyle(autoPlay ? discord_js_1.ButtonStyle.Success : discord_js_1.ButtonStyle.Secondary));
        rows.push(volumeRow);
        // Row 3: Extra features
        if (trackUrl) {
            const extraRow = new discord_js_1.ActionRowBuilder();
            extraRow.addComponents(new discord_js_1.ButtonBuilder()
                .setLabel('Open Link')
                .setStyle(discord_js_1.ButtonStyle.Link)
                .setURL(trackUrl)
                .setEmoji('🔗'), new discord_js_1.ButtonBuilder()
                .setCustomId(`music_lyrics:${guildId}`)
                .setLabel('Lyrics')
                .setEmoji('📝')
                .setStyle(discord_js_1.ButtonStyle.Primary));
            const voteSkipButton = new discord_js_1.ButtonBuilder()
                .setCustomId(`music_voteskip:${guildId}`)
                .setEmoji('🗳️')
                .setStyle(discord_js_1.ButtonStyle.Secondary);
            if (options.listenerCount && options.listenerCount <= 1) {
                voteSkipButton.setLabel('Vote Skip').setDisabled(true);
            }
            else {
                voteSkipButton.setLabel('Vote Skip');
            }
            extraRow.addComponents(voteSkipButton);
            rows.push(extraRow);
        }
        return rows;
    }
    /**
     * Create queued track embed
     */
    createQueuedEmbed(track, position, requester) {
        const sourceInfo = this._getSourceInfo(track);
        const embed = new discord_js_1.EmbedBuilder()
            .setColor(exports.COLORS.queued)
            .setAuthor({ name: 'Added to Queue' })
            .setTitle(track.title)
            .setURL(track.url)
            .setDescription(`**Artist:** ${track.author || 'Unknown Artist'}\n` +
            `**Duration:** ${(0, index_js_1.formatSecondsToTime)(track.lengthSeconds)}\n` +
            `**Source:** ${sourceInfo.emoji} ${sourceInfo.name}`)
            .addFields({
            name: 'Position',
            value: position === 0 ? 'Playing Next!' : `#${position} in queue`,
            inline: true
        });
        if (track.thumbnail) {
            embed.setThumbnail(track.thumbnail);
        }
        if (requester) {
            embed.setFooter({
                text: `Requested by ${requester.displayName || requester.username}`,
                iconURL: requester.displayAvatarURL() || undefined
            });
        }
        embed.setTimestamp();
        return embed;
    }
    /**
     * Create priority queued embed
     */
    createPriorityQueuedEmbed(track, requester) {
        const sourceInfo = this._getSourceInfo(track);
        const embed = new discord_js_1.EmbedBuilder()
            .setColor(exports.COLORS.success)
            .setAuthor({ name: 'Priority Added - Playing Next!' })
            .setTitle(track.title)
            .setURL(track.url)
            .setDescription(`**Artist:** ${track.author || 'Unknown Artist'}\n` +
            `**Duration:** ${(0, index_js_1.formatSecondsToTime)(track.lengthSeconds)}\n` +
            `**Source:** ${sourceInfo.emoji} ${sourceInfo.name}\n\n` +
            `*This track was added to the front of the queue.*`);
        if (track.thumbnail) {
            embed.setThumbnail(track.thumbnail);
        }
        if (requester) {
            embed.setFooter({
                text: `Requested by ${requester.displayName || requester.username}`,
                iconURL: requester.displayAvatarURL() || undefined
            });
        }
        embed.setTimestamp();
        return embed;
    }
    /**
     * Create playlist queued embed
     */
    createPlaylistEmbed(playlistName, trackCount, requester, firstTrack) {
        const embed = new discord_js_1.EmbedBuilder()
            .setColor(exports.COLORS.queued)
            .setAuthor({ name: 'Playlist Added' })
            .setTitle(playlistName || 'Playlist')
            .setDescription(`**Total Tracks:** ${trackCount}\n` +
            `**First Track:** ${firstTrack?.title || 'Loading...'}`);
        if (firstTrack?.thumbnail) {
            embed.setThumbnail(firstTrack.thumbnail);
        }
        if (requester) {
            embed.setFooter({
                text: `Requested by ${requester.displayName || requester.username}`,
                iconURL: requester.displayAvatarURL() || undefined
            });
        }
        embed.setTimestamp();
        return embed;
    }
    /**
     * Create queue list embed
     */
    createQueueListEmbed(tracks, currentTrack, options = {}) {
        const { page = 1, perPage = 10, loopMode = 'off', isShuffled = false, volume = 100 } = options;
        const totalPages = Math.ceil(tracks.length / perPage) || 1;
        const start = (page - 1) * perPage;
        const pageItems = tracks.slice(start, start + perPage);
        const loopInfo = exports.LOOP_DISPLAY[loopMode];
        const embed = new discord_js_1.EmbedBuilder()
            .setColor(exports.COLORS.info)
            .setAuthor({ name: 'Music Queue' });
        // Current track section
        if (currentTrack) {
            embed.setTitle('Now Playing');
            embed.setDescription(`**[${currentTrack.title}](${currentTrack.url})**\n` +
                `${currentTrack.author || 'Unknown'} • ${(0, index_js_1.formatSecondsToTime)(currentTrack.lengthSeconds)}`);
            if (currentTrack.thumbnail) {
                embed.setThumbnail(currentTrack.thumbnail);
            }
        }
        // Queue items
        if (pageItems.length > 0) {
            const queueText = pageItems.map((track, i) => {
                const position = start + i + 1;
                const title = this._truncate(track.title, 40);
                const duration = (0, index_js_1.formatSecondsToTime)(track.lengthSeconds);
                return `\`${String(position).padStart(2, '0')}.\` [${title}](${track.url})\n　　 ${duration} • ${this._truncate(track.author, 20)}`;
            }).join('\n\n');
            embed.addFields({
                name: `📑 Up Next (${tracks.length} track${tracks.length !== 1 ? 's' : ''})`,
                value: queueText,
                inline: false
            });
        }
        else if (!currentTrack) {
            embed.setDescription('🔇 The queue is empty!\nUse `/music play` to add some tunes 🎵');
        }
        // Total duration
        const totalDuration = tracks.reduce((sum, t) => sum + (t.lengthSeconds || 0), 0);
        const currentDuration = currentTrack?.lengthSeconds || 0;
        // Status bar
        const statusLine = [
            `🔊 ${volume}%`,
            `${loopInfo.emoji} ${loopInfo.label}`,
            isShuffled ? '🔀 Shuffled' : null,
            `⏱️ ${(0, index_js_1.formatSecondsToTime)(totalDuration + currentDuration)}`
        ].filter(Boolean).join(' │ ');
        embed.setFooter({
            text: `Page ${page}/${totalPages} │ ${statusLine}`
        });
        return embed;
    }
    /**
     * Create queue pagination buttons
     */
    createQueuePaginationButtons(guildId, currentPage, totalPages) {
        const row = new discord_js_1.ActionRowBuilder();
        row.addComponents(new discord_js_1.ButtonBuilder()
            .setCustomId(`music_qpage:${guildId}:first`)
            .setLabel('First')
            .setEmoji('⏮️')
            .setStyle(discord_js_1.ButtonStyle.Secondary)
            .setDisabled(currentPage <= 1), new discord_js_1.ButtonBuilder()
            .setCustomId(`music_qpage:${guildId}:prev`)
            .setLabel('Prev')
            .setEmoji('◀️')
            .setStyle(discord_js_1.ButtonStyle.Primary)
            .setDisabled(currentPage <= 1), new discord_js_1.ButtonBuilder()
            .setCustomId(`music_qpage:${guildId}:info`)
            .setLabel(`${currentPage} / ${totalPages}`)
            .setStyle(discord_js_1.ButtonStyle.Secondary)
            .setDisabled(true), new discord_js_1.ButtonBuilder()
            .setCustomId(`music_qpage:${guildId}:next`)
            .setLabel('Next')
            .setEmoji('▶️')
            .setStyle(discord_js_1.ButtonStyle.Primary)
            .setDisabled(currentPage >= totalPages), new discord_js_1.ButtonBuilder()
            .setCustomId(`music_qpage:${guildId}:last`)
            .setLabel('Last')
            .setEmoji('⏭️')
            .setStyle(discord_js_1.ButtonStyle.Secondary)
            .setDisabled(currentPage >= totalPages));
        return row;
    }
    /**
     * Create skip vote embed
     */
    createSkipVoteEmbed(track, currentVotes, requiredVotes, timeRemaining) {
        const progress = this._createProgressBar(currentVotes, requiredVotes, 10);
        const embed = new discord_js_1.EmbedBuilder()
            .setColor(exports.COLORS.warning)
            .setAuthor({ name: '🗳️ Vote Skip Started' })
            .setTitle('Skip the current track?')
            .setDescription(`**Track:** ${track?.title || 'Unknown'}\n\n` +
            `${DECORATIONS.dotLine}\n\n` +
            `**Votes:** \`${currentVotes}\` / \`${requiredVotes}\`\n` +
            `${progress}\n\n` +
            `Click the button below to add your vote!`);
        if (track?.thumbnail) {
            embed.setThumbnail(track.thumbnail);
        }
        if (timeRemaining) {
            embed.setFooter({ text: `⏱️ Vote expires in ${Math.ceil(timeRemaining / 1000)} seconds` });
        }
        return embed;
    }
    /**
     * Create skip vote button
     */
    createSkipVoteButton(guildId, currentVotes, requiredVotes) {
        const row = new discord_js_1.ActionRowBuilder();
        row.addComponents(new discord_js_1.ButtonBuilder()
            .setCustomId(`music_voteskip_add:${guildId}`)
            .setLabel(`Vote to Skip (${currentVotes}/${requiredVotes})`)
            .setEmoji('🗳️')
            .setStyle(discord_js_1.ButtonStyle.Primary));
        return row;
    }
    /**
     * Create lyrics embed
     */
    createLyricsEmbed(track, lyrics) {
        const maxLength = 4000;
        let displayLyrics = lyrics;
        if (lyrics.length > maxLength) {
            displayLyrics = lyrics.substring(0, maxLength - 50) + '\n\n... *[Lyrics truncated]*';
        }
        const embed = new discord_js_1.EmbedBuilder()
            .setColor(exports.COLORS.lyrics)
            .setAuthor({ name: '📝 Lyrics' })
            .setTitle(track.title)
            .setURL(track.url)
            .setDescription(displayLyrics);
        if (track.thumbnail) {
            embed.setThumbnail(track.thumbnail);
        }
        const avatarUrl = track.requestedBy?.displayAvatarURL?.() || undefined;
        embed.setFooter({
            text: `Artist: ${track.author || 'Unknown'} • Powered by lyrics.ovh`,
            iconURL: avatarUrl
        });
        return embed;
    }
    /**
     * Create info embed
     */
    createInfoEmbed(title, description, type = 'info') {
        const colors = {
            info: exports.COLORS.info,
            success: exports.COLORS.success,
            warning: exports.COLORS.warning,
            error: exports.COLORS.error
        };
        const icons = {
            info: 'ℹ️',
            success: '✅',
            warning: '⚠️',
            error: '❌'
        };
        return new discord_js_1.EmbedBuilder()
            .setColor(colors[type])
            .setTitle(`${icons[type] || ''} ${title}`)
            .setDescription(description)
            .setTimestamp();
    }
    /**
     * Create error embed
     */
    createErrorEmbed(message) {
        return new discord_js_1.EmbedBuilder()
            .setColor(exports.COLORS.error)
            .setTitle('❌ Error')
            .setDescription(`${message}\n\n*If this persists, try again later.*`)
            .setTimestamp();
    }
    /**
     * Create song finished embed
     */
    createSongFinishedEmbed(track) {
        return new discord_js_1.EmbedBuilder()
            .setColor(exports.COLORS.info)
            .setTitle('✅ Track Finished')
            .setDescription(`Finished: **${track?.title || 'Unknown'}**`)
            .setTimestamp();
    }
    /**
     * Create queue finished embed
     */
    createQueueFinishedEmbed(lastTrack = null) {
        const songFinishedText = lastTrack
            ? `**${this._truncate(lastTrack.title, 50)}** has finished playing.`
            : 'All songs have finished playing.';
        return new discord_js_1.EmbedBuilder()
            .setColor(exports.COLORS.info)
            .setAuthor({ name: '📋 Queue Complete' })
            .setDescription(`${songFinishedText}\n\n` +
            `The queue is now empty.\n` +
            `Use \`/music play\` to add more songs!`)
            .setTimestamp();
    }
    /**
     * Create disconnected embed
     */
    createDisconnectedEmbed() {
        return new discord_js_1.EmbedBuilder()
            .setColor(exports.COLORS.warning)
            .setAuthor({ name: 'Disconnected' })
            .setDescription('Left the voice channel due to inactivity.\nUse `/music play` to start playing again!')
            .setTimestamp();
    }
    /**
     * Create stopped by user embed
     */
    createStoppedByUserEmbed(user) {
        const displayName = user
            ? ('displayName' in user ? user.displayName : user.username) || 'a user'
            : 'a user';
        return new discord_js_1.EmbedBuilder()
            .setColor(exports.COLORS.stopped)
            .setAuthor({ name: 'Playback Stopped' })
            .setDescription(`Music was stopped by ${displayName}`)
            .setTimestamp();
    }
    /**
     * Create favorites list embed
     */
    createFavoritesEmbed(favorites, userId, page = 1, perPage = 10) {
        const totalPages = Math.ceil(favorites.length / perPage) || 1;
        const start = (page - 1) * perPage;
        const pageItems = favorites.slice(start, start + perPage);
        const embed = new discord_js_1.EmbedBuilder()
            .setColor(exports.COLORS.favorites)
            .setAuthor({ name: '💖 Your Favorites' })
            .setTitle(`${favorites.length} saved song${favorites.length !== 1 ? 's' : ''}`);
        if (pageItems.length > 0) {
            const favText = pageItems.map((fav, i) => {
                const position = start + i + 1;
                const title = this._truncate(fav.title, 40);
                const duration = (0, index_js_1.formatSecondsToTime)(fav.duration || fav.lengthSeconds);
                return `\`${String(position).padStart(2, '0')}.\` **[${title}](${fav.url})**\n　　 ⏱️ ${duration}`;
            }).join('\n\n');
            embed.setDescription(`${DECORATIONS.dotLine}\n\n${favText}\n\n${DECORATIONS.dotLine}`);
        }
        else {
            embed.setDescription(`${DECORATIONS.dotLine}\n\n` +
                `You haven't saved any favorites yet!\n\n` +
                `Use the 🤍 button while playing music to save songs.\n\n` +
                `${DECORATIONS.dotLine}`);
        }
        embed.setFooter({
            text: `Page ${page}/${totalPages} • Use /music favorites play <number> to play`
        });
        return embed;
    }
    /**
     * Create history embed
     */
    createHistoryEmbed(history, userId, page = 1, perPage = 10) {
        const totalPages = Math.ceil(history.length / perPage) || 1;
        const start = (page - 1) * perPage;
        const pageItems = history.slice(start, start + perPage);
        const embed = new discord_js_1.EmbedBuilder()
            .setColor(exports.COLORS.history)
            .setAuthor({ name: '📜 Listening History' })
            .setTitle(`${history.length} track${history.length !== 1 ? 's' : ''} played`);
        if (pageItems.length > 0) {
            const histText = pageItems.map((item, i) => {
                const position = start + i + 1;
                const title = this._truncate(item.title, 35);
                const timeAgo = this._timeAgo(item.playedAt || Date.now());
                return `\`${String(position).padStart(2, '0')}.\` **[${title}](${item.url})**\n　　 🕐 ${timeAgo}`;
            }).join('\n\n');
            embed.setDescription(`${DECORATIONS.dotLine}\n\n${histText}\n\n${DECORATIONS.dotLine}`);
        }
        else {
            embed.setDescription(`${DECORATIONS.dotLine}\n\n` +
                `No listening history yet!\n\n` +
                `Start playing some music to build your history.\n\n` +
                `${DECORATIONS.dotLine}`);
        }
        embed.setFooter({
            text: `Page ${page}/${totalPages} • Use /music history play <number> to replay`
        });
        return embed;
    }
    /**
     * Create settings embed
     */
    createSettingsEmbed(userId) {
        const prefs = MusicCacheFacade_js_1.default.getPreferences(userId);
        const embed = new discord_js_1.EmbedBuilder()
            .setColor(exports.COLORS.info)
            .setAuthor({ name: '⚙️ Music Settings' })
            .setTitle('Personal Preferences')
            .setDescription(`${DECORATIONS.line}\n\n` +
            `Customize your music experience below.\n` +
            `Changes apply to you only.\n\n` +
            `${DECORATIONS.line}`)
            .addFields({
            name: '🔊 Default Volume',
            value: `\`${prefs.defaultVolume}%\``,
            inline: true
        }, {
            name: '⏱️ Max Track Duration',
            value: prefs.maxTrackDuration >= 99999 ? '`Unlimited`' : `\`${Math.floor(prefs.maxTrackDuration / 60)} min\``,
            inline: true
        }, {
            name: '📋 Max Queue Size',
            value: `\`${prefs.maxQueueSize} tracks\``,
            inline: true
        }, {
            name: '📢 Track Announcements',
            value: prefs.announceTrack ? '✅ Enabled' : '❌ Disabled',
            inline: true
        }, {
            name: '🗳️ Vote Skip Required',
            value: prefs.voteSkipEnabled ? '✅ Enabled' : '❌ Disabled',
            inline: true
        }, {
            name: '🖼️ Show Thumbnails',
            value: prefs.showThumbnails ? '✅ Enabled' : '❌ Disabled',
            inline: true
        })
            .setFooter({ text: 'Use the menus below to change settings' });
        return embed;
    }
    /**
     * Create settings select menus
     */
    createSettingsComponents(userId) {
        const prefs = MusicCacheFacade_js_1.default.getPreferences(userId);
        const rows = [];
        // Volume select
        const volumeSelect = new discord_js_1.StringSelectMenuBuilder()
            .setCustomId(`music_setting_volume:${userId}`)
            .setPlaceholder('🔊 Select Default Volume')
            .addOptions([
            { label: '🔈 25% - Quiet', value: '25', description: 'Low volume', default: prefs.defaultVolume === 25 },
            { label: '🔉 50% - Medium', value: '50', description: 'Medium volume', default: prefs.defaultVolume === 50 },
            { label: '🔉 75% - Moderate', value: '75', description: 'Moderate volume', default: prefs.defaultVolume === 75 },
            { label: '🔊 100% - Normal', value: '100', description: 'Default volume', default: prefs.defaultVolume === 100 },
            { label: '🔊 125% - Loud', value: '125', description: 'Above normal', default: prefs.defaultVolume === 125 },
            { label: '📢 150% - Very Loud', value: '150', description: 'High volume', default: prefs.defaultVolume === 150 }
        ]);
        rows.push(new discord_js_1.ActionRowBuilder().addComponents(volumeSelect));
        // Max duration select
        const durationSelect = new discord_js_1.StringSelectMenuBuilder()
            .setCustomId(`music_setting_duration:${userId}`)
            .setPlaceholder('⏱️ Max Track Duration')
            .addOptions([
            { label: '5 minutes', value: '300', emoji: '⏱️', description: 'Short tracks only', default: prefs.maxTrackDuration === 300 },
            { label: '10 minutes', value: '600', emoji: '⏱️', description: 'Standard limit', default: prefs.maxTrackDuration === 600 },
            { label: '15 minutes', value: '900', emoji: '⏱️', description: 'Extended tracks', default: prefs.maxTrackDuration === 900 },
            { label: '30 minutes', value: '1800', emoji: '⏱️', description: 'Long tracks', default: prefs.maxTrackDuration === 1800 },
            { label: '1 hour', value: '3600', emoji: '⏱️', description: 'Very long tracks', default: prefs.maxTrackDuration === 3600 },
            { label: '♾️ Unlimited', value: '99999', emoji: '♾️', description: 'No limit', default: prefs.maxTrackDuration >= 99999 }
        ]);
        rows.push(new discord_js_1.ActionRowBuilder().addComponents(durationSelect));
        // Toggles row
        const toggleRow = new discord_js_1.ActionRowBuilder();
        toggleRow.addComponents(new discord_js_1.ButtonBuilder()
            .setCustomId(`music_setting_announce:${userId}`)
            .setLabel(prefs.announceTrack ? 'Announce: ON' : 'Announce: OFF')
            .setEmoji('📢')
            .setStyle(prefs.announceTrack ? discord_js_1.ButtonStyle.Success : discord_js_1.ButtonStyle.Secondary), new discord_js_1.ButtonBuilder()
            .setCustomId(`music_setting_voteskip:${userId}`)
            .setLabel(prefs.voteSkipEnabled ? 'Vote Skip: ON' : 'Vote Skip: OFF')
            .setEmoji('🗳️')
            .setStyle(prefs.voteSkipEnabled ? discord_js_1.ButtonStyle.Success : discord_js_1.ButtonStyle.Secondary), new discord_js_1.ButtonBuilder()
            .setCustomId(`music_setting_thumbnails:${userId}`)
            .setLabel(prefs.showThumbnails ? 'Thumbnails: ON' : 'Thumbnails: OFF')
            .setEmoji('🖼️')
            .setStyle(prefs.showThumbnails ? discord_js_1.ButtonStyle.Success : discord_js_1.ButtonStyle.Secondary));
        rows.push(toggleRow);
        return rows;
    }
    /**
     * Create long video confirmation embed
     */
    createLongVideoConfirmEmbed(track, maxDuration) {
        const embed = new discord_js_1.EmbedBuilder()
            .setColor(exports.COLORS.warning)
            .setAuthor({ name: '⚠️ Long Track Warning' })
            .setTitle(track.title)
            .setURL(track.url)
            .setDescription(`This track is **${(0, index_js_1.formatSecondsToTime)(track.lengthSeconds)}** long!\n\n` +
            `Your current limit is set to **${(0, index_js_1.formatSecondsToTime)(maxDuration)}**.\n\n` +
            `Do you want to add it anyway?`);
        if (track.thumbnail) {
            embed.setThumbnail(track.thumbnail);
        }
        embed.setFooter({ text: 'This confirmation expires in 20 seconds' });
        return embed;
    }
    /**
     * Create confirmation buttons
     */
    createConfirmButtons(guildId, action) {
        const row = new discord_js_1.ActionRowBuilder();
        row.addComponents(new discord_js_1.ButtonBuilder()
            .setCustomId(`music_confirm:${guildId}:${action}:yes`)
            .setLabel('Yes, Add It')
            .setEmoji('✅')
            .setStyle(discord_js_1.ButtonStyle.Success), new discord_js_1.ButtonBuilder()
            .setCustomId(`music_confirm:${guildId}:${action}:no`)
            .setLabel('Cancel')
            .setEmoji('❌')
            .setStyle(discord_js_1.ButtonStyle.Danger));
        return row;
    }
    /**
     * Disable all buttons in rows
     */
    disableButtons(rows) {
        return rows.map(row => {
            const newRow = discord_js_1.ActionRowBuilder.from(row);
            newRow.components.forEach(component => {
                if (component.data.style !== discord_js_1.ButtonStyle.Link) {
                    component.setDisabled(true);
                }
            });
            return newRow;
        });
    }
}
exports.TrackHandler = TrackHandler;
// Export singleton instance
exports.trackHandler = new TrackHandler();
exports.default = exports.trackHandler;
//# sourceMappingURL=trackHandler.js.map