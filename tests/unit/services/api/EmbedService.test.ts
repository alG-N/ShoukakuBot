/**
 * EmbedService Unit Tests
 * Tests for social media URL → embed-fix URL conversion
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

import embedService from '../../../../src/services/api/embedService';

describe('EmbedService', () => {
    describe('convert', () => {
        // ── Twitter / X ──

        it('should convert twitter.com URLs to fxtwitter.com', () => {
            const result = embedService.convert('https://twitter.com/user/status/123456789');
            expect(result.success).toBe(true);
            expect(result.fixedUrl).toBe('https://fxtwitter.com/user/status/123456789');
            expect(result.platform!.id).toBe('twitter');
        });

        it('should convert x.com URLs to fixupx.com', () => {
            const result = embedService.convert('https://x.com/user/status/123456789');
            expect(result.success).toBe(true);
            expect(result.fixedUrl).toBe('https://fixupx.com/user/status/123456789');
            expect(result.platform!.id).toBe('twitter');
        });

        it('should handle twitter.com with www prefix', () => {
            const result = embedService.convert('https://www.twitter.com/user/status/999');
            expect(result.success).toBe(true);
            expect(result.fixedUrl).toBe('https://www.fxtwitter.com/user/status/999');
        });

        // ── TikTok ──

        it('should convert tiktok.com URLs to vxtiktok.com', () => {
            const result = embedService.convert('https://www.tiktok.com/@user/video/123456');
            expect(result.success).toBe(true);
            expect(result.fixedUrl).toBe('https://www.vxtiktok.com/@user/video/123456');
            expect(result.platform!.id).toBe('tiktok');
        });

        it('should convert vm.tiktok.com short links', () => {
            const result = embedService.convert('https://vm.tiktok.com/ZMabcdef/');
            expect(result.success).toBe(true);
            expect(result.fixedUrl).toBe('https://vm.vxtiktok.com/ZMabcdef/');
            expect(result.platform!.id).toBe('tiktok');
        });

        // ── Instagram ──

        it('should convert instagram.com/p/ URLs to ddinstagram.com', () => {
            const result = embedService.convert('https://www.instagram.com/p/ABC123/');
            expect(result.success).toBe(true);
            expect(result.fixedUrl).toBe('https://www.ddinstagram.com/p/ABC123/');
            expect(result.platform!.id).toBe('instagram');
        });

        it('should convert instagram.com/reel/ URLs', () => {
            const result = embedService.convert('https://instagram.com/reel/XYZ789/');
            expect(result.success).toBe(true);
            expect(result.fixedUrl).toBe('https://ddinstagram.com/reel/XYZ789/');
        });

        it('should convert instagr.am short links', () => {
            const result = embedService.convert('https://instagr.am/p/ABC123/');
            expect(result.success).toBe(true);
            expect(result.fixedUrl).toBe('https://ddinstagram.com/p/ABC123/');
        });

        // ── Reddit ──

        it('should convert reddit.com URLs to rxddit.com', () => {
            const result = embedService.convert('https://www.reddit.com/r/test/comments/abc123/title/');
            expect(result.success).toBe(true);
            expect(result.fixedUrl).toBe('https://www.rxddit.com/r/test/comments/abc123/title/');
            expect(result.platform!.id).toBe('reddit');
        });

        it('should convert old.reddit.com URLs', () => {
            const result = embedService.convert('https://old.reddit.com/r/test/comments/abc123/title/');
            expect(result.success).toBe(true);
            expect(result.fixedUrl).toContain('rxddit.com');
        });

        it('should convert redd.it short links', () => {
            const result = embedService.convert('https://redd.it/abc123');
            expect(result.success).toBe(true);
            expect(result.fixedUrl).toBe('https://rxddit.com/abc123');
        });

        // ── Bluesky ──

        it('should convert bsky.app URLs to fxbsky.app', () => {
            const result = embedService.convert('https://bsky.app/profile/user.bsky.social/post/abc123');
            expect(result.success).toBe(true);
            expect(result.fixedUrl).toBe('https://fxbsky.app/profile/user.bsky.social/post/abc123');
            expect(result.platform!.id).toBe('bluesky');
        });

        // ── Threads ──

        it('should convert threads.net URLs to fixthreads.net', () => {
            const result = embedService.convert('https://www.threads.net/@user/post/abc123');
            expect(result.success).toBe(true);
            expect(result.fixedUrl).toBe('https://www.fixthreads.net/@user/post/abc123');
            expect(result.platform!.id).toBe('threads');
        });

        // ── Error cases ──

        it('should return error for unsupported URLs', () => {
            const result = embedService.convert('https://youtube.com/watch?v=abc123');
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });

        it('should return error for non-social-media URLs', () => {
            const result = embedService.convert('https://google.com');
            expect(result.success).toBe(false);
        });

        it('should return error for plain text', () => {
            const result = embedService.convert('not a url');
            expect(result.success).toBe(false);
        });

        it('should preserve query params and fragments', () => {
            const result = embedService.convert('https://twitter.com/user/status/123?s=20&t=abc');
            expect(result.success).toBe(true);
            expect(result.fixedUrl).toBe('https://fxtwitter.com/user/status/123?s=20&t=abc');
        });

        it('should trim whitespace from URLs', () => {
            const result = embedService.convert('  https://twitter.com/user/status/123  ');
            expect(result.success).toBe(true);
            expect(result.fixedUrl).toBe('https://fxtwitter.com/user/status/123');
        });
    });

    describe('convertAll', () => {
        it('should convert all supported URLs in a text', () => {
            const text = 'Check https://twitter.com/user/status/123 and https://tiktok.com/@u/video/456';
            const results = embedService.convertAll(text);
            expect(results).toHaveLength(2);
            expect(results[0].platform!.id).toBe('twitter');
            expect(results[1].platform!.id).toBe('tiktok');
        });

        it('should skip unsupported URLs', () => {
            const text = 'https://google.com and https://twitter.com/user/status/123';
            const results = embedService.convertAll(text);
            expect(results).toHaveLength(1);
            expect(results[0].platform!.id).toBe('twitter');
        });

        it('should de-duplicate URLs', () => {
            const text = 'https://twitter.com/user/status/123 https://twitter.com/user/status/123';
            const results = embedService.convertAll(text);
            expect(results).toHaveLength(1);
        });

        it('should return empty array for text without URLs', () => {
            const results = embedService.convertAll('just some text');
            expect(results).toHaveLength(0);
        });

        it('should strip trailing punctuation from URLs', () => {
            const text = 'Look at this: https://twitter.com/user/status/123.';
            const results = embedService.convertAll(text);
            expect(results).toHaveLength(1);
            expect(results[0].fixedUrl).toBe('https://fxtwitter.com/user/status/123');
        });
    });

    describe('isSupported', () => {
        it('should return true for supported platforms', () => {
            expect(embedService.isSupported('https://twitter.com/user/status/123')).toBe(true);
            expect(embedService.isSupported('https://tiktok.com/@u/video/1')).toBe(true);
            expect(embedService.isSupported('https://instagram.com/p/abc/')).toBe(true);
        });

        it('should return false for unsupported platforms', () => {
            expect(embedService.isSupported('https://youtube.com/watch?v=abc')).toBe(false);
            expect(embedService.isSupported('https://facebook.com/post/123')).toBe(false);
        });
    });

    describe('getSupportedPlatforms', () => {
        it('should return all 6 platforms', () => {
            const platforms = embedService.getSupportedPlatforms();
            expect(platforms).toHaveLength(6);
        });

        it('should include required fields for each platform', () => {
            const platforms = embedService.getSupportedPlatforms();
            for (const p of platforms) {
                expect(p).toHaveProperty('id');
                expect(p).toHaveProperty('name');
                expect(p).toHaveProperty('emoji');
                expect(p).toHaveProperty('service');
                expect(p).toHaveProperty('reliable');
            }
        });

        it('should include twitter, tiktok, instagram, reddit, bluesky, threads', () => {
            const ids = embedService.getSupportedPlatforms().map(p => p.id);
            expect(ids).toEqual(expect.arrayContaining([
                'twitter', 'tiktok', 'instagram', 'reddit', 'bluesky', 'threads',
            ]));
        });
    });

    describe('getStats', () => {
        it('should track conversion stats', () => {
            const before = embedService.getStats();
            const prevTotal = before.totalConverted;

            embedService.convert('https://twitter.com/user/status/999');

            const after = embedService.getStats();
            expect(after.totalConverted).toBe(prevTotal + 1);
            expect(after.perPlatform['twitter']).toBeGreaterThanOrEqual(1);
        });
    });
});
