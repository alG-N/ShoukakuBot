import type { MALMediaType, AnimeContentSource } from './mal.js';
import type { NHentaiGallery } from './nhentai.js';

export interface AutocompleteOption {
    name: string;
    value: string;
}

export interface TimedAutocompleteCache {
    results: AutocompleteOption[];
    timestamp: number;
}

export interface AnimeCommandTitle {
    english?: string;
    romaji?: string;
    native?: string;
    default?: string;
}

export interface AnimeLookupItem {
    id: number;
    idMal?: number;
    title?: AnimeCommandTitle | string;
    siteUrl?: string;
    url?: string;
    name?: string;
}

export interface AnimeCachedSearch {
    anime: AnimeLookupItem;
    source: AnimeContentSource;
    mediaType: MALMediaType;
    timestamp: number;
}

export interface PixivArtworkSummary {
    id: number;
    type?: string;
    page_count?: number;
}

export interface PixivCommandSearchOptions {
    type?: string;
    sort?: string;
    nsfw?: string;
    aiFilter?: boolean;
    qualityFilter?: boolean;
    translate?: boolean;
    page?: number;
    offset?: number;
    minBookmarks?: number;
}

export interface PixivCommandSearchResult {
    items?: PixivArtworkSummary[];
    nextUrl?: string;
}

export interface PixivCachedSearch {
    items: PixivArtworkSummary[];
    query: string;
    options: PixivCommandSearchOptions;
    hasNextPage: boolean;
    currentIndex?: number;
    mangaPageIndex?: number;
}

export interface NHentaiPageSession {
    galleryId: number;
    gallery: NHentaiGallery;
    currentPage: number;
    totalPages: number;
    expiresAt: number;
}

export interface NHentaiSearchSession {
    query?: string;
    sort?: string;
    results?: NHentaiGallery[];
    currentPage?: number;
    numPages?: number;
    favPage?: number;
    expiresAt: number;
}

export interface NHentaiUserPreferences {
    popularPeriod: 'today' | 'week' | 'month' | 'all';
    randomPeriod: 'today' | 'week' | 'month' | 'all';
}

export interface PixivUserPreferences {
    contentTypes: string[];         // ['illust', 'manga', 'novel'] subset
    r18Enabled: boolean;
    nsfwMode: 'sfw' | 'all';       // only active when r18Enabled = false
    sortMode: string;
    aiFilter: boolean;
    qualityFilter: boolean;
    minBookmarks: number;
    translate: boolean;
}

export interface NHentaiFavouriteEntry {
    gallery_id: number;
    gallery_title: string;
    num_pages: number;
}

export interface Rule34CommandSession<TPost, TOptions> {
    type: string;
    query?: string;
    posts: TPost[];
    options?: TOptions;
    currentIndex: number;
    currentPage?: number;
    hasMore?: boolean;
    timeframe?: string;
    showTags?: boolean;
    seenPostIds?: number[];
    overflowPosts?: TPost[];
}
