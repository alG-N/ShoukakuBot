export interface SpotifyToken {
    accessToken: string;
    expiresAt: number;
}

export interface SpotifyTrack {
    id: string;
    name: string;
    artists: SpotifyArtist[];
    album: SpotifyAlbum;
    duration_ms: number;
    uri: string;
    external_urls: { spotify: string };
    popularity: number;
    preview_url: string | null;
}

export interface SpotifyArtist {
    id: string;
    name: string;
    genres?: string[];
    external_urls: { spotify: string };
}

export interface SpotifyAlbum {
    id: string;
    name: string;
    images: { url: string; width: number; height: number }[];
    release_date: string;
}

export interface SpotifySearchResult {
    tracks: {
        items: SpotifyTrack[];
        total: number;
    };
}

export interface EmbedTrack {
    title: string;
    artist: string;
    duration_ms: number;
    artworkUrl?: string;
    isrc?: string;
}
