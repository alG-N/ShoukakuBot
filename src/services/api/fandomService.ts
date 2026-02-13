/**
 * Fandom Wiki Service
 * API service for searching and fetching wiki articles from Fandom (formerly Wikia)
 * @module services/api/fandomService
 */

import axios, { AxiosRequestConfig } from 'axios';
import { circuitBreakerRegistry } from '../../core/CircuitBreakerRegistry.js';
import cacheService from '../../cache/CacheService.js';
// TYPES & INTERFACES
interface RequestConfig extends AxiosRequestConfig {
    timeout: number;
    headers: Record<string, string>;
}

export interface SearchResult {
    title: string;
    pageId: number;
    snippet: string;
    url: string;
}

export interface SearchResponse {
    success: boolean;
    results?: SearchResult[];
    wiki?: string;
    query?: string;
    error?: string;
    fromCache?: boolean;
}

export interface ArticleData {
    title: string;
    pageId: number;
    extract: string;
    url: string;
    thumbnail?: string;
    categories: string[];
    wiki: string;
    wikiName: string;
}

export interface ArticleResponse {
    success: boolean;
    article?: ArticleData;
    error?: string;
    fromCache?: boolean;
}

export interface WikiInfo {
    name: string;
    base: string;
    logo?: string;
    lang: string;
    generator: string;
    articles: number;
    pages: number;
    edits: number;
    users: number;
    activeUsers: number;
    images: number;
    subdomain: string;
}

export interface WikiInfoResponse {
    success: boolean;
    info?: WikiInfo;
    error?: string;
    fromCache?: boolean;
}

export interface PopularWiki {
    name: string;
    alias: string;
    subdomain: string;
}

export interface WikiSuggestion {
    name: string;
    subdomain: string;
}

// API Response types
interface MediaWikiSearchResult {
    title: string;
    pageid: number;
    snippet?: string;
}

interface MediaWikiQuerySearchResponse {
    query?: {
        search: MediaWikiSearchResult[];
    };
}

interface MediaWikiPage {
    title: string;
    extract?: string;
    fullurl?: string;
    thumbnail?: { source: string };
    original?: { source: string };
    categories?: Array<{ title: string }>;
}

interface MediaWikiQueryPagesResponse {
    query?: {
        pages: Record<string, MediaWikiPage>;
    };
}

interface MediaWikiRandomPage {
    title: string;
}

interface MediaWikiQueryRandomResponse {
    query?: {
        random: MediaWikiRandomPage[];
    };
}

interface MediaWikiSiteInfo {
    query?: {
        general: {
            sitename: string;
            base: string;
            logo?: string;
            lang: string;
            generator: string;
        };
        statistics: {
            articles: number;
            pages: number;
            edits: number;
            users: number;
            activeusers: number;
            images: number;
        };
    };
}
// CONSTANTS
const REQUEST_CONFIG: RequestConfig = {
    timeout: 10000,
    headers: {
        'User-Agent': 'FumoBOT/2.0 (Discord Bot)',
        'Accept': 'application/json'
    }
};

