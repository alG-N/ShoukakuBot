/**
 * Track Handler — Embed Builders
 * Pure functions for creating Discord embeds for music UI
 * Extracted from trackHandler.ts for modularity
 * @module handlers/music/trackEmbeds
 */

import { EmbedBuilder, User } from 'discord.js';
import musicCache from '../../cache/music/MusicCacheFacade.js';
import { formatSecondsToTime as fmtDur } from '../../utils/music/index.js';
import {
    type Track,
    type LoopMode,
    type SourcePlatform,
    type NowPlayingOptions,
    type QueueListOptions,
    type InfoEmbedType,
    type SourceInfo,
    COLORS,
    LOOP_DISPLAY,
    SOURCE_PLATFORM,
    DECORATIONS,
    NOW_PLAYING_EMOJI,
    PAUSED_EMOJI
} from './trackTypes.js';

// ─── Utility Functions ──────────────────────────────────────

/**
 * Get source info for a track
 */
export function getSourceInfo(track: Track): SourceInfo {
    const source = (track?.source?.toLowerCase() || 'unknown') as SourcePlatform;
    return SOURCE_PLATFORM[source] || SOURCE_PLATFORM.unknown;
}

/**
 * Create a visual progress bar
 */
export function createMusicBar(current: number, total: number, length: number = 15): string {
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
export function createVolumeBar(volume: number, length: number = 8): string {
    const maxVol = 200;
    const filled = Math.round((volume / maxVol) * length);
    return '▰'.repeat(Math.min(filled, length)) + '▱'.repeat(Math.max(0, length - filled));
}

/**
 * Truncate string to specified length
 */
export function truncate(str: string | undefined, length: number): string {
    if (!str) return 'Unknown';
    return str.length > length ? str.substring(0, length - 3) + '...' : str;
}

/**
 * Create progress bar for votes/progress
 */
export function createProgressBar(current: number, max: number, length: number = 10): string {
    const filled = Math.round((current / max) * length);
    const empty = length - filled;
    return '🟩'.repeat(filled) + '⬜'.repeat(empty) + ` ${Math.round((current / max) * 100)}%`;
}

/**
 * Get time ago string
 */
export function timeAgo(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return `${Math.floor(seconds / 604800)}w ago`;
}

// ─── Embed Builders ─────────────────────────────────────────

/**
 * Create now playing embed — Clean version with 3 fields per row
 */
export function createNowPlayingEmbed(track: Track, options: NowPlayingOptions = {}): EmbedBuilder {
    const {
        volume = 100,
        isPaused = false,
        loopMode = 'off',
        isShuffled = false,
        queueLength = 0,
        loopCount = 0,
        voteSkipCount = 0,
        voteSkipRequired = 0
    } = options;

    const sourceInfo = getSourceInfo(track);
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
            ? `[🔍 ${truncate(track.originalQuery, 20)}]`
            : '[Search]';

    // Row 1: Artist, Duration, Source
    embed.addFields(
        { name: '🎤 Artist', value: track.author || 'Unknown Artist', inline: true },
        { name: '⏱️ Duration', value: fmtDur(track.lengthSeconds), inline: true },
        { name: `${sourceInfo.emoji} Source`, value: `${sourceInfo.name} ${searchTypeText}`, inline: true }
    );

    // Row 2: Volume, Playback, Shuffle
    const volBar = createVolumeBar(volume);
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
    if (options.nextTrack) {
        embed.addFields({
            name: '⏭️ Up Next',
            value: `${truncate(options.nextTrack.title, 50)} • ${options.nextTrack.author || 'Unknown'}`,
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
 * Create queued track embed
 */
export function createQueuedEmbed(track: Track, position: number, requester?: User): EmbedBuilder {
    const sourceInfo = getSourceInfo(track);

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
export function createPriorityQueuedEmbed(track: Track, requester?: User): EmbedBuilder {
    const sourceInfo = getSourceInfo(track);

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
export function createPlaylistEmbed(playlistName: string, trackCount: number, requester?: User, firstTrack?: Track): EmbedBuilder {
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
export function createQueueListEmbed(tracks: Track[], currentTrack: Track | null, options: QueueListOptions = {}): EmbedBuilder {
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
            const title = truncate(track.title, 40);
            const duration = fmtDur(track.lengthSeconds);
            return `\`${String(position).padStart(2, '0')}.\` [${title}](${track.url})\n　　 ${duration} • ${truncate(track.author, 20)}`;
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
 * Create skip vote embed
 */
export function createSkipVoteEmbed(track: Track | null, currentVotes: number, requiredVotes: number, timeRemaining?: number): EmbedBuilder {
    const progress = createProgressBar(currentVotes, requiredVotes, 10);

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
 * Create lyrics embed
 */
export function createLyricsEmbed(track: Track, lyrics: string): EmbedBuilder {
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
export function createInfoEmbed(title: string, description: string, type: InfoEmbedType = 'info'): EmbedBuilder {
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
export function createErrorEmbed(message: string): EmbedBuilder {
    return new EmbedBuilder()
        .setColor(COLORS.error as `#${string}`)
        .setTitle('❌ Error')
        .setDescription(`${message}\n\n*If this persists, try again later.*`)
        .setTimestamp();
}

/**
 * Create song finished embed
 */
export function createSongFinishedEmbed(track: Track | null): EmbedBuilder {
    return new EmbedBuilder()
        .setColor(COLORS.info as `#${string}`)
        .setTitle('✅ Track Finished')
        .setDescription(`Finished: **${track?.title || 'Unknown'}**`)
        .setTimestamp();
}

/**
 * Create queue finished embed
 */
export function createQueueFinishedEmbed(lastTrack: Track | null = null): EmbedBuilder {
    const songFinishedText = lastTrack
        ? `**${truncate(lastTrack.title, 50)}** has finished playing.`
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
export function createDisconnectedEmbed(): EmbedBuilder {
    return new EmbedBuilder()
        .setColor(COLORS.warning as `#${string}`)
        .setAuthor({ name: 'Disconnected' })
        .setDescription('Left the voice channel due to inactivity.\nUse `/music play` to start playing again!')
        .setTimestamp();
}

/**
 * Create stopped by user embed
 */
export function createStoppedByUserEmbed(user?: User | { displayName?: string; username?: string }): EmbedBuilder {
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
export function createFavoritesEmbed(favorites: Track[], userId: string, page: number = 1, perPage: number = 10): EmbedBuilder {
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
            const title = truncate(fav.title, 40);
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
export function createHistoryEmbed(history: Track[], userId: string, page: number = 1, perPage: number = 10): EmbedBuilder {
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
            const title = truncate(item.title, 35);
            const ta = timeAgo(item.playedAt || Date.now());
            return `\`${String(position).padStart(2, '0')}.\` **[${title}](${item.url})**\n　　 🕐 ${ta}`;
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
export async function createSettingsEmbed(userId: string): Promise<EmbedBuilder> {
    const prefs = await musicCache.getPreferences(userId);

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
 * Create long video confirmation embed
 */
export function createLongVideoConfirmEmbed(track: Track, maxDuration: number): EmbedBuilder {
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
