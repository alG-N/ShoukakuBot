/**
 * MyAnimeList Service
 * Handles all API interactions with MyAnimeList using Jikan API v4
 * @module services/api/myAnimeListService
 */

import { circuitBreakerRegistry } from '../../core/CircuitBreakerRegistry.js';
import logger from '../../core/Logger.js';
import cacheService from '../../cache/CacheService.js';
// TYPES & INTERFACES
// Jikan API v4 (unofficial MAL API)
const JIKAN_BASE = 'https://api.jikan.moe/v4';

type MediaType = 'anime' | 'manga' | 'lightnovel' | 'webnovel' | 'oneshot';

interface MediaTypeConfig {
    endpoint: 'anime' | 'manga';
    typeFilter: string | null;
}

const MEDIA_TYPE_CONFIG: Record<MediaType, MediaTypeConfig> = {
    anime: { endpoint: 'anime', typeFilter: null },
    manga: { endpoint: 'manga', typeFilter: 'manga' },
    lightnovel: { endpoint: 'manga', typeFilter: 'lightnovel' },
    webnovel: { endpoint: 'manga', typeFilter: 'webnovel' },
    oneshot: { endpoint: 'manga', typeFilter: 'oneshot' }
};

export interface MALTitle {
    romaji: string | null;
    english: string | null;
    native: string | null;
}

export interface MALCoverImage {
    large: string | null;
    color: null;
}

export interface MALDate {
    year: number;
    month: number;
    day: number;
}

export interface MALRanking {
    rank: number;
    type: string;
    allTime: boolean;
}

export interface MALRelatedNode {
    id: number;
    title: { romaji: string; english: null };
    type: string;
}

export interface MALRelationEdge {
    relationType: string;
    node: MALRelatedNode;
}

export interface MALRelations {
    edges: MALRelationEdge[];
}

export interface MALStudio {
    name: string;
}

export interface MALStudios {
    nodes: MALStudio[];
}

export interface MALTrailer {
    id: string;
    site: string;
}

export interface MALCharacters {
    edges: unknown[];
}

export interface MALAnimeData {
    id: number;
    source: string;
    title: MALTitle;
    coverImage: MALCoverImage;
    description: string | null;
    episodes: number | null;
    averageScore: number | null;
    popularity: number | null;
    format: string | null;
    season: string | null;
    seasonYear: number | null;
    status: string;
    genres: string[];
    duration: number | null;
    startDate: MALDate | null;
    endDate: MALDate | null;
    rankings: MALRanking[];
    characters: MALCharacters;
    relations: MALRelations;
    studios: MALStudios;
    trailer: MALTrailer | null;
    siteUrl: string;
    nextAiringEpisode: null;
    malId: number;
    score: number | null;
    scoredBy: number | null;
    rank: number | null;
    popularity_rank: number | null;
    members: number | null;
    favorites: number | null;
    rating: string | null;
    broadcast: string | null;
    mediaType: 'anime';
}

export interface MALAuthor {
    name: string;
    role: string;
}

export interface MALMangaData {
    id: number;
    source: string;
    mediaType: string;
    title: MALTitle;
    coverImage: MALCoverImage;
    description: string | null;
    chapters: number | null;
    volumes: number | null;
    averageScore: number | null;
    popularity: number | null;
    format: string | null;
    status: string;
    genres: string[];
    themes: string[];
    demographics: string[];
    startDate: MALDate | null;
    endDate: MALDate | null;
    authors: MALAuthor[];
    serialization: string[];
    relations: MALRelations;
    siteUrl: string;
    malId: number;
    score: number | null;
    scoredBy: number | null;
    rank: number | null;
    popularity_rank: number | null;
    members: number | null;
    favorites: number | null;
}

export interface MALAutocompleteItem {
    id: number;
    title: {
        romaji: string | null;
        english: string | null;
        japanese: string | null;
    };
    format: string | null;
    status: string;
    seasonYear: number | null;
    startYear: number | null;
    averageScore: number | null;
}

// Jikan API response types
interface JikanImage {
    image_url: string;
    large_image_url?: string;
}

interface JikanImages {
    jpg?: JikanImage;
}

interface JikanGenre {
    mal_id: number;
    name: string;
}

interface JikanStudio {
    mal_id: number;
    name: string;
}

interface JikanAired {
    from?: string;
    to?: string;
}

interface JikanPublished {
    from?: string;
    to?: string;
}

interface JikanTrailer {
    youtube_id?: string;
}

interface JikanRelationEntry {
    mal_id: number;
    name: string;
    type?: string;
}

interface JikanRelation {
    relation: string;
    entry: JikanRelationEntry[];
}

interface JikanAuthor {
    name: string;
    type: string;
}

