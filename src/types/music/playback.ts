import type { User } from 'discord.js';
import type { Track } from './track.js';
import type { MusicTrack } from './events.js';

export type LoopMode = 'off' | 'track' | 'queue';

export interface NowPlayingOptions {
    volume?: number;
    isPaused?: boolean;
    loopMode?: LoopMode;
    isShuffled?: boolean;
    queueLength?: number;
    position?: number;
    player?: unknown;
    requester?: User | null;
    nextTrack?: Track | null;
    loopCount?: number;
    voteSkipCount?: number;
    voteSkipRequired?: number;
    listenerCount?: number;
}

export interface PlayNextResult {
    track: MusicTrack | null;
    isLooped: boolean;
    queueEnded?: boolean;
}
