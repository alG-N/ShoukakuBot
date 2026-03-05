export type AfkType = 'guild' | 'global';

export interface AfkRecord {
    [key: string]: unknown;
    user_id: string;
    guild_id: string | null;
    reason: string;
    timestamp: number;
    type: AfkType;
    created_at?: Date;
    updated_at?: Date;
}

export interface AfkInfo {
    reason: string;
    timestamp: number;
    type: AfkType;
}

export interface SetAfkData {
    userId: string;
    guildId: string | null;
    reason: string;
    type: AfkType;
}
