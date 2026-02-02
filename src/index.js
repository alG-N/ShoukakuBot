/**
 * alterGolden Discord Bot
 * Main Entry Point
 * 
 * Professional utility bot with music, video download, API commands and moderation
 * 
 * Architecture:
 * - src/core/        - Core client & logging
 * - src/shared/      - Shared utilities, errors, cache, middleware
 * - src/config/      - Centralized configuration
 * - src/infrastructure/ - Database abstraction layer
 * - src/modules/     - Feature modules (music, video, api, fun)
 * - src/commands/    - Slash commands (presentation layer)
 * - src/events/      - Discord event handlers
 * - src/services/    - Application services
 * 
 * @author alterGolden Team
 * @version 4.0.0
 */

require('dotenv').config();
const { REST, Routes, Events } = require('discord.js');

// Core utilities (from src/core)
const { 
    createClient, 
    logger, 
    initializeShutdownHandlers, 
    initializeErrorHandlers,
    sentry,
    health
} = require('./core');

// Services
const { CommandRegistry, EventRegistry, SnipeService, RedisCache } = require('./services');
const commandRegistry = CommandRegistry;
const eventRegistry = EventRegistry;
const redisCache = RedisCache;

// Configuration
const { bot, music } = require('./config');

// Database (PostgreSQL)
const { initializeDatabase } = require('./database/admin');
const postgres = require('./database/postgres');

// ==========================================
// APPLICATION INITIALIZATION
// ==========================================

class AlterGoldenBot {
    constructor() {
        this.client = createClient();
        this.rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
        this.healthServer = null;
    }

    /**
     * Initialize and start the bot
     */
    async start() {
        try {
            logger.info('Startup', 'Initializing alterGolden v4.0...');

            // Initialize Sentry error tracking first
            sentry.initialize({
                release: '4.0.0',
                tags: { bot: 'alterGolden' }
            });

            // Start health check server
            this.startHealthServer();

            // Initialize database (PostgreSQL)
            await initializeDatabase();

            // Initialize Redis cache (optional, falls back to in-memory)
            await this.initializeCache();

            // Load commands
            this.loadCommands();

            // Load events
            this.loadEvents();

            // Setup interaction listener
            this.setupInteractionListener();

            // Initialize error handlers
            initializeErrorHandlers(this.client);

            // Initialize shutdown handlers (NEW: graceful shutdown)
            initializeShutdownHandlers(this.client);

            // Initialize Lavalink BEFORE login
            if (music.enabled) {
                this.initializeLavalink();
            }

            // Connect to Discord
            await this.connect();

            // After ready setup
            this.client.once(Events.ClientReady, async () => {
                // Initialize logger with client
                logger.initialize(this.client);
                
                // Register health checks now that services are ready
                this.registerHealthChecks();
                health.setStatus('healthy');
                
                // Initialize Snipe Service
                SnipeService.initialize(this.client);
                logger.info('Services', 'SnipeService initialized');

                // Deploy commands if enabled
                if (bot.autoDeploy) {
                    await this.deployCommands();
                }
                
                logger.info('Ready', `🚀 alterGolden is fully operational!`);
            });

        } catch (error) {
            logger.critical('Startup', `Failed to start: ${error.message}`);
            sentry.captureException(error, { extra: { phase: 'startup' } });
            console.error(error);
            process.exit(1);
        }
    }

    /**
     * Start health check HTTP server
     */
    startHealthServer() {
        const port = parseInt(process.env.HEALTH_PORT) || 3000;
        this.healthServer = health.startHealthServer(port);
    }

    /**
     * Register health checks for all services
     */
    registerHealthChecks() {
        health.registerDefaultChecks({
            client: this.client,
            database: postgres,
            redis: redisCache,
            lavalink: music.enabled ? require('./services/music/LavalinkService') : null
        });
    }

    /**
     * Initialize Redis cache (optional)
     */
    async initializeCache() {
        try {
            const connected = await redisCache.initialize();
            if (connected) {
                logger.info('Cache', 'Redis cache connected');
            } else {
                logger.info('Cache', 'Using in-memory cache (Redis not available)');
            }
        } catch (error) {
            logger.warn('Cache', `Redis initialization failed: ${error.message}`);
        }
    }

    /**
     * Load all commands
     */
    loadCommands() {
        // Load commands from feature modules AND presentation layer
        commandRegistry.loadCommands({ useLegacy: false, useModules: true });
        
        // Attach to client for easy access
        this.client.commands = commandRegistry.commands;
        
        logger.info('Commands', `Loaded ${commandRegistry.size} commands`);
    }

