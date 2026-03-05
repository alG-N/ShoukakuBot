/**
 * Command Registry - Application Layer
 * Centralized command registration and management
 * @module services/registry/CommandRegistry
 */

import { Collection } from 'discord.js';
import logger from '../../core/Logger.js';
import type { RegistryCommand } from '../../types/core/registry.js';

// COMMAND REGISTRY CLASS
class CommandRegistry {
    public commands: Collection<string, RegistryCommand> = new Collection();
    public modalHandlers: Map<string, RegistryCommand> = new Map();

    /**
     * Load commands from all sources
     */
    async loadCommands(): Promise<Collection<string, RegistryCommand>> {
        logger.info('CommandRegistry', 'Loading commands...');

        // Load all commands from commands/ folder
        await this._loadPresentationCommands();

        logger.info('CommandRegistry', `Loaded ${this.commands.size} commands`);
        return this.commands;
    }

    /**
     * Load commands from commands directory
     */
    private async _loadPresentationCommands(): Promise<void> {
        const categories = ['general', 'admin', 'owner', 'api', 'fun', 'music', 'video'];

        for (const category of categories) {
            try {
                const commands = await import(`../../commands/${category}/index.js`);

                // CJS dynamic import wraps module.exports as 'default'
                const commandExports = (commands.default || commands) as Record<string, unknown>;

                for (const [_name, command] of Object.entries(commandExports)) {
                    const cmd = (command as { default?: RegistryCommand }).default || command as RegistryCommand;
                    if (cmd?.data?.name) {
                        this.commands.set(cmd.data.name, cmd);
                        logger.info('CommandRegistry', `Loaded: ${cmd.data.name} (${category})`);

                        // Register modal handlers if present
                        if (cmd.modalHandler) {
                            this.modalHandlers.set(cmd.data.name, cmd);
                        }
                    }
                }
            } catch (error) {
                logger.error('CommandRegistry', `Error loading ${category}: ${(error as Error).message}`);
            }
        }
    }

    /**
     * Get a command by name
     */
    get(name: string): RegistryCommand | undefined {
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
    getModalHandler(commandName: string): RegistryCommand | undefined {
        return this.modalHandlers.get(commandName);
    }

    /**
     * Get commands by category
     */
    getByCategory(category: string): RegistryCommand[] {
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
    [Symbol.iterator](): IterableIterator<[string, RegistryCommand]> {
        return this.commands[Symbol.iterator]();
    }

    /**
     * Shutdown (used by container)
     */
    async shutdown(): Promise<void> {
        this.commands.clear();
        this.modalHandlers.clear();
        logger.info('CommandRegistry', 'Shutdown complete');
    }
}

// Create default instance
const commandRegistry = new CommandRegistry();

export { CommandRegistry };
export default commandRegistry;

// Type export for client usage
export { type RegistryCommand };




