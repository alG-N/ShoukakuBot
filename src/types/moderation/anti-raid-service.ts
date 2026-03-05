import type { Snowflake } from 'discord.js';

export interface JoinEntry {
    userId: Snowflake;
    timestamp: number;
    accountAge: number;
    username: string;
}

export interface RaidModeState {
    active: boolean;
    activatedAt: number;
    activatedBy: Snowflake;
    reason: string;
    stats?: {
        kickedCount: number;
        bannedCount: number;
    };
}

export interface DeactivateResult {
    duration: number;
    flaggedAccounts: number;
    stats?: {
        kickedCount?: number;
        bannedCount?: number;
    };
}

export interface JoinAnalysis {
    isRaid: boolean;
    isSuspicious: boolean;
    triggers: string[];
    recommendation: string | null;
    stats: {
        joinCount: number;
        newAccounts: number;
        similarNames: number;
    };
}

export interface SimilarNameResult {
    count: number;
    isSuspicious: boolean;
}
