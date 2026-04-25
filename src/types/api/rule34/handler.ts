import type {
    ActionRowBuilder,
    ButtonBuilder,
    EmbedBuilder,
    StringSelectMenuBuilder
} from 'discord.js';
import type {
    PostRating,
    Rule34ContentType as ContentType,
    Rule34Post,
    Rule34UserPreferences
} from './model.js';

export interface SearchResults {
    posts: Rule34Post[];
    hasMore: boolean;
    totalCount?: number;
}

export interface PostEmbedOptions {
    resultIndex?: number;
    totalResults?: number;
    searchPage?: number;
    query?: string;
    userId?: string;
    sessionId?: string;
    showTags?: boolean;
    compactMode?: boolean;
    hasMore?: boolean;
    sessionType?: 'search' | 'random' | 'trending' | 'single';
    maxPage?: number;
}

export interface SearchFilters {
    excludeAi?: boolean;
    rating?: PostRating;
    minScore?: number;
    highQualityOnly?: boolean;
    contentType?: ContentType;
}

export type Rule34HandlerPreferences = Rule34UserPreferences;

export interface FavoriteEntry {
    id: number;
    score?: number;
    addedAt?: number;
}

export interface EmbedResult {
    embed: EmbedBuilder;
    rows: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[];
    content?: string;
}