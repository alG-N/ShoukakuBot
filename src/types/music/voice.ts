import type { MusicEventData } from './infrastructure.js';

export interface EventBusLike {
    emitEvent(event: string, data: MusicEventData): void;
    emitTrackStart(guildId: string, track: unknown, data: unknown): void;
    emitTrackEnd(guildId: string, track: unknown, reason?: string): void;
    emitTrackError(guildId: string, track: unknown, error: string): void;
}

export interface EventsModule {
    musicEventBus: EventBusLike;
    MusicEvents: Record<string, string>;
}

export interface ConnectionState {
    isConnected: boolean;
    voiceChannelId: string | null;
    eventsBound: boolean;
    hasInactivityTimer: boolean;
    hasVCMonitor: boolean;
}
