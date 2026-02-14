/**
 * AniList Service
 * GraphQL-based anime information service with circuit breaker and graceful degradation
 * @module services/api/anilistService
 */

import { GraphQLClient, gql } from 'graphql-request';
import { circuitBreakerRegistry } from '../../core/CircuitBreakerRegistry.js';
import logger from '../../core/Logger.js';
import cacheService from '../../cache/CacheService.js';
import gracefulDegradation from '../../core/GracefulDegradation.js';
// TYPES & INTERFACES
export interface AnimeTitle {
    romaji: string | null;
    english: string | null;
    native: string | null;
}

export interface CoverImage {
    large: string | null;
    color: string | null;
}

export interface FuzzyDate {
    year: number | null;
    month: number | null;
    day: number | null;
}

export interface AiringSchedule {
    episode: number;
    airingAt: number;
    timeUntilAiring: number;
}

export interface CharacterName {
    full: string | null;
}

export interface CharacterNode {
    name: CharacterName;
}

export interface CharacterEdge {
    node: CharacterNode;
}

export interface Characters {
    edges: CharacterEdge[];
}

export interface AnimeRanking {
    rank: number;
    allTime: boolean;
    type: string;
    context: string;
}

export interface RelatedAnimeNode {
    id: number;
    title: AnimeTitle;
    type: 'ANIME' | 'MANGA' | 'MOVIE' | string;
    status: string;
    averageScore: number | null;
}

export interface RelationEdge {
    relationType: 'SEQUEL' | 'PREQUEL' | 'ALTERNATIVE' | 'PARENT' | 'SIDE_STORY' | string;
    node: RelatedAnimeNode;
}

export interface Relations {
    edges: RelationEdge[];
}

export interface StudioNode {
    name: string;
}

export interface Studios {
    nodes: StudioNode[];
}

export interface Trailer {
    id: string | null;
    site: string | null;
}

export interface AnimeMedia {
    id: number;
    title: AnimeTitle;
    coverImage: CoverImage | null;
    description: string | null;
    episodes: number | null;
    averageScore: number | null;
    popularity: number | null;
    format: string | null;
    season: string | null;
    seasonYear: number | null;
    status: 'FINISHED' | 'RELEASING' | 'NOT_YET_RELEASED' | 'CANCELLED' | 'HIATUS' | string;
    source: string | null;
    genres: string[];
    duration: number | null;
    startDate: FuzzyDate | null;
    endDate: FuzzyDate | null;
    rankings: AnimeRanking[];
    characters: Characters | null;
    relations: Relations | null;
    studios: Studios | null;
    trailer: Trailer | null;
    siteUrl: string | null;
    nextAiringEpisode: AiringSchedule | null;
    _stale?: boolean;
    _error?: string;
    _cachedAt?: number;
}

export interface AutocompleteMedia {
    id: number;
    title: AnimeTitle;
    format: string | null;
    status: string;
    seasonYear: number | null;
    averageScore: number | null;
}

interface PageResponse<T> {
    Page: {
        media: T[];
    };
}

interface MediaResponse {
    Media: AnimeMedia | null;
}

interface GracefulDegradationContext {
    cachedResult?: AnimeMedia;
    cachedAt?: number;
}
// ANILIST SERVICE CLASS
class AnilistService {
    private client: GraphQLClient;
    private circuitBreaker: ReturnType<typeof circuitBreakerRegistry.get> | null = null;
    private readonly cacheTTL: number = 3600; // 1 hour

    constructor() {
        this.client = new GraphQLClient('https://graphql.anilist.co');
    }

    /**
     * Get or initialize circuit breaker
     */
    private _getCircuitBreaker(): NonNullable<typeof this.circuitBreaker> {
        if (!this.circuitBreaker) {
            circuitBreakerRegistry.initialize();
            this.circuitBreaker = circuitBreakerRegistry.get('anime');

            // Register with graceful degradation
            gracefulDegradation.initialize();
            gracefulDegradation.registerFallback('anilist', async (_error: Error | null, options: Record<string, unknown>) => {
                const context = options as unknown as GracefulDegradationContext;
                if (context?.cachedResult) {
                    return {
                        ...context.cachedResult,
                        _stale: true,
                        _cachedAt: context.cachedAt
                    };
                }
                return null;
            });
        }
        return this.circuitBreaker!;
    }

    /**
     * Get cache key for anime search
     */
    private _getCacheKey(searchTerm: string): string {
        return `anime:${searchTerm.toLowerCase().trim()}`;
    }

