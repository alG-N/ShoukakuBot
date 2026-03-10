/**
 * AutoMod Command — Panel Builders
 * Functions that build embed + component payloads for each automod settings panel.
 * Extracted from automod.ts (~1092 lines) for modularity.
 * @module handlers/moderation/AutoModPanels
 */

import {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ChannelSelectMenuBuilder,
    RoleSelectMenuBuilder,
    ChatInputCommandInteraction
} from 'discord.js';
import type { AutoModSettings } from '../../../types/moderation/automod.js';
import type { AutoModService } from '../../../types/moderation/handlers.js';
import type { ModerationConfig } from '../../../config/features/moderation/index.js';

/**
 * Build and display the main automod panel
 */
export async function showMainPanel(
    interaction: ChatInputCommandInteraction,
    service: AutoModService,
    config: ModerationConfig
): Promise<void> {
    if (!service) return;

    const settings = await service.getSettings(interaction.guildId!);

    const activeFeatures = [
        settings.spam_enabled,
        settings.duplicate_enabled,
        settings.links_enabled,
        settings.invites_enabled,
        settings.mention_enabled,
        settings.caps_enabled,
        settings.filter_enabled
    ].filter(Boolean).length;

    const embed = new EmbedBuilder()
        .setColor(settings.enabled ? (config?.COLORS?.SUCCESS || 0x00FF00) : (config?.COLORS?.ERROR || 0xFF0000))
        .setTitle('🤖 AutoMod Settings')
        .setDescription([
            `**Status:** ${settings.enabled ? '✅ Enabled' : '❌ Disabled'}`,
            `**Active Features:** ${activeFeatures}/7`,
            '',
            'Use the buttons below to navigate to different sections.',
            '',
            '**📊 Toggle** - Enable/disable automod and features',
            '**🚫 Filter** - Manage banned words',
            '**⚙️ Config** - Thresholds configuration',
            '**⚡ Actions** - Punishment actions & escalation',
            '**🛡️ Exempt** - Ignored channels/roles/links'
        ].join('\n'))
        .setFooter({ text: 'Select a section to configure' })
        .setTimestamp();

    const automodDisabled = !settings.enabled;
    const filterDisabled = automodDisabled || !settings.filter_enabled;

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId('automod_toggle_section')
            .setLabel('Toggle')
            .setEmoji('📊')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('automod_filter_section')
            .setLabel('Filter')
            .setEmoji('🚫')
            .setStyle(filterDisabled ? ButtonStyle.Secondary : ButtonStyle.Primary)
            .setDisabled(filterDisabled),
        new ButtonBuilder()
            .setCustomId('automod_config_section')
            .setLabel('Config')
            .setEmoji('⚙️')
            .setStyle(automodDisabled ? ButtonStyle.Secondary : ButtonStyle.Primary)
            .setDisabled(automodDisabled),
        new ButtonBuilder()
            .setCustomId('automod_actions_section')
            .setLabel('Actions')
            .setEmoji('⚡')
            .setStyle(automodDisabled ? ButtonStyle.Secondary : ButtonStyle.Primary)
            .setDisabled(automodDisabled),
        new ButtonBuilder()
            .setCustomId('automod_exempt_section')
            .setLabel('Exempt')
            .setEmoji('🛡️')
            .setStyle(automodDisabled ? ButtonStyle.Secondary : ButtonStyle.Primary)
            .setDisabled(automodDisabled)
    );

    await interaction.editReply({
        embeds: [embed],
        components: [row]
    });
}

/**
 * Build and display the toggle section panel
 */
