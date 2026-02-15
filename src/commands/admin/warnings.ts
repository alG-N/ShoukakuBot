/**
 * Warnings Command
 * View warnings for a user
 * @module commands/admin/warnings
 */

import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    PermissionFlagsBits,
    ChatInputCommandInteraction,
    User,
    Message
} from 'discord.js';
import { BaseCommand, CommandCategory, type CommandData } from '../BaseCommand.js';
import { formatDuration } from '../../utils/common/time.js';
import logger from '../../core/Logger.js';
import { infractionService as _infractionSvc } from '../../services/moderation/index.js';
import _moderationConfigModule from '../../config/features/moderation/index.js';
const WARNINGS_PER_PAGE = 5;

interface Infraction {
    case_id: number;
    type: string;
    reason: string;
    moderator_id: string;
    created_at: Date | string;
    duration_ms?: number;
    active: boolean;
}

interface InfractionService {
    getUserHistory?: (guildId: string, userId: string, options: {
        type?: string | null;
        activeOnly?: boolean;
        limit?: number;
    }) => Promise<Infraction[]>;
    getWarningCount?: (guildId: string, userId: string) => Promise<number>;
}

interface ModerationConfig {
    COLORS: Record<string, number>;
    EMOJIS: Record<string, string>;
}


// SERVICE IMPORTS — static ESM imports (converted from CJS require())
const infractionService: InfractionService = _infractionSvc as any;
const moderationConfig: ModerationConfig = _moderationConfigModule as any;

class WarningsCommand extends BaseCommand {
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

    async run(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!interaction.guild) {
            await this.errorReply(interaction, 'This command can only be used in a server.');
            return;
        }

        const targetUser = interaction.options.getUser('user', true);
        const showAll = interaction.options.getBoolean('all') || false;

        try {
            // Get infractions
            const infractions = await infractionService?.getUserHistory?.(
                interaction.guild.id,
                targetUser.id,
                {
                    type: showAll ? null : 'warn',
                    activeOnly: !showAll,
                    limit: 50
                }
            ) || [];

            if (infractions.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle(`${moderationConfig?.EMOJIS?.USER || '👤'} ${targetUser.tag}`)
                    .setDescription(showAll 
                        ? '✅ This user has no infractions.' 
                        : '✅ This user has no active warnings.')
                    .setThumbnail(targetUser.displayAvatarURL())
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
                return;
            }

            // Get active warning count
            const activeWarnings = await infractionService?.getWarningCount?.(
                interaction.guild.id,
                targetUser.id
            ) || 0;

            // Paginate
            const pages = this._paginateInfractions(infractions, targetUser, activeWarnings, showAll);
            
            if (pages.length === 1) {
                await interaction.editReply({ embeds: [pages[0]] });
                return;
            }

            // Multi-page with buttons
            let currentPage = 0;
            const row = this._createNavigationRow(currentPage, pages.length);

            const message = await interaction.editReply({
                embeds: [pages[currentPage]],
                components: [row]
            }) as Message;

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
                    components: [this._createNavigationRow(currentPage, pages.length)]
                });
            });

            collector.on('end', async () => {
                const disabledRow = this._createNavigationRow(currentPage, pages.length, true);
                await message.edit({ components: [disabledRow] }).catch(() => {});
            });

        } catch (error) {
            logger.error('WarningsCommand', `Error: ${(error as Error).message}`);
            await interaction.editReply({
                content: `❌ Failed to fetch warnings: ${(error as Error).message}`
            });
        }
    }

    /**
     * Paginate infractions into embeds
     */
    private _paginateInfractions(infractions: Infraction[], user: User, activeWarnings: number, showAll: boolean): EmbedBuilder[] {
        const pages: EmbedBuilder[] = [];
        const totalPages = Math.ceil(infractions.length / WARNINGS_PER_PAGE);

        for (let i = 0; i < totalPages; i++) {
            const start = i * WARNINGS_PER_PAGE;
            const pageInfractions = infractions.slice(start, start + WARNINGS_PER_PAGE);

            const embed = new EmbedBuilder()
                .setColor(activeWarnings > 0 ? (moderationConfig?.COLORS?.WARN || 0xFFAA00) : 0x00FF00)
                .setTitle(`${moderationConfig?.EMOJIS?.USER || '👤'} ${user.tag}`)
                .setThumbnail(user.displayAvatarURL())
                .setDescription(showAll 
                    ? `Showing all infractions (${infractions.length} total)`
                    : `**Active Warnings:** ${activeWarnings}`)
                .setFooter({ text: `Page ${i + 1}/${totalPages} • User ID: ${user.id}` })
                .setTimestamp();

            for (const infraction of pageInfractions) {
                const type = infraction.type.toUpperCase();
                const emoji = moderationConfig?.EMOJIS?.[type] || '📋';
                const date = new Date(infraction.created_at);
                const timestamp = Math.floor(date.getTime() / 1000);

                let value = `**Reason:** ${infraction.reason || 'No reason'}\n`;
                value += `**Moderator:** <@${infraction.moderator_id}>\n`;
                value += `**Date:** <t:${timestamp}:R>`;

                if (infraction.duration_ms) {
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
    private _createNavigationRow(currentPage: number, totalPages: number, disabled = false): ActionRowBuilder<ButtonBuilder> {
        return new ActionRowBuilder<ButtonBuilder>()
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

export default new WarningsCommand();
