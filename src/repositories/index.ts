/**
 * Repositories - Data access layer organized by feature
 * Note: Music caches have been moved to src/cache/music/
 */

// Import all repository modules
import * as api from './api';
import * as moderation from './moderation';
import * as general from './general';

// Re-export all modules
export { api, moderation, general };

// Re-export individual repositories for convenience
export { 
    animeRepository, 
    cacheManager, 
    nhentaiRepository, 
    pixivCache, 
    redditCache, 
    rule34Cache 
} from './api';

// Music caches are now in src/cache/music/
// Import from there: import { MusicCache } from '../../cache/music';

export { 
    InfractionRepository, 
    AutoModRepository, 
    FilterRepository, 
    ModLogRepository 
} from './moderation';

export {
    afkRepository,
    AfkRepository
} from './general';

// Default export
export default {
    api,
    moderation,
    general
};
