export interface SubredditInfo {
    name: string;
    title: string;
    displayName: string;
}

export interface RedditPost {
    id?: string;
    subreddit?: string;
    title: string;
    url?: string;
    permalink: string;
    author: string;
    image?: string | null;
    gallery?: string[];
    video?: string | null;
    isVideo?: boolean;
    contentType?: 'text' | 'image' | 'video' | 'gallery' | 'gif';
    selftext?: string;
    upvotes?: number;
    ups?: number;
    downvotes?: number;
    comments?: number;
    awards?: number;
    nsfw?: boolean;
    created?: number | null;
    score?: number;
    num_comments?: number;
    created_utc?: number;
    is_video?: boolean;
    is_gallery?: boolean;
    gallery_data?: unknown;
    media_metadata?: unknown;
    post_hint?: string;
    thumbnail?: string;
    preview?: unknown;
    over_18?: boolean;
    [key: string]: unknown;
}

export interface RedditPostsResult {
    posts?: RedditPost[];
    error?: 'not_found' | 'rate_limited' | 'no_posts' | 'fetch_failed';
}