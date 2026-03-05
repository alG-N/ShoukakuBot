export interface RaidState {
    active: boolean;
    activatedAt?: number;
    activatedBy?: string;
    reason?: string;
    stats?: {
        kickedCount?: number;
        bannedCount?: number;
    };
}

export interface LockResults {
    success: string[];
    skipped: string[];
    failed: string[];
}

export type AntiRaidService = typeof import('../../services/moderation/AntiRaidService.js').default;
