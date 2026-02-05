"use strict";
/**
 * BotCheck Command - Presentation Layer
 * Bot health and status dashboard for owners only
 * @module presentation/commands/owner/botcheck
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const os_1 = __importDefault(require("os"));
const BaseCommand_js_1 = require("../BaseCommand.js");
const constants_js_1 = require("../../constants.js");
const owner_js_1 = require("../../config/owner.js");
const time_js_1 = require("../../utils/common/time.js");
const ShardBridge_js_1 = __importDefault(require("../../services/guild/ShardBridge.js"));
// Helper to get service status
const getServiceStatus = async (name, checkFn) => {
    try {
        const healthy = await checkFn();
        return { name, healthy };
    }
    catch (error) {
        return { name, healthy: false, error: error.message };
    }
};
class BotCheckCommand extends BaseCommand_js_1.BaseCommand {
    constructor() {
        super({
            category: BaseCommand_js_1.CommandCategory.OWNER,
            cooldown: 10,
            deferReply: true,
            ephemeral: true
        });
    }
    get data() {
        return new discord_js_1.SlashCommandBuilder()
            .setName('botcheck')
            .setDescription('View bot health and statistics (Bot Owner Only)');
    }
    async run(interaction) {
        // Owner check
        if (!(0, owner_js_1.isOwner)(interaction.user.id)) {
            await this.errorReply(interaction, 'This command is restricted to bot owners.');
            return;
        }
        const client = interaction.client;
        // System metrics
        const memUsage = process.memoryUsage();
        const totalMem = os_1.default.totalmem();
        const freeMem = os_1.default.freemem();
        // CPU usage - works on both Windows and Unix
        const cpus = os_1.default.cpus();
        const cpuCount = cpus.length;
        let totalIdle = 0, totalTick = 0;
        for (const cpu of cpus) {
            for (const type in cpu.times) {
                totalTick += cpu.times[type];
            }
            totalIdle += cpu.times.idle;
        }
        const cpuPercent = ((1 - totalIdle / totalTick) * 100).toFixed(1);
        // Process CPU usage
        const processCpu = process.cpuUsage();
        const processUpMs = process.uptime() * 1000000; // microseconds
        const processCpuPercent = ((processCpu.user + processCpu.system) / processUpMs * 100).toFixed(1);
        // Bot statistics - use ShardBridge for cross-shard aggregation
        const shardInfo = ShardBridge_js_1.default.getShardInfo();
        let guilds, users, channels;
        if (shardInfo.totalShards > 1 && shardInfo.isInitialized) {
            // Multi-shard: aggregate from all shards
            const aggregateStats = await ShardBridge_js_1.default.getAggregateStats();
            guilds = aggregateStats.totalGuilds;
            users = aggregateStats.totalUsers;
            channels = aggregateStats.totalChannels;
        }
        else {
            // Single shard: use local cache
            guilds = client.guilds.cache.size;
            users = client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0);
            channels = client.channels.cache.size;
        }
        const emojis = client.emojis.cache.size;
        // Get commands from registry
        let commandCount = 0;
        try {
            const registry = require('../../services/registry/CommandRegistry.js');
            const commandRegistry = registry.default || registry;
            commandCount = commandRegistry.commands?.size ?? commandRegistry.getAll?.()?.length ?? 0;
        }
        catch {
            commandCount = client.application?.commands.cache.size ?? 0;
        }
        // Uptime
        const uptime = (0, time_js_1.formatUptime)(client.uptime ?? 0);
        const processUptime = (0, time_js_1.formatUptime)(process.uptime() * 1000);
        // Memory formatting
        const heapUsed = (memUsage.heapUsed / 1024 / 1024).toFixed(2);
        const heapTotal = (memUsage.heapTotal / 1024 / 1024).toFixed(2);
        const rss = (memUsage.rss / 1024 / 1024).toFixed(2);
        const external = (memUsage.external / 1024 / 1024).toFixed(2);
        const totalMemGB = (totalMem / 1024 / 1024 / 1024).toFixed(2);
        const freeMemGB = (freeMem / 1024 / 1024 / 1024).toFixed(2);
        const usedMemPercent = (((totalMem - freeMem) / totalMem) * 100).toFixed(1);
        // Service health checks
        const services = [];
        // Discord
        services.push({
            name: 'Discord Gateway',
            healthy: client.ws.ping < 500 && client.ws.ping > 0,
            details: `${client.ws.ping}ms`
        });
        // PostgreSQL
        try {
            const pg = require('../../database/postgres.js');
            const postgres = pg.default || pg;
            await postgres.query('SELECT 1');
            services.push({ name: 'PostgreSQL', healthy: true });
        }
        catch (e) {
            services.push({ name: 'PostgreSQL', healthy: false, error: e.message });
        }
        // Redis - Check actual Redis connection by pinging via CacheService
        try {
            const cacheModule = await import('../../cache/CacheService.js');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const cacheServiceInstance = (cacheModule.default || cacheModule);
            const redisClient = cacheServiceInstance.getRedis?.();
            if (redisClient) {
                // Actually ping Redis to verify connection
                const pong = await redisClient.ping();
                if (pong === 'PONG') {
                    services.push({
                        name: 'Redis',
                        healthy: true,
                        details: 'Connected'
                    });
                }
                else {
                    services.push({
                        name: 'Redis',
                        healthy: true,
                        details: 'Fallback (in-memory)'
                    });
                }
            }
            else {
                // Check if Redis is available via the flag
                const isAvailable = cacheServiceInstance.isRedisAvailable?.();
                services.push({
                    name: 'Redis',
                    healthy: true,
                    details: isAvailable ? 'Connected' : 'Fallback (in-memory)'
                });
            }
        }
        catch (e) {
            services.push({ name: 'Redis', healthy: false, error: e.message });
        }
        // Lavalink
        try {
            const lavalink = require('../../services/music/LavalinkService.js');
            const lavalinkService = lavalink.default || lavalink;
            const status = lavalinkService.getNodeStatus?.();
            services.push({
                name: 'Lavalink',
                healthy: status?.ready ?? false,
                details: status?.nodes?.length ? `${status.nodes.length} node(s)` : 'No nodes'
            });
        }
        catch (e) {
            services.push({ name: 'Lavalink', healthy: false, error: e.message });
        }
        // Circuit Breakers
        try {
            const cb = require('../../core/index.js');
            const circuitBreakerRegistry = cb.circuitBreakerRegistry || cb.default?.circuitBreakerRegistry;
            if (circuitBreakerRegistry) {
                const summary = circuitBreakerRegistry.getSummary?.();
                services.push({
                    name: 'Circuit Breakers',
                    healthy: (summary?.open ?? 0) === 0,
                    details: summary ? `${summary.closed}/${summary.total} closed` : 'N/A'
                });
            }
        }
        catch {
            // Circuit breakers optional
        }
        // Build service status string
        const serviceLines = services.map(s => {
            const icon = s.healthy ? '✅' : '❌';
            const detail = s.details ? ` (${s.details})` : '';
            const error = s.error ? ` - ${s.error.slice(0, 30)}` : '';
            return `${icon} **${s.name}**${detail}${error}`;
        });
        // Main embed
        const mainEmbed = new discord_js_1.EmbedBuilder()
            .setTitle('🤖 alterGolden Health Dashboard')
            .setColor(services.every(s => s.healthy) ? constants_js_1.COLORS.SUCCESS : constants_js_1.COLORS.WARNING)
            .setDescription(`**Status:** ${services.every(s => s.healthy) ? '🟢 All Systems Operational' : '🟡 Degraded Performance'}`)
            .addFields({ name: '⏱️ Bot Uptime', value: `\`${uptime}\``, inline: true }, { name: '⏱️ Process Uptime', value: `\`${processUptime}\``, inline: true }, { name: '🏓 Gateway Ping', value: `\`${client.ws.ping}ms\``, inline: true }, { name: '🏠 Servers', value: `\`${guilds.toLocaleString()}\``, inline: true }, { name: '👥 Users', value: `\`${users.toLocaleString()}\``, inline: true }, { name: '📺 Channels', value: `\`${channels.toLocaleString()}\``, inline: true }, { name: '😀 Emojis', value: `\`${emojis.toLocaleString()}\``, inline: true }, { name: '⚡ Commands', value: `\`${commandCount}\``, inline: true }, { name: '🔌 Shards', value: `\`${client.shard?.count ?? 1}\``, inline: true })
            .setTimestamp()
            .setFooter({ text: `PID: ${process.pid} | Node ${process.version}` });
        // Memory embed
        const memEmbed = new discord_js_1.EmbedBuilder()
            .setTitle('💾 Memory & System')
            .setColor(constants_js_1.COLORS.INFO)
            .addFields({ name: '📊 Heap Used', value: `\`${heapUsed} MB\``, inline: true }, { name: '📊 Heap Total', value: `\`${heapTotal} MB\``, inline: true }, { name: '📊 RSS', value: `\`${rss} MB\``, inline: true }, { name: '📊 External', value: `\`${external} MB\``, inline: true }, { name: '🖥️ System RAM', value: `\`${usedMemPercent}% used\``, inline: true }, { name: '🖥️ Free RAM', value: `\`${freeMemGB}/${totalMemGB} GB\``, inline: true }, { name: '🔧 System CPU', value: `\`${cpuPercent}%\``, inline: true }, { name: '🔧 Process CPU', value: `\`${processCpuPercent}%\``, inline: true }, { name: '🔧 CPU Cores', value: `\`${cpuCount}\``, inline: true }, { name: '💻 Platform', value: `\`${os_1.default.platform()} ${os_1.default.arch()}\``, inline: true }, { name: '🔧 Node.js', value: `\`${process.version}\``, inline: true }, { name: '📦 Discord.js', value: `\`v${discord_js_1.version}\``, inline: true });
        // Services embed
        const servicesEmbed = new discord_js_1.EmbedBuilder()
            .setTitle('🔌 Services Status')
            .setColor(services.every(s => s.healthy) ? constants_js_1.COLORS.SUCCESS : constants_js_1.COLORS.ERROR)
            .setDescription(serviceLines.join('\n'));
        // Database & Cache details embed
        let dbPoolInfo = 'N/A';
        let cacheInfo = 'N/A';
        let redisInfo = 'N/A';
        try {
            const pg = require('../../database/postgres.js');
            const postgres = pg.default || pg;
            const dbStatus = postgres.getStatus?.();
            if (dbStatus) {
                dbPoolInfo = [
                    `**Connection Pooling:** ✅ Enabled`,
                    `**Status:** ${dbStatus.isConnected ? '🟢 Connected' : '🔴 Disconnected'}`,
                    `**State:** ${dbStatus.state}`,
                    `**Max Pool:** \`${process.env.DB_POOL_MAX || '15'}\``,
                    `**Min Pool:** \`${process.env.DB_POOL_MIN || '2'}\``,
                    `**Pending Writes:** \`${dbStatus.pendingWrites}\``,
                    `**Read Replica:** ${dbStatus.readReplica?.enabled ? `✅ ${dbStatus.readReplica.host}` : '❌ Disabled'}`
                ].join('\n');
            }
        }
        catch {
            dbPoolInfo = 'Unable to fetch';
        }
        try {
            const cache = require('../../cache/CacheService.js');
            const cacheService = cache.default || cache;
            const stats = cacheService.getStats?.();
            if (stats) {
                const hitRate = (stats.hitRate * 100).toFixed(1);
                cacheInfo = [
                    `**Hit Rate:** \`${hitRate}%\``,
                    `**Hits:** \`${stats.hits.toLocaleString()}\``,
                    `**Misses:** \`${stats.misses.toLocaleString()}\``,
                    `**Memory Entries:** \`${stats.memoryEntries.toLocaleString()}\``,
                    `**Namespaces:** \`${stats.namespaces?.length || 0}\``
                ].join('\n');
            }
        }
        catch {
            cacheInfo = 'Unable to fetch';
        }
        try {
            const cacheModule = await import('../../cache/CacheService.js');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const cacheServiceInstance = (cacheModule.default || cacheModule);
            const redisClient = cacheServiceInstance.getRedis?.();
            if (redisClient) {
                try {
                    const [memoryInfo, clientsInfo] = await Promise.all([
                        redisClient.info('memory'),
                        redisClient.info('clients')
                    ]);
                    const usedMemoryMatch = memoryInfo.match(/used_memory_human:(\S+)/);
                    const usedMemory = usedMemoryMatch?.[1] || 'N/A';
                    const connectedMatch = clientsInfo.match(/connected_clients:(\d+)/);
                    const clients = connectedMatch?.[1] || 'N/A';
                    redisInfo = [
                        `**Status:** 🟢 Connected`,
                        `**Memory Used:** \`${usedMemory}\``,
                        `**Connected Clients:** \`${clients}\``,
                        `**Host:** \`${process.env.REDIS_HOST || 'localhost'}\``
                    ].join('\n');
                }
                catch {
                    redisInfo = '**Status:** 🟡 Fallback Mode (in-memory)';
                }
            }
            else {
                const isAvailable = cacheServiceInstance.isRedisAvailable?.();
                redisInfo = isAvailable
                    ? '**Status:** 🟢 Connected (via CacheService)'
                    : '**Status:** 🟡 Fallback Mode (in-memory)';
            }
        }
        catch {
            redisInfo = '**Status:** 🔴 Error fetching info';
        }
        const dataEmbed = new discord_js_1.EmbedBuilder()
            .setTitle('🗄️ Database & Cache')
            .setColor(constants_js_1.COLORS.INFO)
            .addFields({ name: '🐘 PostgreSQL', value: dbPoolInfo, inline: false }, { name: '📦 Cache Service', value: cacheInfo, inline: true }, { name: '🔴 Redis', value: redisInfo, inline: true });
        // Environment info
        const envEmbed = new discord_js_1.EmbedBuilder()
            .setTitle('🌍 Environment')
            .setColor(constants_js_1.COLORS.INFO)
            .addFields({ name: '📂 Working Dir', value: `\`${process.cwd().slice(-40)}\``, inline: false }, { name: '🌐 Node Env', value: `\`${process.env.NODE_ENV || 'development'}\``, inline: true }, { name: '🔐 Sentry', value: `\`${process.env.SENTRY_DSN ? 'Enabled' : 'Disabled'}\``, inline: true }, { name: '📊 Health Port', value: `\`${process.env.HEALTH_PORT || '3000'}\``, inline: true });
        // All embeds for pagination
        const embeds = [mainEmbed, servicesEmbed, dataEmbed, memEmbed, envEmbed];
        const embedNames = ['📊 Overview', '🔌 Services', '🗄️ Data', '💾 Memory', '🌍 Environment'];
        let currentPage = 0;
        // Build buttons
        const getButtons = (page) => {
            return new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
                .setCustomId('botcheck_first')
                .setEmoji('⏮️')
                .setStyle(discord_js_1.ButtonStyle.Secondary)
                .setDisabled(page === 0), new discord_js_1.ButtonBuilder()
                .setCustomId('botcheck_prev')
                .setEmoji('◀️')
                .setStyle(discord_js_1.ButtonStyle.Primary)
                .setDisabled(page === 0), new discord_js_1.ButtonBuilder()
                .setCustomId('botcheck_page')
                .setLabel(`${page + 1}/${embeds.length} • ${embedNames[page]}`)
                .setStyle(discord_js_1.ButtonStyle.Secondary)
                .setDisabled(true), new discord_js_1.ButtonBuilder()
                .setCustomId('botcheck_next')
                .setEmoji('▶️')
                .setStyle(discord_js_1.ButtonStyle.Primary)
                .setDisabled(page === embeds.length - 1), new discord_js_1.ButtonBuilder()
                .setCustomId('botcheck_last')
                .setEmoji('⏭️')
                .setStyle(discord_js_1.ButtonStyle.Secondary)
                .setDisabled(page === embeds.length - 1));
        };
        const reply = await this.safeReply(interaction, {
            embeds: [embeds[currentPage]],
            components: [getButtons(currentPage)]
        });
        if (!reply)
            return;
        // Collector for button interactions
        const collector = reply.createMessageComponentCollector({
            filter: (i) => i.user.id === interaction.user.id && i.customId.startsWith('botcheck_'),
            time: 5 * 60 * 1000 // 5 minutes
        });
        collector.on('collect', async (i) => {
            switch (i.customId) {
                case 'botcheck_first':
                    currentPage = 0;
                    break;
                case 'botcheck_prev':
                    currentPage = Math.max(0, currentPage - 1);
                    break;
                case 'botcheck_next':
                    currentPage = Math.min(embeds.length - 1, currentPage + 1);
                    break;
                case 'botcheck_last':
                    currentPage = embeds.length - 1;
                    break;
            }
            await i.update({
                embeds: [embeds[currentPage]],
                components: [getButtons(currentPage)]
            });
        });
        collector.on('end', async () => {
            try {
                // Disable buttons after timeout
                const disabledRow = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder().setCustomId('botcheck_first').setEmoji('⏮️').setStyle(discord_js_1.ButtonStyle.Secondary).setDisabled(true), new discord_js_1.ButtonBuilder().setCustomId('botcheck_prev').setEmoji('◀️').setStyle(discord_js_1.ButtonStyle.Primary).setDisabled(true), new discord_js_1.ButtonBuilder().setCustomId('botcheck_page').setLabel(`${currentPage + 1}/${embeds.length}`).setStyle(discord_js_1.ButtonStyle.Secondary).setDisabled(true), new discord_js_1.ButtonBuilder().setCustomId('botcheck_next').setEmoji('▶️').setStyle(discord_js_1.ButtonStyle.Primary).setDisabled(true), new discord_js_1.ButtonBuilder().setCustomId('botcheck_last').setEmoji('⏭️').setStyle(discord_js_1.ButtonStyle.Secondary).setDisabled(true));
                await reply.edit({ components: [disabledRow] });
            }
            catch {
                // Message might be deleted
            }
        });
    }
}
exports.default = new BotCheckCommand();
//# sourceMappingURL=botcheck.js.map