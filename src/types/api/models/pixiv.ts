export interface PixivImageUrls {
    square_medium?: string;
    medium?: string;
    large?: string;
    original?: string;
}

export interface PixivMetaPage {
    image_urls: PixivImageUrls;
}

export interface PixivTag {
    name: string;
    translated_name?: string | null;
}

export interface PixivUser {
    id: number;
    name: string;
    account: string;
    profile_image_urls: {
        medium: string;
    };
}

export interface PixivIllust {
    id: number;
    title: string;
    type: 'illust' | 'manga' | 'ugoira';
    image_urls: PixivImageUrls;
    caption: string;
    restrict: number;
    user: PixivUser;
    tags: PixivTag[];
    tools: string[];
    create_date: string;
    page_count: number;
    width: number;
    height: number;
    sanity_level: number;
    x_restrict: number;
    series: unknown;
    meta_single_page: { original_image_url?: string };
    meta_pages: PixivMetaPage[];
    total_view: number;
    total_bookmarks: number;
    is_bookmarked: boolean;
    visible: boolean;
    is_muted: boolean;
    illust_ai_type: number;
}

export interface PixivNovel {
    id: number;
    title: string;
    caption: string;
    restrict: number;
    x_restrict: number;
    is_original: boolean;
    image_urls: PixivImageUrls;
    create_date: string;
    tags: PixivTag[];
    page_count: number;
    text_length: number;
    user: PixivUser;
    series: unknown;
    is_bookmarked: boolean;
    total_bookmarks: number;
    total_view: number;
    visible: boolean;
    total_comments: number;
    is_muted: boolean;
    is_mypixiv_only: boolean;
    is_x_restricted: boolean;
    illust_ai_type?: number;
}

export interface PixivSearchOptions {
    offset?: number;
    contentType?: 'illust' | 'manga' | 'novel' | 'all';
    showNsfw?: boolean;
    r18Only?: boolean;
    aiFilter?: boolean;
    qualityFilter?: boolean;
    minBookmarks?: number;
    sort?: string;
    fetchMultiple?: boolean;
}

export interface RankingOptions {
    mode?: 'day' | 'week' | 'month' | 'day_r18' | 'week_r18' | 'month_r18';
    contentType?: string;
    showNsfw?: boolean;
    r18Only?: boolean;
    aiFilter?: boolean;
    offset?: number;
    qualityFilter?: boolean;
    minBookmarks?: number;
}

export interface PixivSearchResult {
    items: (PixivIllust | PixivNovel)[];
    nextUrl?: string | null;
    error?: string;
}
