/**
 * Music Caches
 * In-memory caching for music playback state
 * Note: These are per-shard caches, not database repositories
 * @module cache/music
 */

// Main facade (backward compatible)
export { default as MusicCache, musicCacheFacade as MusicCacheFacade } from './MusicCacheFacade';

// Individual caches
export { default as queueCache, queueCache as QueueCache } from './QueueCache';
export { default as userMusicCache, userMusicCache as UserMusicCache } from './UserMusicCache';
export { default as guildMusicCache, guildMusicCache as GuildMusicCache } from './GuildMusicCache';
export { default as voteCache, voteCache as VoteCache } from './VoteCache';

// Type exports
export type {
    MusicTrack,
    MusicQueue,
    AddTrackResult,
    AddTracksResult,
    QueueStats
} from './QueueCache';

export type {
    UserPreferences,
    FavoriteTrack,
    HistoryTrack,
    FavoritesEntry,
    HistoryEntry,
    AddFavoriteResult,
    UserMusicStats
} from './UserMusicCache';

export type {
    SkipVoteSession,
    PriorityVoteSession,
    VoteResult,
    AddVoteResult,
    PriorityVoteEndResult,
    VoteSkipStatus,
    VoteCacheStats
} from './VoteCache';

export type {
    GuildMusicSettings,
    RecentlyPlayedTrack,
    RecentlyPlayedEntry,
    DJLockState,
    CachedPlaylist,
    GuildMusicCacheStats
} from './GuildMusicCache';

export type { MusicCacheStats } from './MusicCacheFacade';
