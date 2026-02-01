/**
 * Graceful Shutdown Handler
 * Ensures clean shutdown of all services
 * @module core/shutdown
 */

const logger = require('./Logger');

// Registered shutdown handlers
const shutdownHandlers = [];
let isShuttingDown = false;

/**
 * Register a shutdown handler
 * @param {string} name - Handler name for logging
 * @param {Function} handler - Async function to call on shutdown
 * @param {number} priority - Lower = runs first (default: 100)
 */
function registerShutdownHandler(name, handler, priority = 100) {
    shutdownHandlers.push({ name, handler, priority });
    // Sort by priority
    shutdownHandlers.sort((a, b) => a.priority - b.priority);
    logger.debug('Shutdown', `Registered shutdown handler: ${name} (priority: ${priority})`);
}

/**
 * Handle graceful shutdown
 * @param {string} signal - Signal received (SIGINT, SIGTERM, etc.)
 * @param {Client} client - Discord client
 * @param {Object} options - Shutdown options
 */
async function handleShutdown(signal, client = null, options = {}) {
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
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`Shutdown timeout after ${timeout}ms`)), timeout);
        });
        
        // Run shutdown sequence
        const shutdownPromise = runShutdownSequence(client);
        
        await Promise.race([shutdownPromise, timeoutPromise]);
        
        const duration = Date.now() - shutdownStart;
        logger.success('Shutdown', `Graceful shutdown complete in ${duration}ms`);
        process.exit(0);
        
    } catch (error) {
        logger.error('Shutdown', `Shutdown error: ${error.message}`);
        process.exit(1);
    }
}

/**
 * Run all shutdown handlers in order
 * @private
 */
async function runShutdownSequence(client) {
    const results = [];
    
    // 1. Destroy Discord client first (stop receiving events)
    if (client) {
        try {
            logger.info('Shutdown', 'Destroying Discord client...');
            client.destroy();
            results.push({ name: 'Discord Client', success: true });
        } catch (error) {
            results.push({ name: 'Discord Client', success: false, error: error.message });
        }
    }
    
    // 2. Run registered handlers
    for (const { name, handler } of shutdownHandlers) {
        try {
            logger.debug('Shutdown', `Running handler: ${name}`);
            await handler();
            results.push({ name, success: true });
        } catch (error) {
            logger.error('Shutdown', `Handler "${name}" failed: ${error.message}`);
            results.push({ name, success: false, error: error.message });
        }
    }
    
    // 3. Close database connections (try infrastructure first, then legacy)
    try {
        let infrastructure;
        try {
            infrastructure = require('../infrastructure');
        } catch (e) {
            infrastructure = null;
        }
        
        if (infrastructure?.shutdown) {
            await infrastructure.shutdown();
            logger.info('Shutdown', 'Infrastructure shutdown complete');
        } else {
            const postgres = require('../database/postgres');
            await postgres.close();
            logger.info('Shutdown', 'Database connections closed');
        }
        results.push({ name: 'Database', success: true });
    } catch (error) {
        results.push({ name: 'Database', success: false, error: error.message });
    }
    
    // 4. Close Redis connections
    try {
        const redis = require('../services/RedisCache');
        await redis.disconnect();
        logger.info('Shutdown', 'Redis connection closed');
        results.push({ name: 'Redis', success: true });
    } catch (error) {
        results.push({ name: 'Redis', success: false, error: error.message });
    }
    
    return results;
}

/**
 * Initialize shutdown handlers for process signals
 * @param {Client} client - Discord client
 */
function initializeShutdownHandlers(client) {
    // Standard signals
    process.on('SIGINT', () => handleShutdown('SIGINT', client));
    process.on('SIGTERM', () => handleShutdown('SIGTERM', client));
    
    // Windows-specific handling
    if (process.platform === 'win32') {
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        rl.on('SIGINT', () => process.emit('SIGINT'));
        rl.on('close', () => handleShutdown('CLOSE', client));
    }
    
    logger.info('Shutdown', 'Shutdown handlers initialized');
}

module.exports = {
    registerShutdownHandler,
    handleShutdown,
    initializeShutdownHandlers,
    get isShuttingDown() { return isShuttingDown; }
};
