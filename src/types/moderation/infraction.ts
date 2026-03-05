export type InfractionType =
    | 'warn'
    | 'mute'
    | 'unmute'
    | 'kick'
    | 'ban'
    | 'unban'
    | 'softban'
    | 'automod'
    | 'filter'
    | 'note'
    | string;

export interface Infraction {
    id?: number | string;
    case_id: number;
    guild_id: string;
    user_id: string;
    moderator_id: string;
    guildId?: string;
    userId?: string;
    moderatorId?: string;
    type: InfractionType;
    reason: string | null;
    duration_ms?: number | null;
    expires_at?: Date | string | null;
    reference_id?: number | null;
    active: boolean;
    created_at: Date | string;
    metadata?: Record<string, unknown>;
}

export interface InfractionCreateData {
    guildId: string;
    userId: string;
    moderatorId: string;
    type: InfractionType;
    reason?: string;
    durationMs?: number;
    expiresAt?: Date;
    referenceId?: number;
    metadata?: Record<string, unknown>;
}

export interface InfractionQueryOptions {
    type?: InfractionType;
    activeOnly?: boolean;
    limit?: number;
    offset?: number;
}

export interface InfractionSearchCriteria {
    userId?: string;
    moderatorId?: string;
    type?: InfractionType;
    reason?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
}

export interface InfractionStats {
    type: InfractionType;
    total: number;
    active: number;
    last_7_days: number;
    last_30_days: number;
}

export interface InfractionUpdateData {
    reason?: string;
    active?: boolean;
    metadata?: Record<string, unknown>;
}
