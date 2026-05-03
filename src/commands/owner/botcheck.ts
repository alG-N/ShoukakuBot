/**
 * BotCheck Command - Presentation Layer
 * Bot health and status dashboard for owners only
 * @module presentation/commands/owner/botcheck
 */

import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, version as djsVersion } from 'discord.js';
import { existsSync } from 'fs';
import os from 'os';
import { BaseCommand, CommandCategory, CommandData } from '../baseCommand.js';
import { COLORS } from '../../constants.js';
import { isOwner } from '../../config/owner.js';
import { formatUptime } from '../../utils/common/time.js';
import shardBridge from '../../services/guild/shardBridge.js';
import _commandRegistry from '../../services/registry/commandRegistry.js';
import _postgres from '../../database/postgres.js';
import _lavalinkService from '../../services/music/core/lavalinkService.js';
import * as _coreExports from '../../core/index.js';
import _cacheService from '../../cache/cacheService.js';

type DashboardUrls = {
    port: string;
    localhostUrl: string;
    lanUrls: string[];
};

const RUNNING_IN_CONTAINER = existsSync('/.dockerenv');

function getDashboardPort(): string {
    const configuredPort = process.env.HEALTH_PUBLISHED_PORT || process.env.HEALTH_PORT || '3000';
    return /^\d+$/.test(configuredPort) ? configuredPort : '3000';
}

function getDashboardBindHost(): string {
    const bindHost = (process.env.HEALTH_BIND_HOST || '').trim();
    return bindHost || '127.0.0.1';
}

function getConfiguredLanHosts(): string[] {
    const rawValue = process.env.HEALTH_PUBLIC_HOST || '';

    return [...new Set(
        rawValue
            .split(',')
            .map(host => host.trim())
            .filter(host => host.length > 0 && host !== '127.0.0.1' && host !== 'localhost' && host !== '0.0.0.0')
    )];
}

function getLanIpv4Addresses(): string[] {
    const preferred: string[] = [];
    const fallback: string[] = [];
    const interfaces = os.networkInterfaces();

    for (const interfaceName of Object.keys(interfaces)) {
        const addresses = interfaces[interfaceName];

        if (!Array.isArray(addresses)) {
            continue;
        }

        for (const rawAddress of addresses as unknown[]) {
            const address = rawAddress as {
                address?: string;
                internal?: boolean;
            };
            const ipAddress = address.address;

            if (typeof ipAddress !== 'string' || !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ipAddress) || address.internal) {
                continue;
            }

            if (/^(127\.|169\.254\.)/.test(ipAddress)) {
                continue;
            }

            if (/^(192\.168\.|10\.)/.test(ipAddress)) {
                preferred.push(ipAddress);
                continue;
            }

            if (!RUNNING_IN_CONTAINER && /^172\.(1[6-9]|2\d|3[0-1])\./.test(ipAddress)) {
                fallback.push(ipAddress);
            }
        }
    }

    return [...new Set([...preferred, ...fallback])];
}

function getDashboardUrls(): DashboardUrls {
    const port = getDashboardPort();
    const bindHost = getDashboardBindHost();
    const localhostUrl = `http://localhost:${port}/`;
    const lanUrls = new Set<string>();

    for (const host of getConfiguredLanHosts()) {
        lanUrls.add(`http://${host}:${port}/`);
    }

    if (bindHost !== '127.0.0.1' && bindHost !== 'localhost' && bindHost !== '0.0.0.0') {
        lanUrls.add(`http://${bindHost}:${port}/`);
    }

    if (bindHost === '0.0.0.0') {
        for (const ip of getLanIpv4Addresses()) {
            lanUrls.add(`http://${ip}:${port}/`);
        }
    }

    return {
        port,
        localhostUrl,
        lanUrls: [...lanUrls]
    };
}

class BotCheckCommand extends BaseCommand {
    constructor() {
        super({
            category: CommandCategory.OWNER,
            cooldown: 10,
            deferReply: true,
            ephemeral: true
        });
    }

    get data(): CommandData {
        return new SlashCommandBuilder()
            .setName('botcheck')
            .setDescription('View bot health and statistics (Bot Owner Only)');
    }

