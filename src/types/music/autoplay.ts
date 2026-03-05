export interface SearchStrategy {
    name: string;
    query: string;
    weight: number;
    category: 'artist' | 'genre' | 'mood' | 'discovery' | 'related' | 'context';
}

export interface GenrePattern {
    pattern: RegExp;
    genre: string;
    related: string[];
}

export interface ListeningProfile {
    genres: Map<string, number>;
    artists: Map<string, number>;
    mood: string;
    avgDuration: number;
    language: string;
}
