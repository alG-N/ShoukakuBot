/**
 * API Handlers Index
 * Re-exports all API handlers
 * @module handlers/api
 */

// TypeScript handlers
export { wikipediaHandler, WikipediaHandler } from './wikipedia/index.js';
export { type WikipediaArticle, type WikiSearchResult, type OnThisDayEvent, type OnThisDayDate } from './wikipedia/index.js';

// Anime handler
import * as animeHandlerModule from './anime/index.js';
export {
    createMediaEmbed,
    createAnimeEmbed,
    createAniListEmbed,
    createMALAnimeEmbed,
    createMALMangaEmbed
} from './anime/index.js';
export { type AnimeMedia } from '../../types/api/models/anime.js';
export { type AnimeContentSource as MediaSource, type MALMediaType as MediaType } from '../../types/api/models/mal.js';
export { type MediaConfig, type MediaTitle, type MediaDate } from '../../types/api/handlers/anime-handler.js';
export { type MediaImage, type MediaTrailer, type MediaStudio, type MediaRelation, type MediaCharacter, type MediaRanking } from '../../types/api/handlers/anime-handler.js';

// NHentai handler
import nhentaiHandlerInstance from './nhentai/index.js';
export { default as nhentaiHandler, NHentaiHandler } from './nhentai/index.js';
export { type Gallery, type GalleryTitle, type GalleryTag, type GalleryImages, type PageSession, type SearchSession, type Favourite } from '../../types/api/nhentai/handler.js';
export { type ParsedTags, type SearchData } from '../../types/api/nhentai/model.js';

// Pixiv handler
import * as pixivContentHandlerModule from './pixiv/index.js';
export {
    createContentEmbed,
    createNoResultsEmbed as createPixivNoResultsEmbed,
    createErrorEmbed as createPixivErrorEmbed
} from './pixiv/index.js';
export { type PixivTag } from '../../types/api/pixiv/model.js';
export { type PixivItem, type PixivContentUser, type ContentEmbedOptions, type ContentEmbedResult } from '../../types/api/pixiv/handler.js';

// Reddit handler
import * as redditPostHandlerModule from './reddit/index.js';
export {
    sendPostListEmbed,
    showPostDetails,
    createPostListEmbed,
    createPostEmbed,
    createNotFoundEmbed,
    POSTS_PER_PAGE
} from './reddit/index.js';
export { type RedditPost } from '../../types/api/reddit/model.js';
export { type RedditSortType as SortType } from '../../types/api/reddit/handler.js';

// Rule34 handler
import * as rule34PostHandlerModule from './rule34/index.js';
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
} from './rule34/index.js';
export { type Rule34Post, type PostRating, type Rule34ContentType as ContentType, type SortMode, type Rule34RelatedTag as RelatedTag, type Rule34HistoryEntry } from '../../types/api/rule34/model.js';
export { type SearchResults, type PostEmbedOptions, type SearchFilters, type Rule34HandlerPreferences as UserPreferences, type FavoriteEntry, type EmbedResult } from '../../types/api/rule34/handler.js';

// Steam handler
import * as steamSaleHandlerModule from './steam/index.js';
export { handleSaleCommand } from './steam/index.js';
export { type SteamGame, type SaleState } from './steam/index.js';

// Re-export as namespace objects for backward compatibility
export const animeHandler = animeHandlerModule;
export const pixivContentHandler = pixivContentHandlerModule;
export const redditPostHandler = redditPostHandlerModule;
export const steamSaleHandler = steamSaleHandlerModule;
export const rule34PostHandler = rule34PostHandlerModule;
export { nhentaiHandlerInstance };


