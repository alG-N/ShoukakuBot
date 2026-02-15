/**
 * Embed Service
 * Converts social media URLs to embed-fix URLs for better Discord embedding
 * Uses combo approach: fxtwitter, vxtiktok, ddinstagram, rxddit, etc.
 * 
 * Note: No cache needed — URL conversion is pure string transformation (no I/O).
 * @module services/api/embedService
 */

import logger from '../../core/Logger.js';

// TYPES & INTERFACES

/** Mapping rule: original domain → embed-fix domain */
export interface EmbedFixRule {
    /** Platform identifier (matches platformDetector IDs) */
    platformId: string;
    /** Display name */
    name: string;
    /** Emoji for the platform */
    emoji: string;
    /** Original URL patterns to match */
    patterns: RegExp[];
    /** Domain replacements: [originalDomain, fixedDomain][] */
    replacements: [string, string][];
    /** Embed fix service name */
    service: string;
    /** Whether this platform's fix is reliable */
    reliable: boolean;
}

/** Result of converting a URL */
export interface EmbedFixResult {
    success: boolean;
    /** Original URL */
    originalUrl: string;
    /** Fixed URL for embedding */
    fixedUrl?: string;
    /** Platform info */
    platform?: {
        id: string;
        name: string;
        emoji: string;
        service: string;
        reliable: boolean;
    };
    /** Error message if failed */
    error?: string;
}

/** Stats for the service */
export interface EmbedFixStats {
    totalConverted: number;
    perPlatform: Record<string, number>;
}

// EMBED FIX RULES

const EMBED_FIX_RULES: EmbedFixRule[] = [
    {
        platformId: 'twitter',
        name: 'Twitter / X',
        emoji: '𝕏',
        patterns: [
            /https?:\/\/(www\.)?(twitter\.com|x\.com)\/\w+\/status\/\d+/i,
        ],
        replacements: [
            ['twitter.com', 'fxtwitter.com'],
            ['x.com', 'fixupx.com'],
        ],
        service: 'FixTweet / FixupX',
        reliable: true,
    },
    {
        platformId: 'tiktok',
        name: 'TikTok',
        emoji: '🎵',
        patterns: [
            /https?:\/\/(www\.|vm\.)?tiktok\.com\/.+/i,
        ],
        replacements: [
            ['tiktok.com', 'vxtiktok.com'],
        ],
        service: 'vxTikTok',
        reliable: true,
    },
    {
        platformId: 'instagram',
        name: 'Instagram',
        emoji: '📷',
        patterns: [
            /https?:\/\/(www\.)?(instagram\.com|instagr\.am)\/(p|reel|reels|stories|tv)\/.+/i,
        ],
        replacements: [
            ['instagram.com', 'ddinstagram.com'],
            ['instagr.am', 'ddinstagram.com'],
        ],
        service: 'ddInstagram',
        reliable: true,
    },
    {
        platformId: 'reddit',
        name: 'Reddit',
        emoji: '🤖',
        patterns: [
            /https?:\/\/(www\.|old\.|new\.)?reddit\.com\/r\/\w+\/comments\/.+/i,
            /https?:\/\/redd\.it\/.+/i,
        ],
        replacements: [
            ['reddit.com', 'rxddit.com'],
            ['redd.it', 'rxddit.com'],
        ],
        service: 'rxddit',
        reliable: true,
    },
    {
        platformId: 'bluesky',
        name: 'Bluesky',
        emoji: '🦋',
        patterns: [
            /https?:\/\/(www\.)?bsky\.app\/profile\/.+\/post\/.+/i,
        ],
        replacements: [
            ['bsky.app', 'fxbsky.app'],
        ],
        service: 'fxBsky',
        reliable: true,
    },
    {
        platformId: 'facebook',
        name: 'Facebook',
        emoji: '📘',
        patterns: [
            /https?:\/\/(www\.|m\.|web\.)?facebook\.com\/.+/i,
            /https?:\/\/fb\.watch\/.+/i,
        ],
        replacements: [
            ['facebook.com', 'facebed.com'],
            ['fb.watch', 'facebed.com/fb.watch'],
        ],
        service: 'Facebed',
        reliable: true,
    },
    {
        platformId: 'threads',
        name: 'Threads',
        emoji: '🧵',
        patterns: [
            /https?:\/\/(www\.)?threads\.net\/@.+\/post\/.+/i,
        ],
        replacements: [
            ['threads.net', 'fixthreads.net'],
        ],
        service: 'FixThreads',
        reliable: true,
    },
];

