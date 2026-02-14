/**
 * Kick Command - Presentation Layer
 * Kick a user from the server
 * @module presentation/commands/admin/kick
 */

import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    PermissionFlagsBits,
    ChatInputCommandInteraction,
    User,
    GuildMember
} from 'discord.js';
import { BaseCommand, CommandCategory, type CommandData } from '../BaseCommand.js';
import { COLORS } from '../../constants.js';
import logger from '../../core/Logger.js';
import { moderationService } from '../../services/moderation/index.js';

interface ValidationResult {
    valid: boolean;
    error?: string;
    member?: GuildMember | null;
}

class KickCommand extends BaseCommand {
    constructor() {
        super({
            category: CommandCategory.ADMIN,
            cooldown: 3,
            deferReply: true,
            userPermissions: [PermissionFlagsBits.KickMembers],
            botPermissions: [PermissionFlagsBits.KickMembers]
        });
    }

    get data(): CommandData {
        return new SlashCommandBuilder()
            .setName('kick')
            .setDescription('Kick a user from the server')
            .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
            .addUserOption(opt =>
                opt.setName('user')
                    .setDescription('The user to kick')
                    .setRequired(true))
            .addStringOption(opt =>
                opt.setName('reason')
                    .setDescription('Reason for the kick')
                    .setRequired(false)
                    .setMaxLength(500));
    }

    async run(interaction: ChatInputCommandInteraction): Promise<void> {
        const targetUser = interaction.options.getUser('user', true);
        const reason = interaction.options.getString('reason') || 'No reason provided';

        if (!interaction.guild) {
            await this.errorReply(interaction, 'This command can only be used in a server.');
            return;
        }

        // Validation
        const validation = await this._validateKick(interaction, targetUser);
        if (!validation.valid) {
            await this.errorReply(interaction, validation.error!);
            return;
        }

        const targetMember = validation.member!;

        try {
            // Try to DM the user before kicking
            try {
                const dmEmbed = new EmbedBuilder()
                    .setColor(COLORS.MODERATION)
                    .setTitle(`👢 You have been kicked from ${interaction.guild.name}`)
                    .addFields(
                        { name: 'Reason', value: reason },
                        { name: 'Moderator', value: interaction.user.tag }
                    )
                    .setTimestamp();

                await targetUser.send({ embeds: [dmEmbed] }).catch(() => {});
            } catch {
                // DM failed, continue with kick
            }

            // Perform the kick
            await targetMember.kick(`${reason} | By: ${interaction.user.tag}`);

            // Log to ModerationService if available
            try {
                await moderationService.logModAction(interaction.guild, {
                    type: 'KICK',
                    target: targetUser,
                    moderator: interaction.member as GuildMember,
                    reason
                });
            } catch {
                // Service not available
            }

            const embed = new EmbedBuilder()
                .setColor(COLORS.MODERATION)
                .setTitle('👢 User Kicked')
                .setThumbnail(targetUser.displayAvatarURL())
                .addFields(
                    { name: 'User', value: `${targetUser.tag}\n\`${targetUser.id}\``, inline: true },
                    { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
                    { name: 'Reason', value: reason, inline: false }
                )
                .setTimestamp()
                .setFooter({ text: `Case #${Date.now().toString(36)}` });

            await this.safeReply(interaction, { embeds: [embed] });

        } catch (error) {
            logger.error('Kick', `Error: ${error instanceof Error ? error.message : String(error)}`);
            await this.errorReply(interaction, 'Failed to kick the user. Make sure I have the proper permissions.');
        }
    }

    private async _validateKick(interaction: ChatInputCommandInteraction, targetUser: User): Promise<ValidationResult> {
        // Self check
        if (targetUser.id === interaction.user.id) {
            return { valid: false, error: 'You cannot kick yourself.' };
        }

        // Bot check
        if (targetUser.id === interaction.client.user?.id) {
            return { valid: false, error: 'I cannot kick myself.' };
        }

        // Owner check
        if (targetUser.id === interaction.guild!.ownerId) {
            return { valid: false, error: 'You cannot kick the server owner.' };
        }

        // Fetch member
        const targetMember = await interaction.guild!.members.fetch(targetUser.id).catch(() => null);
        if (!targetMember) {
            return { valid: false, error: 'User not found in this server.' };
        }

        // Role hierarchy check
        const member = interaction.member as GuildMember;
        if (targetMember.roles.highest.position >= member.roles.highest.position) {
            return { valid: false, error: 'You cannot kick someone with equal or higher role than you.' };
        }

        // Bot can kick check
        const botMember = interaction.guild!.members.me;
        if (botMember && targetMember.roles.highest.position >= botMember.roles.highest.position) {
            return { valid: false, error: 'I cannot kick this user due to role hierarchy.' };
        }

        return { valid: true, member: targetMember };
    }
}

export default new KickCommand();
