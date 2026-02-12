/**
 * Lockdown Command
 * Lock/unlock channels or server
 * @module commands/admin/lockdown
 */

import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    PermissionFlagsBits, 
    ChannelType,
    ChatInputCommandInteraction,
    TextChannel
} from 'discord.js';
import { BaseCommand, CommandCategory, type CommandData } from '../BaseCommand.js';

import { getDefault } from '../../utils/common/moduleHelper.js';
interface ModerationConfig {
    COLORS: Record<string, number>;
    EMOJIS: Record<string, string>;
}

interface LockResult {
    success: boolean;
    error?: string;
}

interface ServerLockResult {
    success: string[];
    skipped: string[];
    failed: string[];
    message?: string;
}

interface LockStatus {
    lockedCount: number;
    channelIds: string[];
}

interface LockdownService {
    lockChannel?: (channel: TextChannel, reason: string) => Promise<LockResult>;
    unlockChannel?: (channel: TextChannel, reason: string) => Promise<LockResult>;
    lockServer?: (guild: ChatInputCommandInteraction['guild'], reason: string) => Promise<ServerLockResult>;
    unlockServer?: (guild: ChatInputCommandInteraction['guild'], reason: string) => Promise<ServerLockResult>;
    getLockStatus?: (guildId: string) => Promise<LockStatus>;
}


let lockdownService: LockdownService | undefined;
let moderationConfig: ModerationConfig | undefined;

try {
    lockdownService = getDefault(require('../../services/moderation/LockdownService'));
    moderationConfig = getDefault(require('../../config/features/moderation'));
} catch {
    // Service not available
}

class LockdownCommand extends BaseCommand {
    constructor() {
        super({
            category: CommandCategory.ADMIN,
            cooldown: 5,
            deferReply: false,
            userPermissions: [PermissionFlagsBits.ManageChannels]
        });
    }

    get data(): CommandData {
        return new SlashCommandBuilder()
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
    }

    async run(interaction: ChatInputCommandInteraction): Promise<void> {
        const subcommand = interaction.options.getSubcommand();
        
        switch (subcommand) {
            case 'channel':
                await this._lockChannel(interaction);
                break;
            case 'server':
                await this._lockServer(interaction);
                break;
            case 'unlock':
                await this._unlockChannel(interaction);
                break;
            case 'unlockall':
                await this._unlockAll(interaction);
                break;
            case 'status':
                await this._showStatus(interaction);
                break;
        }
    }
    
