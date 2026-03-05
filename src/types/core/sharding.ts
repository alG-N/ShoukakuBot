export interface ShardIpcMessage {
    type: string;
    data?: unknown;
    requestId?: string;
}
