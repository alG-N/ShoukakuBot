import type { PixivIllust, PixivNovel } from '../pixiv.js';

export interface PixivAuth {
    accessToken: string | null;
    refreshToken: string | undefined;
    expiresAt: number;
}

export interface PixivTokenResponse {
    access_token: string;
    refresh_token: string;
    expires_in: number;
}

export interface InternalSearchResult {
    items: PixivIllust[];
    nextUrl: string | null;
}

export interface PixivSearchResponse {
    illusts?: PixivIllust[];
    novels?: PixivNovel[];
    next_url?: string | null;
}

export interface PixivIllustDetailResponse {
    illust: PixivIllust;
}

export interface AutocompleteSuggestion {
    name: string;
    value: string;
}

export interface PixivAutocompleteCandidate {
    tag_name?: string;
    tag_translation?: string;
}

export interface PixivAutocompleteResponse {
    candidates?: PixivAutocompleteCandidate[];
}
