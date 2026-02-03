/**
 * BotCheck Command - Presentation Layer
 * Bot health and status dashboard for owners only
 * @module presentation/commands/owner/botcheck
 */

import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, version as djsVersion } from 'discord.js';
import os from 'os';
import { BaseCommand, CommandCategory, type CommandData } from '../BaseCommand.js';
import { COLORS } from '../../constants.js';
import { isOwner } from '../../config/owner.js';
import { formatUptime } from '../../utils/common/time.js';

// Helper to get service status
const getServiceStatus = async (name: string, checkFn: () => Promise<boolean> | boolean): Promise<{ name: string; healthy: boolean; error?: string }> => {
    try {
        const healthy = await checkFn();
        return { name, healthy };
    } catch (error) {
        return { name, healthy: false, error: (error as Error).message };
    }
};

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
        
        // Bot statistics
        const guilds = client.guilds.cache.size;
        const users = client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0);
        const channels = client.channels.cache.size;
        const emojis = client.emojis.cache.size;
        
        // Get commands from registry
        let commandCount = 0;
        try {
            const registry = require('../../services/registry/CommandRegistry.js');
            const commandRegistry = registry.default || registry;
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
            const pg = require('../../database/postgres.js');
            const postgres = pg.default || pg;
            await postgres.query('SELECT 1');
            services.push({ name: 'PostgreSQL', healthy: true });
        } catch (e) {
            services.push({ name: 'PostgreSQL', healthy: false, error: (e as Error).message });
        }

        // Redis
        try {
            const redis = require('../../services/guild/RedisCache.js');
            const redisCache = redis.default || redis;
            const stats = await redisCache.getStats?.();
            services.push({ 
                name: 'Redis', 
                healthy: stats?.connected ?? false,
                details: stats?.connected ? 'Connected' : 'Fallback mode'
            });
        } catch (e) {
            services.push({ name: 'Redis', healthy: false, error: (e as Error).message });
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
        } catch (e) {
            services.push({ name: 'Lavalink', healthy: false, error: (e as Error).message });
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
            .setTitle('🤖 alterGolden Health Dashboard')
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

        // Environment info
        const envEmbed = new EmbedBuilder()
            .setTitle('🌍 Environment')
            .setColor(COLORS.INFO)
            .addFields(
                { name: '📂 Working Dir', value: `\`${process.cwd().slice(-40)}\``, inline: false },
                { name: '🌐 Node Env', value: `\`${process.env.NODE_ENV || 'development'}\``, inline: true },
                { name: '🔐 Sentry', value: `\`${process.env.SENTRY_DSN ? 'Enabled' : 'Disabled'}\``, inline: true },
                { name: '📊 Health Port', value: `\`${process.env.HEALTH_PORT || '3000'}\``, inline: true }
            );

        // All embeds for pagination
        const embeds = [mainEmbed, servicesEmbed, memEmbed, envEmbed];
        const embedNames = ['📊 Overview', '🔌 Services', '💾 Memory', '🌍 Environment'];
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

        const reply = await this.safeReply(interaction, { 
            embeds: [embeds[currentPage]],
            components: [getButtons(currentPage)]
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
                components: [getButtons(currentPage)]
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
                await reply.edit({ components: [disabledRow] });
            } catch {
                // Message might be deleted
            }
        });
    }
}

export default new BotCheckCommand();
