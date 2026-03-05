import type {
    AiringSchedule,
    AnimeMedia,
    AnimeTitle,
    CharacterEdge,
    CoverImage,
    FuzzyDate,
    RelationEdge,
    Trailer
} from '../../api/anime.js';

export interface AutocompleteMedia {
    id: number;
    title: AnimeTitle;
    format: string | null;
    status: string;
    seasonYear: number | null;
    averageScore: number | null;
}

export interface PageResponse<T> {
    Page: {
        media: T[];
    };
}

export interface MediaResponse {
    Media: AnimeMedia | null;
}

export interface GracefulDegradationContext {
    cachedResult?: AnimeMedia;
    cachedAt?: number;
}

export type {
    AnimeMedia,
    AnimeTitle,
    CoverImage,
    FuzzyDate,
    AiringSchedule,
    CharacterEdge,
    RelationEdge,
    Trailer
};
