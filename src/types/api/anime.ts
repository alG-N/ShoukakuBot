export interface AnimeTitle {
    romaji: string | null;
    english: string | null;
    native: string | null;
}

export interface CoverImage {
    large: string | null;
    color: string | null;
}

export interface FuzzyDate {
    year: number | null;
    month: number | null;
    day: number | null;
}

export interface AiringSchedule {
    episode: number;
    airingAt: number;
    timeUntilAiring?: number;
}

export interface CharacterName {
    full: string | null;
}

export interface CharacterNode {
    name: CharacterName;
}

export interface CharacterEdge {
    node: CharacterNode;
}

export interface Characters {
    edges: CharacterEdge[];
}

export interface AnimeRanking {
    rank: number;
    allTime: boolean;
    type: string;
    context?: string;
}

export interface RelatedAnimeNode {
    id: number;
    title: AnimeTitle;
    type: 'ANIME' | 'MANGA' | 'MOVIE' | string;
    status: string;
    averageScore: number | null;
}

export interface RelationEdge {
    relationType: 'SEQUEL' | 'PREQUEL' | 'ALTERNATIVE' | 'PARENT' | 'SIDE_STORY' | string;
    node: RelatedAnimeNode;
}

export interface Relations {
    edges: RelationEdge[];
}

export interface StudioNode {
    name: string;
}

export interface Studios {
    nodes: StudioNode[];
}

export interface Trailer {
    id: string | null;
    site: string | null;
}

export interface AnimeMedia {
    id?: number;
    title: AnimeTitle;
    coverImage: CoverImage | null;
    description: string | null;
    episodes: number | null;
    averageScore: number | null;
    popularity: number | null;
    format: string | null;
    season: string | null;
    seasonYear: number | null;
    status: 'FINISHED' | 'RELEASING' | 'NOT_YET_RELEASED' | 'CANCELLED' | 'HIATUS' | string;
    source: string | null;
    genres: string[];
    duration: number | null;
    startDate: FuzzyDate | null;
    endDate: FuzzyDate | null;
    rankings: AnimeRanking[];
    characters: Characters | null;
    relations: Relations | null;
    studios: Studios | null;
    trailer: Trailer | null;
    siteUrl: string | null;
    nextAiringEpisode: AiringSchedule | null;
    score?: number;
    members?: number;
    favorites?: number;
    rank?: number;
    popularity_rank?: number;
    scoredBy?: number;
    rating?: string;
    broadcast?: string;
    chapters?: number;
    volumes?: number;
    authors?: Array<{ name: string; role: string }>;
    serialization?: string[];
    themes?: string[];
    demographics?: string[];
    _stale?: boolean;
    _error?: string;
    _cachedAt?: number;
}
