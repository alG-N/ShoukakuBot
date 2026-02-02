/**
 * Warnings Command
 * View warnings for a user
 * @module commands/admin/warnings
 */

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { BaseCommand } = require('../BaseCommand');
const { InfractionService } = require('../../services/moderation');
const moderationConfig = require('../../config/features/moderation');

const WARNINGS_PER_PAGE = 5;

class WarningsCommand extends BaseCommand {
    constructor() {
        super({
            name: 'warnings',
            description: 'View warnings for a user',
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
            .setName('warnings')
            .setDescription('View warnings for a user')
            .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
            .addUserOption(option =>
                option.setName('user')
                    .setDescription('User to view warnings for')
                    .setRequired(true))
            .addBooleanOption(option =>
                option.setName('all')
                    .setDescription('Show all infractions, not just warnings')
                    .setRequired(false));
    }

    /**
     * Execute command
     */
    async run(interaction) {
        const targetUser = interaction.options.getUser('user');
        const showAll = interaction.options.getBoolean('all') || false;

        await interaction.deferReply();

        try {
            // Get infractions
            const infractions = await InfractionService.getUserHistory(
                interaction.guild.id,
                targetUser.id,
                {
                    type: showAll ? null : 'warn',
                    activeOnly: !showAll,
                    limit: 50
                }
            );

            if (infractions.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle(`${moderationConfig.EMOJIS.USER} ${targetUser.tag}`)
                    .setDescription(showAll 
                        ? '✅ This user has no infractions.' 
                        : '✅ This user has no active warnings.')
                    .setThumbnail(targetUser.displayAvatarURL())
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }

            // Get active warning count
            const activeWarnings = await InfractionService.getWarningCount(
                interaction.guild.id,
                targetUser.id
            );

            // Paginate
            const pages = this.paginateInfractions(infractions, targetUser, activeWarnings, showAll);
            
            if (pages.length === 1) {
                return interaction.editReply({ embeds: [pages[0]] });
            }

            // Multi-page with buttons
            let currentPage = 0;
            const row = this.createNavigationRow(currentPage, pages.length);

            const message = await interaction.editReply({
                embeds: [pages[currentPage]],
                components: [row]
            });

            // Button collector
            const collector = message.createMessageComponentCollector({
                filter: i => i.user.id === interaction.user.id,
                time: 120000 // 2 minutes
            });

            collector.on('collect', async i => {
                if (i.customId === 'warnings_prev') {
                    currentPage = Math.max(0, currentPage - 1);
                } else if (i.customId === 'warnings_next') {
                    currentPage = Math.min(pages.length - 1, currentPage + 1);
                }

                await i.update({
                    embeds: [pages[currentPage]],
                    components: [this.createNavigationRow(currentPage, pages.length)]
                });
            });

            collector.on('end', async () => {
                const disabledRow = this.createNavigationRow(currentPage, pages.length, true);
                await message.edit({ components: [disabledRow] }).catch(() => {});
            });

        } catch (error) {
            console.error('[WarningsCommand] Error:', error);
            await interaction.editReply({
                content: `❌ Failed to fetch warnings: ${error.message}`
            });
        }
    }

    /**
     * Paginate infractions into embeds
     */
    paginateInfractions(infractions, user, activeWarnings, showAll) {
        const pages = [];
        const totalPages = Math.ceil(infractions.length / WARNINGS_PER_PAGE);

        for (let i = 0; i < totalPages; i++) {
            const start = i * WARNINGS_PER_PAGE;
            const pageInfractions = infractions.slice(start, start + WARNINGS_PER_PAGE);

            const embed = new EmbedBuilder()
                .setColor(activeWarnings > 0 ? moderationConfig.COLORS.WARN : 0x00FF00)
                .setTitle(`${moderationConfig.EMOJIS.USER} ${user.tag}`)
                .setThumbnail(user.displayAvatarURL())
                .setDescription(showAll 
                    ? `Showing all infractions (${infractions.length} total)`
                    : `**Active Warnings:** ${activeWarnings}`)
                .setFooter({ text: `Page ${i + 1}/${totalPages} • User ID: ${user.id}` })
                .setTimestamp();

            for (const infraction of pageInfractions) {
                const type = infraction.type.toUpperCase();
                const emoji = moderationConfig.EMOJIS[type] || '📋';
                const date = new Date(infraction.created_at);
                const timestamp = Math.floor(date.getTime() / 1000);

                let value = `**Reason:** ${infraction.reason || 'No reason'}\n`;
                value += `**Moderator:** <@${infraction.moderator_id}>\n`;
                value += `**Date:** <t:${timestamp}:R>`;

                if (infraction.duration_ms) {
                    const { formatDuration } = require('../../utils/common/time');
                    value += `\n**Duration:** ${formatDuration(infraction.duration_ms)}`;
                }

                if (!infraction.active) {
                    value += '\n*⚠️ Inactive*';
                }

                embed.addFields({
                    name: `${emoji} Case #${infraction.case_id} - ${infraction.type.charAt(0).toUpperCase() + infraction.type.slice(1)}`,
                    value,
                    inline: false
                });
            }

            pages.push(embed);
        }

        return pages;
    }

    /**
     * Create navigation button row
     */
    createNavigationRow(currentPage, totalPages, disabled = false) {
        return new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('warnings_prev')
                    .setLabel('◀ Previous')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(disabled || currentPage === 0),
                new ButtonBuilder()
                    .setCustomId('warnings_page')
                    .setLabel(`${currentPage + 1}/${totalPages}`)
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId('warnings_next')
                    .setLabel('Next ▶')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(disabled || currentPage === totalPages - 1)
            );
    }
}

module.exports = new WarningsCommand();
