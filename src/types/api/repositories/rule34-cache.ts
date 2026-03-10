import type { Rule34HistoryEntry, Rule34UserPreferences } from '../models/rule34.js';

export interface Rule34Session {
    userId: string;
    createdAt: number;
    updatedAt: number;
    pagination?: PaginationState;
    query?: string;
    results?: any[];
    currentIndex?: number;
    [key: string]: any;
}

export interface PaginationState {
    currentIndex: number;
    currentPage: number;
    totalResults: number;
    hasMore: boolean;
}

export interface SearchCacheEntry {
    timestamp: number;
    results?: any[];
    totalCount?: number;
    [key: string]: any;
}

export interface AutocompleteEntry {
    suggestions: string[];
    timestamp: number;
}

export interface Rule34Favorite {
    id: number | string;
    addedAt: number;
    url?: string;
    tags?: string[];
    score?: number;
    [key: string]: any;
}

export interface Rule34CacheStats {
    sessions: number;
    searchCache: number;
    blacklists: number;
    preferences: number;
    favorites: number;
    history: number;
    autocomplete: number;
}

export interface FavoriteResult {
    success: boolean;
    message?: string;
    favorites?: Rule34Favorite[];
}

export type {
    Rule34HistoryEntry,
    Rule34UserPreferences
};
