/**
 * Setting Command - Presentation Layer
 * Server owner settings configuration
 * @module presentation/commands/admin/setting
 */

const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ChannelSelectMenuBuilder,
    RoleSelectMenuBuilder,
    ChannelType,
    PermissionFlagsBits,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');
const { BaseCommand, CommandCategory } = require('../BaseCommand');
const { COLORS } = require('../../constants');

class SettingCommand extends BaseCommand {
    constructor() {
        super({
            category: CommandCategory.ADMIN,
            cooldown: 5,
            deferReply: false, // Handle deferral manually for different subcommands
            requiredPermissions: [PermissionFlagsBits.Administrator]
        });
    }

    get data() {
        return new SlashCommandBuilder()
            .setName('setting')
            .setDescription('Configure server settings (Server Owner only)')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
            .addSubcommand(sub =>
                sub.setName('view')
                    .setDescription('View current server settings'))
            .addSubcommand(sub =>
                sub.setName('snipe')
                    .setDescription('Configure snipe message limit')
                    .addIntegerOption(opt =>
                        opt.setName('limit')
                            .setDescription('Number of deleted messages to track (1-50)')
                            .setRequired(true)
                            .setMinValue(1)
                            .setMaxValue(50)))
            .addSubcommand(sub =>
                sub.setName('delete_limit')
                    .setDescription('Configure maximum messages that can be deleted at once')
                    .addIntegerOption(opt =>
                        opt.setName('limit')
                            .setDescription('Maximum messages to delete (1-500)')
                            .setRequired(true)
                            .setMinValue(1)
                            .setMaxValue(500)))
            .addSubcommand(sub =>
                sub.setName('announcement')
                    .setDescription('Set the announcement channel')
                    .addChannelOption(opt =>
                        opt.setName('channel')
                            .setDescription('Channel for bot announcements (leave empty to disable)')
                            .addChannelTypes(ChannelType.GuildText)))
            .addSubcommand(sub =>
                sub.setName('log')
                    .setDescription('Set the moderation log channel')
                    .addChannelOption(opt =>
                        opt.setName('channel')
                            .setDescription('Channel for moderation logs (leave empty to disable)')
                            .addChannelTypes(ChannelType.GuildText)))
            .addSubcommand(sub =>
                sub.setName('adminrole')
                    .setDescription('Manage admin roles')
                    .addStringOption(opt =>
                        opt.setName('action')
                            .setDescription('Add or remove role')
                            .setRequired(true)
                            .addChoices(
                                { name: 'Add', value: 'add' },
                                { name: 'Remove', value: 'remove' }
                            ))
                    .addRoleOption(opt =>
                        opt.setName('role')
                            .setDescription('Role to add/remove')
                            .setRequired(true)))
            .addSubcommand(sub =>
                sub.setName('modrole')
                    .setDescription('Manage moderator roles')
                    .addStringOption(opt =>
                        opt.setName('action')
                            .setDescription('Add or remove role')
                            .setRequired(true)
                            .addChoices(
                                { name: 'Add', value: 'add' },
                                { name: 'Remove', value: 'remove' }
                            ))
                    .addRoleOption(opt =>
                        opt.setName('role')
                            .setDescription('Role to add/remove')
                            .setRequired(true)))
            .addSubcommand(sub =>
                sub.setName('reset')
                    .setDescription('Reset all settings to default'));
    }

