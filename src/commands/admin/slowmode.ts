/**
 * Slowmode Command
 * Set channel slowmode
 * @module commands/admin/slowmode
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
import _lockdownModule from '../../services/moderation/LockdownService.js';
import _moderationConfigModule from '../../config/features/moderation/index.js';
interface ModerationConfig {
    COLORS: Record<string, number>;
    EMOJIS: Record<string, string>;
}

interface SlowmodeResult {
    success: boolean;
    error?: string;
}

interface ServerSlowmodeResult {
    success: string[];
    failed: string[];
}

interface LockdownService {
    setSlowmode?: (channel: TextChannel, duration: number, reason: string) => Promise<SlowmodeResult>;
    setServerSlowmode?: (guild: ChatInputCommandInteraction['guild'], duration: number, reason: string) => Promise<ServerSlowmodeResult>;
}


// SERVICE IMPORTS — static ESM imports (converted from CJS require())
const lockdownService: LockdownService = _lockdownModule as any;
const moderationConfig: ModerationConfig = _moderationConfigModule as any;

class SlowmodeCommand extends BaseCommand {
    constructor() {
        super({
            category: CommandCategory.ADMIN,
            cooldown: 3,
            deferReply: false,
            userPermissions: [PermissionFlagsBits.ManageChannels]
        });
    }

    get data(): CommandData {
        return new SlashCommandBuilder()
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
    }

    async run(interaction: ChatInputCommandInteraction): Promise<void> {
        const subcommand = interaction.options.getSubcommand();
        
        switch (subcommand) {
            case 'set':
                await this._setSlowmode(interaction);
                break;
            case 'off':
                await this._disableSlowmode(interaction);
                break;
            case 'server':
                await this._serverSlowmode(interaction);
                break;
        }
    }
    
    /**
     * Set slowmode on a channel
     */
    private async _setSlowmode(interaction: ChatInputCommandInteraction): Promise<void> {
        const duration = interaction.options.getInteger('duration', true);
        const channel = (interaction.options.getChannel('channel') || interaction.channel) as TextChannel;
        const reason = interaction.options.getString('reason') || 'Slowmode updated';
        
        await interaction.deferReply({ ephemeral: true });
        
        const result = await lockdownService?.setSlowmode?.(
            channel,
            duration,
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
        
        const durationText = duration === 0 
            ? 'disabled' 
            : this._formatDuration(duration);
        
        await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setColor(duration === 0 
                        ? (moderationConfig?.COLORS?.SUCCESS || 0x00FF00)
                        : (moderationConfig?.COLORS?.WARNING || 0xFFAA00))
                    .setDescription(duration === 0
                        ? `${moderationConfig?.EMOJIS?.SUCCESS || '✅'} Slowmode disabled in ${channel}`
                        : `⏱️ Slowmode set to **${durationText}** in ${channel}`)
            ]
        });
    }
    
    /**
     * Disable slowmode
     */
    private async _disableSlowmode(interaction: ChatInputCommandInteraction): Promise<void> {
        const channel = (interaction.options.getChannel('channel') || interaction.channel) as TextChannel;
        
        await interaction.deferReply({ ephemeral: true });
        
        const result = await lockdownService?.setSlowmode?.(
            channel,
            0,
            `Slowmode disabled by ${interaction.user.tag}`
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
        
        await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setColor(moderationConfig?.COLORS?.SUCCESS || 0x00FF00)
                    .setDescription(`${moderationConfig?.EMOJIS?.SUCCESS || '✅'} Slowmode disabled in ${channel}`)
            ]
        });
    }
    
    /**
     * Server-wide slowmode
     */
    private async _serverSlowmode(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!interaction.guild) {
            await this.errorReply(interaction, 'This command can only be used in a server.');
            return;
        }

        const duration = interaction.options.getInteger('duration', true);
        
        await interaction.deferReply({ ephemeral: true });
        
        const results = await lockdownService?.setServerSlowmode?.(
            interaction.guild,
            duration,
            `Server slowmode by ${interaction.user.tag}`
        ) || { success: [], failed: [] };
        
        const durationText = duration === 0 
            ? 'disabled' 
            : this._formatDuration(duration);
        
        await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setColor(duration === 0 
                        ? (moderationConfig?.COLORS?.SUCCESS || 0x00FF00)
                        : (moderationConfig?.COLORS?.WARNING || 0xFFAA00))
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
     */
    private _formatDuration(seconds: number): string {
        if (seconds < 60) return `${seconds} seconds`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes`;
        return `${Math.floor(seconds / 3600)} hours`;
    }
}

export default new SlowmodeCommand();
