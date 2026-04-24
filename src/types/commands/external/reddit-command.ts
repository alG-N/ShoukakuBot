import type {
    AutocompleteInteraction,
    ButtonInteraction,
    ChatInputCommandInteraction,
    EmbedBuilder
} from 'discord.js';
import type { RedditPost } from '../../api/models/reddit.js';

export interface SubredditSuggestion {
    displayName: string;
    title: string;
    name: string;
}

export interface FetchResult {
    posts?: RedditPost[];
    error?: string;
}

export type RedditService = {
    fetchSubredditPosts: (subreddit: string, sort: string, count: number) => Promise<FetchResult>;
    searchSimilarSubreddits: (query: string) => Promise<SubredditSuggestion[]>;
    fetchTrendingPosts?: (region: string, count: number) => Promise<FetchResult>;
    fetchAllPosts?: (sort: string, count: number) => Promise<FetchResult>;
    searchSubreddits: (query: string, limit: number) => Promise<SubredditSuggestion[]>;
};

export interface RedditCache {
    ensureHydrated?: (userId: string, sessionId?: string) => Promise<void>;
    setPosts: (userId: string, posts: RedditPost[], sessionId?: string) => void;
    getPosts: (userId: string, sessionId?: string) => RedditPost[] | null;
    setPage: (userId: string, page: number, sessionId?: string) => void;
    getPage: (userId: string, sessionId?: string) => number;
    setSort: (userId: string, sort: string, sessionId?: string) => void;
    getSort: (userId: string, sessionId?: string) => string;
    setNsfwChannel: (userId: string, isNsfw: boolean, sessionId?: string) => void;
    getNsfwChannel: (userId: string, sessionId?: string) => boolean;
    getGalleryPage: (userId: string, postIndex: number, sessionId?: string) => number;
    setGalleryPage: (userId: string, postIndex: number, page: number, sessionId?: string) => void;
}

export interface RedditPostHandler {
    createNotFoundEmbed: (subreddit: string, suggestions: SubredditSuggestion[]) => EmbedBuilder;
    sendPostListEmbed: (interaction: ChatInputCommandInteraction | ButtonInteraction, subreddit: string, posts: RedditPost[], sortBy: string, page: number, isNsfw: boolean, sessionId?: string) => Promise<void>;
    showPostDetails: (interaction: ButtonInteraction, post: RedditPost, postIndex: number, userId: string, sessionId?: string) => Promise<void>;
}

export type { AutocompleteInteraction };
