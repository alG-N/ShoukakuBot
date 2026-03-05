import type { QueueService } from '../../services/music/queue/index.js';
import type { PlaybackService } from '../../services/music/playback/index.js';
import type { VoiceConnectionService } from '../../services/music/voice/index.js';
import type { musicEventBus } from '../../services/music/events/index.js';
import type { Track } from './track.js';
import type { LoopMode } from './playback.js';

export interface SkipResult {
    skipped: number;
    previousTrack: Track | null;
    autoplayTriggered?: boolean;
}

export interface VoteSkipResult {
    success?: boolean;
    added?: boolean;
    voteCount?: number;
    required?: number;
    message?: string;
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

export interface MusicStats {
    queue: QueueService;
    playback: PlaybackService;
    voice: VoiceConnectionService;
    events: ReturnType<typeof musicEventBus.getStats>;
}
