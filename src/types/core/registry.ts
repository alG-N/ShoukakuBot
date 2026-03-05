import type { Client as DiscordClient } from 'discord.js';

export interface RegistryCommand {
    data: {
        name: string;
        toJSON?: () => unknown;
    };
    execute: (interaction: unknown) => Promise<void>;
    category?: string;
    modalHandler?: (interaction: unknown) => Promise<void>;
    autocomplete?: (interaction: unknown) => Promise<void>;
}

export interface Event {
    name: string;
    once?: boolean;
    execute: (client: DiscordClient, ...args: unknown[]) => Promise<void> | void;
    safeExecute?: (client: DiscordClient, ...args: unknown[]) => Promise<void>;
}
