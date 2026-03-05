import cacheService from '../../../cache/CacheService.js';
import type { Gallery, PageSession, SearchSession } from '../../../types/api/handlers/nhentai-handler.js';

export const NHENTAI_CACHE_NS = 'api:nhentai';

export async function setPageSession(userId: string, gallery: Gallery, currentPage: number, sessionTtl: number): Promise<void> {
    await cacheService.set<PageSession>(NHENTAI_CACHE_NS, `nhentai:page:${userId}`, {
        galleryId: gallery.id,
        gallery,
        currentPage,
        totalPages: gallery.num_pages,
        expiresAt: Date.now() + sessionTtl * 1000
    }, sessionTtl);
}

export function getPageSession(userId: string): Promise<PageSession | null> {
    return cacheService.peek<PageSession>(NHENTAI_CACHE_NS, `nhentai:page:${userId}`);
}

export async function updatePageSession(userId: string, currentPage: number, sessionTtl: number): Promise<void> {
    const session = await getPageSession(userId);
    if (!session) return;
    session.currentPage = currentPage;
    session.expiresAt = Date.now() + sessionTtl * 1000;
    await cacheService.set<PageSession>(NHENTAI_CACHE_NS, `nhentai:page:${userId}`, session, sessionTtl);
}

export function clearPageSession(userId: string): Promise<void> {
    return cacheService.delete(NHENTAI_CACHE_NS, `nhentai:page:${userId}`);
}

export async function setSearchSession(userId: string, data: Partial<SearchSession>, sessionTtl: number): Promise<void> {
    await cacheService.set<SearchSession>(NHENTAI_CACHE_NS, `nhentai:search:${userId}`, {
        ...data,
        expiresAt: Date.now() + sessionTtl * 1000
    } as SearchSession, sessionTtl);
}

export function getSearchSession(userId: string): Promise<SearchSession | null> {
    return cacheService.peek<SearchSession>(NHENTAI_CACHE_NS, `nhentai:search:${userId}`);
}
