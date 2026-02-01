/**
 * BotCheck Command - Presentation Layer
 * Bot health and status dashboard for owners only
 * @module presentation/commands/owner/botcheck
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const os = require('os');
const { BaseCommand, CommandCategory } = require('../BaseCommand');
const { COLORS } = require('../../constants');
const { isOwner } = require('../../config/owner');
const { formatUptime } = require('../../utils/common/time');

class BotCheckCommand extends BaseCommand {
    constructor() {
        super({
            category: CommandCategory.OWNER,
            cooldown: 10,
            deferReply: true,
            ephemeral: true
        });
    }

    get data() {
        return new SlashCommandBuilder()
            .setName('botcheck')
            .setDescription('View bot health and statistics (Bot Owner Only)');
    }

    async run(interaction) {
        // Owner check
        if (!isOwner(interaction.user.id)) {
            return this.errorReply(interaction, 'This command is restricted to bot owners.');
        }

        const client = interaction.client;
        
        // System metrics
        const memUsage = process.memoryUsage();
        const cpuUsage = os.loadavg()[0];
        
        // Bot statistics
        const guilds = client.guilds.cache.size;
        const users = client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0);
        const channels = client.channels.cache.size;
        
        // Uptime
        const uptime = formatUptime(client.uptime);
        
        // Memory formatting
        const heapUsed = (memUsage.heapUsed / 1024 / 1024).toFixed(2);
        const heapTotal = (memUsage.heapTotal / 1024 / 1024).toFixed(2);
        const rss = (memUsage.rss / 1024 / 1024).toFixed(2);

        const embed = new EmbedBuilder()
            .setTitle('🤖 alterGolden Health Dashboard')
            .setColor(COLORS.SUCCESS)
            .addFields(
                { name: '📊 Status', value: '```Online```', inline: true },
                { name: '⏱️ Uptime', value: `\`\`\`${uptime}\`\`\``, inline: true },
                { name: '🏓 Ping', value: `\`\`\`${client.ws.ping}ms\`\`\``, inline: true },
                { name: '🏠 Servers', value: `\`\`\`${guilds}\`\`\``, inline: true },
                { name: '👥 Users', value: `\`\`\`${users.toLocaleString()}\`\`\``, inline: true },
                { name: '📺 Channels', value: `\`\`\`${channels}\`\`\``, inline: true },
                { name: '💾 Memory (Heap)', value: `\`\`\`${heapUsed}/${heapTotal} MB\`\`\``, inline: true },
                { name: '💽 Memory (RSS)', value: `\`\`\`${rss} MB\`\`\``, inline: true },
                { name: '🖥️ CPU Load', value: `\`\`\`${cpuUsage.toFixed(2)}%\`\`\``, inline: true },
                { name: '🔧 Node.js', value: `\`\`\`${process.version}\`\`\``, inline: true },
                { name: '💻 Platform', value: `\`\`\`${os.platform()} ${os.arch()}\`\`\``, inline: true },
                { name: '📡 Discord.js', value: `\`\`\`v14.x\`\`\``, inline: true }
            )
            .setTimestamp()
            .setFooter({ text: 'Bot Health Dashboard' });

        await this.safeReply(interaction, { embeds: [embed] });
    }
}

module.exports = new BotCheckCommand();



