/**
 * Sharding Manager Entry Point
 * 
 * This file spawns multiple shards of the bot for scaling to 1000+ servers.
 * Each shard is a separate process running src/index.ts
 * 
 * Discord recommends 1 shard per ~2500 guilds (hard limit is 2500 guilds/shard)
 * 
 * Usage:
 *   Production: node dist/sharding.js
 *   Development: node dist/index.js (single instance, no sharding)
 * 
 * @module sharding
 */

import 'dotenv/config';
import { ShardingManager, ShardingManagerOptions } from 'discord.js';
import { ChildProcess } from 'child_process';
import path from 'path';
import { readFileSync } from 'fs';

// Read version from package.json
const VERSION = JSON.parse(readFileSync(path.resolve(__dirname, '../package.json'), 'utf-8')).version;

// Configuration
const BOT_TOKEN = process.env.BOT_TOKEN;
const TOTAL_SHARDS = process.env.SHARD_COUNT ? parseInt(process.env.SHARD_COUNT) : 'auto';
const RESPAWN_DELAY = parseInt(process.env.SHARD_RESPAWN_DELAY || '5000');
const SPAWN_TIMEOUT = parseInt(process.env.SHARD_SPAWN_TIMEOUT || '30000');

if (!BOT_TOKEN) {
    console.error('[Sharding] ❌ BOT_TOKEN is required');
    process.exit(1);
}

// Sharding Manager configuration
const managerOptions: ShardingManagerOptions = {
    token: BOT_TOKEN,
    totalShards: TOTAL_SHARDS,
    respawn: true,
    mode: 'process', // 'process' or 'worker'
    execArgv: [], // Node.js flags for child processes
};

// Create the shard manager
const manager = new ShardingManager(
    path.resolve(__dirname, 'index.js'),
    managerOptions
);

// Track shard states
const shardStates = new Map<number, {
    status: 'spawning' | 'ready' | 'disconnected' | 'reconnecting' | 'dead';
    guilds: number;
    lastReady: Date | null;
    restarts: number;
}>();

// ═══════════════════════════════════════════════════════════════
// SHARD EVENT HANDLERS
// ═══════════════════════════════════════════════════════════════

manager.on('shardCreate', (shard) => {
    console.log(`[Sharding] 🚀 Launching shard ${shard.id}...`);
    
    // Initialize state tracking
    shardStates.set(shard.id, {
        status: 'spawning',
        guilds: 0,
        lastReady: null,
        restarts: 0
    });

    // Shard ready
    shard.on('ready', () => {
        console.log(`[Sharding] ✅ Shard ${shard.id} is ready`);
        const state = shardStates.get(shard.id);
        if (state) {
            state.status = 'ready';
            state.lastReady = new Date();
        }
    });

    // Shard disconnect
    shard.on('disconnect', () => {
        console.warn(`[Sharding] ⚠️ Shard ${shard.id} disconnected`);
        const state = shardStates.get(shard.id);
        if (state) state.status = 'disconnected';
    });

    // Shard reconnecting
    shard.on('reconnecting', () => {
        console.log(`[Sharding] 🔄 Shard ${shard.id} reconnecting...`);
        const state = shardStates.get(shard.id);
        if (state) state.status = 'reconnecting';
    });

    // Shard death (will respawn if respawn: true)
    shard.on('death', (childProcess) => {
        const cp = childProcess as ChildProcess;
        console.error(`[Sharding] ❌ Shard ${shard.id} died (exit code: ${cp.exitCode ?? 'unknown'})`);
        const state = shardStates.get(shard.id);
        if (state) {
            state.status = 'dead';
            state.restarts++;
        }
    });

    // Shard spawn (after death, when respawning)
    shard.on('spawn', (childProcess) => {
        const cp = childProcess as ChildProcess;
        console.log(`[Sharding] 🔄 Shard ${shard.id} spawned (PID: ${cp.pid ?? 'unknown'})`);
        const state = shardStates.get(shard.id);
        if (state) state.status = 'spawning';
    });

    // Shard error
    shard.on('error', (error) => {
        console.error(`[Sharding] ❌ Shard ${shard.id} error:`, error.message);
    });

    // IPC messages from shards
    shard.on('message', (message) => {
        handleShardMessage(shard.id, message);
    });
});

// ═══════════════════════════════════════════════════════════════
// IPC MESSAGE HANDLER
// ═══════════════════════════════════════════════════════════════

interface ShardMessage {
    type: string;
    data?: unknown;
    requestId?: string;
}

function handleShardMessage(shardId: number, message: ShardMessage) {
    if (!message || typeof message !== 'object') return;

    switch (message.type) {
        case 'stats':
            // Update guild count for this shard
            const state = shardStates.get(shardId);
            if (state && message.data && typeof message.data === 'object') {
                state.guilds = (message.data as { guilds?: number }).guilds ?? 0;
            }
            break;

        case 'broadcastEval':
            // Forward eval request to all shards
            // This is handled by Discord.js internally
            break;

        case 'log':
            // Forward log from shard
            console.log(`[Shard ${shardId}]`, message.data);
            break;

        default:
            // Unknown message type
            break;
    }
}

// ═══════════════════════════════════════════════════════════════
// AGGREGATE STATS FROM ALL SHARDS
// ═══════════════════════════════════════════════════════════════

