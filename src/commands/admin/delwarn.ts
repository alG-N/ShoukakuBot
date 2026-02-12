/**
 * Delete Warning Command
 * Delete a specific warning by case ID
 * @module commands/admin/delwarn
 */

import { 
    SlashCommandBuilder, 
    EmbedBuilder,
    PermissionFlagsBits,
    ChatInputCommandInteraction
} from 'discord.js';
import { BaseCommand, CommandCategory, type CommandData } from '../BaseCommand.js';

import { getDefault } from '../../utils/common/moduleHelper.js';
interface Infraction {
    id: number;
    guild_id: string;
    user_id: string;
    moderator_id: string;
    type: string;
    reason: string;
    active: boolean;
    created_at: Date;
}

interface InfractionService {
    getCase?: (guildId: string, caseId: number) => Promise<Infraction | null>;
    deleteCase?: (guildId: string, caseId: number) => Promise<boolean>;
}


let infractionService: InfractionService | undefined;

try {
    const mod = getDefault(require('../../services/moderation'));
    infractionService = mod.InfractionService;
} catch {
    // Service not available
}

class DelWarnCommand extends BaseCommand {
    constructor() {
        super({
            category: CommandCategory.ADMIN,
            cooldown: 3,
            deferReply: true,
            userPermissions: [PermissionFlagsBits.ModerateMembers]
        });
    }

    get data(): CommandData {
        return new SlashCommandBuilder()
            .setName('delwarn')
            .setDescription('Delete a specific warning by case ID')
            .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
            .addIntegerOption(option =>
                option.setName('case')
                    .setDescription('Case ID to delete')
                    .setRequired(true)
                    .setMinValue(1))
            .addStringOption(option =>
                option.setName('reason')
                    .setDescription('Reason for deletion')
                    .setRequired(false));
    }

    async run(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!interaction.guild) {
            await this.errorReply(interaction, 'This command can only be used in a server.');
            return;
        }

        const caseId = interaction.options.getInteger('case', true);
        const reason = interaction.options.getString('reason') || 'No reason provided';

        try {
            // Get the case
            const infraction = await infractionService?.getCase?.(interaction.guild.id, caseId);

            if (!infraction) {
                await interaction.editReply({
                    content: `❌ Case #${caseId} not found.`
                });
                return;
            }

            if (!infraction.active) {
                await interaction.editReply({
                    content: `❌ Case #${caseId} is already deleted/inactive.`
                });
                return;
            }

            // Only allow deleting warnings (not bans/kicks)
            if (infraction.type !== 'warn') {
                await interaction.editReply({
                    content: `❌ Case #${caseId} is a ${infraction.type}, not a warning. Use this command only for warnings.`
                });
                return;
            }

            // Delete (deactivate) the warning
            await infractionService?.deleteCase?.(interaction.guild.id, caseId);

            // Get user for display
            const targetUser = await interaction.client.users.fetch(infraction.user_id).catch(() => null);
            const userName = targetUser?.tag || `Unknown User (${infraction.user_id})`;

            // Build response
            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('✅ Warning Deleted')
                .addFields(
                    { name: 'Case ID', value: `#${caseId}`, inline: true },
                    { name: 'User', value: userName, inline: true },
                    { name: 'Original Reason', value: infraction.reason || 'No reason', inline: false },
                    { name: 'Deletion Reason', value: reason }
                )
                .setFooter({ text: `Deleted by ${interaction.user.tag}` })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('[DelWarnCommand] Error:', error);
            await interaction.editReply({
                content: `❌ Failed to delete warning: ${(error as Error).message}`
            });
        }
    }
}

export default new DelWarnCommand();
