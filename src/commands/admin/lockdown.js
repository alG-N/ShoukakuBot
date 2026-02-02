/**
 * Lockdown Command
 * Lock/unlock channels or server
 * @module commands/admin/lockdown
 */

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } = require('discord.js');
const { BaseCommand } = require('../BaseCommand');
const LockdownService = require('../../services/moderation/LockdownService');
const moderationConfig = require('../../config/features/moderation');

class LockdownCommand extends BaseCommand {
    constructor() {
        super('lockdown');
    }

    data = new SlashCommandBuilder()
        .setName('lockdown')
        .setDescription('🔒 Lock/unlock channels or entire server')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addSubcommand(sub =>
            sub.setName('channel')
                .setDescription('Lock a specific channel')
                .addChannelOption(opt =>
                    opt.setName('channel')
                        .setDescription('Channel to lock (current if not specified)')
                        .addChannelTypes(ChannelType.GuildText)
                )
                .addStringOption(opt =>
                    opt.setName('reason')
                        .setDescription('Reason for lockdown')
                        .setMaxLength(500)
                )
        )
        .addSubcommand(sub =>
            sub.setName('server')
                .setDescription('⚠️ Lock ALL text channels')
                .addStringOption(opt =>
                    opt.setName('reason')
                        .setDescription('Reason for server lockdown')
                        .setMaxLength(500)
                )
        )
        .addSubcommand(sub =>
            sub.setName('unlock')
                .setDescription('Unlock a channel')
                .addChannelOption(opt =>
                    opt.setName('channel')
                        .setDescription('Channel to unlock (current if not specified)')
                        .addChannelTypes(ChannelType.GuildText)
                )
        )
        .addSubcommand(sub =>
            sub.setName('unlockall')
                .setDescription('Unlock all locked channels')
        )
        .addSubcommand(sub =>
            sub.setName('status')
                .setDescription('View current lockdown status')
        );

    async run(interaction) {
        const subcommand = interaction.options.getSubcommand();
        
        switch (subcommand) {
            case 'channel':
                return this._lockChannel(interaction);
            case 'server':
                return this._lockServer(interaction);
            case 'unlock':
                return this._unlockChannel(interaction);
            case 'unlockall':
                return this._unlockAll(interaction);
            case 'status':
                return this._showStatus(interaction);
        }
    }
    
