export type AutoModActionType = 'warn' | 'mute' | 'kick' | 'ban' | 'delete' | 'delete_warn' | 'timeout';

export interface AutoModSettings {
    guild_id?: string;
    guildId?: string;
    enabled: boolean;

    filter_enabled?: boolean;
    filtered_words?: string[];

    spam_enabled?: boolean;
    spam_threshold?: number;
    spam_interval?: number;
    spam_window_ms?: number;
    spam_action?: AutoModActionType | string;
    spam_mute_duration_ms?: number;

    duplicate_enabled?: boolean;
    duplicate_threshold?: number;
    duplicate_window_ms?: number;
    duplicate_action?: AutoModActionType | string;

    links_enabled?: boolean;
    links_action?: AutoModActionType | string;
    links_whitelist?: string[];

    invites_enabled?: boolean;
    invites_action?: AutoModActionType | string;
    invites_whitelist?: string[];

    mention_enabled?: boolean;
    mention_limit?: number;
    mention_action?: AutoModActionType | string;

    caps_enabled?: boolean;
    caps_percent?: number;
    caps_percentage?: number;
    caps_min_length?: number;
    caps_action?: AutoModActionType | string;

    new_account_enabled?: boolean;
    new_account_age_hours?: number;
    new_account_action?: AutoModActionType | string;

    raid_enabled?: boolean;
    raid_join_threshold?: number;
    raid_window_ms?: number;
    raid_action?: AutoModActionType | string;
    raid_auto_unlock_ms?: number;

    ignored_channels?: string[];
    ignored_roles?: string[];
    ignoredChannels?: string[];
    ignoredRoles?: string[];
    log_channel_id?: string | null;

    auto_warn?: boolean;
    mute_duration?: number;
    default_action?: AutoModActionType | string;
    warn_threshold?: number;
    warn_action?: AutoModActionType | string;
    warn_reset_hours?: number;

    created_at?: Date | string;
    updated_at?: Date | string;
    updatedAt?: Date | string;

    [key: string]: unknown;
}
