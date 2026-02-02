/**
 * Setting Command - Simplified Server Settings
 * All settings are managed through /setting view with interactive components
 * @module commands/admin/setting
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
    TextInputStyle,
    ComponentType
} = require('discord.js');
const { BaseCommand } = require('../BaseCommand');
const { COLORS } = require('../../constants');

class SettingCommand extends BaseCommand {
    constructor() {
        super('setting');
        this.cooldown = 5;
        this.permissions = [PermissionFlagsBits.Administrator];
    }

    get data() {
        return new SlashCommandBuilder()
            .setName('setting')
            .setDescription('Configure server settings (Server Owner only)')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
        // No subcommands - all handled through interactive view
    }

    async run(interaction) {
        // Server owner check
        if (interaction.user.id !== interaction.guild.ownerId) {
            return interaction.reply({
                content: '❌ Only the server owner can use this command.',
                ephemeral: true
            });
        }

        await this._showMainPanel(interaction);
    }

    /**
     * Show main settings panel
     */
    async _showMainPanel(interaction, isUpdate = false) {
        const { GuildSettingsService } = require('../../services');
        const { AutoModService, LockdownService, AntiRaidService, ModLogService } = require('../../services/moderation');
        
        const settings = await GuildSettingsService.getGuildSettings(interaction.guildId);
        const snipeLimit = await GuildSettingsService.getSnipeLimit(interaction.guildId);
        const deleteLimit = await GuildSettingsService.getDeleteLimit(interaction.guildId);
        const adminRoles = await GuildSettingsService.getAdminRoles(interaction.guildId);
        const modRoles = await GuildSettingsService.getModRoles(interaction.guildId);

        // Get mod log channel from ModLogService (synced with /modlogs command)
        let modLogChannel = null;
        try {
            const modLogSettings = await ModLogService.getSettings(interaction.guildId);
            modLogChannel = modLogSettings?.log_channel_id;
        } catch {}

        // Get moderation status
        let automodSettings = { enabled: false };
        let lockdownStatus = { lockedCount: 0 };
        let raidStatus = null;
        
        try { automodSettings = await AutoModService.getSettings(interaction.guildId); } catch {}
        try { lockdownStatus = LockdownService.getLockStatus(interaction.guildId); } catch {}
        try { raidStatus = AntiRaidService.getRaidModeState(interaction.guildId); } catch {}

        const adminRolesMention = adminRoles.length > 0 
            ? adminRoles.map(id => `<@&${id}>`).join(', ')
            : '*None*';
        
        const modRolesMention = modRoles.length > 0 
            ? modRoles.map(id => `<@&${id}>`).join(', ')
            : '*None*';

        // Moderation status
        const automodFeatures = automodSettings.enabled ? [
            automodSettings.spam_enabled ? 'Spam' : null,
            automodSettings.duplicate_enabled ? 'Duplicate' : null,
            automodSettings.links_enabled ? 'Links' : null,
            automodSettings.invites_enabled ? 'Invites' : null,
            automodSettings.mention_enabled ? 'Mentions' : null,
            automodSettings.caps_enabled ? 'Caps' : null,
            automodSettings.filter_enabled ? 'Filter' : null
        ].filter(Boolean) : [];
        
        const automodStatus = automodSettings.enabled 
            ? `✅ Enabled (${automodFeatures.length} active)`
            : '❌ Disabled';

        // Announcement status
        const announceEnabled = settings.announcements_enabled !== false; // default true
        const announceStatus = announceEnabled
            ? (settings.announcement_channel ? `✅ <#${settings.announcement_channel}>` : '⚠️ No channel set')
            : '❌ Disabled';

        const embed = new EmbedBuilder()
            .setColor(COLORS.INFO)
            .setTitle('⚙️ Server Settings')
            .setDescription(`Settings for **${interaction.guild.name}**\nClick buttons or use select menus to configure.`)
            .addFields(
                { name: '📝 Snipe Limit', value: `\`${snipeLimit}\``, inline: true },
                { name: '🗑️ Delete Limit', value: `\`${deleteLimit}\``, inline: true },
                { name: '📋 Mod Log', value: modLogChannel ? `<#${modLogChannel}>` : '*Not set*', inline: true },
                { name: '👑 Admin Roles', value: adminRolesMention, inline: true },
                { name: '🛡️ Mod Roles', value: modRolesMention, inline: true },
                { name: '📢 Announce', value: announceStatus, inline: true },
                { name: '─────────────', value: '**🔧 Moderation Status**', inline: false },
                { name: '🤖 AutoMod', value: automodStatus, inline: true },
                { name: '🔒 Lockdown', value: lockdownStatus.lockedCount > 0 ? `🔒 Active (${lockdownStatus.lockedCount})` : '🔓 Inactive', inline: true },
                { name: '🛡️ Raid Mode', value: raidStatus?.active ? '🛡️ Active' : '🛡️ Inactive', inline: true }
            )
            .setFooter({ text: 'Use /automod for detailed automod settings • /modlogs for log toggles' })
            .setTimestamp();

        // Settings select menu
        const settingsMenu = new StringSelectMenuBuilder()
            .setCustomId('setting_menu')
            .setPlaceholder('📝 Quick Edit Setting...')
            .addOptions([
                { label: 'Snipe Limit', value: 'snipe', emoji: '📝', description: 'Messages to track for snipe' },
                { label: 'Delete Limit', value: 'delete', emoji: '🗑️', description: 'Max messages per delete' },
                { label: 'Toggle Announcements', value: 'toggle_announce', emoji: '📢', description: announceEnabled ? 'Currently: Enabled' : 'Currently: Disabled' },
                { label: 'Reset All', value: 'reset', emoji: '🔄', description: 'Reset to defaults' }
            ]);

        // Channel select for mod log
        const channelMenu = new ChannelSelectMenuBuilder()
            .setCustomId('setting_modlog_channel')
            .setPlaceholder('📋 Set Mod Log Channel...')
            .setChannelTypes(ChannelType.GuildText)
            .setMinValues(0)
            .setMaxValues(1);

        // Channel select for announcement
        const announceChannelMenu = new ChannelSelectMenuBuilder()
            .setCustomId('setting_announce_channel')
            .setPlaceholder('📢 Set Announcement Channel...')
            .setChannelTypes(ChannelType.GuildText)
            .setMinValues(0)
            .setMaxValues(1);

        // Role menus
        const adminRoleMenu = new RoleSelectMenuBuilder()
            .setCustomId('setting_admin_role')
            .setPlaceholder('👑 Add/Remove Admin Role...')
            .setMinValues(0)
            .setMaxValues(5);

        const modRoleMenu = new RoleSelectMenuBuilder()
            .setCustomId('setting_mod_role')
            .setPlaceholder('🛡️ Add/Remove Mod Role...')
            .setMinValues(0)
            .setMaxValues(5);

        const row1 = new ActionRowBuilder().addComponents(settingsMenu);
        const row2 = new ActionRowBuilder().addComponents(channelMenu);
        const row3 = new ActionRowBuilder().addComponents(announceChannelMenu);
        const row4 = new ActionRowBuilder().addComponents(adminRoleMenu);
        const row5 = new ActionRowBuilder().addComponents(modRoleMenu);

        const messageOptions = { 
            embeds: [embed], 
            components: [row1, row2, row3, row4, row5],
            ephemeral: true
        };

        let response;
        if (isUpdate) {
            response = await interaction.update({ ...messageOptions, fetchReply: true });
        } else {
            response = await interaction.reply({ ...messageOptions, fetchReply: true });
        }

        // Collector
        const collector = response.createMessageComponentCollector({
            time: 300000 // 5 minutes
        });

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({ content: '❌ This panel is not for you!', ephemeral: true });
            }

            try {
                if (i.customId === 'setting_menu') {
                    await this._handleSettingMenu(i, i.values[0]);
                } else if (i.customId === 'setting_modlog_channel') {
                    await this._handleModLogChannel(i);
                } else if (i.customId === 'setting_announce_channel') {
                    await this._handleAnnounceChannel(i);
                } else if (i.customId === 'setting_admin_role') {
                    await this._handleAdminRoles(i);
                } else if (i.customId === 'setting_mod_role') {
                    await this._handleModRoles(i);
                }
            } catch (error) {
                if (error.code === 10062) return; // Unknown interaction
                console.error('[Setting] Error:', error);
                if (!i.replied && !i.deferred) {
                    await i.reply({ content: '❌ An error occurred.', ephemeral: true }).catch(() => {});
                }
            }
        });

        collector.on('end', async () => {
            try {
                await interaction.editReply({ components: [] }).catch(() => {});
            } catch {}
        });
    }

    async _handleSettingMenu(interaction, value) {
        const { GuildSettingsService } = require('../../services');

        if (value === 'reset') {
            await GuildSettingsService.resetGuildSettings(interaction.guildId);
            await interaction.update({
                content: '✅ All settings have been reset to defaults!',
                embeds: [],
                components: []
            });
            return;
        }

        if (value === 'toggle_announce') {
            const settings = await GuildSettingsService.getGuildSettings(interaction.guildId);
            const currentEnabled = settings.announcements_enabled !== false;
            await GuildSettingsService.updateGuildSettings(interaction.guildId, { 
                announcements_enabled: !currentEnabled 
            });
            
            await interaction.reply({
                content: !currentEnabled 
                    ? '✅ Announcements have been **enabled**. Set a channel to receive announcements.'
                    : '❌ Announcements have been **disabled**.',
                ephemeral: true
            });
            return;
        }

        // Show modal for numeric inputs
        const modal = new ModalBuilder()
            .setCustomId(`setting_modal_${value}`)
            .setTitle(value === 'snipe' ? 'Set Snipe Limit' : 'Set Delete Limit');

        const input = new TextInputBuilder()
            .setCustomId('value')
            .setLabel(value === 'snipe' ? 'Snipe Limit (1-50)' : 'Delete Limit (1-500)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(3);

        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal);

        // Wait for modal submit
        try {
            const modalSubmit = await interaction.awaitModalSubmit({
                filter: i => i.customId === `setting_modal_${value}`,
                time: 60000
            });

            const newValue = parseInt(modalSubmit.fields.getTextInputValue('value'));
            
            if (isNaN(newValue)) {
                return modalSubmit.reply({ content: '❌ Please enter a valid number!', ephemeral: true });
            }

            if (value === 'snipe') {
                if (newValue < 1 || newValue > 50) {
                    return modalSubmit.reply({ content: '❌ Snipe limit must be 1-50!', ephemeral: true });
                }
                await GuildSettingsService.setSnipeLimit(interaction.guildId, newValue);
            } else {
                if (newValue < 1 || newValue > 500) {
                    return modalSubmit.reply({ content: '❌ Delete limit must be 1-500!', ephemeral: true });
                }
                await GuildSettingsService.setDeleteLimit(interaction.guildId, newValue);
            }

            await modalSubmit.reply({ 
                content: `✅ ${value === 'snipe' ? 'Snipe' : 'Delete'} limit set to **${newValue}**!`, 
                ephemeral: true 
            });
        } catch (e) {
            // Modal timeout - ignore
        }
    }

    async _handleModLogChannel(interaction) {
        const { ModLogService } = require('../../services/moderation');
        const channelId = interaction.values[0] || null;
        
        // Use ModLogService to stay synced with /modlogs command
        await ModLogService.setLogChannel(interaction.guildId, channelId);
        
        await interaction.reply({
            content: channelId 
                ? `✅ Mod log channel set to <#${channelId}>` 
                : '✅ Mod log channel has been disabled',
            ephemeral: true
        });
    }

    async _handleAnnounceChannel(interaction) {
        const { GuildSettingsService } = require('../../services');
        const channelId = interaction.values[0] || null;
        
        await GuildSettingsService.updateGuildSettings(interaction.guildId, { 
            announcement_channel: channelId 
        });
        
        await interaction.reply({
            content: channelId 
                ? `✅ Announcement channel set to <#${channelId}>` 
                : '✅ Announcement channel has been cleared',
            ephemeral: true
        });
    }

    async _handleAdminRoles(interaction) {
        const { GuildSettingsService } = require('../../services');
        const newRoles = interaction.values;
        
        await GuildSettingsService.setAdminRoles(interaction.guildId, newRoles);
        
        await interaction.reply({
            content: newRoles.length 
                ? `✅ Admin roles updated: ${newRoles.map(r => `<@&${r}>`).join(', ')}` 
                : '✅ Admin roles cleared',
            ephemeral: true
        });
    }

    async _handleModRoles(interaction) {
        const { GuildSettingsService } = require('../../services');
        const newRoles = interaction.values;
        
        await GuildSettingsService.setModRoles(interaction.guildId, newRoles);
        
        await interaction.reply({
            content: newRoles.length 
                ? `✅ Mod roles updated: ${newRoles.map(r => `<@&${r}>`).join(', ')}` 
                : '✅ Mod roles cleared',
            ephemeral: true
        });
    }
}

module.exports = new SettingCommand();



