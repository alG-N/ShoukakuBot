/**
 * Shared Constants
 * Centralized constants for the entire application
 * @module constants
 */
// EMBED COLORS
/**
 * Color codes for Discord embeds
 */
export const COLORS = {
    // Status colors
    SUCCESS: 0x00FF00,
    ERROR: 0xFF0000,
    WARNING: 0xFFAA00,
    INFO: 0x00AAFF,
    
    // Feature colors
    MODERATION: 0xFF5555,
    MUSIC: 0x1DB954,
    VIDEO: 0xFF0000,
    API: 0x5865F2,
    FUN: 0xFFCC00,
    SETTING: 0x5865F2,
    SNIPE: 0x9B59B6,
    
    // Brand colors
    PRIMARY: 0x5865F2,
    SECONDARY: 0x99AAB5,
    PREMIUM: 0xF47FFF,
    
    // API-specific colors
    REDDIT: 0xFF4500,
    NHENTAI: 0xED2553,
    PIXIV: 0x0096FA,
    RULE34: 0xAAE5A4,
    ANILIST: 0x02A9FF,
    STEAM: 0x1B2838,
    WIKIPEDIA: 0xFFFFFF,
    MAL: 0x2E51A2,
} as const;

export type ColorKey = keyof typeof COLORS;
export type ColorValue = typeof COLORS[ColorKey];
// CACHE LIMITS (Optimized for 1K+ servers)
/**
 * Cache configuration limits
 */
export const CACHE_LIMITS = {
    // Guild-related
    MAX_GUILDS: 2500,
    MAX_QUEUE_SIZE: 500,
    MAX_QUEUE_TRACK_DURATION: 3 * 60 * 60 * 1000, // 3 hours
    
    // User-related
    MAX_USER_SESSIONS: 5000,
    MAX_USER_HISTORY: 100,
    MAX_USER_FAVORITES: 200,
    
    // General cache limits
    MAX_PLAYLIST_CACHE: 100,
    MAX_RECENTLY_PLAYED: 50,
    MAX_API_CACHE_ENTRIES: 1000,
    MAX_SNIPE_MESSAGES: 50,
    
    // TTL (Time To Live) in milliseconds
    SESSION_TTL: 60 * 60 * 1000,        // 1 hour
    SETTINGS_CACHE_TTL: 5 * 60 * 1000,  // 5 minutes
    PLAYLIST_CACHE_TTL: 30 * 60 * 1000, // 30 minutes
    API_CACHE_TTL: 10 * 60 * 1000,      // 10 minutes
    GUILD_SETTINGS_TTL: 5 * 60 * 1000,  // 5 minutes
    USER_DATA_TTL: 10 * 60 * 1000,      // 10 minutes
} as const;
// TIMEOUTS
/**
 * Timeout durations in milliseconds
 */
export const TIMEOUTS = {
    // Interaction timeouts
    BUTTON_COLLECTOR: 5 * 60 * 1000,    // 5 minutes
    SELECT_MENU_COLLECTOR: 3 * 60 * 1000, // 3 minutes
    MODAL_TIMEOUT: 5 * 60 * 1000,       // 5 minutes
    AUTOCOMPLETE: 3000,                 // 3 seconds
    
    // Music timeouts
    VOICE_INACTIVITY: 5 * 60 * 1000,    // 5 minutes
    SKIP_VOTE: 30 * 1000,               // 30 seconds
    QUEUE_MESSAGE: 60 * 1000,           // 1 minute
    
    // General
    COMMAND_COOLDOWN: 3 * 1000,         // 3 seconds
    API_REQUEST: 30 * 1000,             // 30 seconds
    DATABASE_QUERY: 10 * 1000,          // 10 seconds
    DEFER_REPLY: 2500,                  // 2.5 seconds (before auto-defer)
} as const;
// PAGINATION
/**
 * Pagination settings
 */
export const PAGINATION = {
    DEFAULT_PAGE_SIZE: 10,
    QUEUE_PAGE_SIZE: 10,
    HISTORY_PAGE_SIZE: 15,
    SEARCH_RESULTS: 25,
    HELP_COMMANDS: 8,
    SNIPE_MESSAGES: 10,
} as const;
// RATE LIMITS
/**
 * Rate limit configurations
 */
export const RATE_LIMITS = {
    COMMANDS_PER_MINUTE: 20,
    API_REQUESTS_PER_MINUTE: 60,
    MESSAGES_PER_CHANNEL: 5,
    MUSIC_ACTIONS_PER_MINUTE: 30,
    DOWNLOADS_PER_HOUR: 10,
} as const;
// COOLDOWNS (in milliseconds)
/**
 * Command cooldown durations in milliseconds
 */
