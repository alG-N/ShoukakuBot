/**
 * Slowmode Command
 * Set channel slowmode
 * @module commands/admin/slowmode
 */

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } = require('discord.js');
const { BaseCommand } = require('../BaseCommand');
const LockdownService = require('../../services/moderation/LockdownService');
const moderationConfig = require('../../config/features/moderation');

class SlowmodeCommand extends BaseCommand {
    constructor() {
        super('slowmode');
    }

    data = new SlashCommandBuilder()
        .setName('slowmode')
        .setDescription('⏱️ Set slowmode for channels')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addSubcommand(sub =>
            sub.setName('set')
                .setDescription('Set slowmode on a channel')
                .addIntegerOption(opt =>
                    opt.setName('duration')
                        .setDescription('Slowmode duration in seconds (0 to disable)')
                        .setRequired(true)
                        .setMinValue(0)
                        .setMaxValue(21600)
                )
                .addChannelOption(opt =>
                    opt.setName('channel')
                        .setDescription('Channel (current if not specified)')
                        .addChannelTypes(ChannelType.GuildText)
                )
                .addStringOption(opt =>
                    opt.setName('reason')
                        .setDescription('Reason for slowmode')
                        .setMaxLength(500)
                )
        )
        .addSubcommand(sub =>
            sub.setName('off')
                .setDescription('Disable slowmode on a channel')
                .addChannelOption(opt =>
                    opt.setName('channel')
                        .setDescription('Channel (current if not specified)')
                        .addChannelTypes(ChannelType.GuildText)
                )
        )
        .addSubcommand(sub =>
            sub.setName('server')
                .setDescription('⚠️ Set slowmode on ALL text channels')
                .addIntegerOption(opt =>
                    opt.setName('duration')
                        .setDescription('Slowmode duration in seconds')
                        .setRequired(true)
                        .setMinValue(0)
                        .setMaxValue(21600)
                )
        );

    async run(interaction) {
        const subcommand = interaction.options.getSubcommand();
        
        switch (subcommand) {
            case 'set':
                return this._setSlowmode(interaction);
            case 'off':
                return this._disableSlowmode(interaction);
            case 'server':
                return this._serverSlowmode(interaction);
        }
    }
    
    /**
     * Set slowmode on a channel
     */
    async _setSlowmode(interaction) {
        const duration = interaction.options.getInteger('duration');
        const channel = interaction.options.getChannel('channel') || interaction.channel;
        const reason = interaction.options.getString('reason') || 'Slowmode updated';
        
        await interaction.deferReply({ ephemeral: true });
        
        const result = await LockdownService.setSlowmode(
            channel,
            duration,
            `${reason} | By: ${interaction.user.tag}`
        );
        
        if (!result.success) {
            return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(moderationConfig.COLORS.ERROR)
                        .setDescription(`${moderationConfig.EMOJIS.ERROR} ${result.error}`)
                ]
            });
        }
        
        const durationText = duration === 0 
            ? 'disabled' 
            : this._formatDuration(duration);
        
        return interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setColor(duration === 0 
                        ? moderationConfig.COLORS.SUCCESS 
                        : moderationConfig.COLORS.WARNING)
                    .setDescription(duration === 0
                        ? `${moderationConfig.EMOJIS.SUCCESS} Slowmode disabled in ${channel}`
                        : `⏱️ Slowmode set to **${durationText}** in ${channel}`)
            ]
        });
    }
    
    /**
     * Disable slowmode
     */
    async _disableSlowmode(interaction) {
        const channel = interaction.options.getChannel('channel') || interaction.channel;
        
        await interaction.deferReply({ ephemeral: true });
        
        const result = await LockdownService.setSlowmode(
            channel,
            0,
            `Slowmode disabled by ${interaction.user.tag}`
        );
        
        if (!result.success) {
            return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(moderationConfig.COLORS.ERROR)
                        .setDescription(`${moderationConfig.EMOJIS.ERROR} ${result.error}`)
                ]
            });
        }
        
        return interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setColor(moderationConfig.COLORS.SUCCESS)
                    .setDescription(`${moderationConfig.EMOJIS.SUCCESS} Slowmode disabled in ${channel}`)
            ]
        });
    }
    
    /**
     * Server-wide slowmode
     */
    async _serverSlowmode(interaction) {
        const duration = interaction.options.getInteger('duration');
        
        await interaction.deferReply({ ephemeral: true });
        
        const results = await LockdownService.setServerSlowmode(
            interaction.guild,
            duration,
            `Server slowmode by ${interaction.user.tag}`
        );
        
        const durationText = duration === 0 
            ? 'disabled' 
            : this._formatDuration(duration);
        
        return interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setColor(duration === 0 
                        ? moderationConfig.COLORS.SUCCESS 
                        : moderationConfig.COLORS.WARNING)
                    .setTitle(duration === 0 
                        ? '✅ Server Slowmode Disabled' 
                        : '⏱️ Server Slowmode Set')
                    .addFields(
                        { 
                            name: 'Duration', 
                            value: durationText, 
                            inline: true 
                        },
                        { 
                            name: 'Channels Updated', 
                            value: `${results.success.length}`, 
                            inline: true 
                        },
                        { 
                            name: 'Failed', 
                            value: `${results.failed.length}`, 
                            inline: true 
                        }
                    )
                    .setTimestamp()
            ]
        });
    }
    
    /**
     * Format duration to human readable
     * @param {number} seconds 
     * @returns {string}
     */
    _formatDuration(seconds) {
        if (seconds < 60) return `${seconds} seconds`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes`;
        return `${Math.floor(seconds / 3600)} hours`;
    }
}

module.exports = new SlowmodeCommand();
