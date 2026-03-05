export interface NodeConfig {
    name: string;
    url: string;
    auth: string;
    secure?: boolean;
}

export interface LavalinkSearchResult {
    track: unknown;
    encoded: string;
    url: string;
    title: string;
    lengthSeconds: number;
    thumbnail: string | null;
    author: string;
    requestedBy: unknown;
    source: string;
    viewCount: number | null;
    identifier: string | null;
    searchedByLink: boolean;
    originalQuery: string | null;
}

export interface PlaylistResult {
    playlistName: string;
    tracks: LavalinkSearchResult[];
}

export interface PreservedState {
    timestamp: number;
    track: unknown;
    position: number;
    paused: boolean;
    volume: number;
}

export interface NodeStatus {
    ready: boolean;
    activeConnections: number;
    error?: string;
    nodes?: Array<{
        name: string;
        state: number;
        stats: unknown;
    }>;
    players?: Array<{
        guildId: string;
        paused: boolean;
        track: unknown;
    }>;
}
