import type { RedditPost } from '../models/reddit.js';

export type SortType = 'top' | 'new' | 'hot' | 'rising' | 'controversial';

export interface RedditSession {
    posts: RedditPost[];
    page: number;
    sort: SortType;
    nsfw: boolean;
    galleryPages: Record<string, number>;
    updatedAt: number;
}
