/**
 * Delete Warning Command
 * Delete a specific warning by case ID
 * @module commands/admin/delwarn
 */

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { BaseCommand } = require('../BaseCommand');
const { InfractionService } = require('../../services/moderation');
const moderationConfig = require('../../config/features/moderation');

class DelWarnCommand extends BaseCommand {
    constructor() {
        super({
            name: 'delwarn',
            description: 'Delete a specific warning by case ID',
            category: 'admin',
            permissions: ['ModerateMembers'],
            cooldown: 3000
        });
    }

    get data() {
        return this.buildSlashCommand();
    }

    /**
     * Build slash command
     */
    buildSlashCommand() {
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

    /**
     * Execute command
     */
    async run(interaction) {
        const caseId = interaction.options.getInteger('case');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        await interaction.deferReply();

        try {
            // Get the case
            const infraction = await InfractionService.getCase(interaction.guild.id, caseId);

            if (!infraction) {
                return interaction.editReply({
                    content: `❌ Case #${caseId} not found.`
                });
            }

            if (!infraction.active) {
                return interaction.editReply({
                    content: `❌ Case #${caseId} is already deleted/inactive.`
                });
            }

            // Only allow deleting warnings (not bans/kicks)
            if (infraction.type !== 'warn') {
                return interaction.editReply({
                    content: `❌ Case #${caseId} is a ${infraction.type}, not a warning. Use this command only for warnings.`
                });
            }

            // Delete (deactivate) the warning
            await InfractionService.deleteCase(interaction.guild.id, caseId);

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
                content: `❌ Failed to delete warning: ${error.message}`
            });
        }
    }
}

module.exports = new DelWarnCommand();
