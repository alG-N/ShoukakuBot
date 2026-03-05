export interface AddTrackResult {
    success: boolean;
    position: number;
    reason?: string;
    maxSize?: number;
}

export interface AddTracksResult {
    success: boolean;
    added: number;
    skipped: number;
    totalLength: number;
}

export interface QueueStats {
    totalQueues: number;
    activeQueues: number;
    totalTracks: number;
    maxGuilds: number;
    maxQueueSize: number;
}