export const COOLDOWNS = {
    DEFAULT: 3000,
    MUSIC: 2000,
    API: 5000,
    VIDEO: 30000,
    ADMIN: 5000,
    OWNER: 0,
} as const;

export type CooldownCategory = keyof typeof COOLDOWNS;
// EMOJIS
/**
 * Emoji constants for UI elements
 */
export const EMOJIS = {
    // Status
    SUCCESS: '✅',
    ERROR: '❌',
    WARNING: '⚠️',
    INFO: 'ℹ️',
    LOADING: '⏳',
    QUESTION: '❓',
    
    // Music
    PLAY: '▶️',
    PAUSE: '⏸️',
    STOP: '⏹️',
    SKIP: '⏭️',
    PREVIOUS: '⏮️',
    SHUFFLE: '🔀',
    REPEAT: '🔁',
    REPEAT_ONE: '🔂',
    VOLUME: '🔊',
    VOLUME_LOW: '🔉',
    MUTE: '🔇',
    QUEUE: '📋',
    
    // General
    MUSIC: '🎵',
    VIDEO: '📹',
    SETTINGS: '⚙️',
    STAR: '⭐',
    FIRE: '🔥',
    CLOCK: '🕐',
    LINK: '🔗',
    SEARCH: '🔍',
    
    // Moderation
    BAN: '🔨',
    KICK: '👢',
    MUTE_MOD: '🔇',
    WARN: '⚠️',
    
    // Navigation
    ARROW_LEFT: '◀️',
    ARROW_RIGHT: '▶️',
    ARROW_UP: '🔼',
    ARROW_DOWN: '🔽',
    FIRST: '⏮️',
    LAST: '⏭️',
} as const;

export type EmojiKey = keyof typeof EMOJIS;
// REGEX PATTERNS
/**
 * Common regex patterns for validation
 */
export const PATTERNS = {
    // URLs
    YOUTUBE_URL: /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/i,
    YOUTUBE_VIDEO: /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    YOUTUBE_PLAYLIST: /(?:youtube\.com\/playlist\?list=)([a-zA-Z0-9_-]+)/,
    SPOTIFY_URL: /^(https?:\/\/)?(open\.)?spotify\.com\/.+$/i,
    SOUNDCLOUD_URL: /^(https?:\/\/)?(www\.)?soundcloud\.com\/.+$/i,
    TWITTER_URL: /^(https?:\/\/)?(www\.)?(twitter\.com|x\.com)\/.+$/i,
    TIKTOK_URL: /^(https?:\/\/)?(www\.)?(tiktok\.com|vm\.tiktok\.com)\/.+$/i,
    INSTAGRAM_URL: /^(https?:\/\/)?(www\.)?instagram\.com\/.+$/i,
    REDDIT_URL: /^(https?:\/\/)?(www\.|old\.)?reddit\.com\/.+$/i,
    
    // General
    DISCORD_ID: /^\d{17,19}$/,
    URL: /^https?:\/\/.+$/i,
    TIME_FORMAT: /^(\d{1,2}:)?(\d{1,2}):(\d{2})$/,
    DURATION: /^(\d+)(d|h|m|s)$/i,
    HEX_COLOR: /^#?([0-9A-F]{3}){1,2}$/i,
    EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
} as const;
// LIMITS
/**
 * Discord and application limits
 */
export const LIMITS = {
    // Discord limits
    EMBED_TITLE: 256,
    EMBED_DESCRIPTION: 4096,
    EMBED_FIELDS: 25,
    EMBED_FIELD_NAME: 256,
    EMBED_FIELD_VALUE: 1024,
    EMBED_FOOTER: 2048,
    EMBED_AUTHOR: 256,
    MESSAGE_CONTENT: 2000,
    EMBED_TOTAL: 6000,
    
    // File limits (in bytes)
    FILE_SIZE_STANDARD: 8 * 1024 * 1024,   // 8 MB
    FILE_SIZE_NITRO: 50 * 1024 * 1024,     // 50 MB
    FILE_SIZE_BOOST_2: 50 * 1024 * 1024,   // 50 MB
    FILE_SIZE_BOOST_3: 100 * 1024 * 1024,  // 100 MB
    
    // Custom limits
    QUEUE_SIZE: 500,
    FAVORITES_SIZE: 200,
    HISTORY_SIZE: 100,
} as const;

