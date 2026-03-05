import type { EmbedBuilder, Guild, Snowflake, TextChannel, User } from 'discord.js';
import type { Infraction } from './infraction.js';
import type { LockResult, LockStatus, ServerLockResult } from './lockdown.js';

export interface EscalationResult {
    action: string;
    reason: string;
    durationMs?: number;
}

export interface WarningCreateResult {
    infraction: Infraction;
    warnCount: number;
    escalation: EscalationResult | null;
}

export interface CreateInfractionOptions {
    guild: Guild;
    user: User | { id: string; tag?: string; username?: string };
    moderator: User | { id: string; tag?: string; username?: string };
    type: string;
    reason: string;
    durationMs?: number;
    expiryDays?: number;
    metadata?: Record<string, unknown>;
}

export interface InfractionService {
    createInfraction?: (options: CreateInfractionOptions) => Promise<Infraction>;
    createWarning?: (
        guild: Guild,
        user: User,
        moderator: User,
        reason: string,
        options?: { expiryDays?: number; metadata?: Record<string, unknown> }
    ) => Promise<WarningCreateResult>;
    logMute?: (
        guild: Guild,
        user: User | { id: string; tag?: string },
        moderator: User | { id: string; tag?: string },
        reason: string,
        durationMs: number
    ) => Promise<Infraction>;
    logKick?: (
        guild: Guild,
        user: User | { id: string; tag?: string },
        moderator: User | { id: string; tag?: string },
        reason: string
    ) => Promise<Infraction>;
    logBan?: (
        guild: Guild,
        user: User,
        moderator: User,
        reason: string,
        metadata?: Record<string, unknown>
    ) => Promise<Infraction>;
    getCase?: (guildId: string, caseId: number) => Promise<Infraction | null>;
    getUserHistory?: (
        guildId: string,
        userId: string,
        options: { type?: string | null; activeOnly?: boolean; limit?: number }
    ) => Promise<Infraction[]>;
    getWarningCount?: (guildId: string, userId: string) => Promise<number>;
    clearWarnings?: (guildId: string, userId: string) => Promise<number>;
    deleteCase?: (guildId: string, caseId: number) => Promise<boolean>;
    buildCaseEmbed?: (infraction: Infraction, user?: User | null) => EmbedBuilder;
}

export interface SlowmodeResult {
    success: boolean;
    error?: string;
}

export interface ServerSlowmodeResult {
    success: string[];
    failed: string[];
}

export interface LockdownService {
    lockChannel?: (channel: TextChannel, reason?: string) => Promise<LockResult>;
    unlockChannel?: (channel: TextChannel, reason?: string) => Promise<LockResult>;
    lockServer?: (guild: Guild, reason?: string, excludeChannels?: Snowflake[]) => Promise<ServerLockResult>;
    unlockServer?: (guild: Guild, reason?: string) => Promise<ServerLockResult>;
    getLockStatus?: (guildId: Snowflake) => Promise<LockStatus>;
    setSlowmode?: (channel: TextChannel, duration: number, reason: string) => Promise<SlowmodeResult>;
    setServerSlowmode?: (guild: Guild, duration: number, reason: string) => Promise<ServerSlowmodeResult>;
}
