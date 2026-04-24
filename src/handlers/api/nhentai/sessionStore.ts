import cacheService from '../../../cache/CacheService.js';
import type { Gallery, PageSession, SearchSession, UserPreferences } from '../../../types/api/handlers/nhentai-handler.js';
import nhentaiRepository from '../../../repositories/api/nhentaiRepository.js';

export const NHENTAI_CACHE_NS = 'api:nhentai';
const PREFS_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

const DEFAULT_PREFERENCES: UserPreferences = {
    popularPeriod: 'all',
    randomPeriod: 'all'
};

function buildSessionKey(type: 'page' | 'search', userId: string, sessionId: string = 'latest'): string {
    return `nhentai:${type}:${userId}:${sessionId}`;
}

export async function setPageSession(userId: string, gallery: Gallery, currentPage: number, sessionTtl: number, sessionId: string = 'latest'): Promise<void> {
    await cacheService.set<PageSession>(NHENTAI_CACHE_NS, buildSessionKey('page', userId, sessionId), {
        galleryId: gallery.id,
        gallery,
        currentPage,
        totalPages: gallery.num_pages,
        expiresAt: Date.now() + sessionTtl * 1000
    }, sessionTtl);
}

export function getPageSession(userId: string, sessionId: string = 'latest'): Promise<PageSession | null> {
    return cacheService.peek<PageSession>(NHENTAI_CACHE_NS, buildSessionKey('page', userId, sessionId));
}

export async function updatePageSession(userId: string, currentPage: number, sessionTtl: number, sessionId: string = 'latest'): Promise<void> {
    const session = await getPageSession(userId, sessionId);
    if (!session) return;
    session.currentPage = currentPage;
    session.expiresAt = Date.now() + sessionTtl * 1000;
    await cacheService.set<PageSession>(NHENTAI_CACHE_NS, buildSessionKey('page', userId, sessionId), session, sessionTtl);
}

export function clearPageSession(userId: string, sessionId: string = 'latest'): Promise<void> {
    return cacheService.delete(NHENTAI_CACHE_NS, buildSessionKey('page', userId, sessionId));
}

export async function setSearchSession(userId: string, data: Partial<SearchSession>, sessionTtl: number, sessionId: string = 'latest'): Promise<void> {
    await cacheService.set<SearchSession>(NHENTAI_CACHE_NS, buildSessionKey('search', userId, sessionId), {
        ...data,
        expiresAt: Date.now() + sessionTtl * 1000
    } as SearchSession, sessionTtl);
}

export function getSearchSession(userId: string, sessionId: string = 'latest'): Promise<SearchSession | null> {
    return cacheService.peek<SearchSession>(NHENTAI_CACHE_NS, buildSessionKey('search', userId, sessionId));
}

export async function getUserPreferences(userId: string): Promise<UserPreferences> {
    const prefs = await cacheService.peek<UserPreferences>(NHENTAI_CACHE_NS, `nhentai:prefs:${userId}`);
    if (prefs) {
        return {
            popularPeriod: prefs.popularPeriod || DEFAULT_PREFERENCES.popularPeriod,
            randomPeriod: prefs.randomPeriod || DEFAULT_PREFERENCES.randomPeriod
        };
    }

    const dbPrefs = await nhentaiRepository.getUserSettings(userId);
    if (!dbPrefs) return { ...DEFAULT_PREFERENCES };

    const normalized: UserPreferences = {
        popularPeriod: dbPrefs.popular_period || DEFAULT_PREFERENCES.popularPeriod,
        randomPeriod: dbPrefs.random_period || DEFAULT_PREFERENCES.randomPeriod
    };

    await cacheService.set<UserPreferences>(NHENTAI_CACHE_NS, `nhentai:prefs:${userId}`, normalized, PREFS_TTL_SECONDS);
    return normalized;
}

export async function setUserPreferences(userId: string, prefs: Partial<UserPreferences>): Promise<UserPreferences> {
    const current = await getUserPreferences(userId);
    const merged: UserPreferences = {
        ...current,
        ...prefs
    };

    await cacheService.set<UserPreferences>(NHENTAI_CACHE_NS, `nhentai:prefs:${userId}`, merged, PREFS_TTL_SECONDS);
    await nhentaiRepository.setUserSettings(userId, {
        popular_period: merged.popularPeriod,
        random_period: merged.randomPeriod
    });
    return merged;
}
