import type { GuildMember, User } from 'discord.js';

export type ViolationType =
    | 'spam'
    | 'duplicate'
    | 'links'
    | 'invites'
    | 'mentions'
    | 'caps'
    | 'banned_words';

export interface ActionResult {
    deleted: boolean;
    warned: boolean;
    muted?: boolean;
    kicked?: boolean;
    banned?: boolean;
    escalated?: boolean;
    warnCount?: number;
    warnThreshold?: number;
    muteDuration?: number;
}

export type FeatureConfig = [string, boolean | undefined, string];

export interface AutoModService {
    getSettings: (guildId: string) => Promise<import('./automod.js').AutoModSettings>;
    updateSettings: (guildId: string, settings: Partial<import('./automod.js').AutoModSettings>) => Promise<void>;
}

export type ModActionType = 'warn' | 'mute' | 'kick' | 'ban' | 'unmute' | 'unban';

export interface QuickEmbedOptions {
    type: ModActionType;
    user: User | GuildMember | { id: string; displayAvatarURL?: () => string };
    moderator: User | GuildMember | { id: string };
    reason?: string;
    duration?: number;
    caseId?: number | string;
    color?: number;
}
