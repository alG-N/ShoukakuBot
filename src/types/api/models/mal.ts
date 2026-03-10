export type MALMediaType = 'anime' | 'manga' | 'lightnovel' | 'webnovel' | 'oneshot';

export type AnimeContentSource = 'anilist' | 'mal';

export interface MALMediaTypeConfig {
    endpoint: 'anime' | 'manga';
    typeFilter: string | null;
}

export interface MALTypeDisplay {
    emoji: string;
    label: string;
    endpoint: 'anime' | 'manga';
}
