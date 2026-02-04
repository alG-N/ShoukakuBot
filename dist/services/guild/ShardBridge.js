"use strict";
/**
 * Shard Bridge Service
 *
 * Cross-shard communication via Redis Pub/Sub
 * Allows shards to:
 * - Broadcast messages to all shards
 * - Request data from specific shards
 * - Aggregate stats across all shards
 *
 * @module services/guild/ShardBridge
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShardBridge = void 0;
const events_1 = require("events");
// ═══════════════════════════════════════════════════════════════
// SHARD BRIDGE CLASS
// ═══════════════════════════════════════════════════════════════
class ShardBridge extends events_1.EventEmitter {
    client = null;
    shardId = 0;
    totalShards = 1;
    pendingRequests = new Map();
    redisPublisher = null;
    redisSubscriber = null;
    isInitialized = false;
    CHANNEL_BROADCAST = 'shard:broadcast';
    CHANNEL_REQUEST = 'shard:request';
    CHANNEL_RESPONSE = 'shard:response';
    DEFAULT_TIMEOUT = 5000;
    /**
     * Initialize the shard bridge
     */
    async initialize(client) {
        if (this.isInitialized)
            return;
        this.client = client;
        this.shardId = client.shard?.ids[0] ?? 0;
        this.totalShards = client.shard?.count ?? 1;
        // Skip Redis setup if not sharded or Redis not available
        if (this.totalShards <= 1) {
            console.log('[ShardBridge] Single shard mode, Redis pub/sub disabled');
            this.isInitialized = true;
            return;
        }
        try {
            // Check if Redis is connected via CacheService singleton
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const cacheService = require('../../cache/CacheService.js').default;
            const stats = cacheService.getStats();
            const isConnected = stats.redis.connected;
            if (!isConnected) {
                console.warn('[ShardBridge] Redis not connected, using fallback mode');
                this.isInitialized = true;
                return;
            }
            // Create dedicated pub/sub connections using ioredis
            const { Redis } = await import('ioredis');
            const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
            this.redisPublisher = new Redis(redisUrl);
            this.redisSubscriber = new Redis(redisUrl);
            // Subscribe to channels
            const subscriber = this.redisSubscriber;
            await subscriber.subscribe(this.CHANNEL_BROADCAST, this.CHANNEL_REQUEST, this.CHANNEL_RESPONSE);
            // Handle incoming messages
            subscriber.on('message', (channel, message) => {
                this.handleMessage(channel, message);
            });
            console.log(`[ShardBridge] ✅ Initialized for shard ${this.shardId}/${this.totalShards}`);
            this.isInitialized = true;
        }
        catch (error) {
            console.error('[ShardBridge] Failed to initialize Redis pub/sub:', error);
            this.isInitialized = true; // Continue without pub/sub
        }
    }
    /**
     * Handle incoming Redis messages
     */
    handleMessage(channel, rawMessage) {
        try {
            const message = JSON.parse(rawMessage);
            // Ignore messages from self
            if (message.shardId === this.shardId && channel !== this.CHANNEL_RESPONSE) {
                return;
            }
            switch (channel) {
                case this.CHANNEL_BROADCAST:
                    this.handleBroadcast(message);
                    break;
                case this.CHANNEL_REQUEST:
                    this.handleRequest(message);
                    break;
                case this.CHANNEL_RESPONSE:
                    this.handleResponse(message);
                    break;
            }
        }
        catch (error) {
            console.error('[ShardBridge] Error parsing message:', error);
        }
    }
    /**
     * Handle broadcast messages
     */
    handleBroadcast(message) {
        this.emit('broadcast', message.type, message.data);
        this.emit(`broadcast:${message.type}`, message.data);
    }
    /**
     * Handle incoming requests (respond with local data)
     */
    async handleRequest(message) {
        if (!message.requestId)
            return;
        let responseData;
        let error;
        try {
            switch (message.type) {
                case 'getStats':
                    responseData = this.getLocalStats();
                    break;
                case 'getGuildCount':
                    responseData = this.client?.guilds.cache.size ?? 0;
                    break;
                case 'getUserCount':
                    responseData = this.client?.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0) ?? 0;
                    break;
                case 'getVoiceConnections':
                    responseData = this.client?.voice?.adapters.size ?? 0;
                    break;
                case 'findGuild':
                    const guildId = message.data;
                    const guild = this.client?.guilds.cache.get(guildId);
                    responseData = guild ? {
                        id: guild.id,
                        name: guild.name,
                        memberCount: guild.memberCount,
                        shardId: this.shardId
                    } : null;
                    break;
                case 'findUser':
                    const userId = message.data;
                    const user = this.client?.users.cache.get(userId);
                    responseData = user ? {
                        id: user.id,
                        tag: user.tag,
                        shardId: this.shardId
                    } : null;
                    break;
                case 'eval':
                    // Dangerous - only for trusted internal use
                    if (process.env.ALLOW_SHARD_EVAL === 'true') {
                        const evalFn = new Function('client', message.data);
                        responseData = await evalFn(this.client);
                    }
                    else {
                        error = 'Eval disabled';
                    }
                    break;
                default:
                    // Emit for custom handlers
                    this.emit(`request:${message.type}`, message.data, (result) => {
                        responseData = result;
                    });
            }
        }
        catch (e) {
            error = e.message;
        }
        // Send response
        await this.publish(this.CHANNEL_RESPONSE, {
            type: message.type,
            shardId: this.shardId,
            requestId: message.requestId,
            data: responseData,
            timestamp: Date.now()
        });
    }
    /**
     * Handle responses to our requests
     */
    handleResponse(message) {
        if (!message.requestId)
            return;
        const pending = this.pendingRequests.get(message.requestId);
        if (!pending)
            return;
        pending.responses.push({
            shardId: message.shardId,
            data: message.data
        });
        // Check if we have all responses
        if (pending.responses.length >= pending.expectedCount) {
            clearTimeout(pending.timeout);
            pending.resolve(pending.responses);
            this.pendingRequests.delete(message.requestId);
        }
    }
    /**
     * Get local shard stats
     */
    getLocalStats() {
        if (!this.client)
            return {};
        return {
            shardId: this.shardId,
            guilds: this.client.guilds.cache.size,
            users: this.client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0),
            channels: this.client.channels.cache.size,
            voiceConnections: this.client.voice?.adapters.size ?? 0,
            ping: this.client.ws.ping,
            uptime: this.client.uptime ?? 0
        };
    }
    /**
     * Publish a message to Redis
     */
    async publish(channel, message) {
        if (!this.redisPublisher)
            return;
        const fullMessage = {
            type: message.type || '',
            shardId: this.shardId,
            requestId: message.requestId,
            data: message.data,
            timestamp: Date.now()
        };
        const publisher = this.redisPublisher;
        await publisher.publish(channel, JSON.stringify(fullMessage));
    }
    // ═══════════════════════════════════════════════════════════════
    // PUBLIC API
    // ═══════════════════════════════════════════════════════════════
    /**
     * Broadcast a message to all shards
     */
    async broadcast(type, data) {
        if (this.totalShards <= 1) {
            // Single shard, emit locally
            this.emit('broadcast', type, data);
            this.emit(`broadcast:${type}`, data);
            return;
        }
        await this.publish(this.CHANNEL_BROADCAST, { type, data, timestamp: Date.now() });
    }
    /**
     * Request data from all shards
     */
    async requestAll(type, data, timeout = this.DEFAULT_TIMEOUT) {
        // Single shard mode - just return local data
        if (this.totalShards <= 1 || !this.redisPublisher) {
            const localResponse = await this.handleLocalRequest(type, data);
            return [{ shardId: this.shardId, data: localResponse }];
        }
        const requestId = `${this.shardId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        return new Promise((resolve, reject) => {
            // Set timeout
            const timeoutHandle = setTimeout(() => {
                const pending = this.pendingRequests.get(requestId);
                if (pending) {
                    this.pendingRequests.delete(requestId);
                    // Return partial results
                    resolve(pending.responses);
                }
            }, timeout);
            // Store pending request
            this.pendingRequests.set(requestId, {
                resolve,
                reject,
                responses: [],
                expectedCount: this.totalShards,
                timeout: timeoutHandle
            });
            // Send request
            this.publish(this.CHANNEL_REQUEST, {
                type,
                requestId,
                data,
                timestamp: Date.now()
            });
        });
    }
    /**
     * Handle local request (for single shard mode)
     */
    async handleLocalRequest(type, data) {
        switch (type) {
            case 'getStats':
                return this.getLocalStats();
            case 'getGuildCount':
                return this.client?.guilds.cache.size ?? 0;
            case 'getUserCount':
                return this.client?.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0) ?? 0;
            case 'getVoiceConnections':
                return this.client?.voice?.adapters.size ?? 0;
            case 'findGuild':
                const guild = this.client?.guilds.cache.get(data);
                return guild ? { id: guild.id, name: guild.name, memberCount: guild.memberCount, shardId: this.shardId } : null;
            case 'findUser':
                const user = this.client?.users.cache.get(data);
                return user ? { id: user.id, tag: user.tag, shardId: this.shardId } : null;
            default:
                return null;
        }
    }
    /**
     * Get aggregate stats from all shards
     */
    async getAggregateStats() {
        const responses = await this.requestAll('getStats');
        const shards = responses.map(r => ({
            id: r.data.shardId,
            guilds: r.data.guilds ?? 0,
            users: r.data.users ?? 0,
            ping: r.data.ping ?? -1,
            uptime: r.data.uptime ?? 0
        }));
        return {
            totalGuilds: shards.reduce((acc, s) => acc + s.guilds, 0),
            totalUsers: shards.reduce((acc, s) => acc + s.users, 0),
            totalChannels: responses.reduce((acc, r) => acc + (r.data.channels ?? 0), 0),
            totalVoiceConnections: responses.reduce((acc, r) => acc + (r.data.voiceConnections ?? 0), 0),
            shardCount: this.totalShards,
            shards
        };
    }
    /**
     * Find a guild across all shards
     */
    async findGuild(guildId) {
        // Check local first
        const localGuild = this.client?.guilds.cache.get(guildId);
        if (localGuild) {
            return {
                id: localGuild.id,
                name: localGuild.name,
                memberCount: localGuild.memberCount,
                shardId: this.shardId
            };
        }
        // Query other shards
        if (this.totalShards <= 1)
            return null;
        const responses = await this.requestAll('findGuild', guildId);
        for (const response of responses) {
            if (response.data) {
                return response.data;
            }
        }
        return null;
    }
    /**
     * Find a user across all shards
     */
    async findUser(userId) {
        // Check local first
        const localUser = this.client?.users.cache.get(userId);
        if (localUser) {
            return {
                id: localUser.id,
                tag: localUser.tag,
                shardId: this.shardId
            };
        }
        // Query other shards
        if (this.totalShards <= 1)
            return null;
        const responses = await this.requestAll('findUser', userId);
        for (const response of responses) {
            if (response.data) {
                return response.data;
            }
        }
        return null;
    }
    /**
     * Get current shard info
     */
    getShardInfo() {
        return {
            shardId: this.shardId,
            totalShards: this.totalShards,
            isInitialized: this.isInitialized
        };
    }
    /**
     * Cleanup resources
     */
    async shutdown() {
        // Clear pending requests
        for (const [, pending] of this.pendingRequests) {
            clearTimeout(pending.timeout);
            pending.reject(new Error('ShardBridge shutting down'));
        }
        this.pendingRequests.clear();
        // Close Redis connections
        if (this.redisPublisher) {
            await this.redisPublisher.quit();
        }
        if (this.redisSubscriber) {
            await this.redisSubscriber.quit();
        }
        this.isInitialized = false;
        console.log('[ShardBridge] Shutdown complete');
    }
}
exports.ShardBridge = ShardBridge;
// ═══════════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════════
const shardBridge = new ShardBridge();
exports.default = shardBridge;
//# sourceMappingURL=ShardBridge.js.map