export async function showToggleSection(
    interaction: ChatInputCommandInteraction,
    service: AutoModService,
    config: ModerationConfig
): Promise<void> {
    if (!service) return;

    const settings = await service.getSettings(interaction.guildId!);

    const features = [
        { key: 'spam', name: 'Anti-Spam', emoji: '📨', desc: 'Detect message spam' },
        { key: 'duplicate', name: 'Anti-Duplicate', emoji: '📋', desc: 'Detect repeated messages' },
        { key: 'links', name: 'Link Filter', emoji: '🔗', desc: 'Block unauthorized links' },
        { key: 'invites', name: 'Invite Filter', emoji: '📩', desc: 'Block Discord invites' },
        { key: 'mention', name: 'Mass Mention', emoji: '📢', desc: 'Limit mentions' },
        { key: 'caps', name: 'Caps Filter', emoji: '🔠', desc: 'Limit excessive caps' },
        { key: 'filter', name: 'Word Filter', emoji: '🚫', desc: 'Filter banned words' }
    ];

    const featureStatus = features.map(f => {
        const enabled = settings[`${f.key}_enabled` as keyof AutoModSettings];
        return `${f.emoji} **${f.name}**: ${enabled ? '✅' : '❌'}`;
    }).join('\n');

    const embed = new EmbedBuilder()
        .setColor(settings.enabled ? (config?.COLORS?.SUCCESS || 0x00FF00) : (config?.COLORS?.ERROR || 0xFF0000))
        .setTitle('📊 AutoMod Toggle')
        .setDescription([
            `**Master Switch:** ${settings.enabled ? '✅ Enabled' : '❌ Disabled'}`,
            '',
            '**Feature Status:**',
            featureStatus,
            '',
            settings.enabled
                ? '⬇️ Select features to toggle below'
                : '⚠️ Enable AutoMod first to configure features'
        ].join('\n'))
        .setTimestamp();

    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId('automod_master_toggle')
            .setLabel(settings.enabled ? 'Disable AutoMod' : 'Enable AutoMod')
            .setEmoji(settings.enabled ? '❌' : '✅')
            .setStyle(settings.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('automod_back')
            .setLabel('Back')
            .setEmoji('◀️')
            .setStyle(ButtonStyle.Secondary)
    );

    const featureOptions = features.map(f => ({
        label: f.name,
        value: f.key,
        emoji: f.emoji,
        description: `${settings[`${f.key}_enabled` as keyof AutoModSettings] ? '✅ Enabled' : '❌ Disabled'} - ${f.desc}`
    }));

    const featureSelect = new StringSelectMenuBuilder()
        .setCustomId('automod_feature_toggle')
        .setPlaceholder(settings.enabled ? '🔄 Toggle a feature...' : '⚠️ Enable AutoMod first')
        .setDisabled(!settings.enabled)
        .addOptions(featureOptions);

    const row2 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(featureSelect);

    await interaction.editReply({ embeds: [embed], components: [row1, row2] });
}

/**
 * Build and display the filter section panel
 */
export async function showFilterSection(
    interaction: ChatInputCommandInteraction,
    service: AutoModService,
    config: ModerationConfig
): Promise<void> {
    if (!service) return;

    const settings = await service.getSettings(interaction.guildId!);
    const filteredWords = settings.filtered_words || [];

    const wordList = filteredWords.length > 0
        ? `||${filteredWords.slice(0, 30).join(', ')}${filteredWords.length > 30 ? '...' : ''}||`
        : '*No words in filter*';

    const embed = new EmbedBuilder()
        .setColor(config?.COLORS?.INFO || 0x0099FF)
        .setTitle('🚫 Word Filter')
        .setDescription([
            `**Filter Status:** ${settings.filter_enabled ? '✅ Enabled' : '❌ Disabled'}`,
            `**Total Words:** ${filteredWords.length}`,
            '',
            '**Filtered Words:**',
            wordList,
            '',
            '⬇️ Select an action below'
        ].join('\n'))
        .setTimestamp();

    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId('automod_filter_toggle')
            .setLabel(settings.filter_enabled ? 'Disable Filter' : 'Enable Filter')
            .setEmoji(settings.filter_enabled ? '❌' : '✅')
            .setStyle(settings.filter_enabled ? ButtonStyle.Danger : ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('automod_back')
            .setLabel('Back')
            .setEmoji('◀️')
            .setStyle(ButtonStyle.Secondary)
    );

    const actionSelect = new StringSelectMenuBuilder()
        .setCustomId('automod_filter_action')
        .setPlaceholder('📝 Select action...')
        .addOptions([
            { label: 'Add Words', value: 'add', emoji: '➕', description: 'Add words to filter' },
            { label: 'Remove Words', value: 'remove', emoji: '➖', description: 'Remove words from filter' },
            { label: 'Clear All', value: 'clear', emoji: '🗑️', description: 'Remove all words' },
            { label: 'Import: Profanity', value: 'import_profanity', emoji: '📥', description: 'Import profanity preset' },
            { label: 'Import: Slurs', value: 'import_slurs', emoji: '📥', description: 'Import slurs preset' },
            { label: 'Import: NSFW', value: 'import_nsfw', emoji: '📥', description: 'Import NSFW preset' }
        ]);

    const row2 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(actionSelect);

    await interaction.editReply({ embeds: [embed], components: [row1, row2] });
}

