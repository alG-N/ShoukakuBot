export interface MALTitle {
    romaji: string | null;
    english: string | null;
    native: string | null;
}

export interface MALCoverImage {
    large: string | null;
    color: null;
}

export interface MALDate {
    year: number;
    month: number;
    day: number;
}

export interface MALRanking {
    rank: number;
    type: string;
    allTime: boolean;
}

export interface MALRelatedNode {
    id: number;
    title: { romaji: string; english: null };
    type: string;
}

export interface MALRelationEdge {
    relationType: string;
    node: MALRelatedNode;
}

export interface MALRelations {
    edges: MALRelationEdge[];
}

export interface MALStudio {
    name: string;
}

export interface MALStudios {
    nodes: MALStudio[];
}

export interface MALTrailer {
    id: string;
    site: string;
}

export interface MALCharacters {
    edges: unknown[];
}

export interface MALAnimeData {
    id: number;
    source: string;
    title: MALTitle;
    coverImage: MALCoverImage;
    description: string | null;
    episodes: number | null;
    averageScore: number | null;
    popularity: number | null;
    format: string | null;
    season: string | null;
    seasonYear: number | null;
    status: string;
    genres: string[];
    duration: number | null;
    startDate: MALDate | null;
    endDate: MALDate | null;
    rankings: MALRanking[];
    characters: MALCharacters;
    relations: MALRelations;
    studios: MALStudios;
    trailer: MALTrailer | null;
    siteUrl: string;
    nextAiringEpisode: null;
    malId: number;
    score: number | null;
    scoredBy: number | null;
    rank: number | null;
    popularity_rank: number | null;
    members: number | null;
    favorites: number | null;
    rating: string | null;
    broadcast: string | null;
    mediaType: 'anime';
}

export interface MALAuthor {
    name: string;
    role: string;
}

export interface MALMangaData {
    id: number;
    source: string;
    mediaType: string;
    title: MALTitle;
    coverImage: MALCoverImage;
    description: string | null;
    chapters: number | null;
    volumes: number | null;
    averageScore: number | null;
    popularity: number | null;
    format: string | null;
    status: string;
    genres: string[];
    themes: string[];
    demographics: string[];
    startDate: MALDate | null;
    endDate: MALDate | null;
    authors: MALAuthor[];
    serialization: string[];
    relations: MALRelations;
    siteUrl: string;
    malId: number;
    score: number | null;
    scoredBy: number | null;
    rank: number | null;
    popularity_rank: number | null;
    members: number | null;
    favorites: number | null;
}

export interface MALAutocompleteItem {
    id: number;
    title: {
        romaji: string | null;
        english: string | null;
        japanese: string | null;
    };
    format: string | null;
    status: string;
    seasonYear: number | null;
    startYear: number | null;
    averageScore: number | null;
}

export interface JikanImage {
    image_url: string;
    large_image_url?: string;
}

export interface JikanImages {
    jpg?: JikanImage;
}

export interface JikanGenre {
    mal_id: number;
    name: string;
}

export interface JikanStudio {
    mal_id: number;
    name: string;
}

export interface JikanAired {
    from?: string;
    to?: string;
}

export interface JikanPublished {
    from?: string;
    to?: string;
}

export interface JikanTrailer {
    youtube_id?: string;
}

export interface JikanRelationEntry {
    mal_id: number;
    name: string;
    type?: string;
}

export interface JikanRelation {
    relation: string;
    entry: JikanRelationEntry[];
}

export interface JikanAuthor {
    name: string;
    type: string;
}

export interface JikanSerialization {
    name: string;
}

export interface JikanTheme {
    name: string;
}

export interface JikanDemographic {
    name: string;
}

export interface JikanBroadcast {
    string?: string;
}

export interface JikanAnimeData {
    mal_id: number;
    title: string;
    title_english?: string;
    title_japanese?: string;
    images?: JikanImages;
    synopsis?: string;
    episodes?: number;
    score?: number;
    scored_by?: number;
    rank?: number;
    popularity?: number;
    members?: number;
    favorites?: number;
    type?: string;
    season?: string;
    year?: number;
    status?: string;
    source?: string;
    genres?: JikanGenre[];
    duration?: string;
    aired?: JikanAired;
    studios?: JikanStudio[];
    trailer?: JikanTrailer;
    url?: string;
    rating?: string;
    broadcast?: JikanBroadcast;
    relations?: JikanRelation[];
}

export interface JikanMangaData {
    mal_id: number;
    title: string;
    title_english?: string;
    title_japanese?: string;
    images?: JikanImages;
    synopsis?: string;
    chapters?: number;
    volumes?: number;
    score?: number;
    scored_by?: number;
    rank?: number;
    popularity?: number;
    members?: number;
    favorites?: number;
    type?: string;
    status?: string;
    genres?: JikanGenre[];
    themes?: JikanTheme[];
    demographics?: JikanDemographic[];
    published?: JikanPublished;
    authors?: JikanAuthor[];
    serializations?: JikanSerialization[];
    url?: string;
    relations?: JikanRelation[];
}

export interface JikanSearchResponse<T> {
    data: T[];
}

export interface JikanSingleResponse<T> {
    data: T;
}
