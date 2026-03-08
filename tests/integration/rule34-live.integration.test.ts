/**
 * Live Rule34 API integration checks for random pagination flow.
 * Run explicitly with: $env:RUN_LIVE_RULE34_TESTS='1'; npm test -- tests/integration/rule34-live.integration.test.ts
 */

import rule34Service from '../../src/services/api/rule34Service';

const hasAuth = Boolean(process.env.RULE34_USER_ID && process.env.RULE34_API_KEY);
const describeLive = process.env.RUN_LIVE_RULE34_TESTS && hasAuth ? describe : describe.skip;

describeLive('Rule34 Live Random Pagination', () => {
    jest.setTimeout(30000);

    it('keeps random page size stable and can fetch next-page candidates', async () => {
        const tags = '';
        const requestedCount = 25;
        const excludeAi = true;
        const minScore = 1;

        const firstPage = await rule34Service.getRandom({
            tags,
            count: requestedCount,
            excludeAi,
            minScore,
            rating: null
        });

        expect(firstPage.length).toBe(requestedCount);

        let nextCandidates: typeof firstPage = [];
        const seenIds = new Set(firstPage.map(p => p.id));
        const hasTags = tags.trim().length > 0;
        const pageRange = hasTags ? 10 : 30;
        const maxAttempts = 3;

        for (let attempt = 0; attempt < maxAttempts && nextCandidates.length === 0; attempt++) {
            const page = attempt === 0 ? 0 : Math.floor(Math.random() * pageRange);
            const result = await rule34Service.search(tags, {
                limit: Math.min(100, Math.max(requestedCount * 2, 50)),
                page,
                excludeAi,
                minScore,
                sort: 'random'
            } as any);

            const fetched = result?.posts || [];
            const unseen = fetched.filter(post => !seenIds.has(post.id));
            nextCandidates = unseen.length > 0 ? unseen : fetched;
        }

        expect(nextCandidates.length).toBeGreaterThan(0);

        const secondPage = nextCandidates.slice(0, requestedCount);
        expect(secondPage.length).toBe(requestedCount);

        const overlapCount = secondPage.filter(p => seenIds.has(p.id)).length;
        // Live visibility in test output to inspect overlap behavior.
        console.log(`[LIVE RULE34] first=${firstPage.length} second=${secondPage.length} overlap=${overlapCount}`);
    });
});
