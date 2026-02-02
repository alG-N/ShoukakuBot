/**
 * Health Check Service
 * Provides health status for the application
 * Used by load balancers, Kubernetes probes, and monitoring
 * @module core/health
 */

const http = require('http');
const logger = require('./Logger');

// Health check state
const healthState = {
    status: 'starting',
    startTime: Date.now(),
    checks: {}
};

// Registered health checks
const healthChecks = new Map();

/**
 * Register a health check
 * @param {string} name - Check name
 * @param {Function} checkFn - Async function returning { healthy: boolean, details?: object }
 */
function registerHealthCheck(name, checkFn) {
    healthChecks.set(name, checkFn);
    logger.debug('Health', `Registered health check: ${name}`);
}

/**
 * Run all health checks
 * @returns {Promise<Object>} Health status
 */
async function runHealthChecks() {
    const results = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: Math.floor((Date.now() - healthState.startTime) / 1000),
        checks: {}
    };

    for (const [name, checkFn] of healthChecks) {
        try {
            const startTime = Date.now();
            const result = await Promise.race([
                checkFn(),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Health check timeout')), 5000)
                )
            ]);
            
            results.checks[name] = {
                status: result.healthy ? 'healthy' : 'unhealthy',
                latency: Date.now() - startTime,
                ...result.details
            };

            if (!result.healthy) {
                results.status = 'unhealthy';
            }
        } catch (error) {
            results.checks[name] = {
                status: 'unhealthy',
                error: error.message
            };
            results.status = 'unhealthy';
        }
    }

    healthState.checks = results.checks;
    healthState.status = results.status;

    return results;
}

/**
 * Get current health status (cached, fast)
 * @returns {Object} Current health state
 */
function getHealthStatus() {
    return {
        status: healthState.status,
        timestamp: new Date().toISOString(),
        uptime: Math.floor((Date.now() - healthState.startTime) / 1000),
        checks: healthState.checks
    };
}

/**
 * Set the overall status
 * @param {'starting' | 'healthy' | 'unhealthy' | 'shutting_down'} status 
 */
function setStatus(status) {
    healthState.status = status;
}

/**
 * Start the health check HTTP server
 * @param {number} port - Port to listen on (default: 3000)
 * @returns {http.Server}
 */
function startHealthServer(port = 3000) {
    const server = http.createServer(async (req, res) => {
        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'application/json');

        if (req.url === '/health' || req.url === '/healthz') {
            try {
                const health = await runHealthChecks();
                const statusCode = health.status === 'healthy' ? 200 : 503;
                res.writeHead(statusCode);
                res.end(JSON.stringify(health, null, 2));
            } catch (error) {
                res.writeHead(500);
                res.end(JSON.stringify({ status: 'error', error: error.message }));
            }
        } else if (req.url === '/ready' || req.url === '/readyz') {
            // Readiness probe - quick check, no deep health checks
            const status = healthState.status;
            const ready = status === 'healthy';
            res.writeHead(ready ? 200 : 503);
            res.end(JSON.stringify({ ready, status }));
        } else if (req.url === '/live' || req.url === '/livez') {
            // Liveness probe - just check if process is alive
            res.writeHead(200);
            res.end(JSON.stringify({ alive: true }));
        } else {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Not found' }));
        }
    });

    server.listen(port, () => {
        logger.info('Health', `Health check server listening on port ${port}`);
    });

    server.on('error', (error) => {
        logger.error('Health', `Health server error: ${error.message}`);
    });

    return server;
}

/**
 * Create default health checks for common services
 * @param {Object} services - Services to check
 */
function registerDefaultChecks(services = {}) {
    // Discord client check
    if (services.client) {
        registerHealthCheck('discord', async () => {
            const client = services.client;
            return {
                healthy: client.isReady(),
                details: {
                    ping: client.ws.ping,
                    guilds: client.guilds.cache.size,
                    uptime: client.uptime
                }
            };
        });
    }

    // PostgreSQL check
    if (services.database) {
        registerHealthCheck('postgres', async () => {
            try {
                const result = await services.database.query('SELECT 1');
                return { healthy: true, details: { connected: true } };
            } catch (error) {
                return { healthy: false, details: { error: error.message } };
            }
        });
    }

    // Redis check
    if (services.redis) {
        registerHealthCheck('redis', async () => {
            try {
                if (services.redis.isConnected) {
                    await services.redis.client.ping();
                    return { healthy: true, details: { connected: true } };
                }
                return { healthy: true, details: { connected: false, fallback: 'in-memory' } };
            } catch (error) {
                return { healthy: false, details: { error: error.message } };
            }
        });
    }

    // Lavalink check
    if (services.lavalink) {
        registerHealthCheck('lavalink', async () => {
            const status = services.lavalink.getNodeStatus?.() || {};
            return {
                healthy: status.ready === true,
                details: {
                    ready: status.ready,
                    nodes: status.nodes?.length || 0,
                    players: status.activeConnections || 0
                }
            };
        });
    }
}

module.exports = {
    registerHealthCheck,
    runHealthChecks,
    getHealthStatus,
    setStatus,
    startHealthServer,
    registerDefaultChecks
};
