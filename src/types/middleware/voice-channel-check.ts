import type {
    ButtonInteraction,
    ChatInputCommandInteraction,
    StringSelectMenuInteraction
} from 'discord.js';

export interface VoiceCheckResult {
    valid: boolean;
    error?: string;
}

export type MusicInteraction = ChatInputCommandInteraction | ButtonInteraction | StringSelectMenuInteraction;