    /**
     * Lock a single channel
     */
    async _lockChannel(interaction) {
        const channel = interaction.options.getChannel('channel') || interaction.channel;
        const reason = interaction.options.getString('reason') || 'No reason provided';
        
        await interaction.deferReply({ ephemeral: true });
        
        const result = await LockdownService.lockChannel(
            channel,
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
        
        // Send message in locked channel
        const lockEmbed = new EmbedBuilder()
            .setColor(moderationConfig.COLORS.LOCKDOWN)
            .setTitle('🔒 Channel Locked')
            .setDescription('This channel has been locked by a moderator.')
            .addFields({ name: 'Reason', value: reason })
            .setTimestamp();
        
        await channel.send({ embeds: [lockEmbed] }).catch(() => {});
        
        return interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setColor(moderationConfig.COLORS.LOCKDOWN)
                    .setDescription(`${moderationConfig.EMOJIS.LOCK} Successfully locked ${channel}`)
            ]
        });
    }
    
    /**
     * Lock entire server
     */
    async _lockServer(interaction) {
        const reason = interaction.options.getString('reason') || 'Server lockdown';
        
        // Require confirmation
        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(moderationConfig.COLORS.WARNING)
                    .setTitle('⚠️ Server Lockdown Confirmation')
                    .setDescription('This will lock **ALL** text channels in the server.\nType `confirm` within 30 seconds to proceed.')
            ],
            ephemeral: true
        });
        
        // Wait for confirmation
        try {
            const filter = m => m.author.id === interaction.user.id && m.content.toLowerCase() === 'confirm';
            const collected = await interaction.channel.awaitMessages({
                filter,
                max: 1,
                time: 30000,
                errors: ['time']
            });
            
            // Delete confirmation message
            collected.first()?.delete().catch(() => {});
            
        } catch {
            return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(moderationConfig.COLORS.ERROR)
                        .setDescription(`${moderationConfig.EMOJIS.ERROR} Lockdown cancelled - confirmation timed out.`)
                ]
            });
        }
        
        await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setColor(moderationConfig.COLORS.WARNING)
                    .setDescription('🔄 Locking server channels...')
            ]
        });
        
        const results = await LockdownService.lockServer(
            interaction.guild,
            `${reason} | By: ${interaction.user.tag}`
        );
        
        return interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setColor(moderationConfig.COLORS.LOCKDOWN)
                    .setTitle('🔒 Server Locked')
                    .addFields(
                        { name: '✅ Locked', value: `${results.success.length} channels`, inline: true },
                        { name: '⏭️ Skipped', value: `${results.skipped.length} channels`, inline: true },
                        { name: '❌ Failed', value: `${results.failed.length} channels`, inline: true },
                        { name: 'Reason', value: reason }
                    )
                    .setTimestamp()
            ]
        });
    }
    
    /**
     * Unlock a single channel
     */
    async _unlockChannel(interaction) {
        const channel = interaction.options.getChannel('channel') || interaction.channel;
        
        await interaction.deferReply({ ephemeral: true });
        
        const result = await LockdownService.unlockChannel(
            channel,
            `Unlocked by ${interaction.user.tag}`
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
        
        // Send message in unlocked channel
        const unlockEmbed = new EmbedBuilder()
            .setColor(moderationConfig.COLORS.SUCCESS)
            .setTitle('🔓 Channel Unlocked')
            .setDescription('This channel has been unlocked.')
            .setTimestamp();
        
        await channel.send({ embeds: [unlockEmbed] }).catch(() => {});
        
        return interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setColor(moderationConfig.COLORS.SUCCESS)
                    .setDescription(`${moderationConfig.EMOJIS.UNLOCK} Successfully unlocked ${channel}`)
            ]
        });
    }
    
    /**
     * Unlock all channels
     */
    async _unlockAll(interaction) {
        await interaction.deferReply({ ephemeral: true });
        
        const results = await LockdownService.unlockServer(
            interaction.guild,
            `Server unlock by ${interaction.user.tag}`
        );
        
        if (results.success.length === 0 && results.message) {
            return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(moderationConfig.COLORS.INFO)
                        .setDescription(`${moderationConfig.EMOJIS.INFO} ${results.message}`)
                ]
            });
        }
        
        return interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setColor(moderationConfig.COLORS.SUCCESS)
                    .setTitle('🔓 Server Unlocked')
                    .addFields(
                        { name: '✅ Unlocked', value: `${results.success.length} channels`, inline: true },
                        { name: '⏭️ Skipped', value: `${results.skipped.length} channels`, inline: true },
                        { name: '❌ Failed', value: `${results.failed.length} channels`, inline: true }
                    )
                    .setTimestamp()
            ]
        });
    }
    
    /**
     * Show lockdown status
     */
    async _showStatus(interaction) {
        const status = LockdownService.getLockStatus(interaction.guild.id);
        
        let description;
        if (status.lockedCount === 0) {
            description = '✅ No channels are currently locked.';
        } else {
            const channelMentions = status.channelIds
                .slice(0, 20)
                .map(id => `<#${id}>`)
                .join(', ');
            
            const overflow = status.lockedCount > 20 
                ? `\n...and ${status.lockedCount - 20} more` 
                : '';
            
            description = `🔒 **${status.lockedCount}** channels locked:\n${channelMentions}${overflow}`;
        }
        
        return interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(status.lockedCount > 0 
                        ? moderationConfig.COLORS.LOCKDOWN 
                        : moderationConfig.COLORS.SUCCESS)
                    .setTitle('Lockdown Status')
                    .setDescription(description)
            ],
            ephemeral: true
        });
    }
}

module.exports = new LockdownCommand();
