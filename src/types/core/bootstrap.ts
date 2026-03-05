import type {
    AutocompleteInteraction,
    ButtonInteraction,
    ChatInputCommandInteraction,
    Client,
    ModalSubmitInteraction,
    StringSelectMenuInteraction
} from 'discord.js';

export interface BootstrapCommand {
    data?: { name: string };
    deferReply?: boolean;
    ephemeral?: boolean;
    execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
    autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
    handleButton?: (interaction: ButtonInteraction) => Promise<void>;
    handleModal?: (interaction: ModalSubmitInteraction) => Promise<void>;
    handleSelectMenu?: (interaction: StringSelectMenuInteraction) => Promise<void>;
}

export interface ClientWithCommands extends Client {
    commands?: Map<string, BootstrapCommand>;
}
