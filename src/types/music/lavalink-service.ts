export interface CircuitBreaker {
    execute<T>(fn: () => Promise<T>): Promise<T>;
}

export interface ShoukakuNode {
    name: string;
    state: number;
    stats: unknown;
    rest: {
        resolve(query: string): Promise<{
            loadType: string;
            data?: unknown;
            tracks?: unknown[];
        } | null>;
    };
}

export interface ShoukakuPlayer {
    guildId: string;
    paused: boolean;
    track: unknown;
    position: number;
    volume: number;
    connection: {
        disconnect(): Promise<void>;
        channelId?: string;
    };
    playTrack(options: { track: { encoded: string } }): Promise<void>;
    stopTrack(): Promise<void>;
    setPaused(paused: boolean): Promise<void>;
    seekTo(position: number): Promise<void>;
    setGlobalVolume(volume: number): Promise<void>;
    on(event: string, listener: (...args: unknown[]) => void): void;
    removeAllListeners(): void;
}

export interface TrackData {
    encoded?: string;
    info?: {
        uri?: string;
        title?: string;
        length?: number;
        artworkUrl?: string;
        author?: string;
        sourceName?: string;
        identifier?: string;
        viewCount?: number;
    };
    pluginInfo?: {
        viewCount?: number;
        playCount?: number;
    };
}
