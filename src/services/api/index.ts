/**
 * API Services Index
 * Re-exports all API services (TypeScript)
 * @module services/api
 */

export { default as embedService } from './embedService.js';
export * from './embedService.js';

export { default as wikipediaService } from './wikipediaService.js';
export * from './wikipediaService.js';

export { default as anilistService } from './anilistService.js';
export * from './anilistService.js';

export { default as myAnimeListService } from './myAnimeListService.js';
export * from './myAnimeListService.js';

export { default as steamService } from './steamService.js';
export * from './steamService.js';

export { default as redditService } from './redditService.js';
export * from './redditService.js';

export { default as pixivService } from './pixivService.js';
export * from './pixivService.js';

export { default as nhentaiService } from './nhentaiService.js';
export * from './nhentaiService.js';

export { default as rule34Service } from './rule34Service.js';
export { Rule34Service } from './rule34Service.js';
export { type Rule34Post, type Rule34RawPost, type Rule34SearchResult, type RelatedTag, type Rule34SearchOptions, type Rule34Auth, type FilterOptions, type BuildQueryOptions, type TagInfoResponse, type CommentResponse } from './rule34Service.js';
export { type AutocompleteSuggestion as Rule34Suggestion } from './rule34Service.js';

