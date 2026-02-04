/**
 * Track Handler
 * Creates embeds, buttons, and handles track display
 * Enhanced UI with rich visuals and descriptive controls
 * @module handlers/music/trackHandler
 */

import {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    User
} from 'discord.js';
import musicCache, { UserPreferences } from '../../cache/music/MusicCacheFacade.js';
import { formatSecondsToTime as fmtDur } from '../../utils/music/index.js';
/**
 * Track data structure
 */
export interface Track {
    title: string;
    author?: string;
    url: string;
    thumbnail?: string;
    duration?: number;
    lengthSeconds: number;
    source?: string;
    searchedByLink?: boolean;
    originalQuery?: string;
    requestedBy?: User | { displayName?: string; username?: string; displayAvatarURL?: () => string | null };
    playedAt?: number;
}

/**
 * Loop mode types
 */
export type LoopMode = 'off' | 'track' | 'queue';

/**
 * Source platform types
 */
export type SourcePlatform = 'youtube' | 'soundcloud' | 'spotify' | 'unknown';

/**
 * Now playing embed options
 */
export interface NowPlayingOptions {
    volume?: number;
    isPaused?: boolean;
    loopMode?: LoopMode;
    isShuffled?: boolean;
    queueLength?: number;
    position?: number;
    player?: unknown;
    requester?: User | null;
    nextTrack?: Track | null;
    loopCount?: number;
    voteSkipCount?: number;
    voteSkipRequired?: number;
    listenerCount?: number;
}

/**
 * Control buttons options
 */
export interface ControlButtonsOptions {
    isPaused?: boolean;
    loopMode?: LoopMode;
    isShuffled?: boolean;
    trackUrl?: string | null;
    userId?: string;
    autoPlay?: boolean;
    listenerCount?: number;
}

/**
 * Queue list options
 */
export interface QueueListOptions {
    page?: number;
    perPage?: number;
    loopMode?: LoopMode;
    isShuffled?: boolean;
    volume?: number;
}

/**
 * Info embed type
 */
export type InfoEmbedType = 'info' | 'success' | 'warning' | 'error';

/**
 * Source platform info
 */
interface SourceInfo {
    emoji: string;
    name: string;
    color: string;
}

/**
 * Loop display info
 */
interface LoopDisplayInfo {
    emoji: string;
    text: string;
    label: string;
}
/**
 * Enhanced color scheme
 */
export const COLORS = {
    playing: '#1DB954',      // Spotify green
    paused: '#FFA500',       // Warm orange
    stopped: '#DC143C',      // Crimson
    queued: '#9B59B6',       // Amethyst purple
    info: '#5865F2',         // Discord blurple
    error: '#ED4245',        // Discord red
    warning: '#FEE75C',      // Discord yellow
    success: '#57F287',      // Discord green
    lyrics: '#E91E63',       // Pink for lyrics
    favorites: '#FF6B9D',    // Soft pink for favorites
    history: '#3498DB'       // Sky blue for history
} as const;

/**
 * Loop mode display configuration
 */
export const LOOP_DISPLAY: Record<LoopMode, LoopDisplayInfo> = {
    'off': { emoji: '➡️', text: 'Off', label: 'No Repeat' },
    'track': { emoji: '🔂', text: 'Song', label: 'Repeat Song' },
    'queue': { emoji: '🔁', text: 'Queue', label: 'Repeat All' }
};

/**
 * Source platform styling
 */
