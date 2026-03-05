import type { Rule34QueryContentType, Rule34SearchOptions } from '../rule34.js';

export interface Rule34Auth {
    userId: string;
    apiKey: string;
}

export interface FilterOptions {
    excludeAi?: boolean;
    minScore?: number;
    highQualityOnly?: boolean;
    excludeLowQuality?: boolean;
}

export interface BuildQueryOptions extends FilterOptions {
    rating?: Rule34SearchOptions['rating'];
    contentType?: Rule34QueryContentType | null;
    excludeTags?: string[];
    requireTags?: string[];
    minWidth?: number;
    minHeight?: number;
    sort?: string;
}

export interface TagInfoResponse {
    id: number;
    name: string;
    count: number;
    type: number;
}

export interface CommentResponse {
    id: number;
    post_id: number;
    creator: string;
    body: string;
    created_at: string;
}

export interface AutocompleteItem {
    label?: string;
    value?: string;
    type?: string;
    count?: number;
}