interface JikanSerialization {
    name: string;
}

interface JikanTheme {
    name: string;
}

interface JikanDemographic {
    name: string;
}

interface JikanBroadcast {
    string?: string;
}

interface JikanAnimeData {
    mal_id: number;
    title: string;
    title_english?: string;
    title_japanese?: string;
    images?: JikanImages;
    synopsis?: string;
    episodes?: number;
    score?: number;
    scored_by?: number;
    rank?: number;
    popularity?: number;
    members?: number;
    favorites?: number;
    type?: string;
    season?: string;
    year?: number;
    status?: string;
    source?: string;
    genres?: JikanGenre[];
    duration?: string;
    aired?: JikanAired;
    studios?: JikanStudio[];
    trailer?: JikanTrailer;
    url?: string;
    rating?: string;
    broadcast?: JikanBroadcast;
    relations?: JikanRelation[];
}

interface JikanMangaData {
    mal_id: number;
    title: string;
    title_english?: string;
    title_japanese?: string;
    images?: JikanImages;
    synopsis?: string;
    chapters?: number;
    volumes?: number;
    score?: number;
    scored_by?: number;
    rank?: number;
    popularity?: number;
    members?: number;
    favorites?: number;
    type?: string;
    status?: string;
    genres?: JikanGenre[];
    themes?: JikanTheme[];
    demographics?: JikanDemographic[];
    published?: JikanPublished;
    authors?: JikanAuthor[];
    serializations?: JikanSerialization[];
    url?: string;
    relations?: JikanRelation[];
}

interface JikanSearchResponse<T> {
    data: T[];
}

interface JikanSingleResponse<T> {
    data: T;
}
// MYANIMEIST SERVICE CLASS
class MyAnimeListService {
    private readonly CACHE_NS = 'api:anime';
    private readonly CACHE_TTL = 300; // 5 minutes in seconds
    private readonly rateLimitDelay: number = 400; // Jikan has rate limiting
    private readonly RATE_LIMIT_KEY = 'mal_ratelimit:last_request';
    private readonly RATE_LIMIT_TTL = 2; // seconds — just long enough for cross-shard coordination
    private lastRequest: number = 0; // Local fallback when Redis unavailable

    constructor() {
        // No local cache setup needed
    }

    /**
     * Get last request timestamp from Redis (shard-safe) with local fallback
     */
    private async _getLastRequest(): Promise<number> {
        try {
            const ts = await cacheService.peek<number>(this.CACHE_NS, this.RATE_LIMIT_KEY);
            if (ts !== null) return ts;
        } catch {
            // Redis unavailable — fall through to local
        }
        return this.lastRequest;
    }

    /**
     * Store last request timestamp in Redis (shard-safe) with local fallback
     */
    private async _setLastRequest(timestamp: number): Promise<void> {
        this.lastRequest = timestamp; // Always update local as fallback
        try {
            await cacheService.set(this.CACHE_NS, this.RATE_LIMIT_KEY, timestamp, this.RATE_LIMIT_TTL);
        } catch {
            // Redis unavailable — local fallback already set
        }
    }

