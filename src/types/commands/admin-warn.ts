export interface WarnThreshold {
    guild_id: string;
    warn_count: number;
    action: string;
    duration_ms: number | null;
}

export type ModerationService = typeof import('../../services/moderation/index.js').moderationService;

export interface Database {
    query: (sql: string, params?: (string | number | null)[]) => Promise<{ rows: WarnThreshold[] }>;
}
