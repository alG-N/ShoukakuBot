export interface UserPreferences {
    defaultVolume: number;
    autoPlay: boolean;
    announceTrack: boolean;
    compactMode: boolean;
    djMode: boolean;
    maxTrackDuration: number;
    maxQueueSize: number;
    preferredSource: string;
    showThumbnails: boolean;
    autoLeaveEmpty: boolean;
    voteSkipEnabled: boolean;
    updatedAt: number;
    lastAccessed?: number;
}

export interface FavoriteTrack {
    url: string;
    title: string;
    author?: string;
    duration?: number;
    thumbnail?: string;
    addedAt: number;
}

export interface HistoryTrack {
    url: string;
    title: string;
    author?: string;
    duration?: number;
    thumbnail?: string;
    playedAt: number;
}

export interface FavoritesEntry {
    tracks: FavoriteTrack[];
    _lastAccessed: number;
}

export interface HistoryEntry {
    tracks: HistoryTrack[];
    _lastAccessed: number;
}

export interface AddFavoriteResult {
    success: boolean;
    message?: string;
    count?: number;
}

export interface UserMusicStats {
    preferences: number;
    favorites: number;
    history: number;
    maxUsers: number;
}
