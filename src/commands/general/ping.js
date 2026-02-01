/**
 * Ping Command - Presentation Layer
 * Check bot latency and status
 * @module presentation/commands/general/ping
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { BaseCommand, CommandCategory } = require('../BaseCommand');
const { COLORS } = require('../../constants');

class PingCommand extends BaseCommand {
    constructor() {
        super({
            category: CommandCategory.GENERAL,
            cooldown: 3,
            deferReply: false
        });
    }

    get data() {
        return new SlashCommandBuilder()
            .setName('ping')
            .setDescription('Check bot latency and status');
    }

    async run(interaction) {
        // Calculate latency
        const response = await interaction.reply({ content: 'Pinging...', withResponse: true });
        const sent = response?.resource?.message || await interaction.fetchReply();
        const latency = Math.abs(sent.createdTimestamp - interaction.createdTimestamp);
        const apiLatency = Math.round(interaction.client.ws.ping);
        
        // Calculate uptime
        const uptime = Math.floor(interaction.client.uptime / 1000);
        const days = Math.floor(uptime / 86400);
        const hours = Math.floor((uptime % 86400) / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = uptime % 60;
        
        const uptimeString = [
            days ? `${days}d` : '',
            hours ? `${hours}h` : '',
            minutes ? `${minutes}m` : '',
            seconds ? `${seconds}s` : ''
        ].filter(Boolean).join(' ') || '0s';

        // Determine latency status
        let status, statusColor;
        if (latency < 100) {
            status = '🟢 Excellent';
            statusColor = COLORS.SUCCESS;
        } else if (latency < 200) {
            status = '🟡 Good';
            statusColor = COLORS.WARNING;
        } else {
            status = '🔴 High';
            statusColor = COLORS.ERROR;
        }

        const embed = new EmbedBuilder()
            .setColor(statusColor)
            .setTitle('🏓 Pong!')
            .addFields(
                { name: '📡 Latency', value: `\`${latency}ms\``, inline: true },
                { name: '🌐 API', value: `\`${apiLatency}ms\``, inline: true },
                { name: '📊 Status', value: status, inline: true },
                { name: '⏱️ Uptime', value: `\`${uptimeString}\``, inline: true },
                { name: '🏠 Servers', value: `\`${interaction.client.guilds.cache.size}\``, inline: true },
                { name: '👥 Users', value: `\`${interaction.client.users.cache.size}\``, inline: true }
            )
            .setFooter({ 
                text: `Requested by ${interaction.user.tag}`, 
                iconURL: interaction.user.displayAvatarURL() 
            })
            .setTimestamp();

        await interaction.editReply({ content: '', embeds: [embed] });
    }
}

module.exports = new PingCommand();



