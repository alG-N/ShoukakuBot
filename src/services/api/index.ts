/**
 * API Services Index
 * Re-exports all API services (TypeScript)
 * @module services/api
 */
// GENERAL API SERVICES
// Embed Service
export { default as embedService, EmbedService, EMBED_FIX_RULES } from './embedService.js';
export type {
    EmbedFixRule,
    EmbedFixResult,
    EmbedFixStats
} from './embedService.js';

// Wikipedia Service
export { wikipediaService, WikipediaService } from './wikipediaService.js';
export type {
    WikiSearchResult,
    WikiSearchResponse,
    WikiArticle,
    WikiArticleResponse,
    OnThisDayEvent,
    OnThisDayResponse,
    OnThisDayPage,
    SearchOptions as WikiSearchOptions
} from './wikipediaService.js';
// ANIME/MANGA SERVICES
// AniList Service
export { anilistService, AnilistService } from './anilistService.js';
export type {
    AnimeMedia,
    AnimeTitle,
    CoverImage,
    FuzzyDate,
    AiringSchedule,
    CharacterEdge,
    RelationEdge,
    Trailer,
    AutocompleteMedia
} from './anilistService.js';

// MyAnimeList Service
export { myAnimeListService, MyAnimeListService } from './myAnimeListService.js';
export type {
    MALAnimeData,
    MALMangaData,
    MALTitle,
    MALDate,
    MALAuthor,
    MALAutocompleteItem
} from './myAnimeListService.js';
// GAMING SERVICES
// Steam Service
export { steamService, SteamService } from './steamService.js';
export type {
    SteamGame,
    SteamSaleResponse,
    SteamPriceOverview,
    SteamAppDetailsResponse,
    SteamFeaturedGame,
    SteamSpyData
} from './steamService.js';
// SOCIAL MEDIA SERVICES
// Reddit Service
export { redditService, RedditService } from './redditService.js';
export type {
    SubredditInfo,
    RedditPost,
    RedditPostsResult
} from './redditService.js';

// Pixiv Service
export { pixivService, PixivService } from './pixivService.js';
export type {
    PixivIllust,
    PixivNovel,
    PixivUser,
    PixivTag,
    PixivImageUrls,
    SearchOptions as PixivSearchOptions,
    SearchResult as PixivSearchResult,
    RankingOptions
} from './pixivService.js';
// NSFW SERVICES
// NHentai Service
export { nhentaiService, NHentaiService } from './nhentaiService.js';
export type {
    NHentaiGallery,
    NHentaiTag,
    NHentaiTitle,
    NHentaiImages,
    GalleryResult,
    SearchResult as NHentaiSearchResult,
    SearchData as NHentaiSearchData,
    PageUrl,
    ParsedTags
} from './nhentaiService.js';

// Rule34 Service
export { rule34Service, Rule34Service } from './rule34Service.js';
export type {
    Rule34Post,
    Rule34RawPost,
    SearchResult as Rule34SearchResult,
    AutocompleteSuggestion as Rule34Suggestion,
    RelatedTag
} from './rule34Service.js';