    async run(interaction) {
        // Server owner check
        try {
            const { GuildSettingsService } = require('../../../services');
            if (!GuildSettingsService.isServerOwner(interaction.member)) {
                return interaction.reply({
                    content: '❌ Only the server owner can use this command.',
                    ephemeral: true
                });
            }
        } catch {
            // Fallback to basic owner check
            if (interaction.user.id !== interaction.guild.ownerId) {
                return interaction.reply({
                    content: '❌ Only the server owner can use this command.',
                    ephemeral: true
                });
            }
        }

        const subcommand = interaction.options.getSubcommand();

        try {
            switch (subcommand) {
                case 'view': return await this._handleView(interaction);
                case 'snipe': return await this._handleSnipe(interaction);
                case 'delete_limit': return await this._handleDeleteLimit(interaction);
                case 'announcement': return await this._handleAnnouncement(interaction);
                case 'log': return await this._handleLog(interaction);
                case 'adminrole': return await this._handleAdminRole(interaction);
                case 'modrole': return await this._handleModRole(interaction);
                case 'reset': return await this._handleReset(interaction);
                default:
                    return interaction.reply({ content: '❌ Unknown subcommand.', ephemeral: true });
            }
        } catch (error) {
            console.error('[/setting] Error:', error);
            const errorMsg = { content: '❌ An error occurred while processing the command.', ephemeral: true };
            if (interaction.replied || interaction.deferred) {
                return interaction.followUp(errorMsg);
            }
            return interaction.reply(errorMsg);
        }
    }

    async _handleView(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const { GuildSettingsService } = require('../../services');
        
        const settings = await GuildSettingsService.getGuildSettings(interaction.guild.id);
        const snipeLimit = await GuildSettingsService.getSnipeLimit(interaction.guild.id);
        const deleteLimit = await GuildSettingsService.getDeleteLimit(interaction.guild.id);
        const adminRoles = await GuildSettingsService.getAdminRoles(interaction.guild.id);
        const modRoles = await GuildSettingsService.getModRoles(interaction.guild.id);

        const adminRolesMention = adminRoles.length > 0 
            ? adminRoles.map(id => `<@&${id}>`).join(', ')
            : '*None configured*';
        
        const modRolesMention = modRoles.length > 0 
            ? modRoles.map(id => `<@&${id}>`).join(', ')
            : '*None configured*';

        const embed = new EmbedBuilder()
            .setColor(COLORS.INFO)
            .setTitle('⚙️ Server Settings')
            .setDescription(`Settings for **${interaction.guild.name}**\n\nSelect an option below to edit settings.`)
            .addFields(
                { name: '📝 Snipe Limit', value: `\`${snipeLimit}\` messages`, inline: true },
                { name: '🗑️ Delete Limit', value: `\`${deleteLimit}\` messages`, inline: true },
                { name: '\u200b', value: '\u200b', inline: true },
                { name: '📋 Log Channel', value: settings.log_channel ? `<#${settings.log_channel}>` : '*Not set*', inline: true },
                { name: '📢 Announcement', value: settings.announcement_channel ? `<#${settings.announcement_channel}>` : '*Not set*', inline: true },
                { name: '\u200b', value: '\u200b', inline: true },
                { name: '👑 Admin Roles', value: adminRolesMention },
                { name: '🛡️ Moderator Roles', value: modRolesMention }
            )
            .setFooter({ text: 'Settings are saved automatically' })
            .setTimestamp();

        // Select menu for editing settings
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('setting_select')
            .setPlaceholder('📝 Select setting to edit...')
            .addOptions([
                { label: 'Snipe Limit', value: 'snipe', emoji: '📝', description: 'Number of deleted messages to track' },
                { label: 'Delete Limit', value: 'delete', emoji: '🗑️', description: 'Max messages to delete at once' },
                { label: 'Log Channel', value: 'log', emoji: '📋', description: 'Channel for moderation logs' },
                { label: 'Announcement Channel', value: 'announce', emoji: '📢', description: 'Channel for bot announcements' },
                { label: 'Admin Roles', value: 'admin', emoji: '👑', description: 'Manage admin roles' },
                { label: 'Moderator Roles', value: 'mod', emoji: '🛡️', description: 'Manage moderator roles' },
            ]);

        const selectRow = new ActionRowBuilder().addComponents(selectMenu);
        
        const buttonRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('setting_refresh')
                .setLabel('Refresh')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🔄'),
            new ButtonBuilder()
                .setCustomId('setting_reset_all')
                .setLabel('Reset All')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🗑️')
        );

