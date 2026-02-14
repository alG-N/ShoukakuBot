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

import 'dotenv/config';

// Validate environment variables FIRST — fail fast on missing config
import { validateOrExit } from './config/validation.js';
validateOrExit();

import { REST, Routes, Events, Client, Interaction, ChatInputCommandInteraction, AutocompleteInteraction, ButtonInteraction, ModalSubmitInteraction, StringSelectMenuInteraction } from 'discord.js';
import http from 'http';

// Core utilities (from src/core)
import { 
    createClient, 
    logger, 
    initializeShutdownHandlers, 
    initializeErrorHandlers,
    sentry,
    health,
    gracefulDegradation
} from './core/index.js';

// DI Container & Service Registration
import container from './container.js';
import { registerServices } from './bootstrap/services.js';

// Services (resolved via container after registration)
import { snipeService as SnipeService } from './services/index.js';
import shardBridge from './services/guild/ShardBridge.js';

// Import types for container resolution
import type { CommandRegistry } from './services/registry/CommandRegistry.js';
import type { EventRegistry } from './services/registry/EventRegistry.js';
import type { RedisCache } from './services/guild/RedisCache.js';
import type { CacheService } from './cache/CacheService.js';

// Configuration
import { bot, music } from './config/index.js';

// Database (PostgreSQL)
import postgres, { initializeDatabase } from './database/postgres.js';

// Services resolved from container (set during start())
let commandReg: CommandRegistry;
let eventReg: EventRegistry;
let redisCache: RedisCache;
let cacheService: CacheService;
// Types
interface Command {
    data?: { name: string };
    deferReply?: boolean;
    ephemeral?: boolean;
    execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
    autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
    handleButton?: (interaction: ButtonInteraction) => Promise<void>;
    handleModal?: (interaction: ModalSubmitInteraction) => Promise<void>;
    handleSelectMenu?: (interaction: StringSelectMenuInteraction) => Promise<void>;
}

interface ClientWithCommands extends Client {
    commands?: Map<string, Command>;
}
// APPLICATION INITIALIZATION
class AlterGoldenBot {
    public client: ClientWithCommands;
    private rest: REST;
    private healthServer: http.Server | null = null;

    constructor() {
        this.client = createClient() as ClientWithCommands;
        this.rest = new REST({ version: '10', timeout: 120000 }).setToken(process.env.BOT_TOKEN!);
    }

    /**
     * Initialize and start the bot
     */
    async start(): Promise<void> {
        try {
            logger.info('Startup', 'Initializing alterGolden v4.1...');

            // Initialize Sentry error tracking first
            sentry.initialize({
                release: '4.1.0',
                tags: { bot: 'alterGolden' }
            });

            // Start health check server
            this.startHealthServer();

            // Initialize database (PostgreSQL)
            await initializeDatabase();

            // Register services with DI container
            registerServices();
            
            // Boot core services (this initializes Redis)
            await this.bootServices();

            // Load commands
            await this.loadCommands();

            // Load events
            await this.loadEvents();

            // Setup interaction listener
            this.setupInteractionListener();

            // Initialize error handlers
            initializeErrorHandlers(this.client);

            // Initialize shutdown handlers (NEW: graceful shutdown)
            initializeShutdownHandlers(this.client);

            // Initialize Lavalink BEFORE login
            if (music.enabled) {
                await this.initializeLavalink();
            }

            // Connect to Discord
            await this.connect();

            // After ready setup
            this.client.once(Events.ClientReady, async () => {
                // Initialize logger with client
                logger.initialize(this.client);
                
                // Set shard ID for shard-scoped Redis keys and Sentry tags
                const shardId = this.client.shard?.ids[0] ?? 0;
                gracefulDegradation.setShardId(shardId);
                sentry.setShardId(shardId);
                
                // Register health checks now that services are ready
                await this.registerHealthChecks();
                health.setStatus('healthy');
                
                // Initialize Snipe Service
                SnipeService.initialize(this.client);
                logger.info('Services', 'SnipeService initialized');

                // Initialize ShardBridge for cross-shard communication
                await shardBridge.initialize(this.client);
                const shardInfo = shardBridge.getShardInfo();
                logger.info('Services', `ShardBridge initialized (shard ${shardInfo.shardId}/${shardInfo.totalShards})`);

                // Deploy commands if enabled
                if (bot.autoDeploy) {
                    await this.deployCommands();
                }
                
                logger.info('Ready', `🚀 alterGolden is fully operational!`);

                // Send startup summary to Discord log channel
                const guilds = this.client.guilds.cache.size;
                const users = this.client.guilds.cache.reduce((a, g) => a + g.memberCount, 0);
                const commands = commandReg.size;
                const shardLabel = this.client.shard ? `Shard ${shardId}/${this.client.shard.count}` : 'No sharding';
                await logger.discord('SUCCESS', '🚀 Bot Started', 
                    `**alterGolden v4.1** is now online and ready!`, {
                    'Guilds': `${guilds}`,
                    'Users': `~${users.toLocaleString()}`,
                    'Commands': `${commands}`,
                    'Shard': shardLabel,
                    'Node.js': process.version,
                    'Uptime': `Started at <t:${Math.floor(Date.now() / 1000)}:F>`
                });
            });

        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger.critical('Startup', `Failed to start: ${message}`);
            sentry.captureException(error instanceof Error ? error : new Error(String(error)), { extra: { phase: 'startup' } });
            console.error(error);
            process.exit(1);
        }
    }

