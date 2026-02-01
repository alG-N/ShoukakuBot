/**
 * Mute Command - Presentation Layer
 * Timeout/mute users in the server
 * @module presentation/commands/admin/mute
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { BaseCommand, CommandCategory } = require('../BaseCommand');
const { COLORS } = require('../../constants');

/**
 * Duration choices for mute
 */
const DURATION_CHOICES = [
    { name: '60 seconds', value: '60s' },
    { name: '5 minutes', value: '5m' },
    { name: '10 minutes', value: '10m' },
    { name: '30 minutes', value: '30m' },
    { name: '1 hour', value: '1h' },
    { name: '6 hours', value: '6h' },
    { name: '12 hours', value: '12h' },
    { name: '1 day', value: '1d' },
    { name: '3 days', value: '3d' },
    { name: '1 week', value: '1w' },
    { name: '2 weeks', value: '2w' },
    { name: '28 days (max)', value: '28d' }
];

/**
 * Parse duration string to milliseconds
 * @param {string} duration - Duration string (e.g., '1h', '30m', '1d')
 * @returns {number} Duration in milliseconds
 */
function parseDuration(duration) {
    const units = {
        's': 1000,
        'm': 60 * 1000,
        'h': 60 * 60 * 1000,
        'd': 24 * 60 * 60 * 1000,
        'w': 7 * 24 * 60 * 60 * 1000
    };

    const match = duration.match(/^(\d+)([smhdw])$/);
    if (!match) return null;

    const value = parseInt(match[1]);
    const unit = match[2];

    return value * units[unit];
}

/**
 * Format milliseconds to readable duration
 * @param {number} ms - Milliseconds
 * @returns {string} Formatted duration
 */
function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? 's' : ''}`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''}`;
    return `${seconds} second${seconds > 1 ? 's' : ''}`;
}

class MuteCommand extends BaseCommand {
    constructor() {
        super({
            category: CommandCategory.ADMIN,
            cooldown: 3,
            deferReply: true,
            requiredPermissions: [PermissionFlagsBits.ModerateMembers],
            botPermissions: [PermissionFlagsBits.ModerateMembers]
        });
    }

    get data() {
        return new SlashCommandBuilder()
            .setName('mute')
            .setDescription('Timeout/mute users in the server')
            .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
            .addSubcommand(sub =>
                sub.setName('add')
                    .setDescription('Timeout a user')
                    .addUserOption(opt =>
                        opt.setName('user')
                            .setDescription('The user to timeout')
                            .setRequired(true))
                    .addStringOption(opt =>
                        opt.setName('duration')
                            .setDescription('Duration of the timeout')
                            .setRequired(true)
                            .addChoices(...DURATION_CHOICES))
                    .addStringOption(opt =>
                        opt.setName('reason')
                            .setDescription('Reason for the timeout')
                            .setRequired(false)
                            .setMaxLength(500)))
            .addSubcommand(sub =>
                sub.setName('remove')
                    .setDescription('Remove timeout from a user')
                    .addUserOption(opt =>
                        opt.setName('user')
                            .setDescription('The user to unmute')
                            .setRequired(true))
                    .addStringOption(opt =>
                        opt.setName('reason')
                            .setDescription('Reason for removing the timeout')
                            .setRequired(false)));
    }

