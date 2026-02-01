/**
 * Command Registry - Application Layer
 * Centralized command registration and management
 * @module application/CommandRegistry
 */

const { Collection } = require('discord.js');
const path = require('path');
const fs = require('fs');

/**
 * Command Registry for managing slash commands
 */
class CommandRegistry {
    constructor() {
        /** @type {Collection<string, Object>} */
        this.commands = new Collection();
        
        /** @type {Map<string, Object>} */
        this.modalHandlers = new Map();
        
        /** @type {Map<string, Object>} */
        this.buttonHandlers = new Map();
        
        /** @type {Map<string, Object>} */
        this.selectMenuHandlers = new Map();
    }

    /**
     * Load commands from all sources
     * @param {Object} options - Load options
     * @param {boolean} [options.useLegacy=true] - Also load legacy commands
     * @param {boolean} [options.useModules=true] - Load from feature modules
     * @returns {Collection} Loaded commands
     */
    loadCommands(options = { useLegacy: true }) {
        console.log('[CommandRegistry] Loading commands...');
        
        // Load all commands from commands/ folder
        this._loadPresentationCommands();
        
        // Load legacy commands if enabled
        if (options.useLegacy) {
            this._loadLegacyCommands();
        }
        
        console.log(`[CommandRegistry] Loaded ${this.commands.size} commands`);
        return this.commands;
    }

    /**
     * Load commands from commands directory
     * @private
     */
    _loadPresentationCommands() {
        // All commands are now in commands/ folder including music and video
        const categories = ['general', 'admin', 'owner', 'api', 'fun', 'music', 'video'];
        
        for (const category of categories) {
            try {
                const commands = require(`../../commands/${category}`);
                
                for (const [name, command] of Object.entries(commands)) {
                    if (command?.data?.name) {
                        this.commands.set(command.data.name, command);
                        console.log(`[CommandRegistry] Loaded: ${command.data.name} (${category})`);
                        
                        // Register modal handlers if present
                        if (command.modalHandler) {
                            this.modalHandlers.set(command.data.name, command);
                        }
                        
                        // Register autocomplete handlers if present
                        if (command.autocomplete) {
                            // Commands with autocomplete are stored in commands collection
                        }
                    }
                }
            } catch (error) {
                console.error(`[CommandRegistry] Error loading ${category}:`, error.message);
            }
        }
    }

    /**
     * Load legacy commands from commands folder
     * @private
     */
    _loadLegacyCommands() {
        const commandsPath = path.join(__dirname, '..', '..', 'commands');
        
        if (!fs.existsSync(commandsPath)) {
            return;
        }

        const categories = fs.readdirSync(commandsPath);
        
        for (const category of categories) {
            const categoryPath = path.join(commandsPath, category);
            
            if (!fs.statSync(categoryPath).isDirectory()) continue;
            
            const commandFiles = fs.readdirSync(categoryPath)
                .filter(f => f.endsWith('.js'));
            
            for (const file of commandFiles) {
                try {
                    const command = require(path.join(categoryPath, file));
                    
                    if (command?.data?.name) {
                        // Only add if not already loaded from presentation layer
                        if (!this.commands.has(command.data.name)) {
                            this.commands.set(command.data.name, command);
                            console.log(`[CommandRegistry] Loaded legacy: ${command.data.name}`);
                        }
                    }
                } catch (error) {
                    console.error(`[CommandRegistry] Error loading ${file}:`, error.message);
                }
            }
        }
    }

    /**
     * Get a command by name
     * @param {string} name - Command name
     * @returns {Object|undefined} Command or undefined
     */
    get(name) {
        return this.commands.get(name);
    }

    /**
     * Check if a command exists
     * @param {string} name - Command name
     * @returns {boolean}
     */
    has(name) {
        return this.commands.has(name);
    }

    /**
     * Get all commands as JSON for registration
     * @returns {Array} Command JSON array
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
     * @param {string} commandName - Command name
     * @returns {Object|undefined}
     */
    getModalHandler(commandName) {
        return this.modalHandlers.get(commandName);
    }

    /**
     * Get commands by category
     * @param {string} category - Category name
     * @returns {Array} Commands in category
     */
    getByCategory(category) {
        return [...this.commands.values()].filter(cmd => 
            cmd.category?.toLowerCase() === category.toLowerCase()
        );
    }

    /**
     * Get command count
     * @returns {number}
     */
    get size() {
        return this.commands.size;
    }

    /**
     * Iterator for commands
     * @returns {Iterator}
     */
    [Symbol.iterator]() {
        return this.commands[Symbol.iterator]();
    }
}

module.exports = new CommandRegistry();
