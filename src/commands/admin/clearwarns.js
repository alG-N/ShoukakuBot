/**
 * Clear Warnings Command
 * Clear all warnings for a user
 * @module commands/admin/clearwarns
 */

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { BaseCommand } = require('../BaseCommand');
const { InfractionService } = require('../../services/moderation');
const moderationConfig = require('../../config/features/moderation');

class ClearWarnsCommand extends BaseCommand {
    constructor() {
        super({
            name: 'clearwarns',
            description: 'Clear all warnings for a user',
            category: 'admin',
            permissions: ['ModerateMembers'],
            cooldown: 5000
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

    /**
     * Execute command
     */
    async run(interaction) {
        const targetUser = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        await interaction.deferReply();

        try {
            // Get current warning count
            const beforeCount = await InfractionService.getWarningCount(
                interaction.guild.id,
                targetUser.id
            );

            if (beforeCount === 0) {
                return interaction.editReply({
                    content: '❌ This user has no active warnings to clear.'
                });
            }

            // Clear warnings
            const clearedCount = await InfractionService.clearWarnings(
                interaction.guild.id,
                targetUser.id
            );

            // Log the action
            await InfractionService.createInfraction({
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
            console.error('[ClearWarnsCommand] Error:', error);
            await interaction.editReply({
                content: `❌ Failed to clear warnings: ${error.message}`
            });
        }
    }
}

module.exports = new ClearWarnsCommand();