    async run(interaction) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'add':
                return this._muteUser(interaction);
            case 'remove':
                return this._unmuteUser(interaction);
        }
    }

    async _muteUser(interaction) {
        const targetUser = interaction.options.getUser('user');
        const duration = interaction.options.getString('duration');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        // Parse duration
        const durationMs = parseDuration(duration);
        if (!durationMs) {
            return this.errorReply(interaction, 'Invalid duration format.');
        }

        // Max timeout is 28 days
        const MAX_TIMEOUT = 28 * 24 * 60 * 60 * 1000;
        if (durationMs > MAX_TIMEOUT) {
            return this.errorReply(interaction, 'Maximum timeout duration is 28 days.');
        }

        // Validation
        const validation = await this._validateMute(interaction, targetUser);
        if (!validation.valid) {
            return this.errorReply(interaction, validation.error);
        }

        const targetMember = validation.member;

        try {
            // Check if already timed out
            if (targetMember.communicationDisabledUntil && targetMember.communicationDisabledUntil > new Date()) {
                return this.errorReply(interaction, `This user is already timed out until <t:${Math.floor(targetMember.communicationDisabledUntil.getTime() / 1000)}:R>.`);
            }

            // DM user before mute
            try {
                const dmEmbed = new EmbedBuilder()
                    .setColor(COLORS.WARNING)
                    .setTitle(`🔇 You have been timed out in ${interaction.guild.name}`)
                    .addFields(
                        { name: 'Duration', value: formatDuration(durationMs) },
                        { name: 'Reason', value: reason },
                        { name: 'Moderator', value: interaction.user.tag }
                    )
                    .setTimestamp();

                await targetUser.send({ embeds: [dmEmbed] }).catch(() => {});
            } catch {
                // DM failed
            }

            // Apply timeout
            await targetMember.timeout(durationMs, `${reason} | By: ${interaction.user.tag}`);

            // Log to ModerationService
            try {
                const { ModerationService } = require('../../../services');
                await ModerationService.logAction(interaction.guild.id, {
                    type: 'mute',
                    target: targetUser,
                    moderator: interaction.user,
                    reason,
                    extra: { duration: formatDuration(durationMs) }
                });
            } catch {
                // Service not available
            }

            const embed = new EmbedBuilder()
                .setColor(COLORS.WARNING)
                .setTitle('🔇 User Timed Out')
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { name: 'User', value: `${targetUser.tag}\n\`${targetUser.id}\``, inline: true },
                    { name: 'Duration', value: formatDuration(durationMs), inline: true },
                    { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
                    { name: 'Reason', value: reason, inline: false },
                    { name: 'Expires', value: `<t:${Math.floor((Date.now() + durationMs) / 1000)}:R>`, inline: true }
                )
                .setTimestamp()
                .setFooter({ text: `Case #${Date.now().toString(36)}` });

            await this.safeReply(interaction, { embeds: [embed] });

        } catch (error) {
            console.error('[Mute] Error:', error);
            return this.errorReply(interaction, 'Failed to timeout the user. Make sure I have the proper permissions.');
        }
    }

    async _unmuteUser(interaction) {
        const targetUser = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        // Fetch member
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        if (!targetMember) {
            return this.errorReply(interaction, 'User not found in this server.');
        }

        // Check if timed out
        if (!targetMember.communicationDisabledUntil || targetMember.communicationDisabledUntil <= new Date()) {
            return this.errorReply(interaction, 'This user is not currently timed out.');
        }

        try {
            // Remove timeout
            await targetMember.timeout(null, `${reason} | By: ${interaction.user.tag}`);

            // DM user
            try {
                const dmEmbed = new EmbedBuilder()
                    .setColor(COLORS.SUCCESS)
                    .setTitle(`🔊 Your timeout has been removed in ${interaction.guild.name}`)
                    .addFields(
                        { name: 'Reason', value: reason },
                        { name: 'Moderator', value: interaction.user.tag }
                    )
                    .setTimestamp();

                await targetUser.send({ embeds: [dmEmbed] }).catch(() => {});
            } catch {
                // DM failed
            }

            // Log to ModerationService
            try {
                const { ModerationService } = require('../../../services');
                await ModerationService.logAction(interaction.guild.id, {
                    type: 'unmute',
                    target: targetUser,
                    moderator: interaction.user,
                    reason
                });
            } catch {
                // Service not available
            }

            const embed = new EmbedBuilder()
                .setColor(COLORS.SUCCESS)
                .setTitle('🔊 Timeout Removed')
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { name: 'User', value: `${targetUser.tag}\n\`${targetUser.id}\``, inline: true },
                    { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
                    { name: 'Reason', value: reason, inline: false }
                )
                .setTimestamp();

            await this.safeReply(interaction, { embeds: [embed] });

        } catch (error) {
            console.error('[Unmute] Error:', error);
            return this.errorReply(interaction, 'Failed to remove the timeout.');
        }
    }

    async _validateMute(interaction, targetUser) {
        // Self check
        if (targetUser.id === interaction.user.id) {
            return { valid: false, error: 'You cannot timeout yourself.' };
        }

        // Bot check
        if (targetUser.id === interaction.client.user.id) {
            return { valid: false, error: 'I cannot timeout myself.' };
        }

        // Owner check
        if (targetUser.id === interaction.guild.ownerId) {
            return { valid: false, error: 'You cannot timeout the server owner.' };
        }

        // Fetch member
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        if (!targetMember) {
            return { valid: false, error: 'User not found in this server.' };
        }

        // Role hierarchy check
        if (targetMember.roles.highest.position >= interaction.member.roles.highest.position) {
            return { valid: false, error: 'You cannot timeout someone with equal or higher role than you.' };
        }

        // Bot can timeout check
        const botMember = interaction.guild.members.me;
        if (targetMember.roles.highest.position >= botMember.roles.highest.position) {
            return { valid: false, error: 'I cannot timeout this user due to role hierarchy.' };
        }

        return { valid: true, member: targetMember };
    }
}

// Export utilities for other modules
module.exports = new MuteCommand();
module.exports.parseDuration = parseDuration;
module.exports.formatDuration = formatDuration;
module.exports.DURATION_CHOICES = DURATION_CHOICES;



