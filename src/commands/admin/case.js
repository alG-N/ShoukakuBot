/**
 * Case Command
 * View details of a specific moderation case
 * @module commands/admin/case
 */

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { BaseCommand } = require('../BaseCommand');
const { InfractionService } = require('../../services/moderation');

class CaseCommand extends BaseCommand {
    constructor() {
        super({
            name: 'case',
            description: 'View details of a specific moderation case',
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
            .setName('case')
            .setDescription('View details of a specific moderation case')
            .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
            .addIntegerOption(option =>
                option.setName('id')
                    .setDescription('Case ID to view')
                    .setRequired(true)
                    .setMinValue(1));
    }

    /**
     * Execute command
     */
    async run(interaction) {
        const caseId = interaction.options.getInteger('id');

        await interaction.deferReply();

        try {
            // Get the case
            const infraction = await InfractionService.getCase(interaction.guild.id, caseId);

            if (!infraction) {
                return interaction.editReply({
                    content: `❌ Case #${caseId} not found.`
                });
            }

            // Get user for avatar
            const targetUser = await interaction.client.users.fetch(infraction.user_id).catch(() => null);

            // Build embed
            const embed = InfractionService.buildCaseEmbed(infraction, targetUser);

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('[CaseCommand] Error:', error);
            await interaction.editReply({
                content: `❌ Failed to fetch case: ${error.message}`
            });
        }
    }
}

module.exports = new CaseCommand();