    /**
     * Start health check HTTP server
     */
    private startHealthServer(): void {
        const basePort = parseInt(process.env.HEALTH_PORT || '3000');
        const shardId = this.client.shard?.ids[0] ?? 0;
        const port = basePort + shardId;
        this.healthServer = health.startHealthServer(port);
    }

    /**
     * Boot services via DI container
     */
    private async bootServices(): Promise<void> {
        logger.info('Container', 'Booting services via DI container...');
        
        // Resolve core services from container
        redisCache = container.resolve<RedisCache>('redisCache');
        cacheService = container.resolve<CacheService>('cacheService');
        commandReg = container.resolve<CommandRegistry>('commandRegistry');
        eventReg = container.resolve<EventRegistry>('eventRegistry');
        
        // Initialize Redis
        try {
            const connected = await redisCache.initialize();
            if (connected) {
                // Connect unified CacheService to Redis
                cacheService.setRedis(redisCache.client);
                logger.info('Cache', 'Redis cache connected via container');
            } else {
                logger.info('Cache', 'Using in-memory cache (Redis not available)');
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger.warn('Cache', `Redis initialization failed: ${message}`);
        }
        
        logger.info('Container', 'All services booted successfully');
    }

    /**
     * Register health checks for all services
     */
    private async registerHealthChecks(): Promise<void> {
        // Dynamic import LavalinkService
        let lavalinkService: { getNodeStatus?: () => { ready?: boolean; nodes?: unknown[]; activeConnections?: number } } | undefined;
        if (music.enabled) {
            const lavalinkModule = await import('./services/music/core/LavalinkService.js');
            const mod = lavalinkModule.default as Record<string, unknown>;
            lavalinkService = ((mod && typeof mod === 'object' && 'default' in mod) ? mod.default : mod) as typeof lavalinkService;
        }
        
        health.registerDefaultChecks({
            client: this.client,
            database: postgres,
            redis: redisCache as { isConnected: boolean; client: { ping: () => Promise<unknown> } },
            lavalink: lavalinkService,
            cacheService: cacheService
        });
    }

    /**
     * Load all commands
     */
    private async loadCommands(): Promise<void> {
        // Load all commands from commands/ folder
        await commandReg.loadCommands();
        
        // Attach to client for easy access
        this.client.commands = commandReg.commands;
        
        logger.info('Commands', `Loaded ${commandReg.size} commands`);
    }

    /**
     * Load all events
     */
    private async loadEvents(): Promise<void> {
        // Load all events
        await eventReg.loadEvents();
        
        // Register with client
        eventReg.registerWithClient(this.client);
        
        logger.info('Events', `Loaded ${eventReg.size} events`);
    }

    /**
     * Setup the main interaction listener
     */
    private setupInteractionListener(): void {
        this.client.on(Events.InteractionCreate, async (interaction: Interaction) => {
            try {
                // Handle slash commands
                if (interaction.isChatInputCommand()) {
                    const command = commandReg.get(interaction.commandName) as Command | undefined;
                    
                    if (!command) {
                        logger.warn('Interaction', `Unknown command: ${interaction.commandName}`);
                        return;
                    }

                    // Execute command via BaseCommand.execute()
                    // Handles defer, cooldown, validation, and metrics
                    await command.execute(interaction);
                }
                
                // Handle autocomplete
                else if (interaction.isAutocomplete()) {
                    const command = commandReg.get(interaction.commandName) as Command | undefined;
                    
                    if (command?.autocomplete) {
                        await command.autocomplete(interaction);
                    }
                }
                
                // Handle buttons
                else if (interaction.isButton()) {
                    // Button handling logic
                    const [commandName] = interaction.customId.split('_');
                    const command = commandReg.get(commandName) as Command | undefined;
                    
                    if (command?.handleButton) {
                        await command.handleButton(interaction);
                    }
                }
                
                // Handle modals
                else if (interaction.isModalSubmit()) {
                    const [commandName] = interaction.customId.split('_');
                    const command = (commandReg.getModalHandler(commandName) || 
                                   commandReg.get(commandName)) as Command | undefined;
                    
                    if (command?.handleModal) {
                        await command.handleModal(interaction);
                    }
                }
                
                // Handle select menus
                else if (interaction.isStringSelectMenu()) {
                    const [commandName] = interaction.customId.split('_');
                    const command = commandReg.get(commandName) as Command | undefined;
                    
                    if (command?.handleSelectMenu) {
                        await command.handleSelectMenu(interaction);
                    }
                }
                
            } catch (error) {
                // Ignore "Unknown interaction" errors (interaction expired/already handled)
                // This is normal for long-running commands or user clicking buttons after timeout
                const err = error as { code?: number };
                if (err.code === 10062) {
                    const id = interaction.isChatInputCommand() ? interaction.commandName : 
                               'customId' in interaction ? interaction.customId : 'unknown';
                    logger.debug('Interaction', `Interaction expired for ${id}`);
                    return;
                }
                
                const message = error instanceof Error ? error.message : String(error);
                logger.error('Interaction', `Error handling interaction: ${message}`);
                console.error(error);
                
                // Try to respond with error
                try {
                    const errorMsg = { content: '❌ An error occurred.', ephemeral: true };
                    if ('replied' in interaction && 'deferred' in interaction) {
                        if (interaction.replied || interaction.deferred) {
                            await interaction.followUp(errorMsg);
                        } else {
                            await interaction.reply(errorMsg);
                        }
                    }
                } catch {
                    // Ignore - interaction likely expired
                }
            }
        });
    }

    /**
     * Initialize Lavalink music service
     */
    private async initializeLavalink(): Promise<void> {
        try {
            const lavalinkModule = await import('./services/music/core/LavalinkService.js');
            const mod = lavalinkModule.default as Record<string, unknown>;
            const lavalinkService = ((mod && typeof mod === 'object' && 'default' in mod) ? mod.default : mod) as { preInitialize: (client: unknown) => void };
            lavalinkService.preInitialize(this.client);
            logger.info('Lavalink', 'Music service pre-initialized');
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger.warn('Lavalink', `Music service failed: ${message}`);
        }
    }

    /**
     * Deploy commands to Discord
     */
    private async deployCommands(): Promise<void> {
        try {
            const commands = commandReg.toJSON();
            
            logger.info('Deploy', `Deploying ${commands.length} commands...`);
            
            await this.rest.put(
                Routes.applicationCommands(bot.clientId),
                { body: commands }
            );
            
            logger.info('Deploy', `Successfully deployed ${commands.length} commands!`);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger.error('Deploy', `Failed to deploy commands: ${message}`);
        }
    }

    /**
     * Connect to Discord
     */
    private async connect(): Promise<void> {
        logger.info('Startup', 'Connecting to Discord...');
        await this.client.login(process.env.BOT_TOKEN);
    }
}
// ENTRY POINT
// Guard: only start the bot when this file is the entry point
// Prevents accidental startup when imported by tests or tools
let bot_instance: AlterGoldenBot | undefined;

const isEntryPoint = typeof require !== 'undefined'
    ? require.main === module
    : process.argv[1]?.replace(/\\/g, '/').endsWith('/index.js') ||
      process.argv[1]?.replace(/\\/g, '/').endsWith('/index.ts');

if (isEntryPoint || process.env.BOT_START === 'true') {
    bot_instance = new AlterGoldenBot();
    bot_instance.start().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

// Export for external access
export { bot_instance as bot, AlterGoldenBot };
export default { bot: bot_instance };