// Popular Fandom wikis
const POPULAR_WIKIS: Record<string, string> = {
    // Games
    'genshin': 'genshin-impact',
    'minecraft': 'minecraft',
    'pokemon': 'pokemon',
    'valorant': 'valorant',
    'lol': 'leagueoflegends',
    'leagueoflegends': 'leagueoflegends',
    'fortnite': 'fortnite',
    'roblox': 'roblox',
    'terraria': 'terraria',
    'zelda': 'zelda',
    'dota': 'dota2',
    'csgo': 'csgopedia',
    'gta': 'gta',
    'elden-ring': 'eldenring',
    'darksouls': 'darksouls',
    'ffxiv': 'finalfantasy',
    'destiny': 'destinypedia',

    // Anime/Manga
    'naruto': 'naruto',
    'onepiece': 'onepiece',
    'dragonball': 'dragonball',
    'bleach': 'bleach',
    'jjk': 'jujutsu-kaisen',
    'jujutsukaisen': 'jujutsu-kaisen',
    'attackontitan': 'attackontitan',
    'aot': 'attackontitan',
    'demonslayer': 'kimetsu-no-yaiba',
    'mha': 'myheroacademia',
    'myheroacademia': 'myheroacademia',
    'hunterxhunter': 'hunterxhunter',
    'chainsaw-man': 'chainsaw-man',
    'spy-x-family': 'spy-x-family',

    // Movies/TV
    'marvel': 'marvel',
    'mcu': 'marvelcinematicuniverse',
    'dc': 'dc',
    'starwars': 'starwars',
    'harrypotter': 'harrypotter',
    'lotr': 'lotr',
    'got': 'gameofthrones',
    'gameofthrones': 'gameofthrones',
    'disney': 'disney',
    'pixar': 'pixar',
    'stranger-things': 'strangerthings',

    // Touhou
    'touhou': 'touhou'
};
// FANDOM SERVICE CLASS
class FandomService {
    private readonly CACHE_NS = 'api:search';
    private readonly CACHE_TTL = 600; // 10 minutes in seconds

    constructor() {
        // No local cache setup needed
    }

    /**
     * Get wiki subdomain from alias or custom name
     */
    getWikiSubdomain(wiki: string): string {
        const normalized = wiki.toLowerCase().replace(/[\s_-]/g, '');
        return POPULAR_WIKIS[normalized] || wiki.toLowerCase().replace(/[\s_]/g, '-');
    }

    /**
     * Search articles in a Fandom wiki with circuit breaker
     */
    async search(wiki: string, query: string, limit: number = 10): Promise<SearchResponse> {
        const subdomain = this.getWikiSubdomain(wiki);
        const cacheKey = `fandom:search_${subdomain}_${query}`;

        const cached = await cacheService.get<SearchResponse>(this.CACHE_NS, cacheKey);
        if (cached) return { ...cached, fromCache: true };

        return circuitBreakerRegistry.execute('fandom', async () => {
            try {
                const response = await axios.get<MediaWikiQuerySearchResponse>(
                    `https://${subdomain}.fandom.com/api.php`,
                    {
                        ...REQUEST_CONFIG,
                        params: {
                            action: 'query',
                            list: 'search',
                            srsearch: query,
                            srlimit: Math.min(limit, 25),
                            srprop: 'snippet|titlesnippet',
                            format: 'json'
                        }
                    }
                );

                const searchResults = response.data?.query?.search || [];

                if (searchResults.length === 0) {
                    return {
                        success: true,
                        results: [],
                        wiki: subdomain,
                        query
                    };
                }

                const results: SearchResult[] = searchResults.map(item => ({
                    title: item.title,
                    pageId: item.pageid,
                    snippet: item.snippet?.replace(/<[^>]*>/g, '').substring(0, 150) || 'No preview available.',
                    url: `https://${subdomain}.fandom.com/wiki/${encodeURIComponent(item.title.replace(/ /g, '_'))}`
                }));

                const result: SearchResponse = { success: true, results, wiki: subdomain, query };
                await cacheService.set(this.CACHE_NS, cacheKey, result, this.CACHE_TTL);

                return result;
            } catch (error) {
                const err = error as { response?: { status: number }; code?: string; message: string };
                console.error('[Fandom Search Error]', err.message);

                // Check if wiki doesn't exist
                if (err.response?.status === 404 || err.code === 'ENOTFOUND') {
                    return {
                        success: false,
                        error: `Wiki **${subdomain}** not found. Make sure you entered the correct wiki name.`
                    };
                }

                return { success: false, error: 'Failed to search Fandom wiki. Please try again.' };
            }
        });
    }

