"use strict";
/**
 * Command Registry - Application Layer
 * Centralized command registration and management
 * @module services/registry/CommandRegistry
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandRegistry = void 0;
const discord_js_1 = require("discord.js");
// COMMAND REGISTRY CLASS
class CommandRegistry {
    commands = new discord_js_1.Collection();
    modalHandlers = new Map();
    buttonHandlers = new Map();
    selectMenuHandlers = new Map();
    /**
     * Load commands from all sources
     */
    loadCommands() {
        console.log('[CommandRegistry] Loading commands...');
        // Load all commands from commands/ folder
        this._loadPresentationCommands();
        console.log(`[CommandRegistry] Loaded ${this.commands.size} commands`);
        return this.commands;
    }
    /**
     * Load commands from commands directory
     */
    _loadPresentationCommands() {
        const categories = ['general', 'admin', 'owner', 'api', 'fun', 'music', 'video'];
        for (const category of categories) {
            try {
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const commands = require(`../../commands/${category}`);
                for (const [_name, command] of Object.entries(commands)) {
                    const cmd = command;
                    if (cmd?.data?.name) {
                        this.commands.set(cmd.data.name, cmd);
                        console.log(`[CommandRegistry] Loaded: ${cmd.data.name} (${category})`);
                        // Register modal handlers if present
                        if (cmd.modalHandler) {
                            this.modalHandlers.set(cmd.data.name, cmd);
                        }
                    }
                }
            }
            catch (error) {
                console.error(`[CommandRegistry] Error loading ${category}:`, error.message);
            }
        }
    }
    /**
     * Get a command by name
     */
    get(name) {
        return this.commands.get(name);
    }
    /**
     * Check if a command exists
     */
    has(name) {
        return this.commands.has(name);
    }
    /**
     * Get all commands as JSON for registration
     */
    toJSON() {
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
    getModalHandler(commandName) {
        return this.modalHandlers.get(commandName);
    }
    /**
     * Get commands by category
     */
    getByCategory(category) {
        return [...this.commands.values()].filter(cmd => cmd.category?.toLowerCase() === category.toLowerCase());
    }
    /**
     * Get command count
     */
    get size() {
        return this.commands.size;
    }
    /**
     * Iterator for commands
     */
    [Symbol.iterator]() {
        return this.commands[Symbol.iterator]();
    }
    /**
     * Shutdown (used by container)
     */
    async shutdown() {
        this.commands.clear();
        this.modalHandlers.clear();
        this.buttonHandlers.clear();
        this.selectMenuHandlers.clear();
        console.log('[CommandRegistry] Shutdown complete');
    }
}
exports.CommandRegistry = CommandRegistry;
// Create default instance
const commandRegistry = new CommandRegistry();
exports.default = commandRegistry;
//# sourceMappingURL=CommandRegistry.js.map