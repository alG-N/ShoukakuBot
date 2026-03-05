/**
 * API Repositories - Data caching for API services
 */

// Import all repositories
import animeRepository, { AnimeRepository } from './animeRepository.js';
import type { AnimeFavourite, AnimeNotification } from './animeRepository.js';

import nhentaiRepository, { NHentaiRepository } from './nhentaiRepository.js';
import type { NHentaiGallery, NHentaiTag, NHentaiFavourite, ToggleFavouriteResult } from './nhentaiRepository.js';

import pixivCache, { PixivCache } from './pixivCache.js';
import type { PixivCacheSearchResult, PixivResultData } from './pixivCache.js';

import redditCache, { RedditCache } from './redditCache.js';
import type { RedditPost, SortType as RedditSortType } from './redditCache.js';

import rule34Cache, { Rule34Cache } from './rule34Cache.js';
import type {
    Rule34Session,
    PaginationState,
    SearchCacheEntry,
    AutocompleteEntry,
    Rule34Favorite,
    Rule34HistoryEntry,
    Rule34UserPreferences,
    Rule34CacheStats,
    FavoriteResult
} from './rule34Cache.js';

// Re-export instances and classes
export {
    // Instances
    animeRepository,
    nhentaiRepository,
    pixivCache,
    redditCache,
    rule34Cache,
    
    // Classes
    AnimeRepository,
    NHentaiRepository,
    PixivCache,
    RedditCache,
    Rule34Cache
};

// Re-export types separately
export { type // Types - Anime
    AnimeFavourite, type AnimeNotification, type // Types - NHentai
    NHentaiGallery, type NHentaiTag, type NHentaiFavourite, type ToggleFavouriteResult, type // Types - Pixiv
    PixivCacheSearchResult, type PixivResultData, type // Types - Reddit
    RedditPost, type RedditSortType, type // Types - Rule34
    Rule34Session, type PaginationState, type SearchCacheEntry, type AutocompleteEntry, type Rule34Favorite, type Rule34HistoryEntry, type Rule34UserPreferences, type Rule34CacheStats, type FavoriteResult };

// Default export for CommonJS compatibility
export default {
    animeRepository,
    nhentaiRepository,
    pixivCache,
    redditCache,
    rule34Cache
};



