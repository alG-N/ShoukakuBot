/**
 * Pixiv User Settings — Repository Types (snake_case, matching DB columns)
 */
export type PixivContentType = 'illust' | 'manga' | 'novel';

export interface PixivUserSettings {
    content_types: string;          // comma-separated: 'illust', 'manga', 'novel'
    r18_enabled: boolean;
    nsfw_mode: 'sfw' | 'all';      // only active when r18_enabled = false
    sort_mode: string;
    ai_filter: boolean;
    quality_filter: boolean;
    min_bookmarks: number;
    translate: boolean;
}
