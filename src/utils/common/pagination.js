/**
 * Pagination Utilities
 * Shared pagination for Discord embeds
 * @module shared/utils/pagination
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

/**
 * Create pagination buttons
 * @param {number} currentPage - Current page (0-indexed)
 * @param {number} totalPages - Total pages
 * @param {string} prefix - Button ID prefix
 * @param {string} userId - User ID (to filter button clicks)
 * @param {boolean} disabled - Disable all buttons
 * @returns {ActionRowBuilder}
 */
function createPaginationButtons(currentPage, totalPages, prefix, userId, disabled = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${prefix}_first_${userId}`)
            .setLabel('⏮')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled || currentPage === 0),
        new ButtonBuilder()
            .setCustomId(`${prefix}_prev_${userId}`)
            .setLabel('◀')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(disabled || currentPage === 0),
        new ButtonBuilder()
            .setCustomId(`${prefix}_page_${userId}`)
            .setLabel(`${currentPage + 1} / ${totalPages}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`${prefix}_next_${userId}`)
            .setLabel('▶')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(disabled || currentPage >= totalPages - 1),
        new ButtonBuilder()
            .setCustomId(`${prefix}_last_${userId}`)
            .setLabel('⏭')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled || currentPage >= totalPages - 1)
    );
}

/**
 * Create simple prev/next pagination
 * @param {number} currentPage - Current page (0-indexed)
 * @param {number} totalPages - Total pages
 * @param {string} prefix - Button ID prefix
 * @param {string} userId - User ID
 * @param {boolean} disabled - Disable all buttons
 * @returns {ActionRowBuilder}
 */
function createSimplePagination(currentPage, totalPages, prefix, userId, disabled = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${prefix}_prev_${userId}`)
            .setLabel('◀ Previous')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(disabled || currentPage === 0),
        new ButtonBuilder()
            .setCustomId(`${prefix}_page_${userId}`)
            .setLabel(`Page ${currentPage + 1}/${totalPages}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`${prefix}_next_${userId}`)
            .setLabel('Next ▶')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(disabled || currentPage >= totalPages - 1)
    );
}

/**
 * Disable all pagination buttons
 * @param {number} currentPage - Current page
 * @param {number} totalPages - Total pages
 * @param {string} prefix - Button ID prefix
 * @param {string} userId - User ID
 * @returns {ActionRowBuilder}
 */
function disablePaginationButtons(currentPage, totalPages, prefix, userId) {
    return createPaginationButtons(currentPage, totalPages, prefix, userId, true);
}

/**
 * Parse pagination button interaction
 * @param {string} customId - Button custom ID
 * @returns {Object|null} Parsed info or null
 */
function parsePaginationButton(customId) {
    const parts = customId.split('_');
    if (parts.length < 3) return null;
    
    const action = parts[parts.length - 2];
    const userId = parts[parts.length - 1];
    const prefix = parts.slice(0, -2).join('_');
    
    if (!['first', 'prev', 'next', 'last', 'page'].includes(action)) {
        return null;
    }
    
    return { prefix, action, userId };
}

/**
 * Calculate new page based on action
 * @param {string} action - Pagination action
 * @param {number} currentPage - Current page
 * @param {number} totalPages - Total pages
 * @returns {number} New page
 */
function getNewPage(action, currentPage, totalPages) {
    switch (action) {
        case 'first': return 0;
        case 'prev': return Math.max(0, currentPage - 1);
        case 'next': return Math.min(totalPages - 1, currentPage + 1);
        case 'last': return totalPages - 1;
        default: return currentPage;
    }
}

/**
 * Pagination State Manager
 * Tracks pagination state with auto-expiry
 */
class PaginationState {
    constructor(expiryMs = 300000) { // 5 minutes default
        this.states = new Map();
        this.expiryMs = expiryMs;

        // Auto cleanup every 5 minutes
        this.cleanupInterval = setInterval(() => this._cleanup(), 300000);
    }

    set(userId, key, value) {
        const userKey = `${userId}_${key}`;
        this.states.set(userKey, {
            value,
            timestamp: Date.now()
        });
    }

    get(userId, key) {
        const userKey = `${userId}_${key}`;
        const entry = this.states.get(userKey);

        if (!entry) return undefined;

        if (Date.now() - entry.timestamp > this.expiryMs) {
            this.states.delete(userKey);
            return undefined;
        }

        return entry.value;
    }

    update(userId, key, updater) {
        const current = this.get(userId, key);
        if (current !== undefined) {
            this.set(userId, key, updater(current));
        }
    }

    delete(userId, key) {
        const userKey = `${userId}_${key}`;
        this.states.delete(userKey);
    }

    clear(userId) {
        for (const key of this.states.keys()) {
            if (key.startsWith(`${userId}_`)) {
                this.states.delete(key);
            }
        }
    }

    _cleanup() {
        const now = Date.now();
        for (const [key, entry] of this.states.entries()) {
            if (now - entry.timestamp > this.expiryMs) {
                this.states.delete(key);
            }
        }
    }

    destroy() {
        clearInterval(this.cleanupInterval);
        this.states.clear();
    }
}

// Global pagination state instance
const globalPaginationState = new PaginationState();

module.exports = {
    createPaginationButtons,
    createSimplePagination,
    disablePaginationButtons,
    parsePaginationButton,
    getNewPage,
    PaginationState,
    globalPaginationState
};
