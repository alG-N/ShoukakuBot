import type { Snowflake } from 'discord.js';

export interface ModLogSettings {
    guild_id?: string;
    log_channel_id: Snowflake | null;
    log_warns: boolean;
    log_mutes: boolean;
    log_kicks: boolean;
    log_bans: boolean;
    log_unbans: boolean;
    log_automod: boolean;
    log_filters: boolean;
    log_message_deletes: boolean;
    log_message_edits: boolean;
    log_member_joins: boolean;
    log_member_leaves: boolean;
    log_role_changes: boolean;
    log_nickname_changes: boolean;
    use_embeds: boolean;
    include_moderator: boolean;
    include_reason: boolean;
    created_at?: Date;
    updated_at?: Date;
}

export interface ModLogUpdateData {
    log_channel_id?: string | null;
    logChannelId?: string | null;
    log_warns?: boolean;
    logWarns?: boolean;
    log_mutes?: boolean;
    logMutes?: boolean;
    log_kicks?: boolean;
    logKicks?: boolean;
    log_bans?: boolean;
    logBans?: boolean;
    log_unbans?: boolean;
    logUnbans?: boolean;
    log_automod?: boolean;
    logAutomod?: boolean;
    log_filters?: boolean;
    logFilters?: boolean;
    log_message_deletes?: boolean;
    logMessageDeletes?: boolean;
    log_message_edits?: boolean;
    logMessageEdits?: boolean;
    log_member_joins?: boolean;
    logMemberJoins?: boolean;
    log_member_leaves?: boolean;
    logMemberLeaves?: boolean;
    log_role_changes?: boolean;
    logRoleChanges?: boolean;
    log_nickname_changes?: boolean;
    logNicknameChanges?: boolean;
    use_embeds?: boolean;
    useEmbeds?: boolean;
    include_moderator?: boolean;
    includeModerator?: boolean;
    include_reason?: boolean;
    includeReason?: boolean;
    [key: string]: unknown;
}

export type ModLogType =
    | 'warns'
    | 'mutes'
    | 'kicks'
    | 'bans'
    | 'unbans'
    | 'automod'
    | 'filters'
    | 'message_deletes'
    | 'message_edits'
    | 'member_joins'
    | 'member_leaves'
    | 'role_changes'
    | 'nickname_changes';