const SOURCE_PLATFORM: Record<SourcePlatform, SourceInfo> = {
    youtube: { emoji: '🔴', name: 'YouTube', color: '#FF0000' },
    soundcloud: { emoji: '🟠', name: 'SoundCloud', color: '#FF5500' },
    spotify: { emoji: '🟢', name: 'Spotify', color: '#1DB954' },
    unknown: { emoji: '🎵', name: 'Music', color: COLORS.info }
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
    private _getSourceInfo(track: Track): SourceInfo {
        const source = (track?.source?.toLowerCase() || 'unknown') as SourcePlatform;
        return SOURCE_PLATFORM[source] || SOURCE_PLATFORM.unknown;
    }

    /**
     * Create a visual progress bar
     */
    private _createMusicBar(current: number, total: number, length: number = 15): string {
        const progress = Math.min(current / total, 1);
        const filled = Math.round(progress * length);
        const empty = length - filled;
        const slider = '🔘';
        
        if (filled === 0) return `${slider}${'▬'.repeat(length)}`;
        if (filled === length) return `${'▬'.repeat(length)}${slider}`;
        return `${'▬'.repeat(filled)}${slider}${'▬'.repeat(empty)}`;
    }

    /**
     * Create volume bar visual
     */
    private _createVolumeBar(volume: number, length: number = 8): string {
        const maxVol = 200;
        const filled = Math.round((volume / maxVol) * length);
        return '▰'.repeat(Math.min(filled, length)) + '▱'.repeat(Math.max(0, length - filled));
    }

    /**
     * Truncate string to specified length
     */
    private _truncate(str: string | undefined, length: number): string {
        if (!str) return 'Unknown';
        return str.length > length ? str.substring(0, length - 3) + '...' : str;
    }

    /**
     * Create progress bar for votes/progress
     */
    private _createProgressBar(current: number, max: number, length: number = 10): string {
        const filled = Math.round((current / max) * length);
        const empty = length - filled;
        return '🟩'.repeat(filled) + '⬜'.repeat(empty) + ` ${Math.round((current / max) * 100)}%`;
    }

    /**
     * Get time ago string
     */
    private _timeAgo(timestamp: number): string {
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        
        if (seconds < 60) return 'just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
        return `${Math.floor(seconds / 604800)}w ago`;
    }

    /**
     * Create now playing embed - Clean version with 3 fields per row
     */
    createNowPlayingEmbed(track: Track, options: NowPlayingOptions = {}): EmbedBuilder {
        const {
            volume = 100,
            isPaused = false,
            loopMode = 'off',
            isShuffled = false,
            queueLength = 0,
            position = 0,
            player = null,
            requester = null,
            nextTrack = null,
            loopCount = 0,
            voteSkipCount = 0,
            voteSkipRequired = 0
        } = options;

        const sourceInfo = this._getSourceInfo(track);
        const color = isPaused ? COLORS.paused : COLORS.playing;
        const loopInfo = LOOP_DISPLAY[loopMode];

        // Status icon
        let statusIcon = isPaused ? PAUSED_EMOJI : `${DECORATIONS.disc} ${NOW_PLAYING_EMOJI}`;
        if (loopMode === 'track' && loopCount > 0) {
            statusIcon = `🔂 ${NOW_PLAYING_EMOJI} (Looped ${loopCount}x)`;
        }

        const embed = new EmbedBuilder()
            .setColor(color as `#${string}`)
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
        embed.addFields(
            { name: '🎤 Artist', value: track.author || 'Unknown Artist', inline: true },
            { name: '⏱️ Duration', value: fmtDur(track.lengthSeconds), inline: true },
            { name: `${sourceInfo.emoji} Source`, value: `${sourceInfo.name} ${searchTypeText}`, inline: true }
        );

        // Row 2: Volume, Playback, Shuffle
        const volBar = this._createVolumeBar(volume);
        embed.addFields(
            { name: '🔊 Volume', value: `${volBar} ${volume}%`, inline: true },
            { name: '🔁 Playback', value: `${loopInfo.emoji} ${loopInfo.label}`, inline: true },
            { name: '🔀 Shuffle', value: isShuffled ? '✅ On' : '➡️ Off', inline: true }
        );

        // Row 3: Looped count, Vote-skip, Queue size
        let loopedText = '—';
        if (loopMode === 'track') {
            loopedText = loopCount > 0 ? `🔂 ${loopCount}x` : '🔂 Active';
        } else if (loopMode === 'queue') {
            loopedText = '🔁 Queue';
        }
        
        const voteSkipText = voteSkipRequired <= 1 
            ? '✅ Skippable' 
            : `${voteSkipCount} / ${voteSkipRequired}`;
        
        const queueSizeText = queueLength > 0 
            ? `${queueLength} song${queueLength !== 1 ? 's' : ''}` 
            : 'Empty';
        
        embed.addFields(
            { name: '🔂 Looped', value: loopedText, inline: true },
            { name: '🗳️ Vote-skip', value: voteSkipText, inline: true },
            { name: '📋 Queue', value: queueSizeText, inline: true }
        );

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
    createControlButtons(guildId: string, options: ControlButtonsOptions = {}): ActionRowBuilder<ButtonBuilder>[] {
        const {
            isPaused = false,
            loopMode = 'off',
            isShuffled = false,
            trackUrl = null,
            userId = '',
            autoPlay = false
        } = options;

        const rows: ActionRowBuilder<ButtonBuilder>[] = [];
        const loopInfo = LOOP_DISPLAY[loopMode];

        // Row 1: Main playback controls
        const controlRow = new ActionRowBuilder<ButtonBuilder>();
        controlRow.addComponents(
            new ButtonBuilder()
                .setCustomId(`music_pause:${guildId}`)
                .setLabel(isPaused ? 'Resume' : 'Pause')
                .setEmoji(isPaused ? '▶️' : '⏸️')
                .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`music_stop:${guildId}`)
                .setLabel('Stop')
                .setEmoji('⏹️')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`music_skip:${guildId}`)
                .setLabel('Skip')
                .setEmoji('⏭️')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`music_loop:${guildId}`)
                .setLabel(loopInfo.text)
                .setEmoji(loopInfo.emoji)
                .setStyle(loopMode !== 'off' ? ButtonStyle.Success : ButtonStyle.Secondary)
                .setDisabled(autoPlay),
            new ButtonBuilder()
                .setCustomId(`music_shuffle:${guildId}`)
                .setLabel('Shuffle')
                .setEmoji('🔀')
                .setStyle(isShuffled ? ButtonStyle.Success : ButtonStyle.Secondary)
                .setDisabled(autoPlay)
        );
        rows.push(controlRow);

        // Row 2: Volume, queue and autoplay controls
        const volumeRow = new ActionRowBuilder<ButtonBuilder>();
        volumeRow.addComponents(
            new ButtonBuilder()
                .setCustomId(`music_voldown:${guildId}`)
                .setLabel('-10')
                .setEmoji('🔉')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`music_volup:${guildId}`)
                .setLabel('+10')
                .setEmoji('🔊')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`music_queue:${guildId}`)
                .setLabel('Queue')
                .setEmoji('📋')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`music_autoplay:${guildId}`)
                .setLabel('Autoplay')
                .setEmoji('🎵')
                .setStyle(autoPlay ? ButtonStyle.Success : ButtonStyle.Secondary)
        );
        rows.push(volumeRow);

        // Row 3: Extra features
        if (trackUrl) {
            const extraRow = new ActionRowBuilder<ButtonBuilder>();
            extraRow.addComponents(
                new ButtonBuilder()
                    .setLabel('Open Link')
                    .setStyle(ButtonStyle.Link)
                    .setURL(trackUrl)
                    .setEmoji('🔗'),
                new ButtonBuilder()
                    .setCustomId(`music_lyrics:${guildId}`)
                    .setLabel('Lyrics')
                    .setEmoji('📝')
                    .setStyle(ButtonStyle.Primary)
            );
            
            const voteSkipButton = new ButtonBuilder()
                .setCustomId(`music_voteskip:${guildId}`)
                .setEmoji('🗳️')
                .setStyle(ButtonStyle.Secondary);
            
            if (options.listenerCount && options.listenerCount <= 1) {
                voteSkipButton.setLabel('Vote Skip').setDisabled(true);
            } else {
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
    createQueuedEmbed(track: Track, position: number, requester?: User): EmbedBuilder {
        const sourceInfo = this._getSourceInfo(track);
        
        const embed = new EmbedBuilder()
            .setColor(COLORS.queued as `#${string}`)
            .setAuthor({ name: 'Added to Queue' })
            .setTitle(track.title)
            .setURL(track.url)
            .setDescription(
                `**Artist:** ${track.author || 'Unknown Artist'}\n` +
                `**Duration:** ${fmtDur(track.lengthSeconds)}\n` +
                `**Source:** ${sourceInfo.emoji} ${sourceInfo.name}`
            )
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
    createPriorityQueuedEmbed(track: Track, requester?: User): EmbedBuilder {
        const sourceInfo = this._getSourceInfo(track);
        
        const embed = new EmbedBuilder()
            .setColor(COLORS.success as `#${string}`)
            .setAuthor({ name: 'Priority Added - Playing Next!' })
            .setTitle(track.title)
            .setURL(track.url)
            .setDescription(
                `**Artist:** ${track.author || 'Unknown Artist'}\n` +
                `**Duration:** ${fmtDur(track.lengthSeconds)}\n` +
                `**Source:** ${sourceInfo.emoji} ${sourceInfo.name}\n\n` +
                `*This track was added to the front of the queue.*`
            );

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
    createPlaylistEmbed(playlistName: string, trackCount: number, requester?: User, firstTrack?: Track): EmbedBuilder {
        const embed = new EmbedBuilder()
            .setColor(COLORS.queued as `#${string}`)
            .setAuthor({ name: 'Playlist Added' })
            .setTitle(playlistName || 'Playlist')
            .setDescription(
                `**Total Tracks:** ${trackCount}\n` +
                `**First Track:** ${firstTrack?.title || 'Loading...'}`
            );

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
    createQueueListEmbed(tracks: Track[], currentTrack: Track | null, options: QueueListOptions = {}): EmbedBuilder {
        const { page = 1, perPage = 10, loopMode = 'off', isShuffled = false, volume = 100 } = options;
        
        const totalPages = Math.ceil(tracks.length / perPage) || 1;
        const start = (page - 1) * perPage;
        const pageItems = tracks.slice(start, start + perPage);
        const loopInfo = LOOP_DISPLAY[loopMode];

        const embed = new EmbedBuilder()
            .setColor(COLORS.info as `#${string}`)
            .setAuthor({ name: 'Music Queue' });

        // Current track section
        if (currentTrack) {
            embed.setTitle('Now Playing');
            embed.setDescription(
                `**[${currentTrack.title}](${currentTrack.url})**\n` +
                `${currentTrack.author || 'Unknown'} • ${fmtDur(currentTrack.lengthSeconds)}`
            );
            
            if (currentTrack.thumbnail) {
                embed.setThumbnail(currentTrack.thumbnail);
            }
        }

        // Queue items
        if (pageItems.length > 0) {
            const queueText = pageItems.map((track, i) => {
                const position = start + i + 1;
                const title = this._truncate(track.title, 40);
                const duration = fmtDur(track.lengthSeconds);
                return `\`${String(position).padStart(2, '0')}.\` [${title}](${track.url})\n　　 ${duration} • ${this._truncate(track.author, 20)}`;
            }).join('\n\n');

            embed.addFields({ 
                name: `📑 Up Next (${tracks.length} track${tracks.length !== 1 ? 's' : ''})`, 
                value: queueText, 
                inline: false 
            });
        } else if (!currentTrack) {
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
            `⏱️ ${fmtDur(totalDuration + currentDuration)}`
        ].filter(Boolean).join(' │ ');

        embed.setFooter({ 
            text: `Page ${page}/${totalPages} │ ${statusLine}`
        });

        return embed;
    }

    /**
     * Create queue pagination buttons
     */
    createQueuePaginationButtons(guildId: string, currentPage: number, totalPages: number): ActionRowBuilder<ButtonBuilder> {
        const row = new ActionRowBuilder<ButtonBuilder>();
        
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`music_qpage:${guildId}:first`)
                .setLabel('First')
                .setEmoji('⏮️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(currentPage <= 1),
            new ButtonBuilder()
                .setCustomId(`music_qpage:${guildId}:prev`)
                .setLabel('Prev')
                .setEmoji('◀️')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(currentPage <= 1),
            new ButtonBuilder()
                .setCustomId(`music_qpage:${guildId}:info`)
                .setLabel(`${currentPage} / ${totalPages}`)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId(`music_qpage:${guildId}:next`)
                .setLabel('Next')
                .setEmoji('▶️')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(currentPage >= totalPages),
            new ButtonBuilder()
                .setCustomId(`music_qpage:${guildId}:last`)
                .setLabel('Last')
                .setEmoji('⏭️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(currentPage >= totalPages)
        );

        return row;
    }

    /**
     * Create skip vote embed
     */
    createSkipVoteEmbed(track: Track | null, currentVotes: number, requiredVotes: number, timeRemaining?: number): EmbedBuilder {
        const progress = this._createProgressBar(currentVotes, requiredVotes, 10);
        
        const embed = new EmbedBuilder()
            .setColor(COLORS.warning as `#${string}`)
            .setAuthor({ name: '🗳️ Vote Skip Started' })
            .setTitle('Skip the current track?')
            .setDescription(
                `**Track:** ${track?.title || 'Unknown'}\n\n` +
                `${DECORATIONS.dotLine}\n\n` +
                `**Votes:** \`${currentVotes}\` / \`${requiredVotes}\`\n` +
                `${progress}\n\n` +
                `Click the button below to add your vote!`
            );

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
    createSkipVoteButton(guildId: string, currentVotes: number, requiredVotes: number): ActionRowBuilder<ButtonBuilder> {
        const row = new ActionRowBuilder<ButtonBuilder>();
        
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`music_voteskip_add:${guildId}`)
                .setLabel(`Vote to Skip (${currentVotes}/${requiredVotes})`)
                .setEmoji('🗳️')
                .setStyle(ButtonStyle.Primary)
        );

        return row;
    }

    /**
     * Create lyrics embed
     */
    createLyricsEmbed(track: Track, lyrics: string): EmbedBuilder {
        const maxLength = 4000;
        let displayLyrics = lyrics;
        
        if (lyrics.length > maxLength) {
            displayLyrics = lyrics.substring(0, maxLength - 50) + '\n\n... *[Lyrics truncated]*';
        }

        const embed = new EmbedBuilder()
            .setColor(COLORS.lyrics as `#${string}`)
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
    createInfoEmbed(title: string, description: string, type: InfoEmbedType = 'info'): EmbedBuilder {
        const colors: Record<InfoEmbedType, string> = {
            info: COLORS.info,
            success: COLORS.success,
            warning: COLORS.warning,
            error: COLORS.error
        };

        const icons: Record<InfoEmbedType, string> = {
            info: 'ℹ️',
            success: '✅',
            warning: '⚠️',
            error: '❌'
        };

        return new EmbedBuilder()
            .setColor(colors[type] as `#${string}`)
            .setTitle(`${icons[type] || ''} ${title}`)
            .setDescription(description)
            .setTimestamp();
    }

    /**
     * Create error embed
     */
    createErrorEmbed(message: string): EmbedBuilder {
        return new EmbedBuilder()
            .setColor(COLORS.error as `#${string}`)
            .setTitle('❌ Error')
            .setDescription(`${message}\n\n*If this persists, try again later.*`)
            .setTimestamp();
    }

    /**
     * Create song finished embed
     */
    createSongFinishedEmbed(track: Track | null): EmbedBuilder {
        return new EmbedBuilder()
            .setColor(COLORS.info as `#${string}`)
            .setTitle('✅ Track Finished')
            .setDescription(`Finished: **${track?.title || 'Unknown'}**`)
            .setTimestamp();
    }

    /**
     * Create queue finished embed
     */
    createQueueFinishedEmbed(lastTrack: Track | null = null): EmbedBuilder {
        const songFinishedText = lastTrack 
            ? `**${this._truncate(lastTrack.title, 50)}** has finished playing.`
            : 'All songs have finished playing.';
        
        return new EmbedBuilder()
            .setColor(COLORS.info as `#${string}`)
            .setAuthor({ name: '📋 Queue Complete' })
            .setDescription(
                `${songFinishedText}\n\n` +
                `The queue is now empty.\n` +
                `Use \`/music play\` to add more songs!`
            )
            .setTimestamp();
    }

    /**
     * Create disconnected embed
     */
    createDisconnectedEmbed(): EmbedBuilder {
        return new EmbedBuilder()
            .setColor(COLORS.warning as `#${string}`)
            .setAuthor({ name: 'Disconnected' })
            .setDescription('Left the voice channel due to inactivity.\nUse `/music play` to start playing again!')
            .setTimestamp();
    }

    /**
     * Create stopped by user embed
     */
    createStoppedByUserEmbed(user?: User | { displayName?: string; username?: string }): EmbedBuilder {
        const displayName = user 
            ? ('displayName' in user ? user.displayName : user.username) || 'a user'
            : 'a user';
            
        return new EmbedBuilder()
            .setColor(COLORS.stopped as `#${string}`)
            .setAuthor({ name: 'Playback Stopped' })
            .setDescription(`Music was stopped by ${displayName}`)
            .setTimestamp();
    }

    /**
     * Create favorites list embed
     */
    createFavoritesEmbed(favorites: Track[], userId: string, page: number = 1, perPage: number = 10): EmbedBuilder {
        const totalPages = Math.ceil(favorites.length / perPage) || 1;
        const start = (page - 1) * perPage;
        const pageItems = favorites.slice(start, start + perPage);

        const embed = new EmbedBuilder()
            .setColor(COLORS.favorites as `#${string}`)
            .setAuthor({ name: '💖 Your Favorites' })
            .setTitle(`${favorites.length} saved song${favorites.length !== 1 ? 's' : ''}`);

        if (pageItems.length > 0) {
            const favText = pageItems.map((fav, i) => {
                const position = start + i + 1;
                const title = this._truncate(fav.title, 40);
                const duration = fmtDur(fav.duration || fav.lengthSeconds);
                return `\`${String(position).padStart(2, '0')}.\` **[${title}](${fav.url})**\n　　 ⏱️ ${duration}`;
            }).join('\n\n');

            embed.setDescription(`${DECORATIONS.dotLine}\n\n${favText}\n\n${DECORATIONS.dotLine}`);
        } else {
            embed.setDescription(
                `${DECORATIONS.dotLine}\n\n` +
                `You haven't saved any favorites yet!\n\n` +
                `Use the 🤍 button while playing music to save songs.\n\n` +
                `${DECORATIONS.dotLine}`
            );
        }

        embed.setFooter({ 
            text: `Page ${page}/${totalPages} • Use /music favorites play <number> to play`
        });

        return embed;
    }

    /**
     * Create history embed
     */
    createHistoryEmbed(history: Track[], userId: string, page: number = 1, perPage: number = 10): EmbedBuilder {
        const totalPages = Math.ceil(history.length / perPage) || 1;
        const start = (page - 1) * perPage;
        const pageItems = history.slice(start, start + perPage);

        const embed = new EmbedBuilder()
            .setColor(COLORS.history as `#${string}`)
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
        } else {
            embed.setDescription(
                `${DECORATIONS.dotLine}\n\n` +
                `No listening history yet!\n\n` +
                `Start playing some music to build your history.\n\n` +
                `${DECORATIONS.dotLine}`
            );
        }

        embed.setFooter({ 
            text: `Page ${page}/${totalPages} • Use /music history play <number> to replay`
        });

        return embed;
    }

    /**
     * Create settings embed
     */
    createSettingsEmbed(userId: string): EmbedBuilder {
        const prefs = musicCache.getPreferences(userId);

        const embed = new EmbedBuilder()
            .setColor(COLORS.info as `#${string}`)
            .setAuthor({ name: '⚙️ Music Settings' })
            .setTitle('Personal Preferences')
            .setDescription(
                `${DECORATIONS.line}\n\n` +
                `Customize your music experience below.\n` +
                `Changes apply to you only.\n\n` +
                `${DECORATIONS.line}`
            )
            .addFields(
                { 
                    name: '🔊 Default Volume', 
                    value: `\`${prefs.defaultVolume}%\``, 
                    inline: true 
                },
                { 
                    name: '⏱️ Max Track Duration', 
                    value: prefs.maxTrackDuration >= 99999 ? '`Unlimited`' : `\`${Math.floor(prefs.maxTrackDuration / 60)} min\``, 
                    inline: true 
                },
                { 
                    name: '📋 Max Queue Size', 
                    value: `\`${prefs.maxQueueSize} tracks\``, 
                    inline: true 
                },
                { 
                    name: '📢 Track Announcements', 
                    value: prefs.announceTrack ? '✅ Enabled' : '❌ Disabled', 
                    inline: true 
                },
                { 
                    name: '🗳️ Vote Skip Required', 
                    value: prefs.voteSkipEnabled ? '✅ Enabled' : '❌ Disabled', 
                    inline: true 
                },
                { 
                    name: '🖼️ Show Thumbnails', 
                    value: prefs.showThumbnails ? '✅ Enabled' : '❌ Disabled', 
                    inline: true 
                }
            )
            .setFooter({ text: 'Use the menus below to change settings' });

        return embed;
    }

    /**
     * Create settings select menus
     */
    createSettingsComponents(userId: string): ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] {
        const prefs = musicCache.getPreferences(userId);
        const rows: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];

        // Volume select
        const volumeSelect = new StringSelectMenuBuilder()
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
        rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(volumeSelect));

        // Max duration select
        const durationSelect = new StringSelectMenuBuilder()
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
        rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(durationSelect));

        // Toggles row
        const toggleRow = new ActionRowBuilder<ButtonBuilder>();
        toggleRow.addComponents(
            new ButtonBuilder()
                .setCustomId(`music_setting_announce:${userId}`)
                .setLabel(prefs.announceTrack ? 'Announce: ON' : 'Announce: OFF')
                .setEmoji('📢')
                .setStyle(prefs.announceTrack ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`music_setting_voteskip:${userId}`)
                .setLabel(prefs.voteSkipEnabled ? 'Vote Skip: ON' : 'Vote Skip: OFF')
                .setEmoji('🗳️')
                .setStyle(prefs.voteSkipEnabled ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`music_setting_thumbnails:${userId}`)
                .setLabel(prefs.showThumbnails ? 'Thumbnails: ON' : 'Thumbnails: OFF')
                .setEmoji('🖼️')
                .setStyle(prefs.showThumbnails ? ButtonStyle.Success : ButtonStyle.Secondary)
        );
        rows.push(toggleRow);

        return rows;
    }

    /**
     * Create long video confirmation embed
     */
    createLongVideoConfirmEmbed(track: Track, maxDuration: number): EmbedBuilder {
        const embed = new EmbedBuilder()
            .setColor(COLORS.warning as `#${string}`)
            .setAuthor({ name: '⚠️ Long Track Warning' })
            .setTitle(track.title)
            .setURL(track.url)
            .setDescription(
                `This track is **${fmtDur(track.lengthSeconds)}** long!\n\n` +
                `Your current limit is set to **${fmtDur(maxDuration)}**.\n\n` +
                `Do you want to add it anyway?`
            );

        if (track.thumbnail) {
            embed.setThumbnail(track.thumbnail);
        }

        embed.setFooter({ text: 'This confirmation expires in 20 seconds' });

        return embed;
    }

    /**
     * Create confirmation buttons
     */
    createConfirmButtons(guildId: string, action: string): ActionRowBuilder<ButtonBuilder> {
        const row = new ActionRowBuilder<ButtonBuilder>();
        
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`music_confirm:${guildId}:${action}:yes`)
                .setLabel('Yes, Add It')
                .setEmoji('✅')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`music_confirm:${guildId}:${action}:no`)
                .setLabel('Cancel')
                .setEmoji('❌')
                .setStyle(ButtonStyle.Danger)
        );

        return row;
    }

    /**
     * Disable all buttons in rows
     */
    disableButtons(rows: ActionRowBuilder<ButtonBuilder>[]): ActionRowBuilder<ButtonBuilder>[] {
        return rows.map(row => {
            const newRow = ActionRowBuilder.from<ButtonBuilder>(row);
            newRow.components.forEach(component => {
                if (component.data.style !== ButtonStyle.Link) {
                    component.setDisabled(true);
                }
            });
            return newRow;
        });
    }
}

// Export singleton instance
export const trackHandler = new TrackHandler();
export default trackHandler;

// Export class for type usage
export { TrackHandler };