/**
 * Build and display the config section panel
 */
export async function showConfigSection(
    interaction: ChatInputCommandInteraction,
    service: AutoModService,
    config: ModerationConfig
): Promise<void> {
    if (!service) return;

    const settings = await service.getSettings(interaction.guildId!);

    const embed = new EmbedBuilder()
        .setColor(config?.COLORS?.INFO || 0x0099FF)
        .setTitle('⚙️ AutoMod Thresholds')
        .setDescription([
            '**Current Thresholds:**',
            `📨 Spam: \`${settings.spam_threshold || 5}\` msgs / \`${settings.spam_interval || 5}\`s`,
            `📋 Duplicates: \`${settings.duplicate_threshold || 3}\` msgs`,
            `📢 Mentions: \`${settings.mention_limit || 5}\` max`,
            `🔠 Caps: \`${settings.caps_percentage || 70}\`%`,
            `🔇 Mute Duration: \`${settings.mute_duration || 10}\` minutes`,
            `👶 New Account Age: \`${settings.new_account_age_hours || 24}\` hours`,
            '',
            '⬇️ Select a threshold to configure'
        ].join('\n'))
        .setTimestamp();

    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId('automod_back')
            .setLabel('Back')
            .setEmoji('◀️')
            .setStyle(ButtonStyle.Secondary)
    );

    const configSelect = new StringSelectMenuBuilder()
        .setCustomId('automod_config_select')
        .setPlaceholder('📊 Configure threshold...')
        .addOptions([
            { label: 'Spam Threshold', value: 'spam_threshold', emoji: '📨', description: `Current: ${settings.spam_threshold || 5} messages` },
            { label: 'Spam Interval', value: 'spam_interval', emoji: '⏱️', description: `Current: ${settings.spam_interval || 5} seconds` },
            { label: 'Duplicate Threshold', value: 'duplicate_threshold', emoji: '📋', description: `Current: ${settings.duplicate_threshold || 3} messages` },
            { label: 'Mention Limit', value: 'mention_limit', emoji: '📢', description: `Current: ${settings.mention_limit || 5} mentions` },
            { label: 'Caps Percentage', value: 'caps_percentage', emoji: '🔠', description: `Current: ${settings.caps_percentage || 70}%` },
            { label: 'Mute Duration', value: 'mute_duration', emoji: '🔇', description: `Current: ${settings.mute_duration || 10} minutes` },
            { label: 'New Account Age', value: 'new_account_age_hours', emoji: '👶', description: `Current: ${settings.new_account_age_hours || 24} hours` }
        ]);

    const row2 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(configSelect);

    await interaction.editReply({ embeds: [embed], components: [row1, row2] });
}

/**
 * Build and display the actions section panel
 */
