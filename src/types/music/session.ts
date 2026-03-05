import type { LoopMode } from './playback.js';
import type { MusicTrack } from './events.js';

export interface TrackEventData {
    guildId: string;
    track?: MusicTrack | null;
    reason?: string;
    error?: string;
    threshold?: number;
}

export interface PlaybackEventData {
    guildId: string;
    paused?: boolean;
    volume?: number;
    position?: number;
}

export interface QueueEventData {
    guildId: string;
    track?: MusicTrack;
    tracks?: MusicTrack[];
    count?: number;
    index?: number;
    position?: string | number;
    fromIndex?: number;
    toIndex?: number;
}

export interface VoiceEventData {
    guildId: string;
    voiceChannelId?: string;
    textChannelId?: string;
    reason?: string;
    code?: number;
}

export interface AutoPlayEventData {
    guildId: string;
    track?: MusicTrack;
    basedOn?: MusicTrack;
    enabled?: boolean;
    error?: string;
}

export interface SkipVoteEventData {
    guildId: string;
    userId?: string;
    required?: number;
    current?: number;
}

export interface NowPlayingEventData {
    guildId: string;
    track?: MusicTrack;
    loopCount?: number;
}

export interface SystemEventData {
    guildId?: string;
    error?: Error | string;
    reason?: string;
    message?: string;
}

export type SourcePlatform = 'youtube' | 'soundcloud' | 'spotify' | 'unknown';

export interface ControlButtonsOptions {
    isPaused?: boolean;
    loopMode?: LoopMode;
    isShuffled?: boolean;
    trackUrl?: string | null;
    userId?: string;
    autoPlay?: boolean;
    listenerCount?: number;
}

export interface QueueListOptions {
    page?: number;
    perPage?: number;
    loopMode?: LoopMode;
    isShuffled?: boolean;
    volume?: number;
}

export type InfoEmbedType = 'info' | 'success' | 'warning' | 'error';

export interface SourceInfo {
    emoji: string;
    name: string;
    color: string;
}

export interface LoopDisplayInfo {
    emoji: string;
    text: string;
    label: string;
}
