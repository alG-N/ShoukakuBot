/**
 * Pixiv Settings — Session Store
 * Redis write-through cache + PostgreSQL fallback for per-user preferences
 */

import cacheService from '../../../cache/CacheService.js';
import pixivRepository from '../../../repositories/api/pixivRepository.js';
import type { PixivUserPreferences } from '../../../types/api/models/content-session.js';

const PIXIV_CACHE_NS = 'api:pixiv';
const PREFS_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

const DEFAULT_PREFERENCES: PixivUserPreferences = {
    contentTypes: ['illust'],
    r18Enabled: false,
    nsfwMode: 'sfw',
    sortMode: 'popular_desc',
    aiFilter: false,
    qualityFilter: false,
    minBookmarks: 0,
    translate: false
};

export async function getUserPreferences(userId: string): Promise<PixivUserPreferences> {
    const prefs = await cacheService.peek<PixivUserPreferences>(PIXIV_CACHE_NS, `pixiv:prefs:${userId}`);
    if (prefs) return prefs;

    const dbSettings = await pixivRepository.getUserSettings(userId);
    if (!dbSettings) return { ...DEFAULT_PREFERENCES };

    const normalized: PixivUserPreferences = {
        contentTypes: dbSettings.content_types.split(',').filter(Boolean),
        r18Enabled: dbSettings.r18_enabled,
        nsfwMode: dbSettings.nsfw_mode,
        sortMode: dbSettings.sort_mode,
        aiFilter: dbSettings.ai_filter,
        qualityFilter: dbSettings.quality_filter,
        minBookmarks: dbSettings.min_bookmarks,
        translate: dbSettings.translate
    };

    await cacheService.set<PixivUserPreferences>(PIXIV_CACHE_NS, `pixiv:prefs:${userId}`, normalized, PREFS_TTL_SECONDS);
    return normalized;
}

export async function setUserPreferences(userId: string, prefs: Partial<PixivUserPreferences>): Promise<PixivUserPreferences> {
    const current = await getUserPreferences(userId);
    const merged: PixivUserPreferences = { ...current, ...prefs };

    // Enforce R18 / NSFW mutual exclusion:
    // When R18 is enabled, nsfw_mode is irrelevant
    if (merged.r18Enabled) {
        merged.nsfwMode = 'sfw';
    }

    await cacheService.set<PixivUserPreferences>(PIXIV_CACHE_NS, `pixiv:prefs:${userId}`, merged, PREFS_TTL_SECONDS);
    await pixivRepository.setUserSettings(userId, {
        content_types: merged.contentTypes.join(','),
        r18_enabled: merged.r18Enabled,
        nsfw_mode: merged.nsfwMode,
        sort_mode: merged.sortMode,
        ai_filter: merged.aiFilter,
        quality_filter: merged.qualityFilter,
        min_bookmarks: merged.minBookmarks,
        translate: merged.translate
    });
    return merged;
}