        const response = await interaction.editReply({ 
            embeds: [embed], 
            components: [selectRow, buttonRow] 
        });

        // Create collector for interactions
        const collector = response.createMessageComponentCollector({
            filter: i => i.user.id === interaction.user.id,
            time: 5 * 60 * 1000 // 5 minutes
        });

        collector.on('collect', async (i) => {
            try {
                if (i.customId === 'setting_refresh') {
                    await this._refreshSettingsView(i);
                } else if (i.customId === 'setting_reset_all') {
                    await this._handleResetFromView(i);
                } else if (i.customId === 'setting_select') {
                    await this._handleSettingSelect(i, i.values[0]);
                } else if (i.customId === 'setting_log_channel') {
                    await this._handleChannelSelect(i, 'log_channel');
                } else if (i.customId === 'setting_announce_channel') {
                    await this._handleChannelSelect(i, 'announcement_channel');
                } else if (i.customId === 'setting_admin_role') {
                    await this._handleRoleSelect(i, 'admin');
                } else if (i.customId === 'setting_mod_role') {
                    await this._handleRoleSelect(i, 'mod');
                } else if (i.customId === 'setting_back') {
                    await this._refreshSettingsView(i);
                } else if (i.customId === 'setting_clear_channel') {
                    await this._handleClearChannel(i);
                }
            } catch (error) {
                console.error('[Settings] Interaction error:', error);
                if (!i.replied && !i.deferred) {
                    await i.reply({ content: '❌ An error occurred.', ephemeral: true }).catch(() => {});
                }
            }
        });