    /**
     * Rate-limited fetch with circuit breaker (shard-safe via Redis)
     */
    private async _rateLimitedFetch(url: string): Promise<Response> {
        const now = Date.now();
        const lastReq = await this._getLastRequest();
        const timeSinceLastRequest = now - lastReq;

        if (timeSinceLastRequest < this.rateLimitDelay) {
            await new Promise(r => setTimeout(r, this.rateLimitDelay - timeSinceLastRequest));
        }

        await this._setLastRequest(Date.now());

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'FumoBOT Discord Bot',
                    'Accept': 'application/json'
                },
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            throw error;
        }
    }

    /**
     * Search media by name (anime, manga, lightnovel, etc.) with circuit breaker
     */
    async searchMedia(query: string, mediaType: MediaType = 'anime'): Promise<MALAnimeData | MALMangaData | null> {
        const config = MEDIA_TYPE_CONFIG[mediaType] || MEDIA_TYPE_CONFIG.anime;
        const cacheKey = `mal:search_${mediaType}_${query.toLowerCase()}`;
        const cached = await cacheService.get<MALAnimeData | MALMangaData>(this.CACHE_NS, cacheKey);
        if (cached) return cached;

        return circuitBreakerRegistry.execute('anime', async () => {
            try {
                let url = `${JIKAN_BASE}/${config.endpoint}?q=${encodeURIComponent(query)}&limit=1`;
                if (config.typeFilter) {
                    url += `&type=${config.typeFilter}`;
                }

                const response = await this._rateLimitedFetch(url);

                if (!response.ok) {
                    throw new Error(`MAL API error: ${response.status}`);
                }

                const data = await response.json() as JikanSearchResponse<JikanAnimeData | JikanMangaData>;

                if (!data.data || data.data.length === 0) {
                    return null;
                }

                const media = config.endpoint === 'manga'
                    ? this._transformMangaData(data.data[0] as JikanMangaData, mediaType)
                    : this._transformAnimeData(data.data[0] as JikanAnimeData);
                await cacheService.set(this.CACHE_NS, cacheKey, media, this.CACHE_TTL);

                return media;
            } catch (error) {
                logger.error('MAL', `Search error: ${(error as Error).message}`);
                return null;
            }
        });
    }

    /**
     * Search anime by name (legacy support)
     */
    async searchAnime(query: string): Promise<MALAnimeData | null> {
        return this.searchMedia(query, 'anime') as Promise<MALAnimeData | null>;
    }

    /**
     * Search media for autocomplete (returns multiple results) with circuit breaker
     */
    async searchMediaAutocomplete(
        query: string,
        mediaType: MediaType = 'anime',
        limit: number = 10
    ): Promise<MALAutocompleteItem[]> {
        const config = MEDIA_TYPE_CONFIG[mediaType] || MEDIA_TYPE_CONFIG.anime;
        const cacheKey = `mal:autocomplete_${mediaType}_${query.toLowerCase()}`;

        // Check cache first
        const cached = await cacheService.get<MALAutocompleteItem[]>(this.CACHE_NS, cacheKey);
        if (cached) return cached;

        return circuitBreakerRegistry.execute('anime', async () => {
            try {
                let url = `${JIKAN_BASE}/${config.endpoint}?q=${encodeURIComponent(query)}&limit=${limit}&sfw=true`;
                if (config.typeFilter) {
                    url += `&type=${config.typeFilter}`;
                }

                const response = await this._rateLimitedFetch(url);

                if (!response.ok) return [];

                const data = await response.json() as JikanSearchResponse<JikanAnimeData | JikanMangaData>;

                const results = (data.data || []).map(item => {
                    const animeItem = item as JikanAnimeData;
                    const mangaItem = item as JikanMangaData;
                    
                    return {
                        id: item.mal_id,
                        title: {
                            romaji: item.title,
                            english: item.title_english || null,
                            japanese: item.title_japanese || null
                        },
                        format: item.type || null,
                        status: this._mapStatus(item.status || ''),
                        seasonYear: animeItem.year || (mangaItem.published?.from ? new Date(mangaItem.published.from).getFullYear() : null),
                        startYear: mangaItem.published?.from ? new Date(mangaItem.published.from).getFullYear() : animeItem.year || null,
                        averageScore: item.score ? Math.round(item.score * 10) : null
                    };
                });

                // Cache successful results
                if (results.length > 0) {
                    await cacheService.set(this.CACHE_NS, cacheKey, results, this.CACHE_TTL);
                }
                return results;
            } catch (error) {
                logger.error('MAL', `Autocomplete error: ${(error as Error).message}`);
                return [];
            }
        });
    }

    /**
     * Search anime for autocomplete (legacy support)
     */
    async searchAnimeAutocomplete(query: string, limit: number = 10): Promise<MALAutocompleteItem[]> {
        return this.searchMediaAutocomplete(query, 'anime', limit);
    }

    /**
     * Get anime by ID with circuit breaker
     */
    async getAnimeById(malId: number): Promise<MALAnimeData | null> {
        const cacheKey = `mal:anime_${malId}`;
        const cached = await cacheService.get<MALAnimeData>(this.CACHE_NS, cacheKey);
        if (cached) return cached;

        return circuitBreakerRegistry.execute('anime', async () => {
            try {
                const response = await this._rateLimitedFetch(
                    `${JIKAN_BASE}/anime/${malId}/full`
                );

                if (!response.ok) return null;

                const data = await response.json() as JikanSingleResponse<JikanAnimeData>;
                const anime = this._transformAnimeData(data.data);
                await cacheService.set(this.CACHE_NS, cacheKey, anime, this.CACHE_TTL);

                return anime;
            } catch (error) {
                logger.error('MAL', `GetById error: ${(error as Error).message}`);
                return null;
            }
        });
    }

    /**
     * Transform Jikan data to match AniList format
     */
    private _transformAnimeData(data: JikanAnimeData): MALAnimeData {
        return {
            id: data.mal_id,
            source: 'mal',
            title: {
                romaji: data.title,
                english: data.title_english || null,
                native: data.title_japanese || null
            },
            coverImage: {
                large: data.images?.jpg?.large_image_url || data.images?.jpg?.image_url || null,
                color: null
            },
            description: data.synopsis || null,
            episodes: data.episodes || null,
            averageScore: data.score ? Math.round(data.score * 10) : null,
            popularity: data.members || null,
            format: data.type || null,
            season: data.season?.toUpperCase() || null,
            seasonYear: data.year || null,
            status: this._mapStatus(data.status || ''),
            genres: data.genres?.map(g => g.name) || [],
            duration: data.duration ? parseInt(data.duration) : null,
            startDate: data.aired?.from ? this._parseDate(data.aired.from) : null,
            endDate: data.aired?.to ? this._parseDate(data.aired.to) : null,
            rankings: data.rank ? [{ rank: data.rank, type: 'RATED', allTime: true }] : [],
            characters: {
                edges: []
            },
            relations: {
                edges: (data.relations || []).flatMap(rel =>
                    rel.entry.map(e => ({
                        relationType: rel.relation.toUpperCase().replace(/ /g, '_'),
                        node: {
                            id: e.mal_id,
                            title: { romaji: e.name, english: null },
                            type: e.type?.toUpperCase() || ''
                        }
                    }))
                )
            },
            studios: {
                nodes: (data.studios || []).map(s => ({ name: s.name }))
            },
            trailer: data.trailer?.youtube_id ? {
                id: data.trailer.youtube_id,
                site: 'youtube'
            } : null,
            siteUrl: data.url || '',
            nextAiringEpisode: null,
            malId: data.mal_id,
            score: data.score || null,
            scoredBy: data.scored_by || null,
            rank: data.rank || null,
            popularity_rank: data.popularity || null,
            members: data.members || null,
            favorites: data.favorites || null,
            rating: data.rating || null,
            broadcast: data.broadcast?.string || null,
            mediaType: 'anime'
        };
    }

    /**
     * Transform Jikan manga data
     */
    private _transformMangaData(data: JikanMangaData, mediaType: string = 'manga'): MALMangaData {
        return {
            id: data.mal_id,
            source: 'mal',
            mediaType: mediaType,
            title: {
                romaji: data.title,
                english: data.title_english || null,
                native: data.title_japanese || null
            },
            coverImage: {
                large: data.images?.jpg?.large_image_url || data.images?.jpg?.image_url || null,
                color: null
            },
            description: data.synopsis || null,
            chapters: data.chapters || null,
            volumes: data.volumes || null,
            averageScore: data.score ? Math.round(data.score * 10) : null,
            popularity: data.members || null,
            format: data.type || null,
            status: this._mapMangaStatus(data.status || ''),
            genres: data.genres?.map(g => g.name) || [],
            themes: data.themes?.map(t => t.name) || [],
            demographics: data.demographics?.map(d => d.name) || [],
            startDate: data.published?.from ? this._parseDate(data.published.from) : null,
            endDate: data.published?.to ? this._parseDate(data.published.to) : null,
            authors: data.authors?.map(a => ({
                name: a.name,
                role: a.type
            })) || [],
            serialization: data.serializations?.map(s => s.name) || [],
            relations: {
                edges: (data.relations || []).flatMap(rel =>
                    rel.entry.map(e => ({
                        relationType: rel.relation.toUpperCase().replace(/ /g, '_'),
                        node: {
                            id: e.mal_id,
                            title: { romaji: e.name, english: null },
                            type: e.type?.toUpperCase() || ''
                        }
                    }))
                )
            },
            siteUrl: data.url || '',
            malId: data.mal_id,
            score: data.score || null,
            scoredBy: data.scored_by || null,
            rank: data.rank || null,
            popularity_rank: data.popularity || null,
            members: data.members || null,
            favorites: data.favorites || null
        };
    }

    /**
     * Map manga status to normalized format
     */
    private _mapMangaStatus(status: string): string {
        const statusMap: Record<string, string> = {
            'Finished': 'FINISHED',
            'Publishing': 'RELEASING',
            'On Hiatus': 'HIATUS',
            'Discontinued': 'CANCELLED',
            'Not yet published': 'NOT_YET_RELEASED'
        };
        return statusMap[status] || status;
    }

    /**
     * Map anime status to normalized format
     */
    private _mapStatus(status: string): string {
        const statusMap: Record<string, string> = {
            'Finished Airing': 'FINISHED',
            'Currently Airing': 'RELEASING',
            'Not yet aired': 'NOT_YET_RELEASED'
        };
        return statusMap[status] || status;
    }

    /**
     * Parse date string to date object
     */
    private _parseDate(dateString: string): MALDate | null {
        if (!dateString) return null;
        const date = new Date(dateString);
        return {
            year: date.getFullYear(),
            month: date.getMonth() + 1,
            day: date.getDate()
        };
    }

}

// Export singleton instance
const myAnimeListService = new MyAnimeListService();

export { myAnimeListService, MyAnimeListService };
export default myAnimeListService;
