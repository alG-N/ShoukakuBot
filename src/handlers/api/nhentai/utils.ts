import type { GalleryTag, GalleryTitle } from '../../../types/api/handlers/nhentai-handler.js';
import type { ParsedTags } from '../../../types/api/nhentai.js';

export const COLORS = {
    NHENTAI: 0xED2553,
    ERROR: 0xFF0000,
    SUCCESS: 0x00FF00,
    FAVOURITE: 0xFFD700
} as const;

export function getExt(typeCode: string): string {
    const ext: Record<string, string> = { j: 'jpg', p: 'png', g: 'gif', w: 'webp' };
    return ext[typeCode] || 'jpg';
}

export function getTitle(title: GalleryTitle): string {
    return title.english || title.japanese || title.pretty || 'Unknown Title';
}

export function getSortLabel(sort: string): string {
    const labels: Record<string, string> = {
        date: 'Recent',
        recent: 'Recent',
        'popular-today': 'Popular Today',
        'popular-week': 'Popular This Week',
        'popular-month': 'Popular This Month',
        popular: 'All Time Popular'
    };
    return labels[sort] || 'Popular';
}

export function formatDate(timestamp: number): string {
    return new Date(timestamp * 1000).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

export function parseTags(tags: GalleryTag[]): ParsedTags {
    const result: ParsedTags = {
        artists: [],
        characters: [],
        parodies: [],
        groups: [],
        tags: [],
        languages: [],
        categories: []
    };

    if (!tags || !Array.isArray(tags)) return result;

    for (const tag of tags) {
        const type = tag.type;
        const key = (type + 's') as keyof ParsedTags;
        if (key in result) {
            result[key].push(tag.name);
        } else if (type === 'tag') {
            result.tags.push(tag.name);
        }
    }

    for (const key in result) {
        result[key as keyof ParsedTags] = result[key as keyof ParsedTags].slice(0, 15);
    }

    return result;
}

export function formatTagList(tags: string[], maxLength: number = 300): string {
    if (!tags || tags.length === 0) return 'None';
    let result = tags.join(', ');
    if (result.length > maxLength) {
        result = result.substring(0, maxLength - 3) + '...';
    }
    return result;
}

export function truncate(text: string, maxLength: number): string {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text;
}