    /**
     * Lock a single channel
     */
    private async _lockChannel(interaction: ChatInputCommandInteraction): Promise<void> {
        const channel = (interaction.options.getChannel('channel') || interaction.channel) as TextChannel;
        const reason = interaction.options.getString('reason') || 'No reason provided';
        
        await interaction.deferReply({ ephemeral: true });
        
        const result = await lockdownService?.lockChannel?.(
            channel,
            `${reason} | By: ${interaction.user.tag}`
        );
        
        if (result && !result.success) {
            await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(moderationConfig?.COLORS?.ERROR || 0xFF0000)
                        .setDescription(`${moderationConfig?.EMOJIS?.ERROR || '❌'} ${result.error}`)
                ]
            });
            return;
        }
        
        // Send message in locked channel
        const lockEmbed = new EmbedBuilder()
            .setColor(moderationConfig?.COLORS?.LOCKDOWN || 0xFF5555)
            .setTitle('🔒 Channel Locked')
            .setDescription('This channel has been locked by a moderator.')
            .addFields({ name: 'Reason', value: reason })
            .setTimestamp();
        
        await channel.send({ embeds: [lockEmbed] }).catch(() => {});
        
        await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setColor(moderationConfig?.COLORS?.LOCKDOWN || 0xFF5555)
                    .setDescription(`${moderationConfig?.EMOJIS?.LOCK || '🔒'} Successfully locked ${channel}`)
            ]
        });
    }
    
    /**
     * Lock entire server
     */
    private async _lockServer(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!interaction.guild || !interaction.channel) {
            await this.errorReply(interaction, 'This command can only be used in a server.');
            return;
        }

        const reason = interaction.options.getString('reason') || 'Server lockdown';
        
        // Require confirmation
        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(moderationConfig?.COLORS?.WARNING || 0xFFAA00)
                    .setTitle('⚠️ Server Lockdown Confirmation')
                    .setDescription('This will lock **ALL** text channels in the server.\nType `confirm` within 30 seconds to proceed.')
            ],
            ephemeral: true
        });
        
        // Wait for confirmation
        try {
            const filter = (m: { author: { id: string }; content: string }) => 
                m.author.id === interaction.user.id && m.content.toLowerCase() === 'confirm';
            
            const textChannel = interaction.channel as TextChannel;
            const collected = await textChannel.awaitMessages({
                filter,
                max: 1,
                time: 30000,
                errors: ['time']
            });
            
            // Delete confirmation message
            collected.first()?.delete().catch(() => {});
            
        } catch {
            await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(moderationConfig?.COLORS?.ERROR || 0xFF0000)
                        .setDescription(`${moderationConfig?.EMOJIS?.ERROR || '❌'} Lockdown cancelled - confirmation timed out.`)
                ]
            });
            return;
        }
        
        await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setColor(moderationConfig?.COLORS?.WARNING || 0xFFAA00)
                    .setDescription('🔄 Locking server channels...')
            ]
        });
        
        const results = await lockdownService?.lockServer?.(
            interaction.guild,
            `${reason} | By: ${interaction.user.tag}`
        ) || { success: [], skipped: [], failed: [] };
        
        await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setColor(moderationConfig?.COLORS?.LOCKDOWN || 0xFF5555)
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
    private async _unlockChannel(interaction: ChatInputCommandInteraction): Promise<void> {
        const channel = (interaction.options.getChannel('channel') || interaction.channel) as TextChannel;
        
        await interaction.deferReply({ ephemeral: true });
        
        const result = await lockdownService?.unlockChannel?.(
            channel,
            `Unlocked by ${interaction.user.tag}`
        );
        
        if (result && !result.success) {
            await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(moderationConfig?.COLORS?.ERROR || 0xFF0000)
                        .setDescription(`${moderationConfig?.EMOJIS?.ERROR || '❌'} ${result.error}`)
                ]
            });
            return;
        }
        
        // Send message in unlocked channel
        const unlockEmbed = new EmbedBuilder()
            .setColor(moderationConfig?.COLORS?.SUCCESS || 0x00FF00)
            .setTitle('🔓 Channel Unlocked')
            .setDescription('This channel has been unlocked.')
            .setTimestamp();
        
        await channel.send({ embeds: [unlockEmbed] }).catch(() => {});
        
        await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setColor(moderationConfig?.COLORS?.SUCCESS || 0x00FF00)
                    .setDescription(`${moderationConfig?.EMOJIS?.UNLOCK || '🔓'} Successfully unlocked ${channel}`)
            ]
        });
    }
    
    /**
     * Unlock all channels
     */
    private async _unlockAll(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!interaction.guild) {
            await this.errorReply(interaction, 'This command can only be used in a server.');
            return;
        }

        await interaction.deferReply({ ephemeral: true });
        
        const results = await lockdownService?.unlockServer?.(
            interaction.guild,
            `Server unlock by ${interaction.user.tag}`
        ) || { success: [], skipped: [], failed: [], message: undefined };
        
        if (results.success.length === 0 && results.message) {
            await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(moderationConfig?.COLORS?.INFO || 0x5865F2)
                        .setDescription(`${moderationConfig?.EMOJIS?.INFO || 'ℹ️'} ${results.message}`)
                ]
            });
            return;
        }
        
        await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setColor(moderationConfig?.COLORS?.SUCCESS || 0x00FF00)
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
    private async _showStatus(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!interaction.guild) {
            await this.errorReply(interaction, 'This command can only be used in a server.');
            return;
        }

        const status = await lockdownService?.getLockStatus?.(interaction.guild.id) || { lockedCount: 0, channelIds: [] };
        
        let description: string;
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
        
        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(status.lockedCount > 0 
                        ? (moderationConfig?.COLORS?.LOCKDOWN || 0xFF5555)
                        : (moderationConfig?.COLORS?.SUCCESS || 0x00FF00))
                    .setTitle('Lockdown Status')
                    .setDescription(description)
            ],
            ephemeral: true
        });
    }
}

export default new LockdownCommand();
