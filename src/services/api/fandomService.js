/**
 * Fandom Wiki Service
 * API service for searching and fetching wiki articles from Fandom (formerly Wikia)
 */

const axios = require('axios');

const REQUEST_CONFIG = {
    timeout: 10000,
    headers: {
        'User-Agent': 'FumoBOT/2.0 (Discord Bot)',
        'Accept': 'application/json'
    }
};

// Popular Fandom wikis
const POPULAR_WIKIS = {
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

class FandomService {
    constructor() {
        this.cache = new Map();
        this.cacheExpiry = 600000; // 10 minutes
        this.maxCacheSize = 200;
        
        // Auto-cleanup every 15 minutes
        setInterval(() => this._cleanupCache(), 900000);
    }

    _cleanupCache() {
        const now = Date.now();
        for (const [key, entry] of this.cache) {
            if (now > entry.expiresAt) {
                this.cache.delete(key);
            }
        }
    }

    _getFromCache(key) {
        const entry = this.cache.get(key);
        if (entry && Date.now() < entry.expiresAt) {
            return entry.data;
        }
        this.cache.delete(key);
        return null;
    }

    _setCache(key, data) {
        // Limit cache size
        if (this.cache.size >= this.maxCacheSize) {
            const oldestKey = this.cache.keys().next().value;
            this.cache.delete(oldestKey);
        }
        this.cache.set(key, {
            data,
            expiresAt: Date.now() + this.cacheExpiry
        });
    }

    /**
     * Get wiki subdomain from alias or custom name
     */
    getWikiSubdomain(wiki) {
        const normalized = wiki.toLowerCase().replace(/[\s_-]/g, '');
        return POPULAR_WIKIS[normalized] || wiki.toLowerCase().replace(/[\s_]/g, '-');
    }

    /**
     * Search articles in a Fandom wiki
     */
    async search(wiki, query, limit = 10) {
        const subdomain = this.getWikiSubdomain(wiki);
        const cacheKey = `search_${subdomain}_${query}`;
        
        const cached = this._getFromCache(cacheKey);
        if (cached) return { ...cached, fromCache: true };

        try {
            // Use Fandom's unified search API
            const response = await axios.get(`https://${subdomain}.fandom.com/api.php`, {
                ...REQUEST_CONFIG,
                params: {
                    action: 'query',
                    list: 'search',
                    srsearch: query,
                    srlimit: Math.min(limit, 25),
                    srprop: 'snippet|titlesnippet',
                    format: 'json'
                }
            });

            const searchResults = response.data?.query?.search || [];
            
            if (searchResults.length === 0) {
                return { 
                    success: true, 
                    results: [], 
                    wiki: subdomain, 
                    query 
                };
            }

            const results = searchResults.map(item => ({
                title: item.title,
                pageId: item.pageid,
                snippet: item.snippet?.replace(/<[^>]*>/g, '').substring(0, 150) || 'No preview available.',
                url: `https://${subdomain}.fandom.com/wiki/${encodeURIComponent(item.title.replace(/ /g, '_'))}`
            }));

            const result = { success: true, results, wiki: subdomain, query };
            this._setCache(cacheKey, result);
            
            return result;
        } catch (error) {
            console.error('[Fandom Search Error]', error.message);
            
            // Check if wiki doesn't exist
            if (error.response?.status === 404 || error.code === 'ENOTFOUND') {
                return { 
                    success: false, 
                    error: `Wiki **${subdomain}** not found. Make sure you entered the correct wiki name.` 
                };
            }
            
            return { success: false, error: 'Failed to search Fandom wiki. Please try again.' };
        }
    }

    /**
     * Get article details from a Fandom wiki
     */
    async getArticle(wiki, title) {
        const subdomain = this.getWikiSubdomain(wiki);
        const cacheKey = `article_${subdomain}_${title}`;
        
        const cached = this._getFromCache(cacheKey);
        if (cached) return { ...cached, fromCache: true };

        try {
            // Get article content and info
            const response = await axios.get(`https://${subdomain}.fandom.com/api.php`, {
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
            });

            const pages = response.data?.query?.pages;
            if (!pages) {
                return { success: false, error: 'Failed to fetch article.' };
            }

            const pageId = Object.keys(pages)[0];
            if (pageId === '-1') {
                return { success: false, error: `Article **${title}** not found in ${subdomain} wiki.` };
            }

            const page = pages[pageId];
            const extract = page.extract || 'No content available.';
            const categories = page.categories?.map(c => c.title.replace('Category:', '')) || [];

            const result = {
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

            this._setCache(cacheKey, result);
            return result;
        } catch (error) {
            console.error('[Fandom Article Error]', error.message);
            return { success: false, error: 'Failed to fetch article. Please try again.' };
        }
    }

    /**
     * Get random article from a wiki
     */
    async getRandomArticle(wiki) {
        const subdomain = this.getWikiSubdomain(wiki);

        try {
            const response = await axios.get(`https://${subdomain}.fandom.com/api.php`, {
                ...REQUEST_CONFIG,
                params: {
                    action: 'query',
                    list: 'random',
                    rnnamespace: 0, // Main namespace only
                    rnlimit: 1,
                    format: 'json'
                }
            });

            const randomPages = response.data?.query?.random;
            if (!randomPages || randomPages.length === 0) {
                return { success: false, error: 'Could not get random article.' };
            }

            // Get full article details
            return await this.getArticle(wiki, randomPages[0].title);
        } catch (error) {
            console.error('[Fandom Random Error]', error.message);
            return { success: false, error: 'Failed to get random article. Please try again.' };
        }
    }

    /**
     * Get wiki info
     */
    async getWikiInfo(wiki) {
        const subdomain = this.getWikiSubdomain(wiki);
        const cacheKey = `wikiinfo_${subdomain}`;
        
        const cached = this._getFromCache(cacheKey);
        if (cached) return { ...cached, fromCache: true };

        try {
            const response = await axios.get(`https://${subdomain}.fandom.com/api.php`, {
                ...REQUEST_CONFIG,
                params: {
                    action: 'query',
                    meta: 'siteinfo',
                    siprop: 'general|statistics|namespaces',
                    format: 'json'
                }
            });

            const general = response.data?.query?.general;
            const statistics = response.data?.query?.statistics;

            if (!general) {
                return { success: false, error: 'Could not fetch wiki info.' };
            }

            const result = {
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

            this._setCache(cacheKey, result);
            return result;
        } catch (error) {
            console.error('[Fandom Wiki Info Error]', error.message);
            return { success: false, error: 'Failed to fetch wiki info.' };
        }
    }

    /**
     * Get list of popular wikis for autocomplete
     */
    getPopularWikis() {
        return Object.entries(POPULAR_WIKIS).map(([alias, subdomain]) => ({
            name: this._formatWikiName(subdomain),
            alias,
            subdomain
        }));
    }

    /**
     * Search for wiki suggestions (autocomplete)
     */
    async searchWikis(query) {
        // First check local popular wikis
        const localMatches = Object.entries(POPULAR_WIKIS)
            .filter(([alias, subdomain]) => 
                alias.includes(query.toLowerCase()) || 
                subdomain.includes(query.toLowerCase())
            )
            .map(([alias, subdomain]) => ({
                name: this._formatWikiName(subdomain),
                subdomain
            }))
            .slice(0, 10);

        if (localMatches.length >= 5) {
            return localMatches;
        }

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

            const results = response.data?.query?.wikiasearch?.result || [];
            const wikiResults = results.map(wiki => ({
                name: wiki.title || wiki.name,
                subdomain: wiki.url?.match(/https?:\/\/([^.]+)/)?.[1] || wiki.name
            }));

            // Combine and deduplicate
            const combined = [...localMatches];
            for (const wiki of wikiResults) {
                if (!combined.find(w => w.subdomain === wiki.subdomain)) {
                    combined.push(wiki);
                }
            }

            return combined.slice(0, 15);
        } catch (error) {
            return localMatches;
        }
    }

    _cleanExtract(text) {
        if (!text) return 'No content available.';
        
        return text
            .replace(/\n{3,}/g, '\n\n')
            .replace(/\[\d+\]/g, '') // Remove citation references
            .trim();
    }

    _formatWikiName(subdomain) {
        return subdomain
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }
}

module.exports = new FandomService();