        collector.on('end', async () => {
            try {
                const disabledSelect = StringSelectMenuBuilder.from(selectMenu).setDisabled(true);
                const disabledButtons = buttonRow.components.map(b => ButtonBuilder.from(b).setDisabled(true));
                await interaction.editReply({ 
                    components: [
                        new ActionRowBuilder().addComponents(disabledSelect),
                        new ActionRowBuilder().addComponents(disabledButtons)
                    ] 
                }).catch(() => {});
            } catch {}
        });
    }

    async _refreshSettingsView(interaction) {
        const { GuildSettingsService } = require('../../services');
        
        const settings = await GuildSettingsService.getGuildSettings(interaction.guild.id);
        const snipeLimit = await GuildSettingsService.getSnipeLimit(interaction.guild.id);
        const deleteLimit = await GuildSettingsService.getDeleteLimit(interaction.guild.id);
        const adminRoles = await GuildSettingsService.getAdminRoles(interaction.guild.id);
        const modRoles = await GuildSettingsService.getModRoles(interaction.guild.id);

        const adminRolesMention = adminRoles.length > 0 
            ? adminRoles.map(id => `<@&${id}>`).join(', ')
            : '*None configured*';
        
        const modRolesMention = modRoles.length > 0 
            ? modRoles.map(id => `<@&${id}>`).join(', ')
            : '*None configured*';

        const embed = new EmbedBuilder()
            .setColor(COLORS.INFO)
            .setTitle('⚙️ Server Settings')
            .setDescription(`Settings for **${interaction.guild.name}**\n\nSelect an option below to edit settings.`)
            .addFields(
                { name: '📝 Snipe Limit', value: `\`${snipeLimit}\` messages`, inline: true },
                { name: '🗑️ Delete Limit', value: `\`${deleteLimit}\` messages`, inline: true },
                { name: '\u200b', value: '\u200b', inline: true },
                { name: '📋 Log Channel', value: settings.log_channel ? `<#${settings.log_channel}>` : '*Not set*', inline: true },
                { name: '📢 Announcement', value: settings.announcement_channel ? `<#${settings.announcement_channel}>` : '*Not set*', inline: true },
                { name: '\u200b', value: '\u200b', inline: true },
                { name: '👑 Admin Roles', value: adminRolesMention },
                { name: '🛡️ Moderator Roles', value: modRolesMention }
            )
            .setFooter({ text: 'Settings are saved automatically' })
            .setTimestamp();

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('setting_select')
            .setPlaceholder('📝 Select setting to edit...')
            .addOptions([
                { label: 'Snipe Limit', value: 'snipe', emoji: '📝', description: 'Number of deleted messages to track' },
                { label: 'Delete Limit', value: 'delete', emoji: '🗑️', description: 'Max messages to delete at once' },
                { label: 'Log Channel', value: 'log', emoji: '📋', description: 'Channel for moderation logs' },
                { label: 'Announcement Channel', value: 'announce', emoji: '📢', description: 'Channel for bot announcements' },
                { label: 'Admin Roles', value: 'admin', emoji: '👑', description: 'Manage admin roles' },
                { label: 'Moderator Roles', value: 'mod', emoji: '🛡️', description: 'Manage moderator roles' },
            ]);

        const selectRow = new ActionRowBuilder().addComponents(selectMenu);
        
        const buttonRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('setting_refresh')
                .setLabel('Refresh')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🔄'),
            new ButtonBuilder()
                .setCustomId('setting_reset_all')
                .setLabel('Reset All')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🗑️')
        );

        await interaction.update({ embeds: [embed], components: [selectRow, buttonRow] });
    }

    async _handleSettingSelect(interaction, setting) {
        switch (setting) {
            case 'snipe':
            case 'delete': {
                const isSnipe = setting === 'snipe';
                const modal = new ModalBuilder()
                    .setCustomId(isSnipe ? 'setting_snipe_modal' : 'setting_delete_modal')
                    .setTitle(isSnipe ? '📝 Set Snipe Limit' : '🗑️ Set Delete Limit');

                const input = new TextInputBuilder()
                    .setCustomId('limit_value')
                    .setLabel(isSnipe ? 'Snipe limit (1-50)' : 'Delete limit (1-500)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder(isSnipe ? 'Enter a number between 1-50' : 'Enter a number between 1-500')
                    .setRequired(true)
                    .setMinLength(1)
                    .setMaxLength(3);

                modal.addComponents(new ActionRowBuilder().addComponents(input));
                await interaction.showModal(modal);

                try {
                    const modalResponse = await interaction.awaitModalSubmit({
                        filter: i => i.customId === modal.data.custom_id && i.user.id === interaction.user.id,
                        time: 60000
                    });

                    const value = parseInt(modalResponse.fields.getTextInputValue('limit_value'));
                    const max = isSnipe ? 50 : 500;
                    
                    if (isNaN(value) || value < 1 || value > max) {
                        await modalResponse.reply({ 
                            content: `❌ Please enter a valid number between 1 and ${max}.`, 
                            ephemeral: true 
                        });
                        return;
                    }

                    const { GuildSettingsService } = require('../../services');
                    if (isSnipe) {
                        await GuildSettingsService.setSnipeLimit(interaction.guild.id, value);
                    } else {
                        await GuildSettingsService.setDeleteLimit(interaction.guild.id, value);
                    }

                    await modalResponse.deferUpdate();
                    await this._refreshSettingsView(modalResponse);
                } catch (error) {
                    // Modal timeout or error - ignore
                }
                break;
            }

            case 'log':
            case 'announce': {
                const isLog = setting === 'log';
                const embed = new EmbedBuilder()
                    .setColor(COLORS.INFO)
                    .setTitle(isLog ? '📋 Set Log Channel' : '📢 Set Announcement Channel')
                    .setDescription('Select a channel from the dropdown below, or click "Clear" to disable.');

                const channelSelect = new ChannelSelectMenuBuilder()
                    .setCustomId(isLog ? 'setting_log_channel' : 'setting_announce_channel')
                    .setPlaceholder('Select a channel...')
                    .setChannelTypes(ChannelType.GuildText);

                const buttonRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('setting_clear_channel')
                        .setLabel('Clear Channel')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('🚫'),
                    new ButtonBuilder()
                        .setCustomId('setting_back')
                        .setLabel('Back')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('◀️')
                );

                // Store which channel type we're editing
                interaction.message._settingType = isLog ? 'log_channel' : 'announcement_channel';

                await interaction.update({
                    embeds: [embed],
                    components: [
                        new ActionRowBuilder().addComponents(channelSelect),
                        buttonRow
                    ]
                });
                break;
            }

            case 'admin':
            case 'mod': {
                const isAdmin = setting === 'admin';
                const { GuildSettingsService } = require('../../services');
                const currentRoles = isAdmin 
                    ? await GuildSettingsService.getAdminRoles(interaction.guild.id)
                    : await GuildSettingsService.getModRoles(interaction.guild.id);

                const currentRolesMention = currentRoles.length > 0
                    ? currentRoles.map(id => `<@&${id}>`).join(', ')
                    : '*None*';

                const embed = new EmbedBuilder()
                    .setColor(COLORS.INFO)
                    .setTitle(isAdmin ? '👑 Manage Admin Roles' : '🛡️ Manage Moderator Roles')
                    .setDescription(`**Current roles:** ${currentRolesMention}\n\nSelect roles to **add** or **remove** them (toggle).`);

                const roleSelect = new RoleSelectMenuBuilder()
                    .setCustomId(isAdmin ? 'setting_admin_role' : 'setting_mod_role')
                    .setPlaceholder('Select roles to toggle...')
                    .setMinValues(1)
                    .setMaxValues(10);

                const buttonRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('setting_back')
                        .setLabel('Back')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('◀️')
                );

                await interaction.update({
                    embeds: [embed],
                    components: [
                        new ActionRowBuilder().addComponents(roleSelect),
                        buttonRow
                    ]
                });
                break;
            }
        }
    }

    async _handleChannelSelect(interaction, settingKey) {
        const { GuildSettingsService } = require('../../services');
        const channelId = interaction.values[0];

        if (settingKey === 'log_channel') {
            await GuildSettingsService.setLogChannel(interaction.guild.id, channelId);
        } else {
            await GuildSettingsService.updateSetting(interaction.guild.id, settingKey, channelId);
        }

        await this._refreshSettingsView(interaction);
    }

    async _handleClearChannel(interaction) {
        const { GuildSettingsService } = require('../../services');
        const settingType = interaction.message._settingType || 'log_channel';

        if (settingType === 'log_channel') {
            await GuildSettingsService.setLogChannel(interaction.guild.id, null);
        } else {
            await GuildSettingsService.updateSetting(interaction.guild.id, settingType, null);
        }

        await this._refreshSettingsView(interaction);
    }

    async _handleRoleSelect(interaction, type) {
        const { GuildSettingsService } = require('../../services');
        const selectedRoles = interaction.values;
        
        const currentRoles = type === 'admin'
            ? await GuildSettingsService.getAdminRoles(interaction.guild.id)
            : await GuildSettingsService.getModRoles(interaction.guild.id);

        // Toggle logic - add if not present, remove if present
        for (const roleId of selectedRoles) {
            // Skip @everyone and managed roles
            const role = interaction.guild.roles.cache.get(roleId);
            if (!role || role.id === interaction.guild.id || role.managed) continue;

            if (currentRoles.includes(roleId)) {
                // Remove
                if (type === 'admin') {
                    await GuildSettingsService.removeAdminRole(interaction.guild.id, roleId);
                } else {
                    await GuildSettingsService.removeModRole(interaction.guild.id, roleId);
                }
            } else {
                // Add
                if (type === 'admin') {
                    await GuildSettingsService.addAdminRole(interaction.guild.id, roleId);
                } else {
                    await GuildSettingsService.addModRole(interaction.guild.id, roleId);
                }
            }
        }

        await this._refreshSettingsView(interaction);
    }

    async _handleResetFromView(interaction) {
        const embed = new EmbedBuilder()
            .setColor(COLORS.WARNING)
            .setTitle('⚠️ Reset All Settings?')
            .setDescription('This will reset:\n• Snipe limit → 10\n• Delete limit → 100\n• Clear all channels\n• Remove all admin/mod roles');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('setting_reset_confirm_view')
                .setLabel('Yes, Reset')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('setting_back')
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Secondary)
        );

        await interaction.update({ embeds: [embed], components: [row] });

        try {
            const confirm = await interaction.message.awaitMessageComponent({
                filter: i => i.user.id === interaction.user.id && i.customId === 'setting_reset_confirm_view',
                time: 30000
            });

            const { GuildSettingsService } = require('../../services');
            await GuildSettingsService.updateGuildSettings(interaction.guild.id, {
                log_channel: null,
                mod_log_channel: null,
                announcement_channel: null,
                mute_role: null,
                settings: {
                    snipe_limit: 10,
                    delete_limit: 100,
                    admin_roles: [],
                    mod_roles: []
                }
            });
            GuildSettingsService.clearCache(interaction.guild.id);

            await this._refreshSettingsView(confirm);
        } catch {
            // Timeout or cancel - will be handled by back button
        }
    }

    async _handleSnipe(interaction) {
        const { GuildSettingsService } = require('../../services');
        
        const limit = interaction.options.getInteger('limit');
        await GuildSettingsService.setSnipeLimit(interaction.guild.id, limit);

        const embed = new EmbedBuilder()
            .setColor(COLORS.SUCCESS)
            .setTitle('✅ Snipe Limit Updated')
            .setDescription(`The bot will now track the last **${limit}** deleted messages.`)
            .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async _handleDeleteLimit(interaction) {
        const { GuildSettingsService } = require('../../services');
        
        const limit = interaction.options.getInteger('limit');
        await GuildSettingsService.setDeleteLimit(interaction.guild.id, limit);

        const embed = new EmbedBuilder()
            .setColor(COLORS.SUCCESS)
            .setTitle('✅ Delete Limit Updated')
            .setDescription(`Moderators can now delete up to **${limit}** messages at once using \`/delete\`.`)
            .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async _handleAnnouncement(interaction) {
        const { GuildSettingsService } = require('../../services');
        
        const channel = interaction.options.getChannel('channel');
        const channelId = channel?.id || null;

        await GuildSettingsService.updateSetting(interaction.guild.id, 'announcement_channel', channelId);

        const embed = new EmbedBuilder()
            .setColor(COLORS.SUCCESS)
            .setTimestamp();

        if (channelId) {
            embed.setTitle('✅ Announcement Channel Set')
                .setDescription(`Bot announcements will be sent to <#${channelId}>`);
        } else {
            embed.setTitle('✅ Announcement Channel Disabled')
                .setDescription('Bot announcements have been disabled for this server.');
        }

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async _handleLog(interaction) {
        const { GuildSettingsService } = require('../../services');
        
        const channel = interaction.options.getChannel('channel');
        const channelId = channel?.id || null;

        await GuildSettingsService.setLogChannel(interaction.guild.id, channelId);

        const embed = new EmbedBuilder()
            .setColor(COLORS.SUCCESS)
            .setTimestamp();

        if (channelId) {
            embed.setTitle('✅ Log Channel Set')
                .setDescription(`Moderation logs will be sent to <#${channelId}>`);
        } else {
            embed.setTitle('✅ Log Channel Disabled')
                .setDescription('Moderation logging has been disabled for this server.');
        }

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async _handleAdminRole(interaction) {
        const { GuildSettingsService } = require('../../services');
        
        const action = interaction.options.getString('action');
        const role = interaction.options.getRole('role');

        // Prevent @everyone or managed roles
        if (role.id === interaction.guild.id || role.managed) {
            return interaction.reply({ content: '❌ You cannot use this role.', ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setColor(COLORS.SUCCESS)
            .setTimestamp();

        if (action === 'add') {
            await GuildSettingsService.addAdminRole(interaction.guild.id, role.id);
            embed.setTitle('✅ Admin Role Added')
                .setDescription(`<@&${role.id}> can now use admin commands.`);
        } else {
            await GuildSettingsService.removeAdminRole(interaction.guild.id, role.id);
            embed.setTitle('✅ Admin Role Removed')
                .setDescription(`<@&${role.id}> can no longer use admin commands.`);
        }

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async _handleModRole(interaction) {
        const { GuildSettingsService } = require('../../services');
        
        const action = interaction.options.getString('action');
        const role = interaction.options.getRole('role');

        // Prevent @everyone or managed roles
        if (role.id === interaction.guild.id || role.managed) {
            return interaction.reply({ content: '❌ You cannot use this role.', ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setColor(COLORS.SUCCESS)
            .setTimestamp();

        if (action === 'add') {
            await GuildSettingsService.addModRole(interaction.guild.id, role.id);
            embed.setTitle('✅ Moderator Role Added')
                .setDescription(`<@&${role.id}> can now use moderation commands.`);
        } else {
            await GuildSettingsService.removeModRole(interaction.guild.id, role.id);
            embed.setTitle('✅ Moderator Role Removed')
                .setDescription(`<@&${role.id}> can no longer use moderation commands.`);
        }

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async _handleReset(interaction) {
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('setting_reset_confirm')
                    .setLabel('Confirm Reset')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('setting_reset_cancel')
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Secondary)
            );

        const embed = new EmbedBuilder()
            .setColor(COLORS.WARNING)
            .setTitle('⚠️ Reset Settings')
            .setDescription('Are you sure you want to reset all settings to default?\n\nThis will clear:\n• Admin roles\n• Moderator roles\n• Announcement channel\n• Log channel\n• Snipe limit (reset to 10)')
            .setTimestamp();

        const response = await interaction.reply({
            embeds: [embed],
            components: [row],
            ephemeral: true
        });

        try {
            const buttonInteraction = await response.awaitMessageComponent({
                filter: i => i.user.id === interaction.user.id,
                time: 30000
            });

            if (buttonInteraction.customId === 'setting_reset_confirm') {
                const { GuildSettingsService } = require('../../services');
                
                // Reset all settings
                await GuildSettingsService.updateGuildSettings(interaction.guild.id, {
                    log_channel: null,
                    mod_log_channel: null,
                    mute_role: null,
                    settings: {
                        snipe_limit: 10,
                        delete_limit: 100,
                        announcement_channel: null,
                        admin_roles: [],
                        mod_roles: []
                    }
                });
                GuildSettingsService.clearCache(interaction.guild.id);

                const successEmbed = new EmbedBuilder()
                    .setColor(COLORS.SUCCESS)
                    .setTitle('✅ Settings Reset')
                    .setDescription('All settings have been reset to default.')
                    .setTimestamp();

                await buttonInteraction.update({ embeds: [successEmbed], components: [] });
            } else {
                const cancelEmbed = new EmbedBuilder()
                    .setColor(COLORS.INFO)
                    .setTitle('❌ Reset Cancelled')
                    .setDescription('Settings were not changed.')
                    .setTimestamp();

                await buttonInteraction.update({ embeds: [cancelEmbed], components: [] });
            }
        } catch (error) {
            const timeoutEmbed = new EmbedBuilder()
                .setColor(COLORS.ERROR)
                .setTitle('⏰ Timeout')
                .setDescription('Reset cancelled due to timeout.')
                .setTimestamp();

            await interaction.editReply({ embeds: [timeoutEmbed], components: [] });
        }
    }
}

module.exports = new SettingCommand();



