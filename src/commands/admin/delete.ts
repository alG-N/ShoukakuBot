/**
 * Delete Command - Presentation Layer
 * Bulk delete messages from a channel
 * @module presentation/commands/admin/delete
 */

import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    PermissionFlagsBits,
    ChatInputCommandInteraction,
    TextChannel,
    Collection,
    Message,
    GuildMember
} from 'discord.js';
import { BaseCommand, CommandCategory, type CommandData } from '../BaseCommand.js';
import { COLORS } from '../../constants.js';
import logger from '../../core/Logger.js';
import { GuildSettingsService } from '../../services/guild/index.js';
import { moderationService } from '../../services/moderation/index.js';

class DeleteCommand extends BaseCommand {
    constructor() {
        super({
            category: CommandCategory.ADMIN,
            cooldown: 5,
            deferReply: true,
            ephemeral: true,
            userPermissions: [PermissionFlagsBits.ManageMessages],
            botPermissions: [PermissionFlagsBits.ManageMessages]
        });
    }

    get data(): CommandData {
        return new SlashCommandBuilder()
            .setName('delete')
            .setDescription('Delete multiple messages from this channel')
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
            .addIntegerOption(opt =>
                opt.setName('amount')
                    .setDescription('Number of messages to delete (1-100)')
                    .setRequired(true)
                    .setMinValue(1)
                    .setMaxValue(100))
            .addUserOption(opt =>
                opt.setName('user')
                    .setDescription('Only delete messages from this user')
                    .setRequired(false))
            .addStringOption(opt =>
                opt.setName('contains')
                    .setDescription('Only delete messages containing this text')
                    .setRequired(false))
            .addBooleanOption(opt =>
                opt.setName('bots')
                    .setDescription('Only delete messages from bots')
                    .setRequired(false))
            .addBooleanOption(opt =>
                opt.setName('pinned')
                    .setDescription('Include pinned messages (default: false)')
                    .setRequired(false));
    }

    async run(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!interaction.guild) {
            await this.errorReply(interaction, 'This command can only be used in a server.');
            return;
        }

        // Get delete limit from guild settings
        let maxDeleteLimit = 100;
        try {
            maxDeleteLimit = await GuildSettingsService.getDeleteLimit(interaction.guildId!) || 100;
        } catch {
            // Use default
        }

        const amount = interaction.options.getInteger('amount', true);
        const targetUser = interaction.options.getUser('user');
        const containsText = interaction.options.getString('contains');
        const botsOnly = interaction.options.getBoolean('bots') || false;
        const includePinned = interaction.options.getBoolean('pinned') || false;

        // Check server limit
        if (amount > maxDeleteLimit) {
            await this.errorReply(interaction, 
                `This server's delete limit is set to **${maxDeleteLimit}** messages. Use \`/setting delete_limit\` to change it.`);
            return;
        }

        const channel = interaction.channel as TextChannel;

        try {
            // Fetch messages
            const fetchLimit = Math.min(amount * 2, 100);
            const messages = await channel.messages.fetch({ limit: fetchLimit });
            
            // Filter messages (must be within 14 days)
            const fourteenDaysAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);
            
            let filteredMessages = messages.filter(msg => {
                if (msg.createdTimestamp < fourteenDaysAgo) return false;
                if (msg.pinned && !includePinned) return false;
                if (targetUser && msg.author.id !== targetUser.id) return false;
                if (containsText && !msg.content.toLowerCase().includes(containsText.toLowerCase())) return false;
                if (botsOnly && !msg.author.bot) return false;
                return true;
            });

            // Limit to requested amount
            const messagesToDelete = [...filteredMessages.values()].slice(0, amount);

            if (messagesToDelete.length === 0) {
                await this.errorReply(interaction, 
                    'No messages found matching your criteria (messages older than 14 days cannot be bulk deleted).');
                return;
            }

            // Perform bulk delete
            const deleted = await channel.bulkDelete(messagesToDelete, true);
            
            // Build filters list
            const filters: string[] = [];
            if (targetUser) filters.push(`From: ${targetUser.tag}`);
            if (containsText) filters.push(`Contains: "${containsText}"`);
            if (botsOnly) filters.push('Bots only');
            if (includePinned) filters.push('Including pinned');

            // Log to ModerationService
            try {
                await moderationService.logModAction(interaction.guild, {
                    type: 'DELETE',
                    target: { id: interaction.user.id },
                    moderator: interaction.member as GuildMember,
                    reason: `Deleted ${deleted.size} messages`,
                    channel: `<#${channel.id}>`,
                    count: deleted.size,
                    filters: filters.join(', ') || 'None'
                });
            } catch {
                // Service not available
            }

            const embed = new EmbedBuilder()
                .setColor(COLORS.SUCCESS)
                .setTitle('🗑️ Messages Deleted')
                .setDescription(`Successfully deleted **${deleted.size}** message${deleted.size !== 1 ? 's' : ''}.`)
                .setTimestamp()
                .setFooter({ text: `Moderator: ${interaction.user.tag}` });

            if (filters.length > 0) {
                embed.addFields({ name: 'Filters Applied', value: filters.join('\n') });
            }

            await this.safeReply(interaction, { embeds: [embed] });

        } catch (error) {
            logger.error('Delete', `Error: ${(error as Error).message}`);
            
            const err = error as Error & { code?: number };
            if (err.code === 50034) {
                await this.errorReply(interaction, 'Cannot delete messages older than 14 days.');
                return;
            }
            
            await this.errorReply(interaction, `Failed to delete messages: ${err.message}`);
        }
    }
}

export default new DeleteCommand();
