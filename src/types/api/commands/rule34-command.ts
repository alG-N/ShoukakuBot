import type {
    ActionRowBuilder,
    ButtonBuilder,
    EmbedBuilder,
    StringSelectMenuBuilder
} from 'discord.js';
import type {
    Rule34Post,
    Rule34SearchOptions,
    Rule34SearchResult,
    Rule34RandomOptions,
    Rule34TrendingOptions
} from '../rule34.js';
import type { Rule34UserPreferences as CacheUserPreferences } from '../../../repositories/api/rule34Cache.js';
import type { Rule34CommandSession } from '../content-session.js';

export type Post = Rule34Post;

export type Rule34CommandSearchOptions = Omit<Rule34SearchOptions, 'rating' | 'contentType'> & {
    rating?: Rule34SearchOptions['rating'] | 'all';
    contentType?: Rule34SearchOptions['contentType'] | 'image';
    followSettings?: boolean;
    hasAiOverride?: boolean;
};

export type Rule34CommandSearchResult = Rule34SearchResult;

export type Session = Rule34CommandSession<Post, Rule34CommandSearchOptions>;

export type Preferences = Partial<CacheUserPreferences>;

export type Rule34ServiceContract = {
    search: (tags: string, options: Rule34CommandSearchOptions) => Promise<Rule34CommandSearchResult>;
    getRandom?: (options: Rule34RandomOptions) => Promise<Post[]>;
    getPostById?: (id: number) => Promise<Post | null>;
    getTrending?: (options: Rule34TrendingOptions & { page?: number }) => Promise<Rule34CommandSearchResult>;
    getRelatedTags?: (tag: string, limit: number) => Promise<Array<{ name?: string }>>;
    getAutocompleteSuggestions?: (query: string) => Promise<Array<{ name: string; count?: number; value?: string }>>;
};

export interface Rule34CacheContract {
    getPreferences?: (userId: string) => Preferences | null;
    setPreferences?: (userId: string, prefs: Partial<Preferences>) => void;
    resetPreferences?: (userId: string) => void;
    getBlacklist?: (userId: string) => string[];
    addToBlacklist?: (userId: string, tag: string) => boolean;
    removeFromBlacklist?: (userId: string, tag: string) => boolean;
    clearBlacklist?: (userId: string) => void;
    getSession?: (userId: string) => Session | null;
    setSession?: (userId: string, session: Session) => void;
    updateSession?: (userId: string, updates: Partial<Session>) => void;
    addToHistory?: (userId: string, postId: number, data: { score?: number }) => void;
    isFavorited?: (userId: string, postId: number) => boolean;
    addFavorite?: (userId: string, postId: number, data: { score?: number; rating?: string }) => void;
    removeFavorite?: (userId: string, postId: number) => void;
    getAutocompleteSuggestions?: (query: string) => Array<{ name: string; count?: number; value?: string }> | null;
    setAutocompleteSuggestions?: (query: string, suggestions: Array<{ name: string; count?: number; value?: string }>) => void;
}

export interface Rule34PostHandlerContract {
    createPostEmbed: (post: Post, options: {
        resultIndex: number;
        totalResults: number;
        query?: string;
        userId: string;
        searchPage?: number;
        showTags?: boolean;
        hasMore?: boolean;
    }) => Promise<{ embed: EmbedBuilder; rows: ActionRowBuilder<ButtonBuilder>[] }>;
    createVideoEmbed?: (post: Post, options: {
        resultIndex: number;
        totalResults: number;
        userId: string;
        searchPage?: number;
        showTags?: boolean;
        hasMore?: boolean;
    }) => { embed: EmbedBuilder; rows: ActionRowBuilder<ButtonBuilder>[]; content?: string };
    createNoResultsEmbed?: (tags: string) => EmbedBuilder;
    createRelatedTagsEmbed?: (tag: string, relatedTags: Array<{ name?: string }>) => EmbedBuilder;
    createSettingsEmbed?: (userId: string) => EmbedBuilder;
    createSettingsComponents?: (userId: string) => ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[];
    createErrorEmbed?: (error: Error) => EmbedBuilder;
}
