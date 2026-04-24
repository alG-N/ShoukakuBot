import type {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    StringSelectMenuBuilder
} from 'discord.js';
import type {
    Rule34Post,
    PostRating,
    Rule34ContentType as ContentType
} from '../models/rule34.js';
import type { Rule34UserPreferences as CacheRule34UserPreferences } from '../../../cache/api/rule34Cache.js';

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

export type Rule34HandlerPreferences = CacheRule34UserPreferences;

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

