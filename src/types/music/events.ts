import type { TrackInfo } from './track.js';

export interface PlayerEventHandlers {
    onStart?: (data: unknown) => void;
    onEnd?: (data: unknown) => void;
    onException?: (data: unknown) => void;
    onStuck?: (data: unknown) => void;
    onClosed?: (data: unknown) => void;
}

export interface MusicTrack {
    track?: {
        encoded?: string;
        info?: TrackInfo;
    };
    encoded?: string;
    url?: string;
    title?: string;
    lengthSeconds?: number;
    thumbnail?: string | null;
    author?: string;
    requestedBy?: {
        id?: string;
        username?: string;
        displayName?: string;
        displayAvatarURL?: () => string | null;
    } | null;
    source?: string;
    viewCount?: number | null;
    identifier?: string;
    info?: TrackInfo;
    searchedByLink?: boolean;
    originalQuery?: string | null;
}
