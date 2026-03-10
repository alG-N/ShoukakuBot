export interface WikiSearchResult {
    title: string;
    description: string;
    url: string;
}

export interface WikiSearchResponse {
    success: boolean;
    results?: WikiSearchResult[];
    query?: string;
    error?: string;
    fromCache?: boolean;
}

export interface WikiArticle {
    title: string;
    displayTitle: string;
    description: string | null;
    extract: string;
    extractHtml?: string | null;
    url: string;
    mobileUrl?: string | null;
    thumbnail: string | null;
    originalImage: string | null;
    type?: string;
    timestamp?: string;
    language: string;
    coordinates?: { lat: number; lon: number } | null;
}

export interface WikiArticleResponse {
    success: boolean;
    article?: WikiArticle;
    error?: string;
    code?: string;
    fromCache?: boolean;
}

export interface OnThisDayPage {
    title: string;
    url: string;
}

export interface OnThisDayEvent {
    year: number;
    text: string;
    pages?: OnThisDayPage[];
}

export interface OnThisDayResponse {
    success: boolean;
    events?: OnThisDayEvent[];
    date?: { month: number; day: number };
    error?: string;
}

export interface OnThisDayDate {
    month: number;
    day: number;
}

export interface WikipediaSearchOptions {
    language?: string;
    limit?: number;
}