// EMBED SERVICE CLASS

class EmbedService {
    private stats: EmbedFixStats;

    constructor() {
        this.stats = {
            totalConverted: 0,
            perPlatform: {},
        };
        logger.info('EmbedService', `Initialized with ${EMBED_FIX_RULES.length} platform rules`);
    }

    /**
     * Convert a social media URL to its embed-fix version
     */
    convert(url: string): EmbedFixResult {
        try {
            const trimmedUrl = url.trim();

            // Find matching rule
            const rule = this._findRule(trimmedUrl);
            if (!rule) {
                return {
                    success: false,
                    originalUrl: trimmedUrl,
                    error: 'Unsupported platform — no embed fix available for this URL',
                };
            }

            // Apply domain replacement
            const fixedUrl = this._applyReplacement(trimmedUrl, rule);
            if (!fixedUrl) {
                return {
                    success: false,
                    originalUrl: trimmedUrl,
                    error: `Could not convert URL for ${rule.name}`,
                };
            }

            // Track stats
            this.stats.totalConverted++;
            this.stats.perPlatform[rule.platformId] = (this.stats.perPlatform[rule.platformId] || 0) + 1;

            return {
                success: true,
                originalUrl: trimmedUrl,
                fixedUrl,
                platform: {
                    id: rule.platformId,
                    name: rule.name,
                    emoji: rule.emoji,
                    service: rule.service,
                    reliable: rule.reliable,
                },
            };
        } catch (error) {
            logger.error('EmbedService', `Error converting URL: ${(error as Error).message}`);
            return {
                success: false,
                originalUrl: url,
                error: 'Failed to process URL',
            };
        }
    }

    /**
     * Convert multiple URLs from a message
     */
    convertAll(text: string): EmbedFixResult[] {
        const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
        const urls = text.match(urlRegex);
        if (!urls) return [];

        const results: EmbedFixResult[] = [];
        const seen = new Set<string>();

        for (const url of urls) {
            // Clean trailing punctuation
            const cleanUrl = url.replace(/[.,;:!?)]+$/, '');
            if (seen.has(cleanUrl)) continue;
            seen.add(cleanUrl);

            const result = this.convert(cleanUrl);
            if (result.success) {
                results.push(result);
            }
        }

        return results;
    }

    /**
     * Check if a URL is supported for embed fix
     */
    isSupported(url: string): boolean {
        return this._findRule(url.trim()) !== null;
    }

    /**
     * Get all supported platforms info
     */
    getSupportedPlatforms(): Array<{ id: string; name: string; emoji: string; service: string; reliable: boolean }> {
        return EMBED_FIX_RULES.map(rule => ({
            id: rule.platformId,
            name: rule.name,
            emoji: rule.emoji,
            service: rule.service,
            reliable: rule.reliable,
        }));
    }

    /**
     * Get service stats
     */
    getStats(): EmbedFixStats {
        return { ...this.stats };
    }

    /**
     * Shutdown handler for DI container
     */
    shutdown(): void {
        logger.info('EmbedService', `Shutting down. Total converted: ${this.stats.totalConverted}`);
    }

    // PRIVATE METHODS

    /**
     * Find the matching embed fix rule for a URL
     */
    private _findRule(url: string): EmbedFixRule | null {
        for (const rule of EMBED_FIX_RULES) {
            for (const pattern of rule.patterns) {
                if (pattern.test(url)) {
                    return rule;
                }
            }
        }
        return null;
    }

    /**
     * Apply domain replacement to URL
     */
    private _applyReplacement(url: string, rule: EmbedFixRule): string | null {
        for (const [original, fixed] of rule.replacements) {
            if (url.includes(original)) {
                return url.replace(original, fixed);
            }
        }
        return null;
    }
}

// Export singleton + class
const embedService = new EmbedService();
export default embedService;
export { EmbedService, EMBED_FIX_RULES };
