import type { MessageEditOptions } from 'discord.js';
import type { MusicTrack } from './events.js';
import type { PlayerLike, MusicEventData } from './infrastructure.js';

export type MessageComponents = NonNullable<MessageEditOptions['components']>;

export interface QueueServiceLike {
    getLoopMode(guildId: string): string;
    getCurrentTrack(guildId: string): MusicTrack | null;
    setCurrentTrack(guildId: string, track: MusicTrack | null): void;
    getTracks(guildId: string): MusicTrack[];
    getVolume(guildId: string): number;
    isShuffled(guildId: string): boolean;
    isAutoPlayEnabled(guildId: string): boolean;
    addTrack(guildId: string, track: MusicTrack): void;
    getNextTrack(guildId: string): MusicTrack | null;
    resetLoopCount(guildId: string): void;
}

export interface PlaybackServiceLike {
    getPlayer(guildId: string): PlayerLike | null;
    acquireTransitionLock(guildId: string, timeout: number): Promise<boolean>;
    releaseTransitionLock(guildId: string): void;
}

export interface VoiceServiceLike {
    setInactivityTimer(guildId: string, callback: () => void): void;
    clearInactivityTimer(guildId: string): void;
    getListenerCount(guildId: string, guild: unknown): number;
}

export interface AutoPlayServiceLike {
    findSimilarTrack(guildId: string, lastTrack: MusicTrack): Promise<MusicTrack | null>;
}

export interface ServiceReferences {
    queueService?: QueueServiceLike;
    playbackService?: PlaybackServiceLike;
    voiceService?: VoiceServiceLike;
    autoPlayService?: AutoPlayServiceLike;
}

export type EventData = MusicEventData & {
    guildId: string;
    reason?: string;
    error?: string;
    lastTrack?: MusicTrack | null;
    track?: MusicTrack | null;
    loopCount?: number;
};