    /**
     * Get article details from a Fandom wiki with circuit breaker
     */
    async getArticle(wiki: string, title: string): Promise<ArticleResponse> {
        const subdomain = this.getWikiSubdomain(wiki);
        const cacheKey = `fandom:article_${subdomain}_${title}`;

        const cached = await cacheService.get<ArticleResponse>(this.CACHE_NS, cacheKey);
        if (cached) return { ...cached, fromCache: true };

        return circuitBreakerRegistry.execute('fandom', async () => {
            try {
                const response = await axios.get<MediaWikiQueryPagesResponse>(
                    `https://${subdomain}.fandom.com/api.php`,
                    {
                        ...REQUEST_CONFIG,
                        params: {
                            action: 'query',
                            titles: title,
                            prop: 'extracts|pageimages|info|categories',
                            exintro: true,
                            explaintext: true,
                            exsectionformat: 'plain',
                            exchars: 1500,
                            piprop: 'thumbnail|original',
                            pithumbsize: 500,
                            inprop: 'url',
                            cllimit: 10,
                            format: 'json'
                        }
                    }
                );

                const pages = response.data?.query?.pages;
                if (!pages) {
                    return { success: false, error: 'Failed to fetch article.' };
                }

                const pageIds = Object.keys(pages);
                const pageId = pageIds[0];
                if (!pageId || pageId === '-1') {
                    return { success: false, error: `Article **${title}** not found in ${subdomain} wiki.` };
                }

                const page = pages[pageId];
                if (!page) {
                    return { success: false, error: `Article **${title}** not found in ${subdomain} wiki.` };
                }
                const extract = page.extract || 'No content available.';
                const categories = page.categories?.map((c: { title: string }) => c.title.replace('Category:', '')) || [];

                const result: ArticleResponse = {
                    success: true,
                    article: {
                        title: page.title,
                        pageId: parseInt(pageId),
                        extract: this._cleanExtract(extract),
                        url: page.fullurl || `https://${subdomain}.fandom.com/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
                        thumbnail: page.thumbnail?.source || page.original?.source,
                        categories: categories.slice(0, 5),
                        wiki: subdomain,
                        wikiName: this._formatWikiName(subdomain)
                    }
                };

                await cacheService.set(this.CACHE_NS, cacheKey, result, this.CACHE_TTL);
                return result;
            } catch (error) {
                console.error('[Fandom Article Error]', (error as Error).message);
                return { success: false, error: 'Failed to fetch article. Please try again.' };
            }
        });
    }

    /**
     * Get random article from a wiki
     */
    async getRandomArticle(wiki: string): Promise<ArticleResponse> {
        const subdomain = this.getWikiSubdomain(wiki);

        return circuitBreakerRegistry.execute('fandom', async () => {
            try {
                const response = await axios.get<MediaWikiQueryRandomResponse>(
                    `https://${subdomain}.fandom.com/api.php`,
                    {
                        ...REQUEST_CONFIG,
                        params: {
                            action: 'query',
                            list: 'random',
                            rnnamespace: 0, // Main namespace only
                            rnlimit: 1,
                            format: 'json'
                        }
                    }
                );

                const randomPages = response.data?.query?.random;
                if (!randomPages || randomPages.length === 0) {
                    return { success: false, error: 'Could not get random article.' };
                }

                const firstPage = randomPages[0];
                if (!firstPage?.title) {
                    return { success: false, error: 'Could not get random article.' };
                }

                // Get full article details
                return await this.getArticle(wiki, firstPage.title);
            } catch (error) {
                console.error('[Fandom Random Error]', (error as Error).message);
                return { success: false, error: 'Failed to get random article. Please try again.' };
            }
        });
    }

    /**
     * Get wiki info
     */
    async getWikiInfo(wiki: string): Promise<WikiInfoResponse> {
        const subdomain = this.getWikiSubdomain(wiki);
        const cacheKey = `fandom:wikiinfo_${subdomain}`;

        const cached = await cacheService.get<WikiInfoResponse>(this.CACHE_NS, cacheKey);
        if (cached) return { ...cached, fromCache: true };

        return circuitBreakerRegistry.execute('fandom', async () => {
            try {
                const response = await axios.get<MediaWikiSiteInfo>(
                    `https://${subdomain}.fandom.com/api.php`,
                    {
                        ...REQUEST_CONFIG,
                        params: {
                            action: 'query',
                            meta: 'siteinfo',
                            siprop: 'general|statistics|namespaces',
                            format: 'json'
                        }
                    }
                );

                const general = response.data?.query?.general;
                const statistics = response.data?.query?.statistics;

                if (!general) {
                    return { success: false, error: 'Could not fetch wiki info.' };
                }

                const result: WikiInfoResponse = {
                    success: true,
                    info: {
                        name: general.sitename,
                        base: general.base,
                        logo: general.logo,
                        lang: general.lang,
                        generator: general.generator,
                        articles: statistics?.articles || 0,
                        pages: statistics?.pages || 0,
                        edits: statistics?.edits || 0,
                        users: statistics?.users || 0,
                        activeUsers: statistics?.activeusers || 0,
                        images: statistics?.images || 0,
                        subdomain
                    }
                };

                await cacheService.set(this.CACHE_NS, cacheKey, result, this.CACHE_TTL);
                return result;
            } catch (error) {
                console.error('[Fandom Wiki Info Error]', (error as Error).message);
                return { success: false, error: 'Failed to fetch wiki info.' };
            }
        });
    }

    /**
     * Get list of popular wikis for autocomplete
     */
    getPopularWikis(): PopularWiki[] {
        return Object.entries(POPULAR_WIKIS).map(([alias, subdomain]) => ({
            name: this._formatWikiName(subdomain),
            alias,
            subdomain
        }));
    }

    /**
     * Search for wiki suggestions (autocomplete)
     */
    async searchWikis(query: string): Promise<WikiSuggestion[]> {
        // First check local popular wikis
        const localMatches = Object.entries(POPULAR_WIKIS)
            .filter(([alias, subdomain]) =>
                alias.includes(query.toLowerCase()) ||
                subdomain.includes(query.toLowerCase())
            )
            .map(([, subdomain]) => ({
                name: this._formatWikiName(subdomain),
                subdomain
            }))
            .slice(0, 10);

        if (localMatches.length >= 5) {
            return localMatches;
        }

        // Check cache for API-augmented results
        const cacheKey = `fandom:wikisearch_${query.toLowerCase()}`;
        const cached = await cacheService.get<WikiSuggestion[]>(this.CACHE_NS, cacheKey);
        if (cached) return cached;

        // If not enough local matches, try Fandom's wiki search
        try {
            const response = await axios.get('https://community.fandom.com/api.php', {
                ...REQUEST_CONFIG,
                timeout: 2500,
                params: {
                    action: 'query',
                    list: 'wikiasearch',
                    query: query,
                    limit: 10,
                    format: 'json'
                }
            });

            interface WikiSearchResult {
                title?: string;
                name?: string;
                url?: string;
            }

            const results = (response.data?.query?.wikiasearch?.result || []) as WikiSearchResult[];
            const wikiResults: WikiSuggestion[] = results.map(wiki => ({
                name: wiki.title || wiki.name || '',
                subdomain: wiki.url?.match(/https?:\/\/([^.]+)/)?.[1] || wiki.name || ''
            }));

            // Combine and deduplicate
            const combined = [...localMatches];
            for (const wiki of wikiResults) {
                if (!combined.find(w => w.subdomain === wiki.subdomain)) {
                    combined.push(wiki);
                }
            }

            const result = combined.slice(0, 15);
            // Cache combined results
            await cacheService.set(this.CACHE_NS, cacheKey, result, this.CACHE_TTL);
            return result;
        } catch {
            return localMatches;
        }
    }

    /**
     * Clean extract text
     */
    private _cleanExtract(text: string): string {
        if (!text) return 'No content available.';

        return text
            .replace(/\n{3,}/g, '\n\n')
            .replace(/\[\d+\]/g, '') // Remove citation references
            .trim();
    }

    /**
     * Format wiki subdomain to display name
     */
    private _formatWikiName(subdomain: string): string {
        return subdomain
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    /**
     * Cleanup resources
     */
    destroy(): void {
        // No local resources to clean up
    }
}

// Export singleton instance
const fandomService = new FandomService();

export { fandomService, FandomService, POPULAR_WIKIS };
export default fandomService;
