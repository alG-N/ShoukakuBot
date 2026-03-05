/**
 * Pagination Utilities
 * Shared pagination for Discord embeds
 * @module utils/common/pagination
 */

import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import type { ParsedPaginationButton, PaginationStateEntry } from '../../types/utils/common/pagination.js';
// PAGINATION BUTTON FUNCTIONS
/**
 * Create pagination buttons
 * @param currentPage - Current page (0-indexed)
 * @param totalPages - Total pages
 * @param prefix - Button ID prefix
 * @param userId - User ID (to filter button clicks)
 * @param disabled - Disable all buttons
 */
export function createPaginationButtons(
    currentPage: number, 
    totalPages: number, 
    prefix: string, 
    userId: string, 
    disabled: boolean = false
): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
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
 * @param currentPage - Current page (0-indexed)
 * @param totalPages - Total pages
 * @param prefix - Button ID prefix
 * @param userId - User ID
 * @param disabled - Disable all buttons
 */
export function createSimplePagination(
    currentPage: number, 
    totalPages: number, 
    prefix: string, 
    userId: string, 
    disabled: boolean = false
): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
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
 * @param currentPage - Current page
 * @param totalPages - Total pages
 * @param prefix - Button ID prefix
 * @param userId - User ID
 */
export function disablePaginationButtons(
    currentPage: number, 
    totalPages: number, 
    prefix: string, 
    userId: string
): ActionRowBuilder<ButtonBuilder> {
    return createPaginationButtons(currentPage, totalPages, prefix, userId, true);
}

/**
 * Parse pagination button interaction
 * @param customId - Button custom ID
 */
export function parsePaginationButton(customId: string): ParsedPaginationButton | null {
    const parts = customId.split('_');
    if (parts.length < 3) return null;
    
    const action = parts[parts.length - 2]!;
    const userId = parts[parts.length - 1]!;
    const prefix = parts.slice(0, -2).join('_');
    
    if (!['first', 'prev', 'next', 'last', 'page'].includes(action)) {
        return null;
    }
    
    return { 
        prefix, 
        action: action as 'first' | 'prev' | 'next' | 'last' | 'page', 
        userId 
    };
}

/**
 * Calculate new page based on action
 * @param action - Pagination action
 * @param currentPage - Current page
 * @param totalPages - Total pages
 */
export function getNewPage(action: string, currentPage: number, totalPages: number): number {
    switch (action) {
        case 'first': return 0;
        case 'prev': return Math.max(0, currentPage - 1);
        case 'next': return Math.min(totalPages - 1, currentPage + 1);
        case 'last': return totalPages - 1;
        default: return currentPage;
    }
}
// PAGINATION STATE CLASS
/**
 * Pagination State Manager
 * Tracks pagination state with auto-expiry
 * NOTE: Uses WeakRef-like pattern with cleanup on access for memory safety
 */
export class PaginationState<T = unknown> {
    private states: Map<string, PaginationStateEntry<T>> = new Map();
    private expiryMs: number;
    private cleanupInterval: ReturnType<typeof setInterval> | null = null;
    private static instances: Set<PaginationState> = new Set();

    constructor(expiryMs: number = 300000) { // 5 minutes default
        this.expiryMs = expiryMs;

        // Auto cleanup every 5 minutes
        this.cleanupInterval = setInterval(() => this._cleanup(), 300000);
        
        // Track instance for global cleanup
        PaginationState.instances.add(this);
    }

    /**
     * Static method to destroy all instances (call on shutdown)
     */
    static destroyAll(): void {
        for (const instance of PaginationState.instances) {
            instance.destroy();
        }
        PaginationState.instances.clear();
    }

    set(userId: string, key: string, value: T): void {
        const userKey = `${userId}_${key}`;
        this.states.set(userKey, {
            value,
            timestamp: Date.now()
        });
    }

    get(userId: string, key: string): T | undefined {
        const userKey = `${userId}_${key}`;
        const entry = this.states.get(userKey);

        if (!entry) return undefined;

        if (Date.now() - entry.timestamp > this.expiryMs) {
            this.states.delete(userKey);
            return undefined;
        }

        return entry.value;
    }

    update(userId: string, key: string, updater: (current: T | undefined) => T): void {
        const current = this.get(userId, key);
        this.set(userId, key, updater(current));
    }

    delete(userId: string, key: string): void {
        const userKey = `${userId}_${key}`;
        this.states.delete(userKey);
    }

    clear(userId?: string): void {
        if (!userId) {
            this.states.clear();
            return;
        }
        for (const key of this.states.keys()) {
            if (key.startsWith(`${userId}_`)) {
                this.states.delete(key);
            }
        }
    }

    private _cleanup(): void {
        const now = Date.now();
        for (const [key, entry] of this.states.entries()) {
            if (now - entry.timestamp > this.expiryMs) {
                this.states.delete(key);
            }
        }
    }

    destroy(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        this.states.clear();
        PaginationState.instances.delete(this);
    }
}
// GLOBAL INSTANCE
// Global pagination state instance
export const globalPaginationState = new PaginationState();
