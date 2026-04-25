import type { RedditSortType, SortConfigItem } from '../../../types/api/reddit/handler.js';

export const POSTS_PER_PAGE = 5;

export const SORT_CONFIG: Record<RedditSortType, SortConfigItem> = {
    hot: { emoji: '🔥', name: 'Hot' },
    best: { emoji: '⭐', name: 'Best' },
    top: { emoji: '🏆', name: 'Top' },
    new: { emoji: '🆕', name: 'New' },
    rising: { emoji: '📈', name: 'Rising' }
};

export const CONTENT_ICONS: Record<string, string> = {
    video: '🎥',
    gallery: '🖼️',
    image: '📷',
    gif: '🎬',
    text: '📝'
};