export async function showActionsSection(
    interaction: ChatInputCommandInteraction,
    service: AutoModService,
    config: ModerationConfig
): Promise<void> {
    if (!service) return;

    const settings = await service.getSettings(interaction.guildId!);

    const actionEmoji = (action?: string): string => {
        if (action?.includes('mute')) return '🔇';
        if (action?.includes('warn')) return '⚠️';
        if (action?.includes('kick')) return '👢';
        return '🗑️';
    };

    const warnThreshold = settings.warn_threshold || 3;
    const warnResetHours = settings.warn_reset_hours || 1;
    const warnAction = settings.warn_action || 'mute';
    const muteDuration = settings.mute_duration || 10;

    const embed = new EmbedBuilder()
        .setColor(config?.COLORS?.INFO || 0x0099FF)
        .setTitle('⚡ AutoMod Actions & Escalation')
        .setDescription([
            '**Feature Actions** (what happens when rule triggered):',
            `📨 Spam: ${actionEmoji(settings.spam_action)} \`${settings.spam_action || 'delete_warn'}\``,
            `📋 Duplicate: ${actionEmoji(settings.duplicate_action)} \`${settings.duplicate_action || 'delete_warn'}\``,
            `🔗 Links: ${actionEmoji(settings.links_action)} \`${settings.links_action || 'delete_warn'}\``,
            `📩 Invites: ${actionEmoji(settings.invites_action)} \`${settings.invites_action || 'delete_warn'}\``,
            `📢 Mentions: ${actionEmoji(settings.mention_action)} \`${settings.mention_action || 'delete_warn'}\``,
            `🔠 Caps: ${actionEmoji(settings.caps_action)} \`${settings.caps_action || 'delete'}\``,
            `👶 New Account: ${actionEmoji(settings.new_account_action)} \`${settings.new_account_action || 'kick'}\``,
            '',
            '─────────────────────────',
            '**⚠️ Warn Escalation** (when action includes "warn"):',
            `• Status: ${settings.auto_warn ? '✅ Enabled' : '❌ Disabled'}`,
            `• Threshold: \`${warnThreshold}\` warnings → ${actionEmoji(warnAction)} \`${warnAction}\``,
            `• Reset: Warnings reset after \`${warnResetHours}\` hour(s)`,
            `• Mute Duration: \`${muteDuration}\` minutes`,
            '',
            `*Flow: Violation → Warn counted → After ${warnThreshold} warns → ${warnAction.toUpperCase()}*`
        ].join('\n'))
        .setTimestamp();

    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId('automod_warn_toggle')
            .setLabel(settings.auto_warn ? 'Disable Escalation' : 'Enable Escalation')
            .setEmoji(settings.auto_warn ? '❌' : '✅')
            .setStyle(settings.auto_warn ? ButtonStyle.Danger : ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('automod_escalation_config')
            .setLabel('Configure Escalation')
            .setEmoji('⚙️')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(!settings.auto_warn),
        new ButtonBuilder()
            .setCustomId('automod_back')
            .setLabel('Back')
            .setEmoji('◀️')
            .setStyle(ButtonStyle.Secondary)
    );

    const actionSelect = new StringSelectMenuBuilder()
        .setCustomId('automod_action_select')
        .setPlaceholder('⚡ Select feature to change action...')
        .addOptions([
            { label: 'Spam Action', value: 'spam_action', emoji: '📨', description: `Current: ${settings.spam_action || 'delete_warn'}` },
            { label: 'Duplicate Action', value: 'duplicate_action', emoji: '📋', description: `Current: ${settings.duplicate_action || 'delete_warn'}` },
            { label: 'Links Action', value: 'links_action', emoji: '🔗', description: `Current: ${settings.links_action || 'delete_warn'}` },
            { label: 'Invites Action', value: 'invites_action', emoji: '📩', description: `Current: ${settings.invites_action || 'delete_warn'}` },
            { label: 'Mentions Action', value: 'mention_action', emoji: '📢', description: `Current: ${settings.mention_action || 'delete_warn'}` },
            { label: 'Caps Action', value: 'caps_action', emoji: '🔠', description: `Current: ${settings.caps_action || 'delete'}` },
            { label: 'New Account Action', value: 'new_account_action', emoji: '👶', description: `Current: ${settings.new_account_action || 'kick'}` }
        ]);

    const row2 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(actionSelect);

    await interaction.editReply({ embeds: [embed], components: [row1, row2] });
}

/**
 * Build and display the escalation config panel
 */
