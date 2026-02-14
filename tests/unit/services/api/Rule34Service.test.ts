/**
 * Rule34Service Unit Tests
 * Tests for search, filtering, enrichment, pure helpers, tag translation
 */

// Mock Logger
jest.mock('../../../../src/core/Logger', () => ({
    __esModule: true,
    default: {
        error: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        success: jest.fn(),
    },
}));

// Mock CircuitBreakerRegistry
jest.mock('../../../../src/core/CircuitBreakerRegistry', () => ({
    __esModule: true,
    circuitBreakerRegistry: {
        execute: jest.fn().mockImplementation((_name: string, fn: () => Promise<any>) => fn()),
    },
}));

// Mock dotenv
jest.mock('dotenv', () => ({
    config: jest.fn(),
}));

// Mock path
jest.mock('path', () => ({
    join: jest.fn((...args: string[]) => args.join('/')),
}));

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Set env vars before import
process.env.RULE34_USER_ID = 'test-user';
process.env.RULE34_API_KEY = 'test-key';

import rule34Service from '../../../../src/services/api/rule34Service';

// Helper: make a raw Rule34 post
function makeRawPost(overrides: Record<string, any> = {}): any {
    return {
        id: 1000,
        hash: 'abc123',
        width: 1920,
        height: 1080,
        score: 50,
        rating: 'explicit',
        owner: 'user1',
        tags: 'tag1 tag2 tag3',
        file_url: 'https://rule34.xxx/images/1000.jpg',
        sample_url: 'https://rule34.xxx/samples/1000.jpg',
        preview_url: 'https://rule34.xxx/thumbnails/1000.jpg',
        source: 'https://example.com',
        parent_id: undefined,
        has_children: false,
        created_at: '2024-01-01T00:00:00Z',
        change: 12345,
        ...overrides,
    };
}

