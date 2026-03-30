import type { NHentaiGallery } from '../models/nhentai.js';

// v2 API GalleryListItem — lightweight object returned by search/list endpoints
export interface NHentaiGalleryListItem {
    id: number;
    media_id: string;
    thumbnail: string;          // relative path e.g. "galleries/123/thumb.webp"
    thumbnail_width: number;
    thumbnail_height: number;
    english_title: string;
    japanese_title?: string | null;
    tag_ids?: number[];
}

// v2 PaginatedResponse shape used by /search, /galleries, /galleries/tagged
export interface NHentaiSearchResponse {
    result: NHentaiGalleryListItem[];
    num_pages: number;
    per_page?: number;
    total?: number | null;
}
