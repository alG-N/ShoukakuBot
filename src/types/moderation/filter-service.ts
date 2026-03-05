export interface Filter {
    id: number;
    guild_id: string;
    pattern: string;
    match_type: 'exact' | 'word' | 'contains' | 'regex';
    action: string;
    severity: number;
    created_by: string;
    created_at: Date;
}

export interface FilterMatch {
    filter: Filter;
    matched: boolean;
    pattern: string;
    action: string;
    severity: number;
}
