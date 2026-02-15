/**
 * Case Command
 * View details of a specific moderation case
 * @module commands/admin/case
 */

import { 
    SlashCommandBuilder, 
    EmbedBuilder,
    PermissionFlagsBits,
    ChatInputCommandInteraction,
    User
} from 'discord.js';
import { BaseCommand, CommandCategory, type CommandData } from '../BaseCommand.js';
import logger from '../../core/Logger.js';
import { infractionService as _infractionSvc } from '../../services/moderation/index.js';
interface Infraction {
    id: number;
    guild_id: string;
    user_id: string;
    moderator_id: string;
    type: string;
    reason: string;
    active: boolean;
    created_at: Date;
    metadata?: Record<string, unknown>;
}

interface InfractionService {
    getCase?: (guildId: string, caseId: number) => Promise<Infraction | null>;
    buildCaseEmbed?: (infraction: Infraction, targetUser: User | null) => EmbedBuilder;
}


// SERVICE IMPORTS — static ESM imports (converted from CJS require())
const infractionService: InfractionService = _infractionSvc as any;

class CaseCommand extends BaseCommand {
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
            .setName('case')
            .setDescription('View details of a specific moderation case')
            .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
            .addIntegerOption(option =>
                option.setName('id')
                    .setDescription('Case ID to view')
                    .setRequired(true)
                    .setMinValue(1));
    }

    async run(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!interaction.guild) {
            await this.errorReply(interaction, 'This command can only be used in a server.');
            return;
        }

        const caseId = interaction.options.getInteger('id', true);

        try {
            // Get the case
            const infraction = await infractionService?.getCase?.(interaction.guild.id, caseId);

            if (!infraction) {
                await interaction.editReply({
                    content: `❌ Case #${caseId} not found.`
                });
                return;
            }

            // Get user for avatar
            const targetUser = await interaction.client.users.fetch(infraction.user_id).catch(() => null);

            // Build embed
            const embed = infractionService?.buildCaseEmbed?.(infraction, targetUser) || this._buildDefaultEmbed(infraction, targetUser);

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            logger.error('Case', `Error: ${(error as Error).message}`);
            await interaction.editReply({
                content: `❌ Failed to fetch case: ${(error as Error).message}`
            });
        }
    }

    private _buildDefaultEmbed(infraction: Infraction, targetUser: User | null): EmbedBuilder {
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`📋 Case #${infraction.id}`)
            .addFields(
                { name: 'Type', value: infraction.type.toUpperCase(), inline: true },
                { name: 'User', value: targetUser ? `${targetUser.tag} (<@${targetUser.id}>)` : `<@${infraction.user_id}>`, inline: true },
                { name: 'Moderator', value: `<@${infraction.moderator_id}>`, inline: true },
                { name: 'Reason', value: infraction.reason || 'No reason provided', inline: false },
                { name: 'Status', value: infraction.active ? '🟢 Active' : '🔴 Inactive', inline: true }
            )
            .setTimestamp(infraction.created_at);

        if (targetUser) {
            embed.setThumbnail(targetUser.displayAvatarURL());
        }

        return embed;
    }
}

export default new CaseCommand();
