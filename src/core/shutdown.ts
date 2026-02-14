/**
 * Graceful Shutdown Handler
 * Ensures clean shutdown of all services
 * @module core/shutdown
 */

import logger from './Logger.js';
import container from '../container.js';
import * as readline from 'readline';
// TYPES
interface ShutdownHandler {
    name: string;
    handler: () => Promise<void>;
    priority: number;
}

interface ShutdownResult {
    name: string;
    success: boolean;
    error?: string;
}

interface ShutdownOptions {
    timeout?: number;
}
// STATE
const shutdownHandlers: ShutdownHandler[] = [];
let isShuttingDown = false;
// FUNCTIONS
/**
 * Register a shutdown handler
 * @param name - Handler name for logging
 * @param handler - Async function to call on shutdown
 * @param priority - Lower = runs first (default: 100)
 */
export function registerShutdownHandler(
    name: string, 
    handler: () => Promise<void>, 
    priority: number = 100
): void {
    shutdownHandlers.push({ name, handler, priority });
    // Sort by priority
    shutdownHandlers.sort((a, b) => a.priority - b.priority);
    logger.debug('Shutdown', `Registered shutdown handler: ${name} (priority: ${priority})`);
}

/**
 * Handle graceful shutdown
 * @param signal - Signal received (SIGINT, SIGTERM, etc.)
 * @param client - Discord client
 * @param options - Shutdown options
 */
export async function handleShutdown(
    signal: string, 
    client: { destroy: () => void } | null = null, 
    options: ShutdownOptions = {}
): Promise<void> {
    // Prevent multiple shutdown attempts
    if (isShuttingDown) {
        logger.warn('Shutdown', 'Shutdown already in progress...');
        return;
    }
    
    isShuttingDown = true;
    const { timeout = 15000 } = options;
    
    logger.info('Shutdown', `Received ${signal}, initiating graceful shutdown...`);
    
    const shutdownStart = Date.now();
    
    try {
        // Create timeout promise
        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error(`Shutdown timeout after ${timeout}ms`)), timeout);
        });
        
        // Run shutdown sequence
        const shutdownPromise = runShutdownSequence(client);
        
        await Promise.race([shutdownPromise, timeoutPromise]);
        
        const duration = Date.now() - shutdownStart;
        logger.success('Shutdown', `Graceful shutdown complete in ${duration}ms`);
        process.exit(0);
        
    } catch (error) {
        logger.error('Shutdown', `Shutdown error: ${(error as Error).message}`);
        process.exit(1);
    }
}

/**
 * Run all shutdown handlers in order
 * 
 * Shutdown sequence:
 * 1. Destroy Discord client (stop receiving events)
 * 2. Run any manually registered shutdown handlers
 * 3. Shutdown DI container (calls shutdown/destroy/close on ALL registered services)
 * 4. Cleanup static resources (PaginationState)
 * 
 * The DI container handles ALL service lifecycle now — database, Redis, cache,
 * API services, music services, handlers, repositories, and events with intervals.
 * No manual require() + shutdown calls needed.
 * 
 * @private
 */
async function runShutdownSequence(client: { destroy: () => void } | null): Promise<ShutdownResult[]> {
    const results: ShutdownResult[] = [];
    
    // 1. Destroy Discord client first (stop receiving events)
    if (client) {
        try {
            logger.info('Shutdown', 'Destroying Discord client...');
            client.destroy();
            results.push({ name: 'Discord Client', success: true });
        } catch (error) {
            results.push({ name: 'Discord Client', success: false, error: (error as Error).message });
        }
    }
    
    // 2. Run registered handlers (external code can still register custom handlers)
    for (const { name, handler } of shutdownHandlers) {
        try {
            logger.debug('Shutdown', `Running handler: ${name}`);
            await handler();
            results.push({ name, success: true });
        } catch (error) {
            logger.error('Shutdown', `Handler "${name}" failed: ${(error as Error).message}`);
            results.push({ name, success: false, error: (error as Error).message });
        }
    }
    
    // 3. Shutdown DI container — handles ALL service lifecycle:
    //    - Database (postgres.close())
    //    - Redis/Cache (redisCache.shutdown(), cacheService.shutdown())
    //    - API services (wikipediaService.shutdown(), pixivService.destroy(), etc.)
    //    - Music services (lavalinkService.shutdown(), musicEventBus.shutdown(), etc.)
    //    - Handlers (nhentaiHandler.destroy())
    //    - Repositories (rule34Cache.destroy(), redditCache.destroy(), etc.)
    //    - Events (voiceStateUpdate.destroy(), readyEvent.destroy())
    //    - Guild services (shardBridge.shutdown(), antiRaidService.shutdown())
    try {
        logger.info('Shutdown', 'Shutting down DI container...');
        await container.shutdown();
        results.push({ name: 'DI Container', success: true });
    } catch (error) {
        logger.error('Shutdown', `Container shutdown failed: ${(error as Error).message}`);
        results.push({ name: 'DI Container', success: false, error: (error as Error).message });
    }

    // 4. Cleanup static resources (not managed by container)
    try {
        const { PaginationState } = await import('../utils/common/pagination.js');
        PaginationState.destroyAll();
        logger.info('Shutdown', 'Pagination state cleanup complete');
        results.push({ name: 'PaginationState', success: true });
    } catch (error) {
        results.push({ name: 'PaginationState', success: false, error: (error as Error).message });
    }
    
    return results;
}

/**
 * Initialize shutdown handlers for process signals
 * @param client - Discord client
 */
export function initializeShutdownHandlers(client: { destroy: () => void }): void {
    // Standard signals
    process.on('SIGINT', () => handleShutdown('SIGINT', client));
    process.on('SIGTERM', () => handleShutdown('SIGTERM', client));
    
    // Windows-specific handling
    if (process.platform === 'win32') {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        rl.on('SIGINT', () => process.emit('SIGINT'));
        rl.on('close', () => handleShutdown('CLOSE', client));
    }
    
    logger.info('Shutdown', 'Shutdown handlers initialized');
}

/**
 * Check if shutdown is in progress
 */
export function getIsShuttingDown(): boolean {
    return isShuttingDown;
}
