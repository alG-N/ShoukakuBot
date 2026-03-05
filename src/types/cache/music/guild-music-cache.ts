export interface GuildMusicSettings {
    defaultVolume: number;
    autoPlay: boolean;
    announceNowPlaying: boolean;
    twentyFourSeven: boolean;
    djRole: string | null;
    textChannelLock: string | null;
    maxQueueSize: number;
    voteSkipEnabled: boolean;
    voteSkipThreshold: number;
    updatedAt: number;
    _lastAccessed?: number;
}

export interface RecentlyPlayedTrack {
    url: string;
    title: string;
    author?: string | null;
    thumbnail?: string | null;
    requestedBy: string;
    playedAt: number;
}

export interface RecentlyPlayedEntry {
    tracks: RecentlyPlayedTrack[];
    _lastAccessed: number;
}

export interface DJLockState {
    enabled: boolean;
    djUserId: string | null;
    lockedAt?: number;
}

export interface CachedPlaylist {
    cachedAt: number;
    [key: string]: any;
}

export interface GuildMusicCacheStats {
    guildSettings: number;
    recentlyPlayed: number;
    djLocks: number;
    playlistCache: number;
    maxGuilds: number;
}
