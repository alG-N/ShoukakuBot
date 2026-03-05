export type FilterMatchType = 'contains' | 'exact' | 'regex' | 'word';

export type FilterAction = 'delete' | 'delete_warn' | 'warn' | 'mute' | 'kick' | 'ban';

export interface WordFilter {
    id: number;
    guild_id: string;
    pattern: string;
    match_type: FilterMatchType;
    action: FilterAction;
    severity: number;
    created_by: string;
    created_at?: Date;
}

export interface FilterAddData {
    guildId: string;
    pattern: string;
    matchType?: FilterMatchType;
    action?: FilterAction;
    severity?: number;
    createdBy: string;
}

export interface FilterBulkItem {
    pattern: string;
    matchType?: FilterMatchType;
    action?: FilterAction;
    severity?: number;
}

export interface FilterUpdateData {
    pattern?: string;
    match_type?: FilterMatchType;
    matchType?: FilterMatchType;
    action?: FilterAction;
    severity?: number;
}
