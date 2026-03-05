import type { GuildMember } from 'discord.js';

export interface BanValidationResult {
    valid: boolean;
    error?: string;
    member?: GuildMember | null;
}

export interface KickValidationResult {
    valid: boolean;
    error?: string;
    member?: GuildMember | null;
}

export interface MuteValidationResult {
    valid: boolean;
    error?: string;
    member?: GuildMember | null;
}
