import type { MusicTrack } from './events.js';

export interface PlaybackState {
    hasPlayer: boolean;
    isPlaying: boolean;
    isPaused: boolean;
    position: number;
    currentTrack: MusicTrack | null;
    volume: number;
}
