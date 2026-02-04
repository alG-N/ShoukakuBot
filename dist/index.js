"use strict";
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
 * @version 4.1.0
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bot = void 0;
require("dotenv/config");
const discord_js_1 = require("discord.js");
// Core utilities (from src/core)
const index_js_1 = require("./core/index.js");
// DI Container & Service Registration
const container_js_1 = __importDefault(require("./container.js"));
const services_js_1 = require("./bootstrap/services.js");
// Services (resolved via container after registration)
const index_js_2 = require("./services/index.js");
const ShardBridge_js_1 = __importDefault(require("./services/guild/ShardBridge.js"));
// Configuration
const index_js_3 = require("./config/index.js");
// Database (PostgreSQL)
const postgres_js_1 = __importStar(require("./database/postgres.js"));
// Services resolved from container (set during start())
let commandReg;
let eventReg;
let redisCache;
let cacheService;
// APPLICATION INITIALIZATION
class AlterGoldenBot {
    client;
    rest;
    healthServer = null;
    constructor() {
        this.client = (0, index_js_1.createClient)();
        this.rest = new discord_js_1.REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
    }
    /**
     * Initialize and start the bot
     */
    async start() {
        try {
            index_js_1.logger.info('Startup', 'Initializing alterGolden v4.1...');
            // Initialize Sentry error tracking first
            index_js_1.sentry.initialize({
                release: '4.1.0',
                tags: { bot: 'alterGolden' }
            });
            // Start health check server
            this.startHealthServer();
            // Initialize database (PostgreSQL)
            await (0, postgres_js_1.initializeDatabase)();
            // Register services with DI container
            (0, services_js_1.registerServices)();
            // Boot core services (this initializes Redis)
            await this.bootServices();
            // Load commands
            this.loadCommands();
            // Load events
            this.loadEvents();
            // Setup interaction listener
            this.setupInteractionListener();
            // Initialize error handlers
            (0, index_js_1.initializeErrorHandlers)(this.client);
            // Initialize shutdown handlers (NEW: graceful shutdown)
            (0, index_js_1.initializeShutdownHandlers)(this.client);
            // Initialize Lavalink BEFORE login
            if (index_js_3.music.enabled) {
                this.initializeLavalink();
            }
            // Connect to Discord
            await this.connect();
            // After ready setup
            this.client.once(discord_js_1.Events.ClientReady, async () => {
                // Initialize logger with client
                index_js_1.logger.initialize(this.client);
                // Register health checks now that services are ready
                this.registerHealthChecks();
                index_js_1.health.setStatus('healthy');
                // Initialize Snipe Service
                index_js_2.snipeService.initialize(this.client);
                index_js_1.logger.info('Services', 'SnipeService initialized');
                // Initialize ShardBridge for cross-shard communication
                await ShardBridge_js_1.default.initialize(this.client);
                const shardInfo = ShardBridge_js_1.default.getShardInfo();
                index_js_1.logger.info('Services', `ShardBridge initialized (shard ${shardInfo.shardId}/${shardInfo.totalShards})`);
                // Deploy commands if enabled
                if (index_js_3.bot.autoDeploy) {
                    await this.deployCommands();
                }
                index_js_1.logger.info('Ready', `🚀 alterGolden is fully operational!`);
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            index_js_1.logger.critical('Startup', `Failed to start: ${message}`);
            index_js_1.sentry.captureException(error instanceof Error ? error : new Error(String(error)), { extra: { phase: 'startup' } });
            console.error(error);
            process.exit(1);
        }
    }
    /**
     * Start health check HTTP server
     */
    startHealthServer() {
        const port = parseInt(process.env.HEALTH_PORT || '3000');
        this.healthServer = index_js_1.health.startHealthServer(port);
    }
    /**
     * Boot services via DI container
     */
    async bootServices() {
        index_js_1.logger.info('Container', 'Booting services via DI container...');
        // Resolve core services from container
        redisCache = container_js_1.default.resolve('redisCache');
        cacheService = container_js_1.default.resolve('cacheService');
        commandReg = container_js_1.default.resolve('commandRegistry');
        eventReg = container_js_1.default.resolve('eventRegistry');
        // Initialize Redis
        try {
            const connected = await redisCache.initialize();
            if (connected) {
                // Connect unified CacheService to Redis
                cacheService.setRedis(redisCache.client);
                index_js_1.logger.info('Cache', 'Redis cache connected via container');
            }
            else {
                index_js_1.logger.info('Cache', 'Using in-memory cache (Redis not available)');
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            index_js_1.logger.warn('Cache', `Redis initialization failed: ${message}`);
        }
        index_js_1.logger.info('Container', 'All services booted successfully');
    }
    /**
     * Register health checks for all services
     */
    registerHealthChecks() {
        // Handle ESM default export for LavalinkService
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const lavalinkModule = index_js_3.music.enabled ? require('./services/music/LavalinkService') : null;
        const lavalinkService = lavalinkModule?.default || lavalinkModule;
        index_js_1.health.registerDefaultChecks({
            client: this.client,
            database: postgres_js_1.default,
            redis: redisCache,
            lavalink: lavalinkService,
            cacheService: cacheService
        });
    }
    /**
     * Load all commands
     */
    loadCommands() {
        // Load all commands from commands/ folder
        commandReg.loadCommands();
        // Attach to client for easy access
        this.client.commands = commandReg.commands;
        index_js_1.logger.info('Commands', `Loaded ${commandReg.size} commands`);
    }
    /**
     * Load all events
     */
    loadEvents() {
        // Load all events
        eventReg.loadEvents();
        // Register with client
        eventReg.registerWithClient(this.client);
        index_js_1.logger.info('Events', `Loaded ${eventReg.size} events`);
    }
    /**
     * Setup the main interaction listener
     */
    setupInteractionListener() {
        this.client.on(discord_js_1.Events.InteractionCreate, async (interaction) => {
            try {
                // Handle slash commands
                if (interaction.isChatInputCommand()) {
                    const command = commandReg.get(interaction.commandName);
                    if (!command) {
                        index_js_1.logger.warn('Interaction', `Unknown command: ${interaction.commandName}`);
                        return;
                    }
                    // Execute command via BaseCommand.execute()
                    // Handles defer, cooldown, validation, and metrics
                    await command.execute(interaction);
                }
                // Handle autocomplete
                else if (interaction.isAutocomplete()) {
                    const command = commandReg.get(interaction.commandName);
                    if (command?.autocomplete) {
                        await command.autocomplete(interaction);
                    }
                }
                // Handle buttons
                else if (interaction.isButton()) {
                    // Button handling logic
                    const [commandName] = interaction.customId.split('_');
                    const command = commandReg.get(commandName);
                    if (command?.handleButton) {
                        await command.handleButton(interaction);
                    }
                }
                // Handle modals
                else if (interaction.isModalSubmit()) {
                    const [commandName] = interaction.customId.split('_');
                    const command = (commandReg.getModalHandler(commandName) ||
                        commandReg.get(commandName));
                    if (command?.handleModal) {
                        await command.handleModal(interaction);
                    }
                }
                // Handle select menus
                else if (interaction.isStringSelectMenu()) {
                    const [commandName] = interaction.customId.split('_');
                    const command = commandReg.get(commandName);
                    if (command?.handleSelectMenu) {
                        await command.handleSelectMenu(interaction);
                    }
                }
            }
            catch (error) {
                // Ignore "Unknown interaction" errors (interaction expired/already handled)
                // This is normal for long-running commands or user clicking buttons after timeout
                const err = error;
                if (err.code === 10062) {
                    const id = interaction.isChatInputCommand() ? interaction.commandName :
                        'customId' in interaction ? interaction.customId : 'unknown';
                    index_js_1.logger.debug('Interaction', `Interaction expired for ${id}`);
                    return;
                }
                const message = error instanceof Error ? error.message : String(error);
                index_js_1.logger.error('Interaction', `Error handling interaction: ${message}`);
                console.error(error);
                // Try to respond with error
                try {
                    const errorMsg = { content: '❌ An error occurred.', ephemeral: true };
                    if ('replied' in interaction && 'deferred' in interaction) {
                        if (interaction.replied || interaction.deferred) {
                            await interaction.followUp(errorMsg);
                        }
                        else {
                            await interaction.reply(errorMsg);
                        }
                    }
                }
                catch {
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
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const lavalinkService = require('./services/music/LavalinkService').default;
            lavalinkService.preInitialize(this.client);
            lavalinkService.finalize();
            index_js_1.logger.info('Lavalink', 'Music service pre-initialized');
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            index_js_1.logger.warn('Lavalink', `Music service failed: ${message}`);
        }
    }
    /**
     * Deploy commands to Discord
     */
    async deployCommands() {
        try {
            const commands = commandReg.toJSON();
            index_js_1.logger.info('Deploy', `Deploying ${commands.length} commands...`);
            await this.rest.put(discord_js_1.Routes.applicationCommands(index_js_3.bot.clientId), { body: commands });
            index_js_1.logger.info('Deploy', `Successfully deployed ${commands.length} commands!`);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            index_js_1.logger.error('Deploy', `Failed to deploy commands: ${message}`);
        }
    }
    /**
     * Connect to Discord
     */
    async connect() {
        index_js_1.logger.info('Startup', 'Connecting to Discord...');
        await this.client.login(process.env.BOT_TOKEN);
    }
}
// ENTRY POINT
const bot_instance = new AlterGoldenBot();
exports.bot = bot_instance;
bot_instance.start().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
exports.default = { bot: bot_instance };
//# sourceMappingURL=index.js.map