/**
 * Filter Service
 * Handles word filtering and content scanning
 * @module services/moderation/FilterService
 */

import FilterRepository from '../../repositories/moderation/FilterRepository.js';
import filterConfig from '../../config/features/moderation/filters.js';
// TYPES
export interface Filter {
    id: number;
    guild_id: string;
    pattern: string;
    match_type: 'exact' | 'word' | 'contains' | 'regex';
    action: string;
    severity: number;
    created_by: string;
    created_at: Date;
}

export interface FilterMatch {
    filter: Filter;
    matched: boolean;
    pattern: string;
    action: string;
    severity: number;
}

import cacheService from '../../cache/CacheService.js';

const CACHE_TTL_SECONDS = 300; // 5 minutes
// CORE FUNCTIONS
/**
 * Get filters for a guild (with caching via Redis)
 */
export async function getFilters(guildId: string): Promise<Filter[]> {
    return cacheService.getOrSet<Filter[]>(
        'guild',
        `filters:${guildId}`,
        async () => FilterRepository.getAll(guildId) as Promise<Filter[]>,
        CACHE_TTL_SECONDS
    );
}

/**
 * Invalidate cache for a guild
 */
export async function invalidateCache(guildId: string): Promise<void> {
    await cacheService.delete('guild', `filters:${guildId}`);
}

/**
 * Normalize text for matching
 */
export function normalizeText(text: string): string {
    let normalized = text.toLowerCase();

    // Strip zalgo
    if (filterConfig.settings?.stripZalgo && filterConfig.zalgoPattern) {
        normalized = normalized.replace(filterConfig.zalgoPattern, '');
    }

    // Normalize unicode
    if (filterConfig.settings?.normalizeUnicode && filterConfig.unicodeMap) {
        for (const [char, replacement] of Object.entries(filterConfig.unicodeMap)) {
            normalized = normalized.replace(new RegExp(char, 'g'), replacement);
        }
    }

    // Convert leetspeak
    if (filterConfig.settings?.checkLeetspeak && filterConfig.leetspeak) {
        for (const [char, replacement] of Object.entries(filterConfig.leetspeak)) {
            const escapedChar = char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            normalized = normalized.replace(new RegExp(escapedChar, 'g'), replacement);
        }
    }

    return normalized;
}

/**
 * Check if text matches a filter pattern
 */
export function matchesFilter(text: string, filter: Filter): boolean {
    const normalizedText = normalizeText(text);
    const pattern = filter.pattern.toLowerCase();

    switch (filter.match_type) {
        case 'exact':
            return normalizedText === pattern;

        case 'word': {
            const regex = new RegExp(`\\b${escapeRegex(pattern)}\\b`, 'i');
            return regex.test(normalizedText);
        }

        case 'contains':
            return normalizedText.includes(pattern);

        case 'regex': {
            try {
                const regex = new RegExp(filter.pattern, 'i');
                return regex.test(text);
            } catch {
                return false;
            }
        }

        default:
            return normalizedText.includes(pattern);
    }
}

/**
 * Escape regex special characters
 */
function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Check message content against filters
 */
export async function checkMessage(guildId: string, content: string): Promise<FilterMatch | null> {
    if (!content || content.length < (filterConfig.settings?.minWordLength || 2)) {
        return null;
    }

    // Check exempt patterns
    let processedContent = content;
    if (filterConfig.exemptPatterns) {
        for (const pattern of filterConfig.exemptPatterns) {
            processedContent = processedContent.replace(pattern, '');
        }
    }

    if (!processedContent.trim()) return null;

    const filters = await getFilters(guildId);

    for (const filter of filters) {
        if (matchesFilter(processedContent, filter)) {
            return {
                filter,
                matched: true,
                pattern: filter.pattern,
                action: filter.action,
                severity: filter.severity
            };
        }
    }

    return null;
}

/**
 * Add a filter
 */
export async function addFilter(data: Partial<Filter> & { guildId: string }): Promise<Filter> {
    const filter = await FilterRepository.add(data as any) as Filter;
    await invalidateCache(data.guildId);
    return filter;
}

/**
 * Add multiple filters
 */
export async function addFilters(
    guildId: string,
    filters: Partial<Filter>[],
    createdBy: string
): Promise<number> {
    const count = await FilterRepository.addBulk(guildId, filters as any, createdBy);
    await invalidateCache(guildId);
    return count;
}

/**
 * Remove a filter
 */
export async function removeFilter(guildId: string, pattern: string): Promise<boolean> {
    const result = await FilterRepository.removeByPattern(guildId, pattern);
    await invalidateCache(guildId);
    return result;
}

/**
 * Remove filter by ID
 */
export async function removeFilterById(id: number, guildId?: string): Promise<boolean> {
    const result = await FilterRepository.remove(id);
    if (guildId) await invalidateCache(guildId);
    return result;
}

/**
 * Get all filters for a guild
 */
export async function listFilters(guildId: string): Promise<Filter[]> {
    return FilterRepository.getAll(guildId) as Promise<Filter[]>;
}

/**
 * Clear all filters for a guild
 */
export async function clearFilters(guildId: string): Promise<number> {
    const count = await FilterRepository.removeAll(guildId);
    await invalidateCache(guildId);
    return count;
}

/**
 * Import a preset filter list
 */
export async function importPreset(
    guildId: string,
    presetName: string,
    createdBy: string
): Promise<number> {
    const preset = filterConfig.presets?.[presetName];
    if (!preset) {
        throw new Error(`Preset "${presetName}" not found`);
    }

    return addFilters(guildId, preset.words, createdBy);
}

/**
 * Get filter count for a guild
 */
export async function getFilterCount(guildId: string): Promise<number> {
    return FilterRepository.count(guildId);
}

/**
 * Search filters
 */
export async function searchFilters(guildId: string, searchTerm: string): Promise<Filter[]> {
    return FilterRepository.search(guildId, searchTerm) as Promise<Filter[]>;
}
// EXPORTS
export default {
    getFilters,
    invalidateCache,
    normalizeText,
    matchesFilter,
    checkMessage,
    addFilter,
    addFilters,
    removeFilter,
    removeFilterById,
    listFilters,
    clearFilters,
    importPreset,
    getFilterCount,
    searchFilters
};
