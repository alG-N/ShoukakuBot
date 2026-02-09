/**
 * External Services Configuration
 * API keys and external service settings
 * @module config/services
 */

export const steam = {
    apiKey: process.env.STEAM_API_KEY || '',
    baseUrl: 'https://api.steampowered.com',
    storeUrl: 'https://store.steampowered.com/api',
    rateLimit: 100  // requests per minute
};

export const reddit = {
    clientId: process.env.REDDIT_CLIENT_ID || '',
    secretKey: process.env.REDDIT_SECRET_KEY || '',
    userAgent: 'alterGolden/2.0 (Discord Bot)',
    baseUrl: 'https://oauth.reddit.com',
    authUrl: 'https://www.reddit.com/api/v1/access_token',
    rateLimit: 60,  // requests per minute
    timeout: parseInt(process.env.REDDIT_TIMEOUT || '10000', 10),
    authTimeout: parseInt(process.env.REDDIT_AUTH_TIMEOUT || '5000', 10),
    searchTimeout: parseInt(process.env.REDDIT_SEARCH_TIMEOUT || '2000', 10),
    maxRetries: parseInt(process.env.REDDIT_MAX_RETRIES || '2', 10)
};

export const pixiv = {
    refreshToken: process.env.PIXIV_REFRESH_TOKEN || '',
    clientId: process.env.PIXIV_CLIENT_ID || '',
    clientSecret: process.env.PIXIV_CLIENT_SECRET || '',
    baseUrl: 'https://app-api.pixiv.net',
    authUrl: 'https://oauth.secure.pixiv.net/auth/token',
    imageProxy: 'https://i.pximg.net',
    rateLimit: 30  // requests per minute
};

export const rule34 = {
    userId: process.env.RULE34_USER_ID || '',
    apiKey: process.env.RULE34_API_KEY || '',
    baseUrl: 'https://api.rule34.xxx',
    rateLimit: process.env.RULE34_API_KEY ? 100 : 30  // Higher with API key
};

export const nhentai = {
    baseUrl: 'https://nhentai.net/api',
    imageUrl: 'https://i.nhentai.net',
    thumbUrl: 'https://t.nhentai.net',
    rateLimit: 20  // requests per minute
};

export const google = {
    apiKey: process.env.GOOGLE_API_KEY || '',
    searchCx: process.env.GOOGLE_SEARCH_CX || '',
    searchUrl: 'https://www.googleapis.com/customsearch/v1',
    enabled: !!(process.env.GOOGLE_API_KEY && process.env.GOOGLE_SEARCH_CX)
};

export const anilist = {
    baseUrl: 'https://graphql.anilist.co',
    rateLimit: 90  // requests per minute
};

export const myanimelist = {
    baseUrl: 'https://api.jikan.moe/v4',
    rateLimit: 60  // requests per minute (Jikan limit)
};

export const wikipedia = {
    baseUrl: 'https://en.wikipedia.org/api/rest_v1',
    rateLimit: 100
};

export const fandom = {
    baseUrl: 'https://community.fandom.com',
    rateLimit: 60
};

export const cobalt = {
    instances: [
        process.env.COBALT_URL || 'http://localhost:9000'
    ],
    timeout: 120000,
    maxRetries: 3
};

export const ytdlp = {
    url: process.env.YTDLP_URL || 'http://localhost:8080',
    timeout: 120000
};

// REMOVED: invidious - không cần thiết, tốn tài nguyên
// Lavalink hoạt động bình thường với OAuth và YouTube plugin clients

export default {
    steam,
    reddit,
    pixiv,
    rule34,
    nhentai,
    google,
    anilist,
    myanimelist,
    wikipedia,
    fandom,
    cobalt,
    ytdlp
};
