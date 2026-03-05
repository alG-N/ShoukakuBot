export interface PlayerLike {
    paused: boolean;
    position: number;
    playTrack(options: { track: { encoded: string } }): Promise<void>;
    stopTrack(): Promise<void>;
    setPaused(paused: boolean): Promise<void>;
    seekTo(position: number): Promise<void>;
    setGlobalVolume(volume: number): Promise<void>;
    removeAllListeners(): void;
    on(event: string, listener: (...args: unknown[]) => void): void;
    connection?: {
        channelId?: string;
    };
}

export interface MusicEventData {
    guildId?: string;
    reason?: string;
    error?: Error | string;
    track?: unknown;
    tracks?: unknown[];
    lastTrack?: unknown;
    threshold?: number;
    code?: number;
    loopCount?: number;
    [key: string]: unknown;
}
