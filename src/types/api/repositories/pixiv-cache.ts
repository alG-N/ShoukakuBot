export interface PixivCacheSearchResult {
    query: string;
    results: any[];
    timestamp?: number;
}

export interface PixivResultData {
    results: any[];
    currentIndex: number;
    mangaPageIndex: number;
    query?: string;
    userId?: string;
    [key: string]: any;
}
