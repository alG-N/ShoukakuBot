import type {
    ChatInputCommandInteraction,
    Client,
    Guild,
    GuildMember,
    PermissionResolvable,
    User
} from 'discord.js';

export type CommandCategoryType = 'general' | 'admin' | 'owner' | 'music' | 'video' | 'api' | 'fun';

export interface CommandOptions {
    category?: CommandCategoryType;
    cooldown?: number;
    ownerOnly?: boolean;
    adminOnly?: boolean;
    guildOnly?: boolean;
    nsfw?: boolean;
    userPermissions?: PermissionResolvable[];
    botPermissions?: PermissionResolvable[];
    deferReply?: boolean;
    ephemeral?: boolean;
}

export interface CooldownResult {
    onCooldown: boolean;
    remaining?: number;
}

export interface CommandContext {
    client: Client;
    guild: Guild | null;
    user: User;
    member: GuildMember | null;
}

export interface CommandData {
    name: string;
    toJSON: () => unknown;
}

export type RunCommand = (interaction: ChatInputCommandInteraction, context?: CommandContext) => Promise<void>;
