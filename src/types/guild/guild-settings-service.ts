import type { Snowflake } from 'discord.js';

export interface GuildSettings {
    guild_id: Snowflake;
    prefix: string;
    language: string;
    log_channel: Snowflake | null;
    mod_log_channel: Snowflake | null;
    welcome_channel: Snowflake | null;
    welcome_message: string | null;
    goodbye_message: string | null;
    auto_role: Snowflake | null;
    admin_roles: Snowflake[];
    mod_roles: Snowflake[];
    snipe_limit: number;
    delete_limit: number;
    music_channel: Snowflake | null;
    dj_role: Snowflake | null;
    volume: number;
    automod_enabled: boolean;
    spam_threshold: number;
    duplicate_threshold: number;
    mention_threshold: number;
    invite_filter: boolean;
    link_filter: boolean;
    caps_filter: boolean;
    caps_threshold: number;
    max_newlines: number;
    max_message_length: number;
    filter_words: string[];
    exempt_channels: Snowflake[];
    exempt_roles: Snowflake[];
    muted_role: Snowflake | null;
    raid_mode: boolean;
    lockdown: boolean;
    settings: Record<string, unknown>;
}
