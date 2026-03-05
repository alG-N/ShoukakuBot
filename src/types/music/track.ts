export interface TrackInfo {
    title?: string;
    author?: string;
    length?: number;
    duration?: number;
    uri?: string;
    identifier?: string;
    artworkUrl?: string;
    sourceName?: string;
}

export interface Track {
    track: {
        encoded: string;
    };
    title: string;
    url: string;
    lengthSeconds: number;
    author?: string;
    thumbnail?: string;
    duration?: number;
    source?: string;
    searchedByLink?: boolean;
    originalQuery?: string;
    requestedBy?: {
        id: string;
        username?: string;
        displayName?: string;
        displayAvatarURL?: () => string | null;
    };
    playedAt?: number;
    info?: TrackInfo;
}
