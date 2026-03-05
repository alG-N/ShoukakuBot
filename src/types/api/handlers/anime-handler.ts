export interface MediaConfig {
    emoji: string;
    color: string;
    label: string;
}

export interface MediaDate {
    year?: number | null;
    month?: number | null;
    day?: number | null;
}

export interface MediaTitle {
    romaji?: string;
    english?: string;
    native?: string;
}

export interface MediaImage {
    large?: string;
    color?: string;
}

export interface MediaTrailer {
    id?: string | null;
    site?: string | null;
}

export interface MediaStudio {
    name: string;
}

export interface MediaRelation {
    node: {
        id?: number;
        title: MediaTitle;
        siteUrl: string;
        type?: string;
        status?: string;
        averageScore?: number | null;
    };
    relationType: string;
}

export interface MediaCharacter {
    node: {
        name: {
            full: string;
        };
    };
}

export interface MediaRanking {
    type: string;
    rank: number;
    allTime: boolean;
}
