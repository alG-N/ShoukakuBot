/**
 * Music Caches
 * In-memory caching for music playback state
 * Note: These are per-shard caches, not database repositories
 * @module cache/music
 */

// Main facade (backward compatible)
export { default as MusicCache, musicCacheFacade as MusicCacheFacade } from './MusicCacheFacade.js';

// Individual caches
export { default as queueCache, queueCache as QueueCache } from './QueueCache.js';
export { default as userMusicCache, userMusicCache as UserMusicCache } from './UserMusicCache.js';
export { default as guildMusicCache, guildMusicCache as GuildMusicCache } from './GuildMusicCache.js';
export { default as voteCache, voteCache as VoteCache } from './VoteCache.js';

// Type exports
export type {
    MusicTrack,
    MusicQueue,
    MessageRef,
    AddTrackResult,
    AddTracksResult,
    QueueStats
} from './QueueCache.js';

export type {
    UserPreferences,
    FavoriteTrack,
    HistoryTrack,
    FavoritesEntry,
    HistoryEntry,
    AddFavoriteResult,
    UserMusicStats
} from './UserMusicCache.js';

export type {
    SkipVoteSession,
    PriorityVoteSession,
    VoteResult,
    AddVoteResult,
    PriorityVoteEndResult,
    VoteSkipStatus,
    VoteCacheStats
} from './VoteCache.js';

export type {
    GuildMusicSettings,
    RecentlyPlayedTrack,
    RecentlyPlayedEntry,
    DJLockState,
    CachedPlaylist,
    GuildMusicCacheStats
} from './GuildMusicCache.js';

export type { MusicCacheStats } from './MusicCacheFacade.js';
