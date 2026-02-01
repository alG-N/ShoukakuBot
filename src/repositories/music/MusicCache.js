/**
 * Music Cache Manager
 * 
 * DEPRECATED: This file is now a re-export of MusicCacheFacade for backward compatibility.
 * The cache has been split into smaller, more manageable modules:
 * 
 * - QueueCache: Guild queue management with size limits
 * - UserMusicCache: User preferences, favorites, history
 * - VoteCache: Skip/priority voting
 * - GuildMusicCache: Guild settings, recently played, DJ lock
 * 
 * For new code, consider importing specific caches:
 * const queueCache = require('./QueueCache');
 * const userMusicCache = require('./UserMusicCache');
 * 
 * @module modules/music/repository/MusicCache
 * @deprecated Use MusicCacheFacade or specific cache modules
 */

// Re-export the facade for backward compatibility
module.exports = require('./MusicCacheFacade');
