import type { InfractionType } from '../moderation/infraction.js';

export interface SpamConfig {
    enabled: boolean;
    threshold: number;
    windowMs: number;
    action: string;
    muteDurationMs: number;
    escalation: {
        enabled: boolean;
        multiplier: number;
        maxDurationMs: number;
    };
}

export interface DuplicateConfig {
    enabled: boolean;
    threshold: number;
    windowMs: number;
    action: string;
    similarity: number;
    ignoreCase: boolean;
    ignoreWhitespace: boolean;
}

export interface LinksConfig {
    enabled: boolean;
    action: string;
    whitelistMode: boolean;
    whitelist: string[];
    blacklist: string[];
    allowMedia: boolean;
    mediaExtensions: string[];
}

export interface InvitesConfig {
    enabled: boolean;
    action: string;
    whitelist: string[];
    bypassRoles: string[];
    patterns: RegExp[];
}

export interface MentionsConfig {
    enabled: boolean;
    userLimit: number;
    roleLimit: number;
    totalLimit: number;
    action: string;
    countEveryone: boolean;
}

export interface CapsConfig {
    enabled: boolean;
    percent: number;
    minLength: number;
    action: string;
    ignoreEmoji: boolean;
    ignoreCommands: boolean;
}

export interface EmojiConfig {
    enabled: boolean;
    limit: number;
    action: string;
    countCustom: boolean;
    countUnicode: boolean;
}

export interface NewAccountConfig {
    enabled: boolean;
    minAgeHours: number;
    action: string;
    restrictRole: string | null;
    sendDM: boolean;
    dmMessage: string;
}

export interface RaidConfig {
    enabled: boolean;
    joinThreshold: number;
    windowMs: number;
    action: string;
    autoUnlockMs: number;
    checkAccountAge: boolean;
    minAccountAgeDays: number;
    lockChannels: string[];
    verificationChannel: string | null;
}

export interface GlobalAutomodConfig {
    logChannel: string | null;
    bypassRoles: string[];
    ignoredChannels: string[];
    bypassUsers: string[];
    cleanupDelayMs: number;
    logMessageContent: boolean;
    maxAutomodWarnsBeforeMute: number;
    automodMuteDurationMs: number;
}

export interface AutomodConfig {
    spam: SpamConfig;
    duplicate: DuplicateConfig;
    links: LinksConfig;
    invites: InvitesConfig;
    mentions: MentionsConfig;
    caps: CapsConfig;
    emoji: EmojiConfig;
    newAccount: NewAccountConfig;
    raid: RaidConfig;
    global: GlobalAutomodConfig;
}

export interface WarningsConfig {
    defaultExpiryDays: number;
    maxActive: number;
    showCountInDM: boolean;
    sendDM: boolean;
}

export interface Threshold {
    warnCount: number;
    action: string;
    durationMs?: number;
    reason: string;
}

export interface MuteConfig {
    defaultDurationMs: number;
    maxDurationMs: number;
    minDurationMs: number;
    presets: Record<string, number>;
    sendDM: boolean;
}

export interface KickConfig {
    sendDM: boolean;
    includeInvite: boolean;
}

export interface BanConfig {
    defaultDeleteDays: number;
    maxDeleteDays: number;
    sendDM: boolean;
    includeAppealInfo: boolean;
    appealMessage: string | null;
}

export interface SoftbanConfig {
    deleteDays: number;
    sendDM: boolean;
}

export interface AutomodPunishmentConfig {
    warnReasonPrefix: string;
    trackSeparately: boolean;
    warnsBeforeMute: number;
    muteDurationMs: number;
    escalation: {
        enabled: boolean;
        durationMultiplier: number;
        maxDurationMs: number;
        resetAfterMs: number;
    };
}

export interface DMTemplateField {
    name: string;
    value: string;
}

export interface DMTemplate {
    title: string;
    description: string;
    fields: DMTemplateField[];
    footer?: string;
}

export interface PunishmentsConfig {
    warnings: WarningsConfig;
    defaultThresholds: Threshold[];
    mute: MuteConfig;
    kick: KickConfig;
    ban: BanConfig;
    softban: SoftbanConfig;
    defaultReasons: Record<string, string>;
    automod: AutomodPunishmentConfig;
    dmTemplates: Record<string, DMTemplate>;
}

export interface FilterSettings {
    defaultAction: string;
    ignoreCase: boolean;
    normalizeUnicode: boolean;
    checkLeetspeak: boolean;
    stripZalgo: boolean;
    minWordLength: number;
    logContent: boolean;
    logChannel: string | null;
}

export interface SeverityLevel {
    name: string;
    action: string;
    color: number;
}

export interface FilterWord {
    pattern: string;
    matchType: string;
    severity: number;
}

export interface FilterPreset {
    name: string;
    description: string;
    severity?: number;
    words: FilterWord[];
}

export interface FilterBypass {
    roles: string[];
    channels: string[];
    users: string[];
}

export interface FiltersConfig {
    settings: FilterSettings;
    matchTypes: {
        EXACT: string;
        CONTAINS: string;
        WORD: string;
        REGEX: string;
    };
    severityLevels: Record<number, SeverityLevel>;
    leetspeak: Record<string, string>;
    unicodeMap: Record<string, string>;
    zalgoPattern: RegExp;
    presets: Record<string, FilterPreset>;
    exemptPatterns: RegExp[];
    bypass: FilterBypass;
}

export type ActionType =
    | 'delete'
    | 'delete_warn'
    | 'warn'
    | 'mute'
    | 'kick'
    | 'ban';

export interface RateLimitConfig {
    window: number;
    max: number;
}

export interface CacheConfig {
    automodSettingsTTL: number;
    filtersTTL: number;
    warnCountTTL: number;
    recentJoinsTTL: number;
}

export interface ModerationConfig {
    automod: AutomodConfig;
    punishments: PunishmentsConfig;
    filters: FiltersConfig;
    INFRACTION_TYPES: Record<string, InfractionType>;
    ACTION_TYPES: Record<string, ActionType>;
    COLORS: Record<string, number>;
    EMOJIS: Record<string, string>;
    permissions: Record<string, string[]>;
    rateLimits: Record<string, RateLimitConfig>;
    cache: CacheConfig;
}
