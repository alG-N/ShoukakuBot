import type queueCache from '../../../cache/music/QueueCache.js';
import type voteCache from '../../../cache/music/VoteCache.js';
import type guildMusicCache from '../../../cache/music/GuildMusicCache.js';
import type { UserMusicStats } from '../../../cache/music/UserMusicCache.js';

export interface MusicCacheStats {
    queue: ReturnType<typeof queueCache.getStats>;
    user: UserMusicStats;
    vote: ReturnType<typeof voteCache.getStats>;
    guild: ReturnType<typeof guildMusicCache.getStats>;
}