    /**
     * Execute with circuit breaker, caching, and graceful degradation
     */
    private async _executeWithResilience<T>(
        cacheKey: string, 
        queryFn: () => Promise<T>
    ): Promise<T | null> {
        const breaker = this._getCircuitBreaker();

        // Try cache first
        const cachedResult = await cacheService.get('api:anime', cacheKey) as T | null;
        if (cachedResult) {
            return cachedResult;
        }

        try {
            // Try live request with circuit breaker
            const result = await breaker.execute(queryFn);

            if (result) {
                // Cache successful result
                await cacheService.set('api:anime', cacheKey, result, this.cacheTTL);
                gracefulDegradation.markHealthy('anilist');
            }

            return result;
        } catch (error) {
            const err = error as Error;
            
            // Check if we have stale cached data to return
            const staleResult = await this._getStaleCache<T>(cacheKey);
            if (staleResult) {
                logger.info('AniList', `Returning stale cache for: ${cacheKey}`);
                gracefulDegradation.markDegraded('anilist', err.message);
                return {
                    ...staleResult,
                    _stale: true,
                    _error: err.message
                } as T;
            }

            gracefulDegradation.markDegraded('anilist', err.message);
            throw error;
        }
    }

    /**
     * Get stale cache (cache that may have expired but we can still use)
     */
    private async _getStaleCache<T>(cacheKey: string): Promise<T | null> {
        const staleKey = `stale:${cacheKey}`;
        return await cacheService.get('api:anime', staleKey) as T | null;
    }

    /**
     * Store stale cache backup (longer TTL for fallback, Redis-backed for cross-shard access)
     */
    private async _setStaleCache<T>(cacheKey: string, data: T): Promise<void> {
        const staleKey = `stale:${cacheKey}`;
        // Keep stale cache for 24 hours as fallback (stored in Redis-backed api:anime namespace)
        await cacheService.set('api:anime', staleKey, data, 86400);
    }

    /**
     * Search for anime by name
     */
    async searchAnime(searchTerm: string): Promise<AnimeMedia | null> {
        const cacheKey = this._getCacheKey(searchTerm);

        return this._executeWithResilience(cacheKey, async () => {
            const result = await this._searchAnimeInternal(searchTerm);

            // Store stale backup for fallback
            if (result) {
                await this._setStaleCache(cacheKey, result);
            }

            return result;
        });
    }

    /**
     * Internal anime search implementation
     */
    private async _searchAnimeInternal(searchTerm: string): Promise<AnimeMedia | null> {
        const query = gql`
            query ($search: String) {
                Media(search: $search, type: ANIME) {
                    id
                    title { romaji english native }
                    coverImage { large color }
                    description(asHtml: false)
                    episodes
                    averageScore
                    popularity
                    format
                    season
                    seasonYear
                    status
                    source
                    genres
                    duration
                    startDate { year month day }
                    endDate { year month day }
                    rankings { rank allTime type context }
                    characters(sort: [ROLE, RELEVANCE], perPage: 5) {
                        edges { node { name { full } } }
                    }
                    relations {
                        edges {
                            relationType
                            node {
                                id
                                title { romaji english }
                                type
                                status
                                averageScore
                            }
                        }
                    }
                    studios { nodes { name } }
                    trailer { id site }
                    siteUrl
                    nextAiringEpisode { episode airingAt timeUntilAiring }
                }
            }
        `;

        try {
            const data = await this.client.request<MediaResponse>(query, { search: searchTerm });
            return data.Media;
        } catch (error) {
            logger.error('AniList', `Search error: ${(error as Error).message}`);
            return null;
        }
    }

    /**
     * Search anime for autocomplete suggestions
     */
    async searchAnimeAutocomplete(searchTerm: string, limit: number = 10): Promise<AutocompleteMedia[]> {
        const query = gql`
            query ($search: String, $perPage: Int) {
                Page(page: 1, perPage: $perPage) {
                    media(search: $search, type: ANIME, sort: [POPULARITY_DESC]) {
                        id
                        title { romaji english native }
                        format
                        status
                        seasonYear
                        averageScore
                    }
                }
            }
        `;

        try {
            const data = await this.client.request<PageResponse<AutocompleteMedia>>(query, { 
                search: searchTerm, 
                perPage: limit 
            });
            return data.Page?.media || [];
        } catch (error) {
            logger.error('AniList', `Autocomplete error: ${(error as Error).message}`);
            return [];
        }
    }

