/**
 * Role Info Command - Presentation Layer
 * Display role information
 * @module presentation/commands/general/roleinfo
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { BaseCommand, CommandCategory } = require('../BaseCommand');
const { COLORS } = require('../../constants');

class RoleInfoCommand extends BaseCommand {
    constructor() {
        super({
            category: CommandCategory.GENERAL,
            cooldown: 3,
            deferReply: false
        });
    }

    get data() {
        return new SlashCommandBuilder()
            .setName('roleinfo')
            .setDescription('Get information about a role')
            .addRoleOption(option =>
                option.setName('role')
                    .setDescription('The role to get info about')
                    .setRequired(true)
            );
    }

    async run(interaction) {
        const role = interaction.options.getRole('role');
        
        if (!role) {
            return this.errorReply(interaction, 'Please provide a valid role.');
        }

        // Get key permissions
        const keyPermissions = [
            { flag: PermissionFlagsBits.Administrator, name: 'Administrator' },
            { flag: PermissionFlagsBits.ManageGuild, name: 'Manage Server' },
            { flag: PermissionFlagsBits.ManageRoles, name: 'Manage Roles' },
            { flag: PermissionFlagsBits.ManageChannels, name: 'Manage Channels' },
            { flag: PermissionFlagsBits.KickMembers, name: 'Kick Members' },
            { flag: PermissionFlagsBits.BanMembers, name: 'Ban Members' },
            { flag: PermissionFlagsBits.ManageMessages, name: 'Manage Messages' },
            { flag: PermissionFlagsBits.MentionEveryone, name: 'Mention Everyone' },
            { flag: PermissionFlagsBits.ModerateMembers, name: 'Timeout Members' }
        ];

        const hasPermissions = keyPermissions
            .filter(p => role.permissions.has(p.flag))
            .map(p => `\`${p.name}\``)
            .join(', ') || 'None';

        // Count members with this role
        const memberCount = role.members.size;

        // Get role icon if exists
        const roleIcon = role.iconURL();

        const embed = new EmbedBuilder()
            .setTitle(`📜 Role: ${role.name}`)
            .setColor(role.color || COLORS.PRIMARY)
            .addFields(
                { name: '🆔 ID', value: `\`${role.id}\``, inline: true },
                { name: '🎨 Color', value: role.hexColor, inline: true },
                { name: '📊 Position', value: `${role.position}/${interaction.guild.roles.cache.size}`, inline: true },
                { name: '👥 Members', value: `${memberCount}`, inline: true },
                { name: '📣 Mentionable', value: role.mentionable ? '✅ Yes' : '❌ No', inline: true },
                { name: '📌 Hoisted', value: role.hoist ? '✅ Yes' : '❌ No', inline: true },
                { name: '🤖 Managed', value: role.managed ? '✅ Yes (Bot/Integration)' : '❌ No', inline: true },
                { name: '📅 Created', value: `<t:${Math.floor(role.createdTimestamp / 1000)}:R>`, inline: true },
                { name: '🔗 Mention', value: `${role}`, inline: true },
                { name: '🔑 Key Permissions', value: hasPermissions, inline: false }
            )
            .setTimestamp()
            .setFooter({ 
                text: `Requested by ${interaction.user.tag}`, 
                iconURL: interaction.user.displayAvatarURL() 
            });

        // Add role icon if exists
        if (roleIcon) {
            embed.setThumbnail(roleIcon);
        }

        await interaction.reply({ embeds: [embed] });
    }
}

module.exports = new RoleInfoCommand();



