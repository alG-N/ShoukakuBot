export interface NHentaiTag {
    id?: number;
    type: 'tag' | 'artist' | 'character' | 'parody' | 'group' | 'language' | 'category' | string;
    name: string;
    url?: string;
    count?: number;
}

export interface NHentaiPage {
    t: string;
    w: number;
    h: number;
}

export interface NHentaiImages {
    pages: NHentaiPage[];
    cover: NHentaiPage;
    thumbnail?: NHentaiPage;
}

export interface NHentaiTitle {
    english?: string;
    japanese?: string;
    pretty?: string;
}

export interface NHentaiGallery {
    id: number;
    media_id: string;
    title: NHentaiTitle;
    images: NHentaiImages;
    scanlator: string;
    upload_date: number;
    tags: NHentaiTag[];
    num_pages: number;
    num_favorites: number;
}

export interface GalleryResult {
    success: boolean;
    data?: NHentaiGallery;
    error?: string;
    code?: string;
    fromCache?: boolean;
}

export interface SearchData {
    results: NHentaiGallery[];
    numPages: number;
    perPage: number;
    totalResults: number;
}

export interface NHentaiSearchResult {
    success: boolean;
    data?: SearchData;
    error?: string;
    code?: string;
    fromCache?: boolean;
}

export interface PageUrl {
    pageNum: number;
    url: string;
    width: number;
    height: number;
}

export interface ParsedTags {
    artists: string[];
    characters: string[];
    parodies: string[];
    groups: string[];
    tags: string[];
    languages: string[];
    categories: string[];
}
