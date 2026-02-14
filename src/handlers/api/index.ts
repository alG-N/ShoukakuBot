/**
 * API Handlers Index
 * Re-exports all API handlers
 * @module handlers/api
 */

// TypeScript handlers
export { wikipediaHandler, WikipediaHandler } from './wikipediaHandler.js';
export type { 
    WikipediaArticle, 
    WikiSearchResult, 
    OnThisDayEvent, 
    OnThisDayDate 
} from './wikipediaHandler.js';

// Anime handler
import * as animeHandlerModule from './animeHandler.js';
export {
    createMediaEmbed,
    createAnimeEmbed,
    createAniListEmbed,
    createMALAnimeEmbed,
    createMALMangaEmbed
} from './animeHandler.js';
export type {
    AnimeMedia,
    MediaSource,
    MediaType,
    MediaConfig,
    MediaTitle,
    MediaDate
} from './animeHandler.js';

// NHentai handler
import nhentaiHandlerInstance from './nhentaiHandler.js';
export { default as nhentaiHandler, NHentaiHandler } from './nhentaiHandler.js';
export type {
    Gallery,
    GalleryTitle,
    GalleryTag,
    GalleryImages,
    ParsedTags,
    PageSession,
    SearchSession,
    SearchData,
    Favourite
} from './nhentaiHandler.js';

// Pixiv handler
import * as pixivContentHandlerModule from './pixivContentHandler.js';
export {
    createContentEmbed,
    createNoResultsEmbed as createPixivNoResultsEmbed,
    createErrorEmbed as createPixivErrorEmbed
} from './pixivContentHandler.js';
export type {
    PixivItem,
    PixivTag,
    PixivUser,
    ContentEmbedOptions,
    ContentEmbedResult
} from './pixivContentHandler.js';

// Reddit handler
import * as redditPostHandlerModule from './redditPostHandler.js';
export {
    sendPostListEmbed,
    showPostDetails,
    createPostListEmbed,
    createPostEmbed,
    createNotFoundEmbed,
    POSTS_PER_PAGE
} from './redditPostHandler.js';
export type {
    RedditPost,
    SortType
} from './redditPostHandler.js';

// Rule34 handler
import * as rule34PostHandlerModule from './rule34PostHandler.js';
export {
    createPostEmbed as createRule34PostEmbed,
    createVideoEmbed as createRule34VideoEmbed,
    createPostButtons as createRule34PostButtons,
    createSearchSummaryEmbed as createRule34SearchSummaryEmbed,
    createNoResultsEmbed as createRule34NoResultsEmbed,
    createErrorEmbed as createRule34ErrorEmbed,
    createBlacklistEmbed,
    createFavoritesEmbed as createRule34FavoritesEmbed,
    createSettingsEmbed as createRule34SettingsEmbed,
    createSettingsComponents,
    createRelatedTagsEmbed,
    createHistoryEmbed as createRule34HistoryEmbed,
    RATING_COLORS,
    RATING_EMOJIS,
    CONTENT_EMOJIS,
    SORT_DISPLAY
} from './rule34PostHandler.js';
export type {
    Rule34Post,
    PostRating,
    ContentType,
    SortMode,
    SearchResults,
    PostEmbedOptions,
    SearchFilters,
    UserPreferences,
    FavoriteEntry,
    HistoryEntry,
    RelatedTag,
    EmbedResult
} from './rule34PostHandler.js';

// Steam handler
import * as steamSaleHandlerModule from './steamSaleHandler.js';
export { handleSaleCommand } from './steamSaleHandler.js';
export type {
    SteamGame,
    SaleState
} from './steamSaleHandler.js';

// Re-export as namespace objects for backward compatibility
export const animeHandler = animeHandlerModule;
export const pixivContentHandler = pixivContentHandlerModule;
export const redditPostHandler = redditPostHandlerModule;
export const steamSaleHandler = steamSaleHandlerModule;
export const rule34PostHandler = rule34PostHandlerModule;
export { nhentaiHandlerInstance };
