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
    setPosts: (userId: string, posts: RedditPost[]) => void;
    getPosts: (userId: string) => RedditPost[] | null;
    setPage: (userId: string, page: number) => void;
    getPage: (userId: string) => number;
    setSort: (userId: string, sort: string) => void;
    getSort: (userId: string) => string;
    setNsfwChannel: (userId: string, isNsfw: boolean) => void;
    getNsfwChannel: (userId: string) => boolean;
    getGalleryPage: (userId: string, postIndex: number) => number;
    setGalleryPage: (userId: string, postIndex: number, page: number) => void;
}

export interface RedditPostHandler {
    createNotFoundEmbed: (subreddit: string, suggestions: SubredditSuggestion[]) => EmbedBuilder;
    sendPostListEmbed: (interaction: ChatInputCommandInteraction | ButtonInteraction, subreddit: string, posts: RedditPost[], sortBy: string, page: number, isNsfw: boolean) => Promise<void>;
    showPostDetails: (interaction: ButtonInteraction, post: RedditPost, postIndex: number, userId: string) => Promise<void>;
}

export type { AutocompleteInteraction };
