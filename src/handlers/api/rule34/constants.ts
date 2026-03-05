import type { ContentType, PostRating, SortMode } from './types.js';

export const RATING_COLORS: Record<PostRating | 'default', `#${string}`> = {
    safe: '#00FF00',
    questionable: '#FFD700',
    explicit: '#FF0000',
    default: '#9400D3'
};

export const RATING_EMOJIS: Record<PostRating, string> = {
    safe: '🟢',
    questionable: '🟡',
    explicit: '🔴'
};

export const CONTENT_EMOJIS: Record<ContentType, string> = {
    video: '🎬',
    gif: '🎞️',
    animated: '✨',
    comic: '📖',
    image: '🖼️'
};

export const SORT_DISPLAY: Record<SortMode, string> = {
    'score:desc': '⬆️ Score (High to Low)',
    'score:asc': '⬇️ Score (Low to High)',
    'id:desc': '🆕 Newest First',
    'id:asc': '📅 Oldest First',
    'updated:desc': '🔄 Recently Updated',
    'random': '🎲 Random'
};
