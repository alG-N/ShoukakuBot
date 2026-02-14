/**
 * Music Facade — Type Definitions
 * Extracted from MusicFacade.ts for modularity.
 * @module services/music/MusicTypes
 */

import type { TextBasedChannel } from 'discord.js';
import type { QueueService } from './queue/index.js';
import type { PlaybackService } from './playback/index.js';
import type { VoiceConnectionService } from './voice/index.js';
import type { musicEventBus } from './events/index.js';

export interface Track {
    track: {
        encoded: string;
    };
    info?: TrackInfo;
    url?: string;
    requestedBy?: {
        id: string;
        username?: string;
    };
}

export interface TrackInfo {
    title: string;
    author?: string;
    duration?: number;
    uri?: string;
    artworkUrl?: string;
    sourceName?: string;
}

export interface PlayNextResult {
    track: Track;
    isLooped: boolean;
}

export interface SkipResult {
    skipped: number;
    previousTrack: Track | null;
}

export interface VoteSkipResult {
    success?: boolean;
    added?: boolean;
    voteCount?: number;
    required?: number;
    message?: string;
}

export interface NowPlayingOptions {
    volume: number;
    isPaused: boolean;
    loopMode: LoopMode;
    isShuffled: boolean;
    queueLength: number;
    nextTrack: Track | null;
    loopCount: number;
    voteSkipCount: number;
    voteSkipRequired: number;
    listenerCount: number;
}

export interface ControlButtonOptions {
    isPaused: boolean;
    loopMode: LoopMode;
    isShuffled: boolean;
    autoPlay: boolean;
    trackUrl: string;
    userId: string;
    listenerCount: number;
}

export interface QueueState {
    tracks: Track[];
    currentTrack: Track | null;
    volume: number;
    loopMode: LoopMode;
    isShuffled: boolean;
    autoPlay: boolean;
    isPaused: boolean;
    textChannel: TextBasedChannel | null;
    eventsBound: boolean;
    skipVoteActive: boolean;
    lastPlayedTracks: string[];
}

export interface MusicStats {
    queue: QueueService;
    playback: PlaybackService;
    voice: VoiceConnectionService;
    events: ReturnType<typeof musicEventBus.getStats>;
}

export type LoopMode = 'off' | 'track' | 'queue';

export interface PlayerEventHandlers {
    onStart: (data: unknown) => void;
    onEnd: (data: unknown) => void;
    onException: (data: unknown) => void;
    onStuck: (data: unknown) => void;
    onClosed: (data: unknown) => void;
}