export async function showEscalationConfig(
    interaction: ChatInputCommandInteraction,
    service: AutoModService,
    config: ModerationConfig
): Promise<void> {
    if (!service) return;

    const settings = await service.getSettings(interaction.guildId!);

    const embed = new EmbedBuilder()
        .setColor(config?.COLORS?.INFO || 0x0099FF)
        .setTitle('⚠️ Configure Warn Escalation')
        .setDescription([
            '**Current Settings:**',
            `• Warn Threshold: \`${settings.warn_threshold || 3}\` violations`,
            `• Escalation Action: \`${settings.warn_action || 'mute'}\``,
            `• Warn Reset Time: \`${settings.warn_reset_hours || 1}\` hour(s)`,
            `• Mute Duration: \`${settings.mute_duration || 10}\` minutes`,
            '',
            '**How it works:**',
            '1. User violates a rule with "warn" action',
            '2. Warning counter increases',
            '3. After threshold reached → escalation action triggers',
            '4. Counter resets after reset time OR after punishment',
            '',
            '⬇️ Select what to configure'
        ].join('\n'))
        .setTimestamp();

    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId('automod_actions_section')
            .setLabel('Back')
            .setEmoji('◀️')
            .setStyle(ButtonStyle.Secondary)
    );

    const configSelect = new StringSelectMenuBuilder()
        .setCustomId('automod_escalation_select')
        .setPlaceholder('⚙️ Configure escalation...')
        .addOptions([
            { label: 'Warn Threshold', value: 'warn_threshold', emoji: '🔢', description: `Current: ${settings.warn_threshold || 3} violations` },
            { label: 'Escalation Action', value: 'warn_action', emoji: '⚡', description: `Current: ${settings.warn_action || 'mute'}` },
            { label: 'Warn Reset Time', value: 'warn_reset_hours', emoji: '⏰', description: `Current: ${settings.warn_reset_hours || 1} hour(s)` },
            { label: 'Mute Duration', value: 'mute_duration', emoji: '🔇', description: `Current: ${settings.mute_duration || 10} minutes` }
        ]);

    const row2 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(configSelect);

    await interaction.editReply({ embeds: [embed], components: [row1, row2] });
}

/**
 * Build and display the exemptions section panel
 */
export async function showExemptSection(
    interaction: ChatInputCommandInteraction,
    service: AutoModService,
    config: ModerationConfig
): Promise<void> {
    if (!service) return;

    const settings = await service.getSettings(interaction.guildId!);
    const ignoredChannels = settings.ignored_channels || [];
    const ignoredRoles = settings.ignored_roles || [];
    const linksWhitelist = settings.links_whitelist || [];

    const embed = new EmbedBuilder()
        .setColor(config?.COLORS?.INFO || 0x0099FF)
        .setTitle('🛡️ AutoMod Exemptions')
        .setDescription([
            '**Ignored Channels:**',
            ignoredChannels.length > 0 ? ignoredChannels.map((c: string) => `<#${c}>`).join(', ') : '*None - all channels monitored*',
            '',
            '**Ignored Roles:**',
            ignoredRoles.length > 0 ? ignoredRoles.map((r: string) => `<@&${r}>`).join(', ') : '*None - all roles monitored*',
            '',
            '**Whitelisted Links:**',
            linksWhitelist.length > 0 ? `\`${linksWhitelist.join('\`, \`')}\`` : '*None - all links blocked*',
            '',
            '⬇️ Use the menus below to manage exemptions'
        ].join('\n'))
        .setTimestamp();

    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId('automod_whitelist_links')
            .setLabel('Edit Link Whitelist')
            .setEmoji('🔗')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('automod_back')
            .setLabel('Back')
            .setEmoji('◀️')
            .setStyle(ButtonStyle.Secondary)
    );

    const ignoreChannelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('automod_ignore_channel')
        .setPlaceholder('📁 Toggle ignored channel...')
        .setMinValues(0)
        .setMaxValues(1);

    const row2 = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(ignoreChannelSelect);

    const ignoreRoleSelect = new RoleSelectMenuBuilder()
        .setCustomId('automod_ignore_role')
        .setPlaceholder('👥 Toggle ignored role...')
        .setMinValues(0)
        .setMaxValues(1);

    const row3 = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(ignoreRoleSelect);

    await interaction.editReply({ embeds: [embed], components: [row1, row2, row3] });
}
