/**
 * Music Repositories (Caches)
 */
const MusicCache = require('./MusicCache');
const MusicCacheFacade = require('./MusicCacheFacade');
const QueueCache = require('./QueueCache');
const UserMusicCache = require('./UserMusicCache');
const GuildMusicCache = require('./GuildMusicCache');
const VoteCache = require('./VoteCache');

module.exports = {
    MusicCache,
    MusicCacheFacade,
    QueueCache,
    UserMusicCache,
    GuildMusicCache,
    VoteCache
};
