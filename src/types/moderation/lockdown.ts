import type { Snowflake } from 'discord.js';

export interface SavedPermissions {
    allow: string;
    deny: string;
}

export interface LockdownState {
    locked: boolean;
    permissions: Record<Snowflake, SavedPermissions | null>;
}

export interface LockResult {
    success: boolean;
    error?: string;
    channelId: string;
    channelName: string;
}

export interface ServerLockResult {
    success: LockResult[];
    failed: LockResult[];
    skipped: LockResult[];
    message?: string;
}

export interface LockStatus {
    lockedCount: number;
    channelIds: Snowflake[];
}
