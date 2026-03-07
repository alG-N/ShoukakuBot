import 'dotenv/config';

import { validateOrExit } from './config/validation.js';
validateOrExit();

import { REST, Routes, Events, Interaction } from 'discord.js';
import type { BootstrapCommand, ClientWithCommands } from './types/core/bootstrap.js';

import { 
    createClient, 
    logger, 
    initializeShutdownHandlers, 
    initializeErrorHandlers,
    sentry,
    health,
    gracefulDegradation
} from './core/index.js';

import container from './container.js';
import { registerServices } from './bootstrap/services.js';

import { snipeService as SnipeService } from './services/index.js';
import shardBridge from './services/guild/ShardBridge.js';

import type { CommandRegistry } from './services/registry/CommandRegistry.js';
import type { EventRegistry } from './services/registry/EventRegistry.js';
import type { RedisCache } from './services/guild/RedisCache.js';
import type { CacheService } from './cache/CacheService.js';

import { bot, music } from './config/index.js';

import postgres, { initializeDatabase } from './database/postgres.js';

let commandReg: CommandRegistry;
let eventReg: EventRegistry;
let redisCache: RedisCache;
let cacheService: CacheService;

class ShoukakuBot {
    public client: ClientWithCommands;
    private rest: REST;

    constructor() {
        this.client = createClient() as ClientWithCommands;
        this.rest = new REST({ version: '10', timeout: 120000 }).setToken(process.env.BOT_TOKEN!);
    }

    async start(): Promise<void> {
        try {
            logger.info('Startup', 'Initializing Shoukaku v4.1...');

            sentry.installConsoleForwarding();
            sentry.initialize({
                release: '4.1.0',
                tags: { bot: 'Shoukaku' }
            });

            this.startHealthServer();

            await initializeDatabase();

            registerServices();
            
            await this.bootServices();

            await this.loadCommands();

            await this.loadEvents();

            this.setupInteractionListener();

            initializeErrorHandlers(this.client);

            initializeShutdownHandlers(this.client);

            if (music.enabled) {
                await this.initializeLavalink();
            }

            await this.connect();

            this.client.once(Events.ClientReady, async () => {
                logger.initialize(this.client);
                
                const shardId = this.client.shard?.ids[0] ?? 0;
                gracefulDegradation.setShardId(shardId);
                sentry.setShardId(shardId);
                
                await this.registerHealthChecks();
                health.setStatus('healthy');
                
                SnipeService.initialize(this.client);
                logger.info('Services', 'SnipeService initialized');

                await shardBridge.initialize(this.client);
                const shardInfo = shardBridge.getShardInfo();
                logger.info('Services', `ShardBridge initialized (shard ${shardInfo.shardId}/${shardInfo.totalShards})`);

                if (bot.autoDeploy) {
                    await this.deployCommands();
                }
                
                logger.info('Ready', `🚀 Shoukaku Bot is fully operational!`);

                const startupKey = `startup:${shardId}`;
                const alreadySent = await cacheService.has('system', startupKey);
                if (!alreadySent) {
                    await cacheService.set('system', startupKey, Date.now(), 60);

                    const guilds = this.client.guilds.cache.size;
                    const users = this.client.guilds.cache.reduce((a, g) => a + g.memberCount, 0);
                    const commands = commandReg.size;
                    const shardLabel = this.client.shard ? `Shard ${shardId}/${this.client.shard.count}` : 'No sharding';
                    await logger.discord('SUCCESS', '🚀 Bot Started', 
                        `**Shoukaku v4.1** is now online and ready!`, {
                        'Guilds': `${guilds}`,
                        'Users': `~${users.toLocaleString()}`,
                        'Commands': `${commands}`,
                        'Shard': shardLabel,
                        'Node.js': process.version,
                        'Uptime': `Started at <t:${Math.floor(Date.now() / 1000)}:F>`
                    });
                } else {
                    logger.info('Ready', 'Skipped duplicate startup embed (already sent within 60s)');
                }
            });

        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger.critical('Startup', `Failed to start: ${message}`);
            sentry.captureException(error instanceof Error ? error : new Error(String(error)), { extra: { phase: 'startup' } });
            console.error(error);
            process.exit(1);
        }
    }

