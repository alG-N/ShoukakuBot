/**
 * Command Registry - Application Layer
 * Centralized command registration and management
 * @module services/registry/CommandRegistry
 */

import { Collection, type Client as DiscordClient } from 'discord.js';
import path from 'path';
import fs from 'fs';
// TYPES
interface Command {
    data: {
        name: string;
        toJSON?: () => unknown;
    };
    execute: (interaction: unknown) => Promise<void>;
    category?: string;
    modalHandler?: (interaction: unknown) => Promise<void>;
    autocomplete?: (interaction: unknown) => Promise<void>;
}

// COMMAND REGISTRY CLASS
class CommandRegistry {
    public commands: Collection<string, Command> = new Collection();
    public modalHandlers: Map<string, Command> = new Map();
    public buttonHandlers: Map<string, Command> = new Map();
    public selectMenuHandlers: Map<string, Command> = new Map();

    /**
     * Load commands from all sources
     */
    loadCommands(): Collection<string, Command> {
        console.log('[CommandRegistry] Loading commands...');

        // Load all commands from commands/ folder
        this._loadPresentationCommands();

        console.log(`[CommandRegistry] Loaded ${this.commands.size} commands`);
        return this.commands;
    }

    /**
     * Load commands from commands directory
     */
    private _loadPresentationCommands(): void {
        const categories = ['general', 'admin', 'owner', 'api', 'fun', 'music', 'video'];

        for (const category of categories) {
            try {
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const commands = require(`../../commands/${category}`);

                for (const [_name, command] of Object.entries(commands)) {
                    const cmd = command as Command;
                    if (cmd?.data?.name) {
                        this.commands.set(cmd.data.name, cmd);
                        console.log(`[CommandRegistry] Loaded: ${cmd.data.name} (${category})`);

                        // Register modal handlers if present
                        if (cmd.modalHandler) {
                            this.modalHandlers.set(cmd.data.name, cmd);
                        }
                    }
                }
            } catch (error) {
                console.error(`[CommandRegistry] Error loading ${category}:`, (error as Error).message);
            }
        }
    }

    /**
     * Get a command by name
     */
    get(name: string): Command | undefined {
        return this.commands.get(name);
    }

    /**
     * Check if a command exists
     */
    has(name: string): boolean {
        return this.commands.has(name);
    }

    /**
     * Get all commands as JSON for registration
     */
    toJSON(): unknown[] {
        return [...this.commands.values()].map(cmd => {
            if (cmd.data?.toJSON) {
                return cmd.data.toJSON();
            }
            return cmd.data;
        });
    }

    /**
     * Get modal handler for a command
     */
    getModalHandler(commandName: string): Command | undefined {
        return this.modalHandlers.get(commandName);
    }

    /**
     * Get commands by category
     */
    getByCategory(category: string): Command[] {
        return [...this.commands.values()].filter(cmd =>
            cmd.category?.toLowerCase() === category.toLowerCase()
        );
    }

    /**
     * Get command count
     */
    get size(): number {
        return this.commands.size;
    }

    /**
     * Iterator for commands
     */
    [Symbol.iterator](): IterableIterator<[string, Command]> {
        return this.commands[Symbol.iterator]();
    }

    /**
     * Shutdown (used by container)
     */
    async shutdown(): Promise<void> {
        this.commands.clear();
        this.modalHandlers.clear();
        this.buttonHandlers.clear();
        this.selectMenuHandlers.clear();
        console.log('[CommandRegistry] Shutdown complete');
    }
}

// Create default instance
const commandRegistry = new CommandRegistry();

export { CommandRegistry };
export default commandRegistry;

// Type export for client usage
export type { Command };
