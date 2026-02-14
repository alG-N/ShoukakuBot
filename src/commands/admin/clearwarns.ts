/**
 * Clear Warnings Command
 * Clear all warnings for a user
 * @module commands/admin/clearwarns
 */

import { 
    SlashCommandBuilder, 
    EmbedBuilder,
    PermissionFlagsBits,
    ChatInputCommandInteraction,
    User,
    Guild
} from 'discord.js';
import { BaseCommand, CommandCategory, type CommandData } from '../BaseCommand.js';
import logger from '../../core/Logger.js';
import { infractionService as _infractionSvc } from '../../services/moderation/index.js';
interface InfractionService {
    getWarningCount?: (guildId: string, userId: string) => Promise<number>;
    clearWarnings?: (guildId: string, userId: string) => Promise<number>;
    createInfraction?: (data: {
        guild: Guild;
        user: User;
        moderator: User;
        type: string;
        reason: string;
        metadata?: Record<string, unknown>;
    }) => Promise<unknown>;
}


// SERVICE IMPORTS — static ESM imports (converted from CJS require())
const infractionService: InfractionService = _infractionSvc as any;

class ClearWarnsCommand extends BaseCommand {
    constructor() {
        super({
            category: CommandCategory.ADMIN,
            cooldown: 5,
            deferReply: true,
            userPermissions: [PermissionFlagsBits.ModerateMembers]
        });
    }

    get data(): CommandData {
        return new SlashCommandBuilder()
            .setName('clearwarns')
            .setDescription('Clear all warnings for a user')
            .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
            .addUserOption(option =>
                option.setName('user')
                    .setDescription('User to clear warnings for')
                    .setRequired(true))
            .addStringOption(option =>
                option.setName('reason')
                    .setDescription('Reason for clearing warnings')
                    .setRequired(false));
    }

    async run(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!interaction.guild) {
            await this.errorReply(interaction, 'This command can only be used in a server.');
            return;
        }

        const targetUser = interaction.options.getUser('user', true);
        const reason = interaction.options.getString('reason') || 'No reason provided';

        try {
            // Get current warning count
            const beforeCount = await infractionService?.getWarningCount?.(
                interaction.guild.id,
                targetUser.id
            ) || 0;

            if (beforeCount === 0) {
                await interaction.editReply({
                    content: '❌ This user has no active warnings to clear.'
                });
                return;
            }

            // Clear warnings
            const clearedCount = await infractionService?.clearWarnings?.(
                interaction.guild.id,
                targetUser.id
            ) || 0;

            // Log the action
            await infractionService?.createInfraction?.({
                guild: interaction.guild,
                user: targetUser,
                moderator: interaction.user,
                type: 'note',
                reason: `Cleared ${clearedCount} warning(s). Reason: ${reason}`,
                metadata: {
                    action: 'clear_warnings',
                    clearedCount
                }
            });

            // Build response
            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('✅ Warnings Cleared')
                .addFields(
                    { name: 'User', value: `${targetUser.tag} (<@${targetUser.id}>)`, inline: true },
                    { name: 'Warnings Cleared', value: `${clearedCount}`, inline: true },
                    { name: 'Reason', value: reason }
                )
                .setFooter({ text: `Cleared by ${interaction.user.tag}` })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            logger.error('ClearWarns', `Error: ${(error as Error).message}`);
            await interaction.editReply({
                content: `❌ Failed to clear warnings: ${(error as Error).message}`
            });
        }
    }
}

export default new ClearWarnsCommand();
