import type { ActionRowBuilder, ButtonBuilder, EmbedBuilder } from 'discord.js';
import type {
    PixivArtworkSummary as Artwork,
    PixivCommandSearchResult,
    PixivCachedSearch as CachedSearch
} from '../api/models/content-session.js';
import type { PixivSearchOptions } from '../api/pixiv/model.js';

export interface PixivContentEmbedResult {
    embed: EmbedBuilder;
    rows?: ActionRowBuilder<ButtonBuilder>[];
}

export type PixivService = {
    getArtworkById: (id: number | string) => Promise<Artwork | null>;
    search: (query: string, options: PixivSearchOptions) => Promise<PixivCommandSearchResult>;
    getAutocompleteSuggestions: (query: string) => Promise<Array<{ name?: string; tag_translation?: string; tag?: string; value?: string }>>;
};

export interface PixivCache {
    getSearchSuggestions?: (query: string) => Array<{ name: string; value: string }> | null;
    setSearchSuggestions?: (query: string, suggestions: Array<{ name: string; value: string }>) => void;
    ensureSearchResultsHydrated?: (key: string) => Promise<void>;
    setSearchResults?: (key: string, data: CachedSearch) => void;
    getSearchResults?: (key: string) => CachedSearch | null;
    updateSearchResults?: (key: string, updates: Partial<CachedSearch>) => void;
}

export interface ContentHandler {
    createContentEmbed: (artwork: Artwork, options: {
        resultIndex: number;
        totalResults: number;
        searchPage?: number;
        cacheKey: string;
        contentType: string;
        mangaPageIndex?: number;
        hasNextPage?: boolean;
        originalQuery?: string;
        sortMode?: string;
        showNsfw?: boolean;
    }) => Promise<PixivContentEmbedResult>;
    createNoResultsEmbed: (query: string) => EmbedBuilder;
    createErrorEmbed?: (error: Error) => EmbedBuilder;
}