async function getAggregateStats(): Promise<{
    totalGuilds: number;
    totalUsers: number;
    totalChannels: number;
    shardCount: number;
    shardStats: Array<{
        id: number;
        status: string;
        guilds: number;
        ping: number;
        uptime: number;
    }>;
}> {
    try {
        // Fetch stats from all shards
        const [guilds, users, channels, pings, uptimes] = await Promise.all([
            manager.fetchClientValues('guilds.cache.size') as Promise<number[]>,
            manager.broadcastEval(c => c.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0)) as Promise<number[]>,
            manager.fetchClientValues('channels.cache.size') as Promise<number[]>,
            manager.fetchClientValues('ws.ping') as Promise<number[]>,
            manager.fetchClientValues('uptime') as Promise<number[]>
        ]);

        const shardStats = guilds.map((guildCount, index) => ({
            id: index,
            status: shardStates.get(index)?.status ?? 'unknown',
            guilds: guildCount,
            ping: pings[index] ?? -1,
            uptime: uptimes[index] ?? 0
        }));

        return {
            totalGuilds: guilds.reduce((a, b) => a + b, 0),
            totalUsers: users.reduce((a, b) => a + b, 0),
            totalChannels: channels.reduce((a, b) => a + b, 0),
            shardCount: manager.shards.size,
            shardStats
        };
    } catch (error) {
        console.error('[Sharding] Error fetching aggregate stats:', error);
        return {
            totalGuilds: 0,
            totalUsers: 0,
            totalChannels: 0,
            shardCount: 0,
            shardStats: []
        };
    }
}

// ═══════════════════════════════════════════════════════════════
// GRACEFUL SHUTDOWN
// ═══════════════════════════════════════════════════════════════

async function shutdown(signal: string) {
    console.log(`\n[Sharding] Received ${signal}, shutting down all shards...`);

    // Give shards time to cleanup
    const shutdownPromises = manager.shards.map(async (shard) => {
        try {
            await shard.send({ type: 'shutdown' });
            // Wait a bit for graceful shutdown
            await new Promise(resolve => setTimeout(resolve, 2000));
            shard.kill();
        } catch {
            shard.kill();
        }
    });

    await Promise.allSettled(shutdownPromises);
    console.log('[Sharding] All shards shut down');
    process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ═══════════════════════════════════════════════════════════════
// HEALTH CHECK SERVER (for orchestrators like K8s)
// ═══════════════════════════════════════════════════════════════

const HEALTH_PORT = parseInt(process.env.SHARD_HEALTH_PORT || '3001');

const healthServer = require('http').createServer(async (req: { url?: string }, res: { writeHead: (code: number, headers: object) => void; end: (data: string) => void }) => {
    if (req.url === '/health' || req.url === '/') {
        const stats = await getAggregateStats();
        const allHealthy = Array.from(shardStates.values()).every(s => s.status === 'ready');
        
        res.writeHead(allHealthy ? 200 : 503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: allHealthy ? 'healthy' : 'degraded',
            timestamp: new Date().toISOString(),
            ...stats
        }));
    } else if (req.url === '/stats') {
        const stats = await getAggregateStats();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(stats));
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
});

// ═══════════════════════════════════════════════════════════════
// START SHARDING
// ═══════════════════════════════════════════════════════════════

async function start() {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║           Shoukaku Sharding Manager v' + VERSION + ' '.repeat(Math.max(0, 26 - VERSION.length)) + '║');
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log(`║  Total Shards: ${String(TOTAL_SHARDS).padEnd(46)}║`);
    console.log(`║  Respawn Delay: ${String(RESPAWN_DELAY + 'ms').padEnd(45)}║`);
    console.log(`║  Spawn Timeout: ${String(SPAWN_TIMEOUT + 'ms').padEnd(45)}║`);
    console.log(`║  Health Port: ${String(HEALTH_PORT).padEnd(47)}║`);
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('');

    try {
        // Start health check server
        healthServer.listen(HEALTH_PORT, () => {
            console.log(`[Sharding] 🏥 Health check listening on port ${HEALTH_PORT}`);
        });

        // Spawn all shards
        console.log('[Sharding] 🚀 Spawning shards...');
        await manager.spawn({
            delay: RESPAWN_DELAY,
            timeout: SPAWN_TIMEOUT
        });

        console.log(`[Sharding] ✅ All ${manager.shards.size} shards spawned successfully!`);

        // Log aggregate stats every 5 minutes
        const statsTimer = setInterval(async () => {
            const stats = await getAggregateStats();
            console.log(`[Sharding] \ud83d\udcca Stats: ${stats.totalGuilds} guilds, ${stats.totalUsers} users across ${stats.shardCount} shards`);
        }, 5 * 60 * 1000);
        statsTimer.unref(); // Don't prevent process exit

    } catch (error) {
        console.error('[Sharding] ❌ Failed to spawn shards:', error);
        process.exit(1);
    }
}

// Export for external use
export { manager, getAggregateStats, shardStates, start };

// Guard: only start sharding when this file is the entry point
// Prevents accidental shard spawning when imported by tests or tools
const isEntryPoint = typeof require !== 'undefined'
    ? require.main === module
    : process.argv[1]?.replace(/\\/g, '/').endsWith('/sharding.js') ||
      process.argv[1]?.replace(/\\/g, '/').endsWith('/sharding.ts');

if (isEntryPoint || process.env.SHARD_START === 'true') {
    start();
}
