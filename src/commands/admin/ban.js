/**
 * Ban Command - Presentation Layer
 * Ban/unban users from the server
 * @module presentation/commands/admin/ban
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { BaseCommand, CommandCategory } = require('../BaseCommand');
const { COLORS } = require('../../constants');

class BanCommand extends BaseCommand {
    constructor() {
        super({
            category: CommandCategory.ADMIN,
            cooldown: 3,
            deferReply: true,
            requiredPermissions: [PermissionFlagsBits.BanMembers],
            botPermissions: [PermissionFlagsBits.BanMembers]
        });
    }

    get data() {
        return new SlashCommandBuilder()
            .setName('ban')
            .setDescription('Ban/unban users from the server')
            .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
            .addSubcommand(sub =>
                sub.setName('add')
                    .setDescription('Ban a user from the server')
                    .addUserOption(opt =>
                        opt.setName('user')
                            .setDescription('The user to ban')
                            .setRequired(true))
                    .addStringOption(opt =>
                        opt.setName('reason')
                            .setDescription('Reason for the ban')
                            .setRequired(false)
                            .setMaxLength(500))
                    .addIntegerOption(opt =>
                        opt.setName('delete_days')
                            .setDescription('Days of messages to delete (0-7)')
                            .setMinValue(0)
                            .setMaxValue(7)
                            .setRequired(false)))
            .addSubcommand(sub =>
                sub.setName('remove')
                    .setDescription('Unban a user from the server')
                    .addStringOption(opt =>
                        opt.setName('user_id')
                            .setDescription('The user ID to unban')
                            .setRequired(true))
                    .addStringOption(opt =>
                        opt.setName('reason')
                            .setDescription('Reason for the unban')
                            .setRequired(false)))
            .addSubcommand(sub =>
                sub.setName('list')
                    .setDescription('List all banned users'));
    }

    async run(interaction) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'add':
                return this._banUser(interaction);
            case 'remove':
                return this._unbanUser(interaction);
            case 'list':
                return this._listBans(interaction);
        }
    }

    async _banUser(interaction) {
        const targetUser = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const deleteDays = interaction.options.getInteger('delete_days') || 0;

        // Validation
        const validation = await this._validateBan(interaction, targetUser);
        if (!validation.valid) {
            return this.errorReply(interaction, validation.error);
        }

        try {
            // DM user before ban
            try {
                const dmEmbed = new EmbedBuilder()
                    .setColor(COLORS.ERROR)
                    .setTitle(`🔨 You have been banned from ${interaction.guild.name}`)
                    .addFields(
                        { name: 'Reason', value: reason },
                        { name: 'Moderator', value: interaction.user.tag }
                    )
                    .setTimestamp();

                await targetUser.send({ embeds: [dmEmbed] }).catch(() => {});
            } catch {
                // DM failed
            }

            // Perform the ban
            await interaction.guild.members.ban(targetUser, {
                deleteMessageDays: deleteDays,
                reason: `${reason} | By: ${interaction.user.tag}`
            });

            // Log to ModerationService
            try {
                const { ModerationService } = require('../../../services');
                await ModerationService.logAction(interaction.guild.id, {
                    type: 'ban',
                    target: targetUser,
                    moderator: interaction.user,
                    reason,
                    extra: { deleteDays }
                });
            } catch {
                // Service not available
            }

            const embed = new EmbedBuilder()
                .setColor(COLORS.ERROR)
                .setTitle('🔨 User Banned')
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { name: 'User', value: `${targetUser.tag}\n\`${targetUser.id}\``, inline: true },
                    { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
                    { name: 'Reason', value: reason, inline: false },
                    { name: 'Messages Deleted', value: `${deleteDays} days`, inline: true }
                )
                .setTimestamp()
                .setFooter({ text: `Case #${Date.now().toString(36)}` });

            await this.safeReply(interaction, { embeds: [embed] });

        } catch (error) {
            console.error('[Ban] Error:', error);
            return this.errorReply(interaction, 'Failed to ban the user. Make sure I have the proper permissions.');
        }
    }

    async _unbanUser(interaction) {
        const userId = interaction.options.getString('user_id');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        // Validate user ID
        if (!/^\d{17,19}$/.test(userId)) {
            return this.errorReply(interaction, 'Invalid user ID format.');
        }

        try {
            // Check if user is banned
            const banList = await interaction.guild.bans.fetch();
            const banned = banList.get(userId);

            if (!banned) {
                return this.errorReply(interaction, 'This user is not banned from this server.');
            }

            // Unban the user
            await interaction.guild.members.unban(userId, `${reason} | By: ${interaction.user.tag}`);

            // Log to ModerationService
            try {
                const { ModerationService } = require('../../../services');
                await ModerationService.logAction(interaction.guild.id, {
                    type: 'unban',
                    target: banned.user,
                    moderator: interaction.user,
                    reason
                });
            } catch {
                // Service not available
            }

            const embed = new EmbedBuilder()
                .setColor(COLORS.SUCCESS)
                .setTitle('✅ User Unbanned')
                .setThumbnail(banned.user.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { name: 'User', value: `${banned.user.tag}\n\`${banned.user.id}\``, inline: true },
                    { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
                    { name: 'Reason', value: reason, inline: false }
                )
                .setTimestamp();

            await this.safeReply(interaction, { embeds: [embed] });

        } catch (error) {
            console.error('[Unban] Error:', error);
            return this.errorReply(interaction, 'Failed to unban the user.');
        }
    }

    async _listBans(interaction) {
        try {
            const bans = await interaction.guild.bans.fetch();

            if (bans.size === 0) {
                return this.infoReply(interaction, 'No users are currently banned from this server.');
            }

            const banList = bans.first(25).map((ban, index) => 
                `**${index + 1}.** ${ban.user.tag} (\`${ban.user.id}\`)\n└ ${ban.reason || 'No reason'}`
            ).join('\n\n');

            const embed = new EmbedBuilder()
                .setColor(COLORS.INFO)
                .setTitle(`🔨 Ban List - ${interaction.guild.name}`)
                .setDescription(banList)
                .setFooter({ text: `Total: ${bans.size} banned user(s)${bans.size > 25 ? ' | Showing first 25' : ''}` })
                .setTimestamp();

            await this.safeReply(interaction, { embeds: [embed] });

        } catch (error) {
            console.error('[Ban List] Error:', error);
            return this.errorReply(interaction, 'Failed to fetch the ban list.');
        }
    }

    async _validateBan(interaction, targetUser) {
        // Self check
        if (targetUser.id === interaction.user.id) {
            return { valid: false, error: 'You cannot ban yourself.' };
        }

        // Bot check
        if (targetUser.id === interaction.client.user.id) {
            return { valid: false, error: 'I cannot ban myself.' };
        }

        // Owner check
        if (targetUser.id === interaction.guild.ownerId) {
            return { valid: false, error: 'You cannot ban the server owner.' };
        }

        // Check if user is in guild
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        
        if (targetMember) {
            // Role hierarchy check
            if (targetMember.roles.highest.position >= interaction.member.roles.highest.position) {
                return { valid: false, error: 'You cannot ban someone with equal or higher role than you.' };
            }

            // Bot can ban check
            const botMember = interaction.guild.members.me;
            if (targetMember.roles.highest.position >= botMember.roles.highest.position) {
                return { valid: false, error: 'I cannot ban this user due to role hierarchy.' };
            }
        }

        return { valid: true, member: targetMember };
    }
}

module.exports = new BanCommand();



