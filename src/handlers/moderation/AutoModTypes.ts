/**
 * AutoMod Command — Shared Type Definitions
 * Extracted from automod.ts for modularity
 * @module handlers/moderation/AutoModTypes
 */

export interface AutoModSettings {
    enabled: boolean;
    spam_enabled?: boolean;
    duplicate_enabled?: boolean;
    links_enabled?: boolean;
    invites_enabled?: boolean;
    mention_enabled?: boolean;
    caps_enabled?: boolean;
    filter_enabled?: boolean;
    filtered_words?: string[];
    spam_threshold?: number;
    spam_interval?: number;
    duplicate_threshold?: number;
    mention_limit?: number;
    caps_percentage?: number;
    mute_duration?: number;
    new_account_age_hours?: number;
    spam_action?: string;
    duplicate_action?: string;
    links_action?: string;
    invites_action?: string;
    mention_action?: string;
    caps_action?: string;
    new_account_action?: string;
    auto_warn?: boolean;
    warn_threshold?: number;
    warn_reset_hours?: number;
    warn_action?: string;
    ignored_channels?: string[];
    ignored_roles?: string[];
    links_whitelist?: string[];
    [key: string]: unknown;
}

export interface AutoModService {
    getSettings: (guildId: string) => Promise<AutoModSettings>;
    updateSettings: (guildId: string, settings: Partial<AutoModSettings>) => Promise<void>;
}

export interface ModerationConfig {
    COLORS: Record<string, number>;
}
