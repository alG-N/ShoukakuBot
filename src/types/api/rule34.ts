export type PostRating = 'safe' | 'questionable' | 'explicit';

export type Rule34QueryContentType = 'animated' | 'comic' | 'photo';

export type Rule34ContentType = 'video' | 'gif' | 'animated' | 'comic' | 'image';

export type SortMode = 'score:desc' | 'score:asc' | 'id:desc' | 'id:asc' | 'updated:desc' | 'random';

export interface Rule34SearchOptions {
    limit?: number;
    page?: number;
    sort?: string;
    rating?: PostRating | null;
    excludeAi?: boolean;
    minScore?: number;
    contentType?: Rule34QueryContentType | null;
    excludeTags?: string[];
    requireTags?: string[];
    minWidth?: number;
    minHeight?: number;
    highQualityOnly?: boolean;
    excludeLowQuality?: boolean;
}

export interface Rule34RandomOptions {
    tags?: string;
    count?: number;
    rating?: PostRating | null;
    excludeAi?: boolean;
    minScore?: number;
}

export interface Rule34TrendingOptions {
    timeframe?: 'day' | 'week' | 'month';
    limit?: number;
    excludeAi?: boolean;
}

export interface Rule34RawPost {
    id: number;
    hash?: string;
    md5?: string;
    width: number;
    height: number;
    score: number;
    rating: string;
    owner: string;
    tags: string;
    file_url: string;
    sample_url?: string;
    preview_url?: string;
    source?: string;
    parent_id?: number;
    has_children?: boolean;
    created_at?: string;
    change?: number;
}

export interface Rule34Post {
    id: number;
    hash: string | undefined;
    width: number;
    height: number;
    score: number;
    rating: string;
    owner: string;
    tags: string;
    tagList: string[];
    tagCount: number;
    fileUrl: string;
    sampleUrl: string;
    previewUrl: string | undefined;
    hasVideo: boolean;
    hasSound: boolean;
    isAnimated: boolean;
    isAiGenerated: boolean;
    isHighQuality: boolean;
    isHighRes: boolean;
    source: string;
    parentId: number | undefined;
    hasChildren: boolean | undefined;
    createdAt: string | undefined;
    change: number | undefined;
    contentType: Rule34ContentType;
    fileExtension: string;
    pageUrl: string;
}

export interface Rule34SearchResult {
    posts: Rule34Post[];
    totalCount: number;
    hasMore: boolean;
    query?: string;
}

export interface Rule34AutocompleteSuggestion {
    name: string;
    value: string;
    type: string;
    count: number;
}

export interface Rule34RelatedTag {
    tag: string;
    count: number;
}

export interface Rule34HistoryEntry {
    id: number | string;
    viewedAt: number;
    url?: string;
    tags?: string[];
    [key: string]: unknown;
}

export interface Rule34UserPreferences {
    aiFilter: boolean;
    defaultRating: string | null;
    minScore: number;
    excludeLowQuality: boolean;
    highQualityOnly: boolean;
    showAnimatedOnly: boolean;
    resultsPerPage: number;
    autoplay: boolean;
    compactMode: boolean;
    sortMode: string;
    safeMode: boolean;
}
