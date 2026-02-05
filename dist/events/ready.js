"use strict";
/**
 * Ready Event - Presentation Layer
 * Fired when the bot successfully connects to Discord
 * @module presentation/events/ready
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const BaseEvent_js_1 = require("./BaseEvent.js");
const Logger_js_1 = __importDefault(require("../core/Logger.js"));
const Client_js_1 = require("../core/Client.js");
const index_js_1 = require("../config/index.js");
const metrics_js_1 = require("../core/metrics.js");
const CacheService_js_1 = __importDefault(require("../cache/CacheService.js"));
// READY EVENT
class ReadyEvent extends BaseEvent_js_1.BaseEvent {
    constructor() {
        super({
            name: discord_js_1.Events.ClientReady,
            once: true
        });
    }
    async execute(client) {
        if (!client.user)
            return;
        Logger_js_1.default.success('Ready', `Logged in as ${client.user.tag}`);
        // Initialize logger with client
        Logger_js_1.default.initialize(client);
        // Set presence from config
        const presenceConfig = index_js_1.bot.presence;
        (0, Client_js_1.setPresence)(client, (presenceConfig.status || 'online'), presenceConfig.activity || '/help | alterGolden', discord_js_1.ActivityType.Playing);
        // Log statistics
        Logger_js_1.default.info('Ready', `Serving ${client.guilds.cache.size} guilds`);
        // Initialize metrics with default values immediately
        const cacheStats = CacheService_js_1.default.getStats();
        metrics_js_1.redisConnectionStatus.set(cacheStats.redisConnected ? 1 : 0);
        metrics_js_1.musicPlayersActive.set(0);
        metrics_js_1.musicQueueSize.set(0);
        metrics_js_1.musicVoiceConnections.set(0);
        metrics_js_1.commandsActive.reset();
        // Start metrics collection
        const collectMetrics = () => {
            const totalUsers = client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0);
            (0, metrics_js_1.updateDiscordMetrics)({
                shardId: client.shard?.ids[0] ?? 0,
                ping: client.ws.ping,
                guilds: client.guilds.cache.size,
                users: totalUsers,
                channels: client.channels.cache.size,
                uptime: client.uptime ?? 0
            });
            // Update Redis status
            const stats = CacheService_js_1.default.getStats();
            metrics_js_1.redisConnectionStatus.set(stats.redisConnected ? 1 : 0);
        };
        collectMetrics();
        setInterval(collectMetrics, 15000); // Update every 15s
        // Log startup to Discord
        await Logger_js_1.default.logSystemEvent('Bot Started', `alterGolden is now online with ${client.guilds.cache.size} guilds`);
        Logger_js_1.default.success('Ready', '🚀 alterGolden is fully operational!');
    }
}
exports.default = new ReadyEvent();
//# sourceMappingURL=ready.js.map