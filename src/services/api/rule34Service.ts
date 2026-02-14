/**
 * Rule34 Service
 * Handles Rule34 API interactions with circuit breaker protection
 * @module services/api/rule34Service
 */

import * as path from 'path';
import * as dotenv from 'dotenv';
import { circuitBreakerRegistry } from '../../core/CircuitBreakerRegistry.js';
import logger from '../../core/Logger.js';

dotenv.config({ path: path.join(__dirname, '../.env') });
// TYPES & INTERFACES
interface Rule34Auth {
    userId: string;
    apiKey: string;
}

interface SearchOptions {
    limit?: number;
    page?: number;
    sort?: string;
    rating?: 'safe' | 'questionable' | 'explicit' | null;
    excludeAi?: boolean;
    minScore?: number;
    contentType?: 'animated' | 'comic' | 'photo' | null;
    excludeTags?: string[];
    requireTags?: string[];
    minWidth?: number;
    minHeight?: number;
    highQualityOnly?: boolean;
    excludeLowQuality?: boolean;
}

interface RandomOptions {
    tags?: string;
    count?: number;
    rating?: 'safe' | 'questionable' | 'explicit' | null;
    excludeAi?: boolean;
    minScore?: number;
}

interface TrendingOptions {
    timeframe?: 'day' | 'week' | 'month';
    limit?: number;
    excludeAi?: boolean;
}

interface FilterOptions {
    excludeAi?: boolean;
    minScore?: number;
    highQualityOnly?: boolean;
    excludeLowQuality?: boolean;
}

interface BuildQueryOptions extends FilterOptions {
    rating?: 'safe' | 'questionable' | 'explicit' | null;
    contentType?: 'animated' | 'comic' | 'photo' | null;
    excludeTags?: string[];
    requireTags?: string[];
    minWidth?: number;
    minHeight?: number;
    sort?: string;
}

export interface Rule34RawPost {
    id: number;
    hash?: string;
    md5?: string;
    width: number;
    height: number;
    score: number;
    rating: string;
    owner: string;
    tags: string;
    file_url: string;
    sample_url?: string;
    preview_url?: string;
    source?: string;
    parent_id?: number;
    has_children?: boolean;
    created_at?: string;
    change?: number;
}

export interface Rule34Post {
    id: number;
    hash: string | undefined;
    width: number;
    height: number;
    score: number;
    rating: string;
    owner: string;
    tags: string;
    tagList: string[];
    tagCount: number;
    fileUrl: string;
    sampleUrl: string;
    previewUrl: string | undefined;
    hasVideo: boolean;
    hasSound: boolean;
    isAnimated: boolean;
    isAiGenerated: boolean;
    isHighQuality: boolean;
    isHighRes: boolean;
    source: string;
    parentId: number | undefined;
    hasChildren: boolean | undefined;
    createdAt: string | undefined;
    change: number | undefined;
    contentType: 'video' | 'gif' | 'comic' | 'animated' | 'image';
    fileExtension: string;
    pageUrl: string;
}

export interface SearchResult {
    posts: Rule34Post[];
    totalCount: number;
    hasMore: boolean;
    query?: string;
}

export interface AutocompleteSuggestion {
    name: string;
    value: string;
    type: string;
    count: number;
}

export interface RelatedTag {
    tag: string;
    count: number;
}

interface TagInfoResponse {
    id: number;
    name: string;
    count: number;
    type: number;
}

interface CommentResponse {
    id: number;
    post_id: number;
    creator: string;
    body: string;
    created_at: string;
}
// CONSTANTS
const AI_TAGS = [
    'ai_generated', 'ai-generated', 'ai_art', 'ai-art',
    'stable_diffusion', 'novelai', 'midjourney', 'dalle',
    'ai_assisted', 'nai_diffusion', 'machine_learning',
    'artificial_intelligence', 'ai_created', 'ai_(artwork)'
];

const QUALITY_TAGS = {
    high: ['high_resolution', 'highres', 'absurdres', 'incredibly_absurdres', 'masterpiece', 'best_quality'],
    low: ['low_resolution', 'lowres', 'bad_anatomy', 'bad_proportions', 'poorly_drawn']
};

const CONTENT_TYPE_TAGS: Record<string, string[]> = {
    animated: ['animated', 'video', 'webm', 'gif', 'animated_gif', 'mp4', 'sound'],
    comic: ['comic', 'manga', 'doujinshi', 'multi-panel', 'page_number'],
    photo: ['photo_(medium)', 'photorealistic', 'realistic', '3d', 'cosplay']
};