    /**
     * Load all events
     */
    loadEvents() {
        // Load events (no legacy mode)
        eventRegistry.loadEvents({ useLegacy: false });
        
        // Register with client
        eventRegistry.registerWithClient(this.client);
        
        logger.info('Events', `Loaded ${eventRegistry.size} events`);
    }

    /**
     * Setup the main interaction listener
     */
    setupInteractionListener() {
        this.client.on(Events.InteractionCreate, async (interaction) => {
            try {
                // Handle slash commands
                if (interaction.isChatInputCommand()) {
                    const command = commandRegistry.get(interaction.commandName);
                    
                    if (!command) {
                        logger.warn('Interaction', `Unknown command: ${interaction.commandName}`);
                        return;
                    }

                    // Auto-defer if command has deferReply enabled
                    if (command.deferReply && !interaction.replied && !interaction.deferred) {
                        await interaction.deferReply({ ephemeral: command.ephemeral ?? false });
                    }

                    // Execute command
                    if (command.run) {
                        await command.run(interaction);
                    } else if (command.execute) {
                        await command.execute(interaction);
                    }
                }
                
                // Handle autocomplete
                else if (interaction.isAutocomplete()) {
                    const command = commandRegistry.get(interaction.commandName);
                    
                    if (command?.autocomplete) {
                        await command.autocomplete(interaction);
                    }
                }
                
                // Handle buttons
                else if (interaction.isButton()) {
                    // Button handling logic
                    const [commandName] = interaction.customId.split('_');
                    const command = commandRegistry.get(commandName);
                    
                    if (command?.handleButton) {
                        await command.handleButton(interaction);
                    }
                }
                
                // Handle modals
                else if (interaction.isModalSubmit()) {
                    const [commandName] = interaction.customId.split('_');
                    const command = commandRegistry.getModalHandler(commandName) || 
                                   commandRegistry.get(commandName);
                    
                    if (command?.handleModal) {
                        await command.handleModal(interaction);
                    }
                }
                
                // Handle select menus
                else if (interaction.isStringSelectMenu()) {
                    const [commandName] = interaction.customId.split('_');
                    const command = commandRegistry.get(commandName);
                    
                    if (command?.handleSelectMenu) {
                        await command.handleSelectMenu(interaction);
                    }
                }
                
            } catch (error) {
                // Ignore "Unknown interaction" errors (interaction expired/already handled)
                // This is normal for long-running commands or user clicking buttons after timeout
                if (error.code === 10062) {
                    logger.debug('Interaction', `Interaction expired for ${interaction.commandName || interaction.customId || 'unknown'}`);
                    return;
                }
                
                logger.error('Interaction', `Error handling interaction: ${error.message}`);
                console.error(error);
                
                // Try to respond with error
                try {
                    const errorMsg = { content: '❌ An error occurred.', ephemeral: true };
                    if (interaction.replied || interaction.deferred) {
                        await interaction.followUp(errorMsg);
                    } else {
                        await interaction.reply(errorMsg);
                    }
                } catch (e) {
                    // Ignore - interaction likely expired
                }
            }
        });
    }

    /**
     * Initialize Lavalink music service
     */
    initializeLavalink() {
        try {
            const lavalinkService = require('./services/music/LavalinkService');
            lavalinkService.preInitialize(this.client);
            lavalinkService.finalize();
            logger.info('Lavalink', 'Music service pre-initialized');
        } catch (error) {
            logger.warn('Lavalink', `Music service failed: ${error.message}`);
        }
    }

    /**
     * Deploy commands to Discord
     */
    async deployCommands() {
        try {
            const commands = commandRegistry.toJSON();
            
            logger.info('Deploy', `Deploying ${commands.length} commands...`);
            
            await this.rest.put(
                Routes.applicationCommands(bot.clientId),
                { body: commands }
            );
            
            logger.info('Deploy', `Successfully deployed ${commands.length} commands!`);
        } catch (error) {
            logger.error('Deploy', `Failed to deploy commands: ${error.message}`);
        }
    }

    /**
     * Connect to Discord
     */
    async connect() {
        logger.info('Startup', 'Connecting to Discord...');
        await this.client.login(process.env.BOT_TOKEN);
    }
}

// ==========================================
// ENTRY POINT
// ==========================================

const bot_instance = new AlterGoldenBot();
bot_instance.start().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});

// Export for external access
module.exports = { bot: bot_instance };
