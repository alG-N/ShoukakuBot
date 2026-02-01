/**
 * Avatar Command - Presentation Layer
 * Display user avatars
 * @module presentation/commands/general/avatar
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { BaseCommand, CommandCategory } = require('../BaseCommand');
const { COLORS } = require('../../constants');

class AvatarCommand extends BaseCommand {
    constructor() {
        super({
            category: CommandCategory.GENERAL,
            cooldown: 3,
            deferReply: false
        });
    }

    get data() {
        return new SlashCommandBuilder()
            .setName('avatar')
            .setDescription("Display a user's avatar")
            .addUserOption(option =>
                option.setName('user')
                    .setDescription('The user to get the avatar of')
                    .setRequired(false)
            )
            .addIntegerOption(option =>
                option.setName('size')
                    .setDescription('Avatar size')
                    .addChoices(
                        { name: '128', value: 128 },
                        { name: '256', value: 256 },
                        { name: '512', value: 512 },
                        { name: '1024', value: 1024 },
                        { name: '2048', value: 2048 },
                        { name: '4096', value: 4096 }
                    )
                    .setRequired(false)
            )
            .addStringOption(option =>
                option.setName('format')
                    .setDescription('Image format')
                    .addChoices(
                        { name: 'Auto (Animated if available)', value: 'auto' },
                        { name: 'PNG', value: 'png' },
                        { name: 'JPG', value: 'jpg' },
                        { name: 'WebP', value: 'webp' },
                        { name: 'GIF', value: 'gif' }
                    )
                    .setRequired(false)
            );
    }

    async run(interaction) {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const size = interaction.options.getInteger('size') || 1024;
        const format = interaction.options.getString('format') || 'auto';

        // Fetch full user to get banner if available
        let fetchedUser;
        try {
            fetchedUser = await interaction.client.users.fetch(targetUser.id, { force: true });
        } catch {
            fetchedUser = targetUser;
        }

        // Build avatar URL
        let avatarURL;
        if (format === 'auto') {
            avatarURL = targetUser.displayAvatarURL({ size, dynamic: true });
        } else {
            avatarURL = targetUser.displayAvatarURL({ size, extension: format });
        }

        // Check if user has server-specific avatar
        let guildAvatarURL = null;
        if (interaction.guild) {
            const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
            if (member?.avatar) {
                guildAvatarURL = member.displayAvatarURL({ size, dynamic: format === 'auto' });
            }
        }

        const embed = new EmbedBuilder()
            .setTitle(`${targetUser.username}'s Avatar`)
            .setColor(fetchedUser.accentColor || COLORS.PRIMARY)
            .setImage(avatarURL)
            .setTimestamp()
            .setFooter({
                text: `Requested by ${interaction.user.username}`,
                iconURL: interaction.user.displayAvatarURL()
            });

        // Add download links
        const formats = ['png', 'jpg', 'webp'];
        if (targetUser.avatar?.startsWith('a_')) {
            formats.push('gif');
        }

        const downloadLinks = formats.map(ext => 
            `[${ext.toUpperCase()}](${targetUser.displayAvatarURL({ size: 4096, extension: ext })})`
        ).join(' • ');

        embed.setDescription(`**Download:** ${downloadLinks}`);

        // Add fields
        const fields = [
            { name: 'User', value: `<@${targetUser.id}>`, inline: true },
            { name: 'ID', value: `\`${targetUser.id}\``, inline: true },
            { name: 'Size', value: `${size}px`, inline: true }
        ];

        // Add server avatar if different
        if (guildAvatarURL && guildAvatarURL !== avatarURL) {
            fields.push({
                name: 'Server Avatar',
                value: `[View](${guildAvatarURL})`,
                inline: true
            });
        }

        // Add banner if exists
        if (fetchedUser.banner) {
            const bannerURL = fetchedUser.bannerURL({ size: 4096 });
            fields.push({
                name: 'Banner',
                value: `[View](${bannerURL})`,
                inline: true
            });
        }

        embed.addFields(fields);

        await interaction.reply({ embeds: [embed] });
    }
}

module.exports = new AvatarCommand();