describe('Rule34Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockFetch.mockReset();
    });

    // --- search ---
    describe('search', () => {
        it('should search and return enriched posts', async () => {
            const rawPosts = [makeRawPost(), makeRawPost({ id: 1001 })];
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => rawPosts,
            });

            const result = await rule34Service.search('test');

            expect(result.posts).toHaveLength(2);
            expect(result.posts[0].id).toBe(1000);
            expect(result.posts[0].tagList).toEqual(['tag1', 'tag2', 'tag3']);
            expect(result.posts[0].pageUrl).toContain('id=1000');
        });

        it('should return empty result when API returns null', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => null,
            });

            const result = await rule34Service.search('empty');

            expect(result.posts).toEqual([]);
            expect(result.totalCount).toBe(0);
        });

        it('should throw on API error', async () => {
            mockFetch.mockResolvedValue({ ok: false, status: 500 });

            await expect(rule34Service.search('error')).rejects.toThrow('Rule34 API error');
        });

        it('should filter AI posts when excludeAi is true', async () => {
            const posts = [
                makeRawPost({ id: 1, tags: 'normal_tag beautiful' }),
                makeRawPost({ id: 2, tags: 'ai_generated stable_diffusion' }),
            ];
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => posts,
            });

            const result = await rule34Service.search('test', { excludeAi: true });

            expect(result.posts.every(p => !p.isAiGenerated)).toBe(true);
        });

        it('should filter by minScore', async () => {
            const posts = [
                makeRawPost({ id: 1, score: 100 }),
                makeRawPost({ id: 2, score: 10 }),
            ];
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => posts,
            });

            const result = await rule34Service.search('test', { minScore: 50 });

            expect(result.posts.every(p => p.score >= 50)).toBe(true);
        });

        it('should filter high quality only', async () => {
            const posts = [
                makeRawPost({ id: 1, tags: 'highres masterpiece' }),
                makeRawPost({ id: 2, tags: 'normal_tag' }),
            ];
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => posts,
            });

            const result = await rule34Service.search('test', { highQualityOnly: true });

            expect(result.posts.every(p => p.isHighQuality)).toBe(true);
        });

        it('should exclude low quality', async () => {
            const posts = [
                makeRawPost({ id: 1, tags: 'good_art' }),
                makeRawPost({ id: 2, tags: 'bad_anatomy low_resolution' }),
            ];
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => posts,
            });

            const result = await rule34Service.search('test', { excludeLowQuality: true });

            expect(result.posts.every(p => !p.tags.includes('bad_anatomy'))).toBe(true);
        });

        it('should add rating filter to search tags', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => [],
            });

            await rule34Service.search('test', { rating: 'safe' });

            const calledUrl = mockFetch.mock.calls[0][0];
            expect(calledUrl).toContain('rating%3Asafe');
        });

        it('should include auth params when configured', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => [],
            });

            await rule34Service.search('test');

            const calledUrl = mockFetch.mock.calls[0][0];
            expect(calledUrl).toContain('user_id=test-user');
            expect(calledUrl).toContain('api_key=test-key');
        });

        it('should set hasMore when result count equals limit', async () => {
            const posts = Array.from({ length: 50 }, (_, i) => makeRawPost({ id: i }));
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => posts,
            });

            const result = await rule34Service.search('test', { limit: 50 });
            expect(result.hasMore).toBe(true);
        });
    });

    // --- getPostById ---
    describe('getPostById', () => {
        it('should fetch post by ID', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => [makeRawPost({ id: 42 })],
            });

            const result = await rule34Service.getPostById(42);

            expect(result).not.toBeNull();
            expect(result!.id).toBe(42);
        });

        it('should return null when post not found', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => [],
            });

            const result = await rule34Service.getPostById(999999);
            expect(result).toBeNull();
        });

        it('should throw on API error', async () => {
            mockFetch.mockResolvedValue({ ok: false, status: 500 });

            await expect(rule34Service.getPostById(1)).rejects.toThrow();
        });
    });

    // --- getRandom ---
    describe('getRandom', () => {
        it('should return shuffled random posts', async () => {
            const posts = Array.from({ length: 10 }, (_, i) => makeRawPost({ id: i }));
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => posts,
            });

            const result = await rule34Service.getRandom({ count: 3 });

            expect(result).toHaveLength(3);
        });

        it('should return empty array when no results', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => [],
            });

            const result = await rule34Service.getRandom({ tags: 'nonexistent' });
            expect(result).toEqual([]);
        });
    });

    // --- getTrending ---
    describe('getTrending', () => {
        it('should fetch trending posts', async () => {
            const posts = Array.from({ length: 5 }, (_, i) => makeRawPost({ id: i, score: 200 }));
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => posts,
            });

            const result = await rule34Service.getTrending();

            expect(result.posts.length).toBeGreaterThan(0);
        });

        it('should use higher minScore for longer timeframes', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => [],
            });

            await rule34Service.getTrending({ timeframe: 'month' });

            // month should have minScore >= 200
            const url = mockFetch.mock.calls[0][0];
            expect(url).toContain('score');
        });
    });

    // --- getAutocompleteSuggestions ---
    describe('getAutocompleteSuggestions', () => {
        it('should return empty array for short queries', async () => {
            const result = await rule34Service.getAutocompleteSuggestions('a');
            expect(result).toEqual([]);
        });

        it('should fetch and transform autocomplete results', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => [
                    { label: 'tag_one', value: 'tag_one', type: 'tag', count: 100 },
                    { label: 'tag_two', value: 'tag_two', type: 'tag', count: 50 },
                ],
            });

            const result = await rule34Service.getAutocompleteSuggestions('tag');

            expect(result).toHaveLength(2);
            expect(result[0].name).toBe('tag_one');
            expect(result[0].count).toBe(100);
        });

        it('should return empty array on error', async () => {
            mockFetch.mockRejectedValue(new Error('Network error'));

            const result = await rule34Service.getAutocompleteSuggestions('test');
            expect(result).toEqual([]);
        });

        it('should limit to 25 suggestions', async () => {
            const manySuggestions = Array.from({ length: 30 }, (_, i) => ({
                label: `tag_${i}`, value: `tag_${i}`, type: 'tag', count: i,
            }));
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => manySuggestions,
            });

            const result = await rule34Service.getAutocompleteSuggestions('tag');
            expect(result).toHaveLength(25);
        });
    });

    // --- getTagInfo ---
    describe('getTagInfo', () => {
        it('should fetch tag info', async () => {
            const tagData = { id: 1, name: 'test', count: 500, type: 0 };
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => [tagData],
            });

            const result = await rule34Service.getTagInfo('test');
            expect(result).toEqual(tagData);
        });

        it('should return null when tag not found', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => [],
            });

            const result = await rule34Service.getTagInfo('nonexistent');
            expect(result).toBeNull();
        });

        it('should return null on API error', async () => {
            mockFetch.mockResolvedValue({ ok: false });

            const result = await rule34Service.getTagInfo('error');
            expect(result).toBeNull();
        });
    });

    // --- getComments ---
    describe('getComments', () => {
        it('should fetch comments for a post', async () => {
            const comments = [
                { id: 1, post_id: 100, creator: 'user1', body: 'Nice', created_at: '2024-01-01' },
            ];
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => comments,
            });

            const result = await rule34Service.getComments(100);
            expect(result).toEqual(comments);
        });

        it('should return empty array on error', async () => {
            mockFetch.mockRejectedValue(new Error('fail'));

            const result = await rule34Service.getComments(100);
            expect(result).toEqual([]);
        });
    });

    // --- getRelatedTags ---
    describe('getRelatedTags', () => {
        it('should extract related tags from search results', async () => {
            const posts = [
                makeRawPost({ tags: 'test related1 related2' }),
                makeRawPost({ tags: 'test related1 related3' }),
            ];
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => posts,
            });

            const result = await rule34Service.getRelatedTags('test');

            // 'related1' should have count 2 (appeared in both posts)
            const r1 = result.find(r => r.tag === 'related1');
            expect(r1?.count).toBe(2);
        });

        it('should exclude the search tag itself', async () => {
            const posts = [makeRawPost({ tags: 'test other_tag' })];
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => posts,
            });

            const result = await rule34Service.getRelatedTags('test');

            expect(result.find(r => r.tag === 'test')).toBeUndefined();
        });

        it('should return empty array when no posts found', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => [],
            });

            const result = await rule34Service.getRelatedTags('nonexistent');
            expect(result).toEqual([]);
        });

        it('should sort by count descending', async () => {
            const posts = [
                makeRawPost({ tags: 'test common_tag rare_tag' }),
                makeRawPost({ tags: 'test common_tag another' }),
                makeRawPost({ tags: 'test common_tag another' }),
            ];
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => posts,
            });

            const result = await rule34Service.getRelatedTags('test');

            for (let i = 0; i < result.length - 1; i++) {
                expect(result[i].count).toBeGreaterThanOrEqual(result[i + 1].count);
            }
        });
    });

    // --- translateTag ---
    describe('translateTag', () => {
        it('should translate common tags', async () => {
            const result = await rule34Service.translateTag('blonde hair');
            expect(result).toBe('blonde_hair');
        });

        it('should translate big breasts to large_breasts', async () => {
            const result = await rule34Service.translateTag('big breasts');
            expect(result).toBe('large_breasts');
        });

        it('should format unknown tags with underscores', async () => {
            const result = await rule34Service.translateTag('blue eyes');
            expect(result).toBe('blue_eyes');
        });

        it('should cache translations', async () => {
            await rule34Service.translateTag('custom tag');
            const result = await rule34Service.translateTag('custom tag');
            expect(result).toBe('custom_tag');
        });

        it('should handle already formatted tags', async () => {
            const result = await rule34Service.translateTag('already_formatted');
            expect(result).toBe('already_formatted');
        });
    });

    // --- formatTagsForDisplay ---
    describe('formatTagsForDisplay', () => {
        it('should format tags with categories', () => {
            const tags = 'artist:someone character_(series) normal_tag another_tag';
            const result = rule34Service.formatTagsForDisplay(tags);

            expect(result).toContain('Characters');
            expect(result).toContain('Tags');
        });

        it('should handle string input', () => {
            const result = rule34Service.formatTagsForDisplay('tag1 tag2');
            expect(result).toContain('Tags');
        });

        it('should handle array input', () => {
            const result = rule34Service.formatTagsForDisplay(['tag1', 'tag2']);
            expect(result).toContain('Tags');
        });

        it('should truncate to maxLength', () => {
            const manyTags = Array.from({ length: 50 }, (_, i) => `tag_number_${i}`).join(' ');
            const result = rule34Service.formatTagsForDisplay(manyTags, 100);

            expect(result.length).toBeLessThanOrEqual(100);
        });

        it('should limit general tags to 15', () => {
            const tags = Array.from({ length: 20 }, (_, i) => `tag_${i}`);
            const result = rule34Service.formatTagsForDisplay(tags, 2000);

            expect(result).toContain('+');
        });

        it('should identify artist tags', () => {
            const tags = ['artist:picasso', 'tag1'];
            const result = rule34Service.formatTagsForDisplay(tags);

            expect(result).toContain('Artist');
            expect(result).toContain('picasso');
        });
    });

    // --- getBlacklistSuggestions ---
    describe('getBlacklistSuggestions', () => {
        it('should return an array of suggestion tags', () => {
            const suggestions = rule34Service.getBlacklistSuggestions();

            expect(Array.isArray(suggestions)).toBe(true);
            expect(suggestions.length).toBeGreaterThan(0);
            expect(suggestions).toContain('gore');
            expect(suggestions).toContain('ai_generated');
        });
    });

    // --- Enrichment helpers (tested via search) ---
    describe('post enrichment', () => {
        it('should detect video posts', async () => {
            const posts = [makeRawPost({ file_url: 'https://rule34.xxx/1000.webm' })];
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => posts,
            });

            const result = await rule34Service.search('test');
            expect(result.posts[0].hasVideo).toBe(true);
            expect(result.posts[0].contentType).toBe('video');
        });

        it('should detect GIF posts', async () => {
            const posts = [makeRawPost({ file_url: 'https://rule34.xxx/1000.gif' })];
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => posts,
            });

            const result = await rule34Service.search('test');
            expect(result.posts[0].contentType).toBe('gif');
        });

        it('should detect animated posts', async () => {
            const posts = [makeRawPost({ tags: 'animated test_tag', file_url: 'https://rule34.xxx/1000.jpg' })];
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => posts,
            });

            const result = await rule34Service.search('test');
            expect(result.posts[0].isAnimated).toBe(true);
        });

        it('should detect comic posts', async () => {
            const posts = [makeRawPost({ tags: 'comic multi-panel', file_url: 'https://rule34.xxx/1000.jpg' })];
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => posts,
            });

            const result = await rule34Service.search('test');
            expect(result.posts[0].contentType).toBe('comic');
        });

        it('should detect high-res posts', async () => {
            const posts = [makeRawPost({ width: 4000, height: 3000 })];
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => posts,
            });

            const result = await rule34Service.search('test');
            expect(result.posts[0].isHighRes).toBe(true);
        });

        it('should detect posts with sound', async () => {
            const posts = [makeRawPost({ tags: 'tag1 sound tag2' })];
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => posts,
            });

            const result = await rule34Service.search('test');
            expect(result.posts[0].hasSound).toBe(true);
        });

        it('should detect AI generated posts', async () => {
            const posts = [makeRawPost({ tags: 'ai_generated stable_diffusion' })];
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => posts,
            });

            const result = await rule34Service.search('test');
            expect(result.posts[0].isAiGenerated).toBe(true);
        });

        it('should extract file extension', async () => {
            const posts = [makeRawPost({ file_url: 'https://rule34.xxx/1000.png' })];
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => posts,
            });

            const result = await rule34Service.search('test');
            expect(result.posts[0].fileExtension).toBe('png');
        });
    });

    // --- Singleton ---
    describe('Singleton', () => {
        it('should export a default singleton instance', () => {
            expect(rule34Service).toBeDefined();
            expect(typeof rule34Service.search).toBe('function');
            expect(typeof rule34Service.formatTagsForDisplay).toBe('function');
        });
    });
});
