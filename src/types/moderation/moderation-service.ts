import type { GuildMember, User } from 'discord.js';

export interface ModAction {
    type: string;
    target: GuildMember | User | { user?: User; id: string };
    moderator: GuildMember;
    reason: string;
    duration?: number;
    deleteMessageDays?: number;
    count?: number;
    channel?: string;
    filters?: string;
}

export interface ModerationServiceConfig {
    COLORS: {
        SUCCESS: number;
        ERROR: number;
        WARNING: number;
        MODERATION: number;
    };
    DEFAULT_REASONS: {
        KICK: string;
        MUTE: string;
        BAN: string;
    };
    LOG_ACTIONS: {
        KICK: string;
        MUTE: string;
        UNMUTE: string;
        BAN: string;
        UNBAN: string;
        DELETE: string;
    };
    MAX_MUTE_DURATION_MS: number;
    DURATION_PRESETS: Record<string, number>;
}
