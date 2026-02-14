/**
 * Snipe Command - Presentation Layer
 * Recover deleted messages
 * @module presentation/commands/admin/snipe
 */

import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    PermissionFlagsBits,
    ChatInputCommandInteraction,
    TextChannel
} from 'discord.js';
import { BaseCommand, CommandCategory, type CommandData } from '../BaseCommand.js';
import { COLORS } from '../../constants.js';
import logger from '../../core/Logger.js';
import { GuildSettingsService } from '../../services/guild/index.js';
import { snipeService, type TrackedMessage } from '../../services/moderation/index.js';

/**
 * Format time ago from timestamp
 */
function formatTimeAgo(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    
    const intervals = [
        { label: 'year', seconds: 31536000 },
        { label: 'month', seconds: 2592000 },
        { label: 'week', seconds: 604800 },
        { label: 'day', seconds: 86400 },
        { label: 'hour', seconds: 3600 },
        { label: 'minute', seconds: 60 },
        { label: 'second', seconds: 1 }
    ];

    for (const interval of intervals) {
        const count = Math.floor(seconds / interval.seconds);
        if (count >= 1) {
            return `${count} ${interval.label}${count !== 1 ? 's' : ''} ago`;
        }
    }
    
    return 'just now';
}

/**
 * Create snipe embed for a deleted message
 */
function createSnipeEmbed(msg: TrackedMessage, index: number, total: number): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setColor((COLORS as Record<string, number>).SNIPE || 0x9B59B6)
        .setAuthor({
            name: `${msg.author.displayName} (${msg.author.tag})`,
            iconURL: msg.author.avatarURL || undefined
        })
        .setFooter({ 
            text: `Message ${index}/${total} • Deleted ${formatTimeAgo(msg.deletedAt)}` 
        })
        .setTimestamp(msg.deletedAt);

    if (msg.content) {
        const content = msg.content.length > 4096 
            ? msg.content.slice(0, 4093) + '...' 
            : msg.content;
        embed.setDescription(content);
    }

    embed.addFields({
        name: 'Channel',
        value: `<#${msg.channel.id}>`,
        inline: true
    });

    embed.addFields({
        name: 'Sent',
        value: `<t:${Math.floor(msg.createdAt / 1000)}:R>`,
        inline: true
    });

    // Handle attachments
    if (msg.attachments && msg.attachments.length > 0) {
        const attachmentList = msg.attachments
            .map(a => `📎 [${a.name}](${a.url})`)
            .join('\n');
        
        embed.addFields({
            name: `Attachments (${msg.attachments.length})`,
            value: attachmentList.slice(0, 1024)
        });

        // Show image preview if available
        const imageAttachment = msg.attachments.find(a => 
            a.type?.startsWith('image/') || 
            /\.(png|jpg|jpeg|gif|webp)$/i.test(a.name)
        );
        
        if (imageAttachment) {
            embed.setImage(imageAttachment.proxyUrl || imageAttachment.url);
        }
    }

    // Handle embeds
    if (msg.embeds && msg.embeds.length > 0) {
        const embedInfo = msg.embeds
            .map(e => e.title || e.description?.slice(0, 50) || 'Embed')
            .join(', ');
        
        embed.addFields({
            name: 'Embeds',
            value: `${msg.embeds.length} embed(s): ${embedInfo}`.slice(0, 1024),
            inline: true
        });
    }

    return embed;
}

class SnipeCommand extends BaseCommand {
    constructor() {
        super({
            category: CommandCategory.ADMIN,
            cooldown: 3,
            deferReply: true,
            userPermissions: [PermissionFlagsBits.ManageMessages]
        });
    }

    get data(): CommandData {
        return new SlashCommandBuilder()
            .setName('snipe')
            .setDescription('Recover recently deleted messages')
            .addIntegerOption(opt =>
                opt.setName('count')
                    .setDescription('Number of messages to recover (default: 1)')
                    .setRequired(false)
                    .setMinValue(1)
                    .setMaxValue(10))
            .addChannelOption(opt =>
                opt.setName('channel')
                    .setDescription('Specific channel to snipe from (default: current channel)')
                    .setRequired(false))
            .addUserOption(opt =>
                opt.setName('user')
                    .setDescription('Only show deleted messages from this user')
                    .setRequired(false));
    }

    async run(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!interaction.guild) {
            await this.errorReply(interaction, 'This command can only be used in a server.');
            return;
        }

        const count = interaction.options.getInteger('count') || 1;
        const targetChannel = (interaction.options.getChannel('channel') || interaction.channel) as TextChannel;
        const targetUser = interaction.options.getUser('user');

        try {
            // Get snipe limit from settings
            let snipeLimit = 10;
            try {
                snipeLimit = await GuildSettingsService.getSnipeLimit(interaction.guild.id) || 10;
            } catch {
                // Use default
            }

            const effectiveCount = Math.min(count, snipeLimit);

            // Get deleted messages from SnipeService
            let messages: TrackedMessage[] = [];
            try {
                if (!snipeService) {
                    await this.errorReply(interaction, 'SnipeService is not available.');
                    return;
                }
                
                let allMessages = await snipeService.getDeletedMessages(
                    interaction.guild.id,
                    targetChannel.id
                );

                // Filter by user if specified
                if (targetUser) {
                    allMessages = allMessages.filter(m => m.author.id === targetUser.id);
                }

                // Limit to requested count
                messages = allMessages.slice(0, effectiveCount);
            } catch (e) {
                logger.error('Snipe', `Service error: ${(e as Error).message}`);
                await this.errorReply(interaction, 'SnipeService is not available.');
                return;
            }

            if (messages.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor(COLORS.WARNING)
                    .setDescription('📭 No deleted messages found.')
                    .setFooter({ text: `Tracking up to ${snipeLimit} messages` });

                await this.safeReply(interaction, { embeds: [embed] });
                return;
            }

            // Create embeds for each message
            const embeds = messages.map((msg, index) => 
                createSnipeEmbed(msg, index + 1, messages.length)
            );

            // Discord only allows 10 embeds per message
            if (embeds.length > 10) {
                embeds.splice(10);
            }

            await this.safeReply(interaction, { embeds });

        } catch (error) {
            logger.error('Snipe', `Error: ${(error as Error).message}`);
            await this.errorReply(interaction, `Failed to retrieve deleted messages: ${(error as Error).message}`);
        }
    }
}

export default new SnipeCommand();