    async run(interaction: ChatInputCommandInteraction): Promise<void> {
        // Owner check
        if (!isOwner(interaction.user.id)) {
            await this.errorReply(interaction, 'This command is restricted to bot owners.');
            return;
        }

        const dashboardUrls = getDashboardUrls();
        const primaryLanUrl = dashboardUrls.lanUrls[0] || null;
        const client = interaction.client;
        
        // System metrics
        const memUsage = process.memoryUsage();
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        
        // CPU usage - works on both Windows and Unix
        const cpus = os.cpus();
        const cpuCount = cpus.length;
        let totalIdle = 0, totalTick = 0;
        for (const cpu of cpus) {
            for (const type in cpu.times) {
                totalTick += cpu.times[type as keyof typeof cpu.times];
            }
            totalIdle += cpu.times.idle;
        }
        const cpuPercent = ((1 - totalIdle / totalTick) * 100).toFixed(1);
        
        // Process CPU usage
        const processCpu = process.cpuUsage();
        const processUpMs = process.uptime() * 1000000; // microseconds
        const processCpuPercent = ((processCpu.user + processCpu.system) / processUpMs * 100).toFixed(1);
        
        // Bot statistics - use ShardBridge for cross-shard aggregation
        const shardInfo = shardBridge.getShardInfo();
        let guilds: number, users: number, channels: number;
        
        if (shardInfo.totalShards > 1 && shardInfo.isInitialized) {
            // Multi-shard: aggregate from all shards
            const aggregateStats = await shardBridge.getAggregateStats();
            guilds = aggregateStats.totalGuilds;
            users = aggregateStats.totalUsers;
            channels = aggregateStats.totalChannels;
        } else {
            // Single shard: use local cache
            guilds = client.guilds.cache.size;
            users = client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0);
            channels = client.channels.cache.size;
        }
        
        const emojis = client.emojis.cache.size;
        
        // Get commands from registry
        let commandCount = 0;
        try {
            const commandRegistry = _commandRegistry as any;
            commandCount = commandRegistry.commands?.size ?? commandRegistry.getAll?.()?.length ?? 0;
        } catch {
            commandCount = client.application?.commands.cache.size ?? 0;
        }
        
        // Uptime
        const uptime = formatUptime(client.uptime ?? 0);
        const processUptime = formatUptime(process.uptime() * 1000);
        
        // Memory formatting
        const heapUsed = (memUsage.heapUsed / 1024 / 1024).toFixed(2);
        const heapTotal = (memUsage.heapTotal / 1024 / 1024).toFixed(2);
        const rss = (memUsage.rss / 1024 / 1024).toFixed(2);
        const external = (memUsage.external / 1024 / 1024).toFixed(2);
        const totalMemGB = (totalMem / 1024 / 1024 / 1024).toFixed(2);
        const freeMemGB = (freeMem / 1024 / 1024 / 1024).toFixed(2);
        const usedMemPercent = (((totalMem - freeMem) / totalMem) * 100).toFixed(1);

        // Service health checks
        const services: { name: string; healthy: boolean; error?: string; details?: string }[] = [];
        
        // Discord
        services.push({
            name: 'Discord Gateway',
            healthy: client.ws.ping < 500 && client.ws.ping > 0,
            details: `${client.ws.ping}ms`
        });

        // PostgreSQL
        try {
            const postgres = _postgres as any;
            await postgres.query('SELECT 1');
            services.push({ name: 'PostgreSQL', healthy: true });
        } catch (e) {
            services.push({ name: 'PostgreSQL', healthy: false, error: (e as Error).message });
        }

