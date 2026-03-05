import type { MusicTrack } from './events.js';
import type { MusicQueue } from './queue.js';

export interface MusicCacheFacade {
    getQueue: (guildId: string) => MusicQueue | null;
    getOrCreateQueue: (guildId: string) => MusicQueue;
    deleteQueue: (guildId: string) => void;
    addTrack: (guildId: string, track: MusicTrack) => number | false;
    addTrackToFront: (guildId: string, track: MusicTrack) => number | false;
    addTracks: (guildId: string, tracks: MusicTrack[]) => MusicTrack[];
    removeTrack: (guildId: string, index: number) => MusicTrack | null;
    clearQueue: (guildId: string) => void;
    clearTracks: (guildId: string) => void;
    shuffleQueue: (guildId: string) => boolean;
    unshuffleQueue: (guildId: string) => boolean;
    setLoopMode: (guildId: string, mode: string) => void;
    cycleLoopMode: (guildId: string) => string;
    getLoopCount: (guildId: string) => number;
    incrementLoopCount: (guildId: string) => number;
    resetLoopCount: (guildId: string) => void;
    getNextTrack: (guildId: string) => MusicTrack | null;
    getCurrentTrack: (guildId: string) => MusicTrack | null;
    setCurrentTrack: (guildId: string, track: MusicTrack | null) => void;
    setVolume: (guildId: string, volume: number) => void;
    getVolume: (guildId: string) => number;
    setAutoPlay: (guildId: string, enabled: boolean) => void;
    isAutoPlayEnabled: (guildId: string) => boolean;
    startSkipVote: (guildId: string, trackId: string) => void;
    addSkipVote: (guildId: string, odId: string) => { added: boolean; voteCount: number; required?: number; message?: string } | null;
    endSkipVote: (guildId: string) => void;
    hasActiveSkipVote: (guildId: string) => boolean;
    hasEnoughSkipVotes: (guildId: string, requiredVotes: number) => boolean;
    addLastPlayedTrack: (guildId: string, trackId: string) => void;
    getLastPlayedTracks: (guildId: string) => string[];
    moveTrack: (guildId: string, from: number, to: number) => boolean;
}
