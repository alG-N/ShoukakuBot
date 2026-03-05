export interface ShardMessage {
    type: string;
    shardId: number;
    requestId?: string;
    data?: unknown;
    timestamp: number;
}

export interface ShardRequest {
    type: string;
    data?: unknown;
    timeout?: number;
}

export interface ShardResponse {
    shardId: number;
    data: unknown;
    error?: string;
}

export interface AggregateStats {
    totalGuilds: number;
    totalUsers: number;
    totalChannels: number;
    totalVoiceConnections: number;
    shardCount: number;
    shards: Array<{
        id: number;
        guilds: number;
        users: number;
        ping: number;
        uptime: number;
    }>;
}