        // Redis - Check actual Redis connection by pinging via CacheService
        try {
            const cacheModule = await import('../../cache/cacheService.js');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const mod = (cacheModule.default || cacheModule) as any;
            const cacheServiceInstance = (mod && typeof mod === 'object' && 'default' in mod) ? mod.default : mod;
            
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
                } else {
                    services.push({ 
                        name: 'Redis', 
                        healthy: true,
                        details: 'Fallback (in-memory)'
                    });
                }
            } else {
                // Check if Redis is available via the flag
                const isAvailable = cacheServiceInstance.isRedisAvailable?.();
                services.push({ 
                    name: 'Redis', 
                    healthy: true,
                    details: isAvailable ? 'Connected' : 'Fallback (in-memory)'
                });
            }
        } catch (e) {
            services.push({ name: 'Redis', healthy: false, error: (e as Error).message });
        }

        // Lavalink
        try {
            const lavalinkService = _lavalinkService as any;
            const status = lavalinkService.getNodeStatus?.();
            services.push({
                name: 'Lavalink',
                healthy: status?.ready ?? false,
                details: status?.nodes?.length ? `${status.nodes.length} node(s)` : 'No nodes'
            });
        } catch (e) {
            services.push({ name: 'Lavalink', healthy: false, error: (e as Error).message });
        }

        // Circuit Breakers
        try {
            const circuitBreakerRegistry = (_coreExports as any).circuitBreakerRegistry;
            if (circuitBreakerRegistry) {
                const summary = circuitBreakerRegistry.getSummary?.();
                services.push({
                    name: 'Circuit Breakers',
                    healthy: (summary?.open ?? 0) === 0,
                    details: summary ? `${summary.closed}/${summary.total} closed` : 'N/A'
                });
            }
        } catch {
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
        const mainEmbed = new EmbedBuilder()
            .setTitle('🤖 Shoukaku Health Dashboard')
            .setColor(services.every(s => s.healthy) ? COLORS.SUCCESS : COLORS.WARNING)
            .setDescription(`**Status:** ${services.every(s => s.healthy) ? '🟢 All Systems Operational' : '🟡 Degraded Performance'}`)
            .addFields(
                { name: '⏱️ Bot Uptime', value: `\`${uptime}\``, inline: true },
                { name: '⏱️ Process Uptime', value: `\`${processUptime}\``, inline: true },
                { name: '🏓 Gateway Ping', value: `\`${client.ws.ping}ms\``, inline: true },
                { name: '🏠 Servers', value: `\`${guilds.toLocaleString()}\``, inline: true },
                { name: '👥 Users', value: `\`${users.toLocaleString()}\``, inline: true },
                { name: '📺 Channels', value: `\`${channels.toLocaleString()}\``, inline: true },
                { name: '😀 Emojis', value: `\`${emojis.toLocaleString()}\``, inline: true },
                { name: '⚡ Commands', value: `\`${commandCount}\``, inline: true },
                { name: '🔌 Shards', value: `\`${client.shard?.count ?? 1}\``, inline: true }
            )
            .setTimestamp()
            .setFooter({ text: `PID: ${process.pid} | Node ${process.version}` });

        // Memory embed
        const memEmbed = new EmbedBuilder()
            .setTitle('💾 Memory & System')
            .setColor(COLORS.INFO)
            .addFields(
                { name: '📊 Heap Used', value: `\`${heapUsed} MB\``, inline: true },
                { name: '📊 Heap Total', value: `\`${heapTotal} MB\``, inline: true },
                { name: '📊 RSS', value: `\`${rss} MB\``, inline: true },
                { name: '📊 External', value: `\`${external} MB\``, inline: true },
                { name: '🖥️ System RAM', value: `\`${usedMemPercent}% used\``, inline: true },
                { name: '🖥️ Free RAM', value: `\`${freeMemGB}/${totalMemGB} GB\``, inline: true },
                { name: '🔧 System CPU', value: `\`${cpuPercent}%\``, inline: true },
                { name: '🔧 Process CPU', value: `\`${processCpuPercent}%\``, inline: true },
                { name: '🔧 CPU Cores', value: `\`${cpuCount}\``, inline: true },
                { name: '💻 Platform', value: `\`${os.platform()} ${os.arch()}\``, inline: true },
                { name: '🔧 Node.js', value: `\`${process.version}\``, inline: true },
                { name: '📦 Discord.js', value: `\`v${djsVersion}\``, inline: true }
            );

        // Services embed
        const servicesEmbed = new EmbedBuilder()
            .setTitle('🔌 Services Status')
            .setColor(services.every(s => s.healthy) ? COLORS.SUCCESS : COLORS.ERROR)
            .setDescription(serviceLines.join('\n'));

        // Database & Cache details embed
        let dbPoolInfo = 'N/A';
        let cacheInfo = 'N/A';
        let redisInfo = 'N/A';
        
        try {
            const postgres = _postgres as any;
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
        } catch {
            dbPoolInfo = 'Unable to fetch';
        }

        try {
            const cacheService = _cacheService as any;
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
        } catch {
            cacheInfo = 'Unable to fetch';
        }

        try {
            const cacheModule = await import('../../cache/cacheService.js');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const mod2 = (cacheModule.default || cacheModule) as any;
            const cacheServiceInstance = (mod2 && typeof mod2 === 'object' && 'default' in mod2) ? mod2.default : mod2;
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
                } catch {
                    redisInfo = '**Status:** 🟡 Fallback Mode (in-memory)';
                }
            } else {
                const isAvailable = cacheServiceInstance.isRedisAvailable?.();
                redisInfo = isAvailable 
                    ? '**Status:** 🟢 Connected (via CacheService)'
                    : '**Status:** 🟡 Fallback Mode (in-memory)';
            }
        } catch {
            redisInfo = '**Status:** 🔴 Error fetching info';
        }

        const dataEmbed = new EmbedBuilder()
            .setTitle('🗄️ Database & Cache')
            .setColor(COLORS.INFO)
            .addFields(
                { name: '🐘 PostgreSQL', value: dbPoolInfo, inline: false },
                { name: '📦 Cache Service', value: cacheInfo, inline: true },
                { name: '🔴 Redis', value: redisInfo, inline: true }
            );

        // Environment info
        const envEmbed = new EmbedBuilder()
            .setTitle('🌍 Environment')
            .setColor(COLORS.INFO)
            .addFields(
                { name: '📂 Working Dir', value: `\`${process.cwd().slice(-40)}\``, inline: false },
                { name: '🌐 Node Env', value: `\`${process.env.NODE_ENV || 'development'}\``, inline: true },
                { name: '🔐 Sentry', value: `\`${process.env.SENTRY_DSN ? 'Enabled' : 'Disabled'}\``, inline: true },
                { name: '📊 Health Port', value: `\`${dashboardUrls.port}\``, inline: true },
                { name: '🔗 Local Dashboard', value: `[Open local dashboard](${dashboardUrls.localhostUrl})\n\`${dashboardUrls.localhostUrl}\``, inline: false },
                {
                    name: '🌐 LAN Dashboard',
                    value: dashboardUrls.lanUrls.length > 0
                        ? dashboardUrls.lanUrls.slice(0, 4).map(url => `[${url}](${url})`).join('\n')
                        : 'No LAN dashboard URL detected. Set `HEALTH_BIND_HOST=0.0.0.0` and, for Docker, `HEALTH_PUBLIC_HOST=<host-ip>` to expose one here.',
                    inline: false
                }
            );

        // All embeds for pagination
        const embeds = [mainEmbed, servicesEmbed, dataEmbed, memEmbed, envEmbed];
        const embedNames = ['📊 Overview', '🔌 Services', '🗄️ Data', '💾 Memory', '🌍 Environment'];
        let currentPage = 0;

        // Build buttons
        const getButtons = (page: number) => {
            return new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId('botcheck_first')
                    .setEmoji('⏮️')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === 0),
                new ButtonBuilder()
                    .setCustomId('botcheck_prev')
                    .setEmoji('◀️')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(page === 0),
                new ButtonBuilder()
                    .setCustomId('botcheck_page')
                    .setLabel(`${page + 1}/${embeds.length} • ${embedNames[page]}`)
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId('botcheck_next')
                    .setEmoji('▶️')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(page === embeds.length - 1),
                new ButtonBuilder()
                    .setCustomId('botcheck_last')
                    .setEmoji('⏭️')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === embeds.length - 1)
            );
        };

        const getLinkRow = () => {
            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setLabel('Open Local Dashboard')
                    .setStyle(ButtonStyle.Link)
                    .setURL(dashboardUrls.localhostUrl)
            );

            if (primaryLanUrl) {
                row.addComponents(
                    new ButtonBuilder()
                        .setLabel('Open LAN Dashboard')
                        .setStyle(ButtonStyle.Link)
                        .setURL(primaryLanUrl)
                );
            }

            return row;
        };

        const reply = await this.safeReply(interaction, { 
            embeds: [embeds[currentPage]],
            components: [getButtons(currentPage), getLinkRow()]
        });

        if (!reply) return;

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
                components: [getButtons(currentPage), getLinkRow()]
            });
        });

        collector.on('end', async () => {
            try {
                // Disable buttons after timeout
                const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder().setCustomId('botcheck_first').setEmoji('⏮️').setStyle(ButtonStyle.Secondary).setDisabled(true),
                    new ButtonBuilder().setCustomId('botcheck_prev').setEmoji('◀️').setStyle(ButtonStyle.Primary).setDisabled(true),
                    new ButtonBuilder().setCustomId('botcheck_page').setLabel(`${currentPage + 1}/${embeds.length}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
                    new ButtonBuilder().setCustomId('botcheck_next').setEmoji('▶️').setStyle(ButtonStyle.Primary).setDisabled(true),
                    new ButtonBuilder().setCustomId('botcheck_last').setEmoji('⏭️').setStyle(ButtonStyle.Secondary).setDisabled(true)
                );
                await reply.edit({ components: [disabledRow, getLinkRow()] });
            } catch {
                // Message might be deleted
            }
        });
    }
}

export default new BotCheckCommand();