    /**
     * Get anime by AniList ID
     */
    async getAnimeById(id: number): Promise<AnimeMedia | null> {
        const query = gql`
            query ($id: Int) {
                Media(id: $id, type: ANIME) {
                    id
                    title { romaji english native }
                    coverImage { large color }
                    status
                    nextAiringEpisode { episode airingAt timeUntilAiring }
                    episodes
                    relations {
                        edges {
                            relationType
                            node {
                                id
                                title { romaji english }
                                status
                            }
                        }
                    }
                }
            }
        `;

        try {
            const data = await this.client.request<MediaResponse>(query, { id });
            return data.Media;
        } catch (error) {
            logger.error('AniList', `GetById error: ${(error as Error).message}`);
            return null;
        }
    }

    /**
     * Find the next ongoing season for an anime (follows sequel chain)
     */
    async findNextOngoingSeason(animeId: number): Promise<AnimeMedia | null> {
        let currentId = animeId;
        const maxIterations = 10;
        let iterations = 0;

        while (iterations < maxIterations) {
            iterations++;
            const media = await this.getAnimeById(currentId);

            if (!media) return null;
            if (media.status === 'RELEASING') return media;

            const sequel = media.relations?.edges?.find(e => e.relationType === 'SEQUEL');
            if (!sequel) return null;

            currentId = sequel.node.id;
        }

        return null;
    }

    /**
     * Format duration in minutes to human readable string
     */
    formatDuration(minutes: number | null): string {
        if (!minutes) return 'N/A';
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
    }

    /**
     * Get recommendation based on score
     */
    getRecommendation(score: number | null): string {
        if (!score) return '😬 Skip or Unknown';
        if (score >= 85) return '🔥 Must Watch';
        if (score >= 70) return '👍 Good';
        if (score >= 55) return '👌 Decent';
        return '😬 Skip or Unknown';
    }

    /**
     * Truncate string to max length
     */
    truncate(str: string | null, max: number = 1000): string {
        if (!str) return '';
        return str.length > max ? str.slice(0, max) + '...' : str;
    }

    /**
     * Format fuzzy date to string
     */
    formatDate(dateObj: FuzzyDate | null): string {
        if (!dateObj?.year) return 'Unknown';
        const day = dateObj.day || '?';
        const month = dateObj.month || '?';
        return `${day}/${month}/${dateObj.year}`;
    }

    /**
     * Format countdown seconds to human readable string
     */
    formatCountdown(seconds: number): string {
        if (seconds <= 0) return 'Airing now';
        const days = Math.floor(seconds / (60 * 60 * 24));
        const hours = Math.floor((seconds % (60 * 60 * 24)) / (60 * 60));
        const mins = Math.floor((seconds % (60 * 60)) / 60);
        return `${days}d ${hours}h ${mins}m`;
    }

    /**
     * Get trailer URL from trailer object
     */
    getTrailerUrl(trailer: Trailer | null): string {
        if (!trailer?.site || !trailer?.id) return 'None';

        const site = trailer.site.toLowerCase();
        if (site === 'youtube') {
            return `[Watch Trailer](https://www.youtube.com/watch?v=${trailer.id})`;
        } else if (site === 'dailymotion') {
            return `[Watch Trailer](https://www.dailymotion.com/video/${trailer.id})`;
        }

        return 'None';
    }

    /**
     * Format related entries for display
     */
    formatRelatedEntries(edges: RelationEdge[] | null | undefined): string {
        if (!edges || edges.length === 0) return 'No other seasons or movies available.';

        const seen = new Set<string>();
        const list: string[] = [];

        for (const rel of edges) {
            if (!['ANIME', 'MOVIE'].includes(rel.node?.type)) continue;

            const key = rel.node.title?.romaji;
            if (!key || seen.has(key)) continue;

            seen.add(key);
            const typeLabel = rel.node.type === 'ANIME' ? '[TV]' : `[${rel.node.type}]`;
            const score = rel.node.averageScore || '?';
            const recommendation = this.getRecommendation(rel.node.averageScore);

            list.push(`${typeLabel} ${key} - Score: ${score} - ${recommendation}`);
        }

        return list.length > 0 ? list.join('\n') : 'No other seasons or movies available.';
    }
}

// Export singleton instance
const anilistService = new AnilistService();

export { anilistService, AnilistService };
export default anilistService;