    private startHealthServer(): void {
        const basePort = parseInt(process.env.HEALTH_PORT || '3000');
        const shardId = this.client.shard?.ids[0] ?? 0;
        const port = basePort + shardId;
        health.startHealthServer(port);
    }

    private async bootServices(): Promise<void> {
        logger.info('Container', 'Booting services via DI container...');
        
        redisCache = container.resolve<RedisCache>('redisCache');
        cacheService = container.resolve<CacheService>('cacheService');
        commandReg = container.resolve<CommandRegistry>('commandRegistry');
        eventReg = container.resolve<EventRegistry>('eventRegistry');
        
        try {
            const connected = await redisCache.initialize();
            if (connected) {
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

    private async registerHealthChecks(): Promise<void> {
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

    private async loadCommands(): Promise<void> {
        await commandReg.loadCommands();
        
        this.client.commands = commandReg.commands;
        
        logger.info('Commands', `Loaded ${commandReg.size} commands`);
    }

    private async loadEvents(): Promise<void> {
        await eventReg.loadEvents();
        
        eventReg.registerWithClient(this.client);
        
        logger.info('Events', `Loaded ${eventReg.size} events`);
    }

    private setupInteractionListener(): void {
        this.client.on(Events.InteractionCreate, async (interaction: Interaction) => {
            try {
                if (interaction.isChatInputCommand()) {
                    const command = commandReg.get(interaction.commandName) as BootstrapCommand | undefined;
                    
                    if (!command) {
                        logger.warn('Interaction', `Unknown command: ${interaction.commandName}`);
                        return;
                    }

                    await command.execute(interaction);
                }
                
                else if (interaction.isAutocomplete()) {
                    const command = commandReg.get(interaction.commandName) as BootstrapCommand | undefined;
                    
                    if (command?.autocomplete) {
                        await command.autocomplete(interaction);
                    }
                }
                
                else if (interaction.isButton()) {
                    const [commandName] = interaction.customId.split('_');
                    const command = commandReg.get(commandName) as BootstrapCommand | undefined;
                    
                    if (command?.handleButton) {
                        await command.handleButton(interaction);
                    }
                }
                
                else if (interaction.isModalSubmit()) {
                    const [commandName] = interaction.customId.split('_');
                    const command = (commandReg.getModalHandler(commandName) || 
                                   commandReg.get(commandName)) as BootstrapCommand | undefined;
                    
                    if (command?.handleModal) {
                        await command.handleModal(interaction);
                    }
                }
                
                else if (interaction.isStringSelectMenu()) {
                    const [commandName] = interaction.customId.split('_');
                    const command = commandReg.get(commandName) as BootstrapCommand | undefined;
                    
                    if (command?.handleSelectMenu) {
                        await command.handleSelectMenu(interaction);
                    }
                }
                
            } catch (error) {
                // Discord interaction tokens can expire during long-running flows.
                const err = error as { code?: number; message?: string };
                if (err.code === 10062 || err.code === 40060 || err.message === 'Unknown interaction') {
                    const id = interaction.isChatInputCommand() ? interaction.commandName : 
                               interaction.isAutocomplete() ? `autocomplete:${interaction.commandName}` :
                               'customId' in interaction ? interaction.customId : 'unknown';
                    logger.warn('Interaction', `Lifecycle issue for ${id}: ${err.message || String(error)}`);
                    return;
                }
                
                const message = error instanceof Error ? error.message : String(error);
                logger.error('Interaction', `Error handling interaction: ${message}`);
                console.error(error);
                
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
                }
            }
        });
    }

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

    private async connect(): Promise<void> {
        logger.info('Startup', 'Connecting to Discord...');
        await this.client.login(process.env.BOT_TOKEN);
    }
}

// Guard against starting the bot when this module is imported by tests/tools.
let bot_instance: ShoukakuBot | undefined;

const isEntryPoint = typeof require !== 'undefined'
    ? require.main === module
    : process.argv[1]?.replace(/\\/g, '/').endsWith('/index.js') ||
      process.argv[1]?.replace(/\\/g, '/').endsWith('/index.ts');

if (isEntryPoint || process.env.BOT_START === 'true') {
    bot_instance = new ShoukakuBot();
    bot_instance.start().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

export { bot_instance as bot, ShoukakuBot };
export default { bot: bot_instance };

