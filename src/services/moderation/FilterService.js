/**
 * Filter Service
 * Handles word filtering and content scanning
 * @module services/moderation/FilterService
 */

const FilterRepository = require('../../repositories/moderation/FilterRepository');
const filterConfig = require('../../config/features/moderation/filters');
const logger = require('../../core/Logger');

// Cache for filters (refreshed periodically)
const filterCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get filters for a guild (with caching)
 * @param {string} guildId - Guild ID
 * @returns {Promise<Object[]>} List of filters
 */
async function getFilters(guildId) {
    const cached = filterCache.get(guildId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.filters;
    }

    const filters = await FilterRepository.getAll(guildId);
    filterCache.set(guildId, { filters, timestamp: Date.now() });
    return filters;
}

/**
 * Invalidate cache for a guild
 * @param {string} guildId - Guild ID
 */
function invalidateCache(guildId) {
    filterCache.delete(guildId);
}

/**
 * Normalize text for matching
 * @param {string} text - Text to normalize
 * @returns {string} Normalized text
 */
function normalizeText(text) {
    let normalized = text.toLowerCase();

    // Strip zalgo
    if (filterConfig.settings.stripZalgo) {
        normalized = normalized.replace(filterConfig.zalgoPattern, '');
    }

    // Normalize unicode
    if (filterConfig.settings.normalizeUnicode) {
        for (const [char, replacement] of Object.entries(filterConfig.unicodeMap)) {
            normalized = normalized.replace(new RegExp(char, 'g'), replacement);
        }
    }

    // Convert leetspeak
    if (filterConfig.settings.checkLeetspeak) {
        for (const [char, replacement] of Object.entries(filterConfig.leetspeak)) {
            normalized = normalized.replace(new RegExp(`\\${char}`, 'g'), replacement);
        }
    }

    return normalized;
}

/**
 * Check if text matches a filter pattern
 * @param {string} text - Text to check
 * @param {Object} filter - Filter object
 * @returns {boolean} Whether text matches
 */
function matchesFilter(text, filter) {
    const normalizedText = normalizeText(text);
    const pattern = filter.pattern.toLowerCase();

    switch (filter.match_type) {
        case 'exact':
            return normalizedText === pattern;

        case 'word': {
            // Word boundary match
            const regex = new RegExp(`\\b${escapeRegex(pattern)}\\b`, 'i');
            return regex.test(normalizedText);
        }

        case 'contains':
            return normalizedText.includes(pattern);

        case 'regex': {
            try {
                const regex = new RegExp(filter.pattern, 'i');
                return regex.test(text); // Use original text for regex
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
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Check message content against filters
 * @param {string} guildId - Guild ID
 * @param {string} content - Message content
 * @returns {Promise<Object|null>} Matched filter or null
 */
async function checkMessage(guildId, content) {
    if (!content || content.length < filterConfig.settings.minWordLength) {
        return null;
    }

    // Check exempt patterns (URLs, code blocks)
    for (const pattern of filterConfig.exemptPatterns) {
        content = content.replace(pattern, '');
    }

    if (!content.trim()) return null;

    const filters = await getFilters(guildId);
    
    // Check filters by severity (highest first)
    for (const filter of filters) {
        if (matchesFilter(content, filter)) {
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
 * @param {Object} data - Filter data
 * @returns {Promise<Object>} Created filter
 */
async function addFilter(data) {
    const filter = await FilterRepository.add(data);
    invalidateCache(data.guildId);
    return filter;
}

/**
 * Add multiple filters
 * @param {string} guildId - Guild ID
 * @param {Object[]} filters - Array of filter data
 * @param {string} createdBy - Creator user ID
 * @returns {Promise<number>} Number added
 */
async function addFilters(guildId, filters, createdBy) {
    const count = await FilterRepository.addBulk(guildId, filters, createdBy);
    invalidateCache(guildId);
    return count;
}

/**
 * Remove a filter
 * @param {string} guildId - Guild ID
 * @param {string} pattern - Pattern to remove
 * @returns {Promise<boolean>} Success
 */
async function removeFilter(guildId, pattern) {
    const result = await FilterRepository.removeByPattern(guildId, pattern);
    invalidateCache(guildId);
    return result;
}

/**
 * Remove filter by ID
 * @param {number} id - Filter ID
 * @param {string} guildId - Guild ID for cache invalidation
 * @returns {Promise<boolean>} Success
 */
async function removeFilterById(id, guildId) {
    const result = await FilterRepository.remove(id);
    if (guildId) invalidateCache(guildId);
    return result;
}

/**
 * Get all filters for a guild
 * @param {string} guildId - Guild ID
 * @returns {Promise<Object[]>} List of filters
 */
async function listFilters(guildId) {
    return FilterRepository.getAll(guildId);
}

/**
 * Clear all filters for a guild
 * @param {string} guildId - Guild ID
 * @returns {Promise<number>} Number removed
 */
async function clearFilters(guildId) {
    const count = await FilterRepository.removeAll(guildId);
    invalidateCache(guildId);
    return count;
}

/**
 * Import a preset filter list
 * @param {string} guildId - Guild ID
 * @param {string} presetName - Preset name
 * @param {string} createdBy - Creator user ID
 * @returns {Promise<number>} Number imported
 */
async function importPreset(guildId, presetName, createdBy) {
    const preset = filterConfig.presets[presetName];
    if (!preset) {
        throw new Error(`Preset "${presetName}" not found`);
    }

    return addFilters(guildId, preset.words, createdBy);
}

/**
 * Get filter count for a guild
 * @param {string} guildId - Guild ID
 * @returns {Promise<number>} Filter count
 */
async function getFilterCount(guildId) {
    return FilterRepository.count(guildId);
}

/**
 * Search filters
 * @param {string} guildId - Guild ID
 * @param {string} searchTerm - Search term
 * @returns {Promise<Object[]>} Matching filters
 */
async function searchFilters(guildId, searchTerm) {
    return FilterRepository.search(guildId, searchTerm);
}

module.exports = {
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
