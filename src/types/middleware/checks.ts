import type {
    ButtonInteraction,
    ChatInputCommandInteraction,
    EmbedBuilder
} from 'discord.js';

export interface AccessValidationResult {
    valid: boolean;
    error?: string;
}

export interface AccessCheckResult {
    blocked: boolean;
    embed?: EmbedBuilder;
}

export interface MaintenanceCheckResult {
    inMaintenance: boolean;
    embed?: EmbedBuilder;
}

export type AnyInteraction = ChatInputCommandInteraction | ButtonInteraction;

export type AccessTypeValue = 'public' | 'sub' | 'main' | 'both' | 'admin' | 'owner' | 'dj' | 'nsfw';
