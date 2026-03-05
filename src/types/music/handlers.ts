import type { Guild } from 'discord.js';
import type { Track } from './track.js';

export type FavoritesSubcommand = 'list' | 'play' | 'remove' | 'clear';

export type HistorySubcommand = 'list' | 'play' | 'clear';

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

export interface PlayerStatus {
    position: number;
    ping?: number;
}
