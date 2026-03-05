import type { TextBasedChannel } from 'discord.js';
import type { LoopMode } from './playback.js';
import type { MusicTrack } from './events.js';
export type { MusicTrack } from './events.js';

export interface MusicTextChannel {
    send(payload: unknown): Promise<any>;
    guild?: unknown;
}

export interface MessageRef {
    messageId: string;
    channelId: string;
}

export interface MusicQueue {
    guildId: string;
    tracks: MusicTrack[];
    originalTracks: MusicTrack[];
    currentTrack: MusicTrack | null;
    position: number;
    isPaused: boolean;
    loopMode: LoopMode;
    loopCount: number;
    isShuffled: boolean;
    volume: number;
    autoPlay: boolean;
    nowPlayingMessage: MessageRef | null;
    controlsMessage: MessageRef | null;
    priorityQueue: MusicTrack[];
    inactivityTimer: NodeJS.Timeout | null;
    vcMonitorInterval: NodeJS.Timeout | null;
    eventsBound: boolean;
    isTransitioning: boolean;
    isReplacing: boolean;
    lastAutoplaySearch?: number;
    lastPlayedTracks: string[];
    createdAt: number;
    updatedAt: number;
    lastAccessed: number;
    textChannelId: string | null;
    textChannel: TextBasedChannel | MusicTextChannel | null;
    voiceChannelId: string | null;
    requesterId: string | null;
}

export interface QueueState {
    exists?: boolean;
    tracks: MusicTrack[];
    trackCount?: number;
    currentTrack: MusicTrack | null;
    loopMode: LoopMode | string;
    isShuffled: boolean;
    volume: number;
    autoPlay: boolean;
    isPaused?: boolean;
    textChannel?: TextBasedChannel | MusicTextChannel | null;
    eventsBound?: boolean;
    skipVoteActive?: boolean;
    lastPlayedTracks?: string[];
    voiceChannelId?: string | null;
    textChannelId?: string | null;
}