const RATINGS: Record<string, string> = {
    safe: 'safe',
    questionable: 'questionable',
    explicit: 'explicit'
};
// RULE34 SERVICE CLASS
class Rule34Service {
    private readonly baseUrl: string = 'https://api.rule34.xxx/index.php';
    private readonly autocompleteUrl: string = 'https://api.rule34.xxx/autocomplete.php';
    private readonly auth: Rule34Auth;
    private readonly headers: Record<string, string>;
    private translationCache: Map<string, string>;
    private readonly MAX_TRANSLATION_CACHE = 2000;

    constructor() {
        this.auth = {
            userId: process.env.RULE34_USER_ID || '',
            apiKey: process.env.RULE34_API_KEY || ''
        };
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        };
        this.translationCache = new Map();
    }

    /**
     * Search for posts with advanced filtering and circuit breaker
     */
    async search(query: string, options: SearchOptions = {}): Promise<SearchResult> {
        const {
            limit = 50,
            page = 0,
            sort = 'score:desc',
            rating = null,
            excludeAi = false,
            minScore = 0,
            contentType = null,
            excludeTags = [],
            requireTags = [],
            minWidth = 0,
            minHeight = 0,
            highQualityOnly = false,
            excludeLowQuality = false
        } = options;

        return circuitBreakerRegistry.execute('nsfw', async () => {
            const searchTags = this._buildSearchQuery(query, {
                rating,
                excludeAi,
                minScore,
                contentType,
                excludeTags,
                requireTags,
                minWidth,
                minHeight,
                highQualityOnly,
                excludeLowQuality,
                sort
            });

            const url = new URL(this.baseUrl);
            url.searchParams.append('page', 'dapi');
            url.searchParams.append('s', 'post');
            url.searchParams.append('q', 'index');
            url.searchParams.append('limit', Math.min(limit, 100).toString());
            url.searchParams.append('pid', page.toString());
            url.searchParams.append('tags', searchTags);
            url.searchParams.append('json', '1');

            if (this.auth.userId && this.auth.apiKey) {
                url.searchParams.append('user_id', this.auth.userId);
                url.searchParams.append('api_key', this.auth.apiKey);
            }

            logger.info('Rule34', `Searching: "${searchTags}" | Page: ${page} | Limit: ${limit}`);

            try {
                const response = await fetch(url.toString(), { headers: this.headers });

                if (!response.ok) {
                    throw new Error(`Rule34 API error: ${response.status}`);
                }

                const data = await response.json() as Rule34RawPost[] | null;

                if (!data || !Array.isArray(data)) {
                    return { posts: [], totalCount: 0, hasMore: false };
                }

                const posts = this._processResults(data, {
                    excludeAi,
                    minScore,
                    highQualityOnly,
                    excludeLowQuality
                });

                logger.info('Rule34', `Found ${posts.length} posts (pre-filter: ${data.length})`);

                return {
                    posts,
                    totalCount: data.length,
                    hasMore: data.length === limit,
                    query: searchTags
                };
            } catch (error) {
                logger.error('Rule34', `Search error: ${(error as Error).message}`);
                throw error;
            }
        });
    }

    /**
     * Get a single post by ID with circuit breaker
     */
    async getPostById(id: number): Promise<Rule34Post | null> {
        return circuitBreakerRegistry.execute('nsfw', async () => {
            const url = new URL(this.baseUrl);
            url.searchParams.append('page', 'dapi');
            url.searchParams.append('s', 'post');
            url.searchParams.append('q', 'index');
            url.searchParams.append('id', id.toString());
            url.searchParams.append('json', '1');

            if (this.auth.userId && this.auth.apiKey) {
                url.searchParams.append('user_id', this.auth.userId);
                url.searchParams.append('api_key', this.auth.apiKey);
            }

            try {
                const response = await fetch(url.toString(), { headers: this.headers });

                if (!response.ok) {
                    throw new Error(`Rule34 API error: ${response.status}`);
                }

                const data = await response.json() as Rule34RawPost[];

                if (!data || data.length === 0) {
                    return null;
                }

                const firstPost = data[0];
                if (!firstPost) {
                    return null;
                }

                return this._enrichPost(firstPost);
            } catch (error) {
                logger.error('Rule34', `GetById error: ${(error as Error).message}`);
                throw error;
            }
        });
    }

    /**
     * Get random posts with optional filters
     */
    async getRandom(options: RandomOptions = {}): Promise<Rule34Post[]> {
        const {
            tags = '',
            count = 1,
            rating = null,
            excludeAi = false,
            minScore = 0
        } = options;

        const result = await this.search(tags, {
            limit: Math.min(100, count * 10),
            page: Math.floor(Math.random() * 10),
            rating,
            excludeAi,
            minScore,
            sort: 'random'
        });

        if (result.posts.length === 0) {
            return [];
        }

        const shuffled = this._shuffleArray([...result.posts]);
        return shuffled.slice(0, count);
    }

    /**
     * Get trending/popular posts
     */
    async getTrending(options: TrendingOptions = {}): Promise<SearchResult> {
        const { timeframe = 'day', limit = 50, excludeAi = false } = options;

        const minScore = timeframe === 'day' ? 50 : timeframe === 'week' ? 100 : 200;

        // Use a time-bucketed random page offset so trending refreshes periodically
        // Bucket changes every 30 minutes for 'day', every 2 hours for 'week', every 6 hours for 'month'
        const bucketMs = timeframe === 'day' ? 30 * 60 * 1000 : timeframe === 'week' ? 2 * 60 * 60 * 1000 : 6 * 60 * 60 * 1000;
        const timeBucket = Math.floor(Date.now() / bucketMs);
        // Derive a pseudo-random page from the time bucket (0-9 range)
        const pageOffset = timeBucket % 10;

        return this.search('', {
            limit,
            page: pageOffset,
            sort: 'score:desc',
            minScore,
            excludeAi
        });
    }

    /**
     * Get autocomplete suggestions with circuit breaker
     */
    async getAutocompleteSuggestions(query: string): Promise<AutocompleteSuggestion[]> {
        if (!query || query.length < 2) return [];

        return circuitBreakerRegistry.execute('nsfw', async () => {
            const url = `${this.autocompleteUrl}?q=${encodeURIComponent(query)}`;

            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 3000);

                const response = await fetch(url, {
                    headers: this.headers,
                    signal: controller.signal
                });

                clearTimeout(timeout);

                if (!response.ok) {
                    return [];
                }

                interface AutocompleteItem {
                    label?: string;
                    value?: string;
                    type?: string;
                    count?: number;
                }

                const data = await response.json() as AutocompleteItem[];

                return data.slice(0, 25).map(item => ({
                    name: item.label || item.value || '',
                    value: item.value || item.label || '',
                    type: item.type || 'tag',
                    count: item.count || 0
                }));
            } catch (error) {
                logger.error('Rule34', `Autocomplete error: ${(error as Error).message}`);
                return [];
            }
        });
    }

    /**
     * Get tag information
     */
    async getTagInfo(tagName: string): Promise<TagInfoResponse | null> {
        return circuitBreakerRegistry.execute('nsfw', async () => {
            const url = new URL(this.baseUrl);
            url.searchParams.append('page', 'dapi');
            url.searchParams.append('s', 'tag');
            url.searchParams.append('q', 'index');
            url.searchParams.append('name', tagName);
            url.searchParams.append('json', '1');

            try {
                const response = await fetch(url.toString(), { headers: this.headers });

                if (!response.ok) return null;

                const data = await response.json() as TagInfoResponse[];
                return data[0] || null;
            } catch {
                return null;
            }
        });
    }

    /**
     * Get comments for a post
     */
    async getComments(postId: number): Promise<CommentResponse[]> {
        return circuitBreakerRegistry.execute('nsfw', async () => {
            const url = new URL(this.baseUrl);
            url.searchParams.append('page', 'dapi');
            url.searchParams.append('s', 'comment');
            url.searchParams.append('q', 'index');
            url.searchParams.append('post_id', postId.toString());
            url.searchParams.append('json', '1');

            try {
                const response = await fetch(url.toString(), { headers: this.headers });

                if (!response.ok) return [];

                const data = await response.json() as CommentResponse[];
                return Array.isArray(data) ? data : [];
            } catch {
                return [];
            }
        });
    }

    /**
     * Get related tags
     */
    async getRelatedTags(tag: string, limit: number = 20): Promise<RelatedTag[]> {
        const result = await this.search(tag, { limit: 50 });

        if (result.posts.length === 0) return [];

        const tagCounts = new Map<string, number>();
        const searchTag = tag.toLowerCase();

        for (const post of result.posts) {
            const tags = post.tags.split(' ');
            for (const t of tags) {
                if (t.toLowerCase() !== searchTag && t.length > 2) {
                    tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
                }
            }
        }

        return [...tagCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([tag, count]) => ({ tag, count }));
    }

    /**
     * Translate tag to booru format
     */
    async translateTag(tag: string): Promise<string> {
        if (this.translationCache.has(tag)) {
            return this.translationCache.get(tag)!;
        }

        const commonTranslations: Record<string, string> = {
            'blonde hair': 'blonde_hair',
            'blue eyes': 'blue_eyes',
            'big breasts': 'large_breasts',
            'small breasts': 'small_breasts',
            'long hair': 'long_hair',
            'short hair': 'short_hair',
            'cat ears': 'cat_ears',
            'animal ears': 'animal_ears',
        };

        const lowerTag = tag.toLowerCase();

        if (commonTranslations[lowerTag]) {
            this.translationCache.set(tag, commonTranslations[lowerTag]);
            this._evictTranslationCache();
            return commonTranslations[lowerTag];
        }

        const formatted = tag.trim().replace(/\s+/g, '_').toLowerCase();
        this.translationCache.set(tag, formatted);
        this._evictTranslationCache();
        return formatted;
    }

    /**
     * Evict oldest entries from translationCache when it exceeds cap
     */
    private _evictTranslationCache(): void {
        if (this.translationCache.size <= this.MAX_TRANSLATION_CACHE) return;
        const excess = this.translationCache.size - this.MAX_TRANSLATION_CACHE;
        const iter = this.translationCache.keys();
        for (let i = 0; i < excess; i++) {
            const { value, done } = iter.next();
            if (done) break;
            this.translationCache.delete(value);
        }
    }
    private _buildSearchQuery(query: string, options: BuildQueryOptions): string {
        const {
            rating,
            excludeAi,
            minScore,
            contentType,
            excludeTags = [],
            requireTags = [],
            minWidth,
            minHeight,
            highQualityOnly,
            excludeLowQuality,
            sort
        } = options;

        const tags: string[] = [];

        if (query && query.trim()) {
            const queryTags = query.split(/[\s,]+/).filter(t => t.length > 0);
            tags.push(...queryTags);
        }

        if (rating && RATINGS[rating]) {
            tags.push(`rating:${RATINGS[rating]}`);
        }

        if (excludeAi) {
            for (const aiTag of AI_TAGS) {
                tags.push(`-${aiTag}`);
            }
        }

        if (minScore && minScore > 0) {
            tags.push(`score:>=${minScore}`);
        }

        if (minWidth && minWidth > 0) {
            tags.push(`width:>=${minWidth}`);
        }
        if (minHeight && minHeight > 0) {
            tags.push(`height:>=${minHeight}`);
        }

        if (contentType) {
            const typeTags = CONTENT_TYPE_TAGS[contentType];
            if (typeTags && typeTags.length > 0) {
                tags.push(`( ${typeTags.join(' ~ ')} )`);
            }
        }

        if (highQualityOnly) {
            const qualityTags = QUALITY_TAGS.high;
            tags.push(`( ${qualityTags.join(' ~ ')} )`);
        }
        if (excludeLowQuality) {
            for (const lowTag of QUALITY_TAGS.low) {
                tags.push(`-${lowTag}`);
            }
        }

        for (const excludeTag of excludeTags) {
            if (excludeTag && excludeTag.trim()) {
                tags.push(`-${excludeTag.trim()}`);
            }
        }

        for (const requireTag of requireTags) {
            if (requireTag && requireTag.trim()) {
                tags.push(requireTag.trim());
            }
        }

        if (sort && sort !== 'default') {
            tags.push(`sort:${sort}`);
        }

        return tags.join(' ');
    }

    private _processResults(posts: Rule34RawPost[], options: FilterOptions): Rule34Post[] {
        const { excludeAi, minScore, highQualityOnly, excludeLowQuality } = options;

        return posts
            .map(post => this._enrichPost(post))
            .filter(post => {
                if (minScore && minScore > 0 && (post.score || 0) < minScore) {
                    return false;
                }

                if (excludeAi && this._isAiGenerated(post)) {
                    return false;
                }

                if (highQualityOnly && !this._isHighQuality(post)) {
                    return false;
                }

                if (excludeLowQuality && this._isLowQuality(post)) {
                    return false;
                }

                return true;
            });
    }

    private _enrichPost(post: Rule34RawPost): Rule34Post {
        const tags = (post.tags || '').split(' ');

        return {
            id: post.id,
            hash: post.hash || post.md5,
            width: post.width,
            height: post.height,
            score: post.score || 0,
            rating: post.rating,
            owner: post.owner,
            tags: post.tags,
            tagList: tags,
            tagCount: tags.length,

            fileUrl: post.file_url,
            sampleUrl: post.sample_url || post.file_url,
            previewUrl: post.preview_url,

            hasVideo: this._isVideo(post),
            hasSound: tags.some(t => t === 'sound' || t === 'has_audio'),
            isAnimated: this._isAnimated(post),
            isAiGenerated: this._isAiGenerated(post),

            isHighQuality: this._isHighQuality(post),
            isHighRes: post.width >= 1920 || post.height >= 1080,

            source: post.source || '',
            parentId: post.parent_id,
            hasChildren: post.has_children,
            createdAt: post.created_at,
            change: post.change,

            contentType: this._detectContentType(post),
            fileExtension: this._getFileExtension(post.file_url),

            pageUrl: `https://rule34.xxx/index.php?page=post&s=view&id=${post.id}`
        };
    }

    private _isAiGenerated(post: Rule34RawPost | Rule34Post): boolean {
        const tags = ('tagList' in post ? post.tagList.join(' ') : post.tags || '').toLowerCase();
        return AI_TAGS.some(aiTag => tags.includes(aiTag));
    }

    private _isHighQuality(post: Rule34RawPost | Rule34Post): boolean {
        const tags = ('tagList' in post ? post.tagList.join(' ') : post.tags || '').toLowerCase();
        return QUALITY_TAGS.high.some(tag => tags.includes(tag));
    }

    private _isLowQuality(post: Rule34RawPost | Rule34Post): boolean {
        const tags = ('tagList' in post ? post.tagList.join(' ') : post.tags || '').toLowerCase();
        return QUALITY_TAGS.low.some(tag => tags.includes(tag));
    }

    private _isVideo(post: Rule34RawPost): boolean {
        const url = post.file_url || '';
        return url.endsWith('.mp4') || url.endsWith('.webm');
    }

    private _isAnimated(post: Rule34RawPost): boolean {
        const url = post.file_url || '';
        const tags = (post.tags || '').toLowerCase();
        return url.endsWith('.gif') ||
            url.endsWith('.mp4') ||
            url.endsWith('.webm') ||
            tags.includes('animated');
    }

    private _detectContentType(post: Rule34RawPost): 'video' | 'gif' | 'comic' | 'animated' | 'image' {
        if (this._isVideo(post)) return 'video';

        const url = post.file_url || '';
        if (url.endsWith('.gif')) return 'gif';

        const tags = (post.tags || '').toLowerCase();
        if (tags.includes('comic') || tags.includes('manga')) return 'comic';
        if (tags.includes('animated')) return 'animated';

        return 'image';
    }

    private _getFileExtension(url: string): string {
        if (!url) return 'unknown';
        const match = url.match(/\.(\w+)(?:\?|$)/);
        return match && match[1] ? match[1].toLowerCase() : 'unknown';
    }

    private _shuffleArray<T>(array: T[]): T[] {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const temp = array[i]!;
            array[i] = array[j]!;
            array[j] = temp;
        }
        return array;
    }

    /**
     * Format tags for display
     */
    formatTagsForDisplay(tags: string | string[], maxLength: number = 500): string {
        if (typeof tags === 'string') {
            tags = tags.split(' ');
        }

        const categories = {
            character: [] as string[],
            copyright: [] as string[],
            artist: [] as string[],
            general: [] as string[],
            meta: [] as string[]
        };

        for (const tag of tags) {
            if (tag.includes('(') && tag.includes(')')) {
                categories.character.push(tag);
            } else if (tag.startsWith('artist:') || tag.endsWith('_(artist)')) {
                categories.artist.push(tag);
            } else if (['tagme', 'meta', 'source_request'].includes(tag)) {
                categories.meta.push(tag);
            } else {
                categories.general.push(tag);
            }
        }

        let result = '';

        if (categories.character.length > 0) {
            result += `**Characters:** ${categories.character.slice(0, 5).join(', ')}\n`;
        }
        if (categories.artist.length > 0) {
            result += `**Artist:** ${categories.artist.slice(0, 3).join(', ')}\n`;
        }
        if (categories.general.length > 0) {
            const generalStr = categories.general.slice(0, 15).join(', ');
            result += `**Tags:** ${generalStr}`;
            if (categories.general.length > 15) {
                result += ` (+${categories.general.length - 15} more)`;
            }
        }

        return result.length > maxLength ? result.slice(0, maxLength - 3) + '...' : result;
    }

    /**
     * Get blacklist suggestions
     */
    getBlacklistSuggestions(): string[] {
        return [
            'gore', 'guro', 'death', 'blood', 'violence',
            'scat', 'vore', 'inflation', 'feet', 'furry',
            ...AI_TAGS,
            ...QUALITY_TAGS.low
        ];
    }
}

// Export singleton instance
const rule34Service = new Rule34Service();

export { rule34Service, Rule34Service };
export default rule34Service;
