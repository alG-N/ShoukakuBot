/**
 * External Services Configuration
 * API keys and external service settings
 * All credentials from environment variables
 * @module config/services
 */

module.exports = {
    // Steam API
    steam: {
        apiKey: process.env.STEAM_API_KEY || '',
        baseUrl: 'https://api.steampowered.com',
        storeUrl: 'https://store.steampowered.com/api',
        rateLimit: 100  // requests per minute
    },
    
    // Reddit API
    reddit: {
        clientId: process.env.REDDIT_CLIENT_ID || process.env.CLIENT_ID || '',
        secretKey: process.env.REDDIT_SECRET_KEY || process.env.SECRET_KEY || '',
        userAgent: 'alterGolden/2.0 (Discord Bot)',
        baseUrl: 'https://oauth.reddit.com',
        authUrl: 'https://www.reddit.com/api/v1/access_token',
        rateLimit: 60  // requests per minute
    },
    
    // Pixiv API
    pixiv: {
        refreshToken: process.env.PIXIV_REFRESH_TOKEN || '',
        clientId: 'MOBrBDS8blbauoSck0ZfDbtuzpyT',
        clientSecret: 'lsACyCD94FhDUtGTXi3QzcFE2uU1hqtDaKeqrdwj',
        baseUrl: 'https://app-api.pixiv.net',
        authUrl: 'https://oauth.secure.pixiv.net/auth/token',
        imageProxy: 'https://i.pximg.net',
        rateLimit: 30  // requests per minute
    },
    
    // Rule34 API
    rule34: {
        userId: process.env.RULE34_USER_ID || '',
        apiKey: process.env.RULE34_API_KEY || '',
        baseUrl: 'https://api.rule34.xxx',
        rateLimit: process.env.RULE34_API_KEY ? 100 : 30  // Higher with API key
    },
    
    // NHentai (no auth needed)
    nhentai: {
        baseUrl: 'https://nhentai.net/api',
        imageUrl: 'https://i.nhentai.net',
        thumbUrl: 'https://t.nhentai.net',
        rateLimit: 20  // requests per minute
    },
    
    // Google API
    google: {
        apiKey: process.env.GOOGLE_API_KEY || '',
        searchCx: process.env.GOOGLE_SEARCH_CX || '',
        searchUrl: 'https://www.googleapis.com/customsearch/v1',
        enabled: !!(process.env.GOOGLE_API_KEY && process.env.GOOGLE_SEARCH_CX)
    },
    
    // AniList API (GraphQL, no auth)
    anilist: {
        baseUrl: 'https://graphql.anilist.co',
        rateLimit: 90  // requests per minute
    },
    
    // MyAnimeList API (Jikan - unofficial)
    myanimelist: {
        baseUrl: 'https://api.jikan.moe/v4',
        rateLimit: 60  // requests per minute (Jikan limit)
    },
    
    // Wikipedia API
    wikipedia: {
        baseUrl: 'https://en.wikipedia.org/api/rest_v1',
        rateLimit: 100
    },
    
    // Fandom/Wikia API
    fandom: {
        baseUrl: 'https://community.fandom.com',
        rateLimit: 60
    },
    
    // Cobalt (Video Download)
    cobalt: {
        instances: [
            process.env.COBALT_URL || 'http://localhost:9000'
        ],
        timeout: 120000,
        maxRetries: 3
    },
    
    // yt-dlp Service
    ytdlp: {
        url: process.env.YTDLP_URL || 'http://localhost:8080',
        timeout: 120000
    },
    
    // Invidious (YouTube alternative)
    invidious: {
        url: process.env.INVIDIOUS_URL || 'http://localhost:3001',
        timeout: 30000
    }
};
