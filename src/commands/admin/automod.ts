/**
 * AutoMod Command - Interactive Panel with Sections
 * Fixed: Use deferUpdate() + editReply() pattern to prevent timeout
 * @module commands/admin/automod
 */

import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ChannelSelectMenuBuilder,
    RoleSelectMenuBuilder,
    PermissionFlagsBits,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChatInputCommandInteraction,
    ButtonInteraction,
    StringSelectMenuInteraction,
    ChannelSelectMenuInteraction,
    RoleSelectMenuInteraction,
    Message,
    InteractionCollector,
    MessageComponentInteraction
} from 'discord.js';
import { BaseCommand, CommandCategory, type CommandData } from '../BaseCommand.js';

import { getDefault } from '../../utils/common/moduleHelper.js';
interface AutoModSettings {
    enabled: boolean;
    spam_enabled?: boolean;
    duplicate_enabled?: boolean;
    links_enabled?: boolean;
    invites_enabled?: boolean;
    mention_enabled?: boolean;
    caps_enabled?: boolean;
    filter_enabled?: boolean;
    filtered_words?: string[];
    spam_threshold?: number;
    spam_interval?: number;
    duplicate_threshold?: number;
    mention_limit?: number;
    caps_percentage?: number;
    mute_duration?: number;
    new_account_age_hours?: number;
    spam_action?: string;
    duplicate_action?: string;
    links_action?: string;
    invites_action?: string;
    mention_action?: string;
    caps_action?: string;
    new_account_action?: string;
    auto_warn?: boolean;
    warn_threshold?: number;
    warn_reset_hours?: number;
    warn_action?: string;
    ignored_channels?: string[];
    ignored_roles?: string[];
    links_whitelist?: string[];
    [key: string]: unknown;
}

interface AutoModService {
    getSettings: (guildId: string) => Promise<AutoModSettings>;
    updateSettings: (guildId: string, settings: Partial<AutoModSettings>) => Promise<void>;
}

interface ModerationConfig {
    COLORS: Record<string, number>;
}


let AutoModServiceInstance: AutoModService | undefined;
let moderationConfig: ModerationConfig | undefined;
let logger: { info: (category: string, message: string) => void } | undefined;

try {
    const modServices = require('../../services/moderation');
    AutoModServiceInstance = modServices.autoModService;
    moderationConfig = getDefault(require('../../config/features/moderation'));
    logger = getDefault(require('../../core/Logger'));
} catch (e) {
    console.error('[AutoMod] Service load error:', (e as Error).message);
}

class AutoModCommand extends BaseCommand {
    private _pendingActionSelect: Map<string, string> = new Map();

    constructor() {
        super({
            category: CommandCategory.ADMIN,
            cooldown: 3,
            deferReply: true,
            userPermissions: [PermissionFlagsBits.ManageGuild]
        });
    }

    get data(): CommandData {
        return new SlashCommandBuilder()
            .setName('automod')
            .setDescription('Configure server auto-moderation')
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
            .addSubcommand(sub => sub
                .setName('settings')
                .setDescription('Open interactive auto-moderation settings panel')
            );
    }

    async run(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!AutoModServiceInstance) {
            await interaction.editReply({ content: '❌ AutoMod service unavailable.' });
            return;
        }

        const settings = await AutoModServiceInstance.getSettings(interaction.guildId!);
        
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
            .setColor(settings.enabled ? (moderationConfig?.COLORS?.SUCCESS || 0x00FF00) : (moderationConfig?.COLORS?.ERROR || 0xFF0000))
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

        const response = await interaction.editReply({ 
            embeds: [embed], 
            components: [row]
        }) as Message;

        this._setupCollector(response, interaction);
    }
    // MAIN PANEL
    private async _showMainPanel(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!AutoModServiceInstance) return;
        
        const settings = await AutoModServiceInstance.getSettings(interaction.guildId!);
        
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
            .setColor(settings.enabled ? (moderationConfig?.COLORS?.SUCCESS || 0x00FF00) : (moderationConfig?.COLORS?.ERROR || 0xFF0000))
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
    // TOGGLE SECTION
    private async _showToggleSection(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!AutoModServiceInstance) return;
        
        const settings = await AutoModServiceInstance.getSettings(interaction.guildId!);

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
            .setColor(settings.enabled ? (moderationConfig?.COLORS?.SUCCESS || 0x00FF00) : (moderationConfig?.COLORS?.ERROR || 0xFF0000))
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
    // FILTER SECTION
    private async _showFilterSection(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!AutoModServiceInstance) return;
        
        const settings = await AutoModServiceInstance.getSettings(interaction.guildId!);
        const filteredWords = settings.filtered_words || [];

        const wordList = filteredWords.length > 0
            ? `||${filteredWords.slice(0, 30).join(', ')}${filteredWords.length > 30 ? '...' : ''}||`
            : '*No words in filter*';

        const embed = new EmbedBuilder()
            .setColor(moderationConfig?.COLORS?.INFO || 0x0099FF)
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
    // CONFIG SECTION
    private async _showConfigSection(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!AutoModServiceInstance) return;
        
        const settings = await AutoModServiceInstance.getSettings(interaction.guildId!);

        const embed = new EmbedBuilder()
            .setColor(moderationConfig?.COLORS?.INFO || 0x0099FF)
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
    // ACTIONS SECTION
    private async _showActionsSection(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!AutoModServiceInstance) return;
        
        const settings = await AutoModServiceInstance.getSettings(interaction.guildId!);

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
            .setColor(moderationConfig?.COLORS?.INFO || 0x0099FF)
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
    // ESCALATION CONFIG SECTION
    private async _showEscalationConfig(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!AutoModServiceInstance) return;
        
        const settings = await AutoModServiceInstance.getSettings(interaction.guildId!);

        const embed = new EmbedBuilder()
            .setColor(moderationConfig?.COLORS?.INFO || 0x0099FF)
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
    // EXEMPTIONS SECTION
    private async _showExemptSection(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!AutoModServiceInstance) return;
        
        const settings = await AutoModServiceInstance.getSettings(interaction.guildId!);
        const ignoredChannels = settings.ignored_channels || [];
        const ignoredRoles = settings.ignored_roles || [];
        const linksWhitelist = settings.links_whitelist || [];

        const embed = new EmbedBuilder()
            .setColor(moderationConfig?.COLORS?.INFO || 0x0099FF)
            .setTitle('🛡️ AutoMod Exemptions')
            .setDescription([
                '**Ignored Channels:**',
                ignoredChannels.length > 0 ? ignoredChannels.map(c => `<#${c}>`).join(', ') : '*None - all channels monitored*',
                '',
                '**Ignored Roles:**',
                ignoredRoles.length > 0 ? ignoredRoles.map(r => `<@&${r}>`).join(', ') : '*None - all roles monitored*',
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
    // COLLECTOR
    private _setupCollector(response: Message, originalInteraction: ChatInputCommandInteraction): void {
        const collector = response.createMessageComponentCollector({
            time: 300000 // 5 minutes
        });

        collector.on('collect', async (i: MessageComponentInteraction) => {
            if (i.user.id !== originalInteraction.user.id) {
                await i.reply({ content: '❌ This panel is not for you!', ephemeral: true }).catch(() => {});
                return;
            }

            try {
                await this._handleInteraction(i, originalInteraction);
            } catch (error: unknown) {
                const err = error as { code?: number };
                if (err.code === 10062) return;
                console.error('[AutoMod] Interaction error:', error);
            }
        });

        collector.on('end', async () => {
            try {
                await originalInteraction.editReply({ components: [] });
            } catch {}
        });
    }

    private async _handleInteraction(i: MessageComponentInteraction, originalInteraction: ChatInputCommandInteraction): Promise<void> {
        const customId = i.customId;
        const guildId = originalInteraction.guildId!;

        // Check if this needs a modal
        const needsModal = 
            (customId === 'automod_filter_action' && ['add', 'remove'].includes((i as StringSelectMenuInteraction).values?.[0])) ||
            customId === 'automod_config_select' ||
            customId === 'automod_whitelist_links' ||
            (customId === 'automod_escalation_select' && !['warn_action'].includes((i as StringSelectMenuInteraction).values?.[0]));

        if (needsModal) {
            if (customId === 'automod_filter_action') {
                return this._handleFilterAction(i as StringSelectMenuInteraction, originalInteraction, (i as StringSelectMenuInteraction).values[0]);
            }
            if (customId === 'automod_config_select') {
                return this._handleConfigSelect(i as StringSelectMenuInteraction, originalInteraction, (i as StringSelectMenuInteraction).values[0]);
            }
            if (customId === 'automod_escalation_select') {
                return this._handleEscalationSelect(i as StringSelectMenuInteraction, originalInteraction, (i as StringSelectMenuInteraction).values[0]);
            }
            if (customId === 'automod_whitelist_links') {
                return this._handleWhitelistLinks(i as ButtonInteraction, originalInteraction);
            }
        }

        // Defer all other interactions
        try {
            await i.deferUpdate();
        } catch (error: unknown) {
            const err = error as { code?: number };
            if (err.code === 10062) return;
            throw error;
        }

        // Navigation
        if (customId === 'automod_back') {
            return this._showMainPanel(originalInteraction);
        }
        if (customId === 'automod_toggle_section') {
            return this._showToggleSection(originalInteraction);
        }
        if (customId === 'automod_filter_section') {
            return this._showFilterSection(originalInteraction);
        }
        if (customId === 'automod_config_section') {
            return this._showConfigSection(originalInteraction);
        }
        if (customId === 'automod_actions_section') {
            return this._showActionsSection(originalInteraction);
        }
        if (customId === 'automod_exempt_section') {
            return this._showExemptSection(originalInteraction);
        }

        // Toggle Section Actions
        if (customId === 'automod_master_toggle') {
            const settings = await AutoModServiceInstance!.getSettings(guildId);
            await AutoModServiceInstance!.updateSettings(guildId, { enabled: !settings.enabled });
            logger?.info('AutoMod', `${i.user.tag} ${settings.enabled ? 'disabled' : 'enabled'} automod in ${originalInteraction.guild!.name}`);
            return this._showToggleSection(originalInteraction);
        }

        if (customId === 'automod_feature_toggle') {
            const feature = (i as StringSelectMenuInteraction).values[0];
            const settings = await AutoModServiceInstance!.getSettings(guildId);
            const fieldName = `${feature}_enabled`;
            await AutoModServiceInstance!.updateSettings(guildId, { [fieldName]: !settings[fieldName as keyof AutoModSettings] });
            logger?.info('AutoMod', `${i.user.tag} toggled ${feature} in ${originalInteraction.guild!.name}`);
            return this._showToggleSection(originalInteraction);
        }

        // Filter Section Actions
        if (customId === 'automod_filter_toggle') {
            const settings = await AutoModServiceInstance!.getSettings(guildId);
            await AutoModServiceInstance!.updateSettings(guildId, { filter_enabled: !settings.filter_enabled });
            return this._showFilterSection(originalInteraction);
        }

        if (customId === 'automod_filter_action') {
            return this._handleFilterActionDeferred(originalInteraction, (i as StringSelectMenuInteraction).values[0]);
        }

        // Actions Section
        if (customId === 'automod_warn_toggle') {
            const settings = await AutoModServiceInstance!.getSettings(guildId);
            await AutoModServiceInstance!.updateSettings(guildId, { auto_warn: !settings.auto_warn });
            return this._showActionsSection(originalInteraction);
        }

        if (customId === 'automod_escalation_config') {
            return this._showEscalationConfig(originalInteraction);
        }

        if (customId === 'automod_escalation_select') {
            if ((i as StringSelectMenuInteraction).values[0] === 'warn_action') {
                return this._handleEscalationActionSelect(i as StringSelectMenuInteraction, originalInteraction);
            }
        }

        if (customId === 'automod_escalation_action_value') {
            return this._handleEscalationActionValue(i as StringSelectMenuInteraction, originalInteraction);
        }

        if (customId === 'automod_ignore_channel') {
            return this._handleIgnoreChannel(i as ChannelSelectMenuInteraction, originalInteraction);
        }

        if (customId === 'automod_ignore_role') {
            return this._handleIgnoreRole(i as RoleSelectMenuInteraction, originalInteraction);
        }

        if (customId === 'automod_action_select') {
            return this._handleActionSelect(i as StringSelectMenuInteraction, originalInteraction, (i as StringSelectMenuInteraction).values[0]);
        }

        if (customId === 'automod_action_value') {
            return this._handleActionValue(i as StringSelectMenuInteraction, originalInteraction);
        }
    }
    // FILTER ACTIONS
    private async _handleFilterAction(i: StringSelectMenuInteraction, originalInteraction: ChatInputCommandInteraction, action: string): Promise<void> {
        const guildId = originalInteraction.guildId!;

        if (action === 'clear' || action.startsWith('import_')) {
            await i.deferUpdate();
            return this._handleFilterActionDeferred(originalInteraction, action);
        }

        if (action === 'add' || action === 'remove') {
            const modal = new ModalBuilder()
                .setCustomId(`filter_${action}_modal_${Date.now()}`)
                .setTitle(action === 'add' ? 'Add Words to Filter' : 'Remove Words from Filter');

            const input = new TextInputBuilder()
                .setCustomId('words')
                .setLabel('Words (comma-separated)')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('word1, word2, word3')
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
            await i.showModal(modal);

            try {
                const modalSubmit = await i.awaitModalSubmit({
                    filter: mi => mi.customId.startsWith(`filter_${action}_modal_`) && mi.user.id === i.user.id,
                    time: 60000
                });

                await modalSubmit.deferUpdate();

                const wordsInput = modalSubmit.fields.getTextInputValue('words');
                const words = wordsInput.toLowerCase().split(',').map(w => w.trim()).filter(w => w);

                const settings = await AutoModServiceInstance!.getSettings(guildId);
                let currentWords = settings.filtered_words || [];

                if (action === 'add') {
                    const newWords = words.filter(w => !currentWords.includes(w));
                    currentWords = [...currentWords, ...newWords];
                } else {
                    currentWords = currentWords.filter(w => !words.includes(w));
                }

                await AutoModServiceInstance!.updateSettings(guildId, { filtered_words: currentWords });
                return this._showFilterSection(originalInteraction);
            } catch {
                return this._showFilterSection(originalInteraction);
            }
        }
    }

    private async _handleFilterActionDeferred(originalInteraction: ChatInputCommandInteraction, action: string): Promise<void> {
        const guildId = originalInteraction.guildId!;
        const settings = await AutoModServiceInstance!.getSettings(guildId);
        let filteredWords = settings.filtered_words || [];

        if (action === 'clear') {
            await AutoModServiceInstance!.updateSettings(guildId, { filtered_words: [] });
            return this._showFilterSection(originalInteraction);
        }

        if (action.startsWith('import_')) {
            const presetName = action.replace('import_', '');
            const presets: Record<string, string[]> = {
                profanity: ['fuck', 'shit', 'bitch', 'ass', 'damn', 'crap', 'bastard', 'dick', 'cunt'],
                slurs: ['nigger', 'faggot', 'retard', 'tranny', 'chink', 'spic'],
                nsfw: ['porn', 'hentai', 'sex', 'nude', 'xxx', 'nsfw', 'lewd']
            };

            const presetWords = presets[presetName] || [];
            const newWords = presetWords.filter(w => !filteredWords.includes(w));
            filteredWords = [...filteredWords, ...newWords];

            await AutoModServiceInstance!.updateSettings(guildId, { filtered_words: filteredWords });
            return this._showFilterSection(originalInteraction);
        }
    }
    // CONFIG ACTIONS
    private async _handleConfigSelect(i: StringSelectMenuInteraction, originalInteraction: ChatInputCommandInteraction, setting: string): Promise<void> {
        const settingNames: Record<string, string> = {
            spam_threshold: 'Spam Threshold (messages)',
            spam_interval: 'Spam Interval (seconds)',
            duplicate_threshold: 'Duplicate Threshold (messages)',
            mention_limit: 'Mention Limit',
            caps_percentage: 'Caps Percentage (%)',
            mute_duration: 'Mute Duration (minutes)',
            new_account_age_hours: 'New Account Age (hours)'
        };

        const modal = new ModalBuilder()
            .setCustomId(`config_${setting}_modal_${Date.now()}`)
            .setTitle(settingNames[setting] || setting);

        const input = new TextInputBuilder()
            .setCustomId('value')
            .setLabel('New Value')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(4);

        modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
        await i.showModal(modal);

        try {
            const modalSubmit = await i.awaitModalSubmit({
                filter: mi => mi.customId.startsWith(`config_${setting}_modal_`) && mi.user.id === i.user.id,
                time: 60000
            });

            await modalSubmit.deferUpdate();

            const value = parseInt(modalSubmit.fields.getTextInputValue('value'));
            
            if (!isNaN(value) && value >= 1) {
                await AutoModServiceInstance!.updateSettings(originalInteraction.guildId!, { [setting]: value });
            }

            return this._showConfigSection(originalInteraction);
        } catch {
            return this._showConfigSection(originalInteraction);
        }
    }

    private async _handleIgnoreChannel(i: ChannelSelectMenuInteraction, originalInteraction: ChatInputCommandInteraction): Promise<void> {
        const channelId = i.values[0];
        
        if (!channelId) {
            return this._showExemptSection(originalInteraction);
        }

        const settings = await AutoModServiceInstance!.getSettings(originalInteraction.guildId!);
        let ignoredChannels = settings.ignored_channels || [];

        if (ignoredChannels.includes(channelId)) {
            ignoredChannels = ignoredChannels.filter(id => id !== channelId);
        } else {
            ignoredChannels.push(channelId);
        }

        await AutoModServiceInstance!.updateSettings(originalInteraction.guildId!, { ignored_channels: ignoredChannels });
        return this._showExemptSection(originalInteraction);
    }

    private async _handleIgnoreRole(i: RoleSelectMenuInteraction, originalInteraction: ChatInputCommandInteraction): Promise<void> {
        const roleId = i.values[0];
        
        if (!roleId) {
            return this._showExemptSection(originalInteraction);
        }

        const settings = await AutoModServiceInstance!.getSettings(originalInteraction.guildId!);
        let ignoredRoles = settings.ignored_roles || [];

        if (ignoredRoles.includes(roleId)) {
            ignoredRoles = ignoredRoles.filter(id => id !== roleId);
        } else {
            ignoredRoles.push(roleId);
        }

        await AutoModServiceInstance!.updateSettings(originalInteraction.guildId!, { ignored_roles: ignoredRoles });
        return this._showExemptSection(originalInteraction);
    }
    // ACTION CONFIGURATION
    private async _handleActionSelect(i: StringSelectMenuInteraction, originalInteraction: ChatInputCommandInteraction, actionType: string): Promise<void> {
        const actionOptions = [
            { label: 'Delete Only', value: 'delete', emoji: '🗑️', description: 'Just delete the message' },
            { label: 'Delete + Warn', value: 'delete_warn', emoji: '⚠️', description: 'Delete and warn user' },
            { label: 'Warn Only', value: 'warn', emoji: '📝', description: 'Warn without deleting' },
            { label: 'Mute', value: 'mute', emoji: '🔇', description: 'Timeout the user' },
            { label: 'Kick', value: 'kick', emoji: '👢', description: 'Kick from server' }
        ];

        this._pendingActionSelect.set(originalInteraction.user.id, actionType);

        const embed = new EmbedBuilder()
            .setColor(moderationConfig?.COLORS?.INFO || 0x0099FF)
            .setTitle(`⚡ Set Action for ${actionType.replace('_action', '').replace('_', ' ').toUpperCase()}`)
            .setDescription('Select what action to take when this rule is triggered:')
            .setTimestamp();

        const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId('automod_actions_section')
                .setLabel('Cancel')
                .setEmoji('❌')
                .setStyle(ButtonStyle.Secondary)
        );

        const actionValueSelect = new StringSelectMenuBuilder()
            .setCustomId('automod_action_value')
            .setPlaceholder('⚡ Select action...')
            .addOptions(actionOptions);

        const row2 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(actionValueSelect);

        await originalInteraction.editReply({ embeds: [embed], components: [row1, row2] });
    }

    private async _handleActionValue(i: StringSelectMenuInteraction, originalInteraction: ChatInputCommandInteraction): Promise<void> {
        const actionType = this._pendingActionSelect.get(originalInteraction.user.id);
        const actionValue = i.values[0];

        if (!actionType) {
            return this._showActionsSection(originalInteraction);
        }

        this._pendingActionSelect.delete(originalInteraction.user.id);

        await AutoModServiceInstance!.updateSettings(originalInteraction.guildId!, { [actionType]: actionValue });
        return this._showActionsSection(originalInteraction);
    }
    // WHITELIST CONFIGURATION
    private async _handleWhitelistLinks(i: ButtonInteraction, originalInteraction: ChatInputCommandInteraction): Promise<void> {
        const settings = await AutoModServiceInstance!.getSettings(originalInteraction.guildId!);
        const currentWhitelist = settings.links_whitelist || [];

        const modal = new ModalBuilder()
            .setCustomId(`whitelist_links_modal_${Date.now()}`)
            .setTitle('Edit Link Whitelist');

        const input = new TextInputBuilder()
            .setCustomId('links')
            .setLabel('Whitelisted domains (one per line)')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('youtube.com\ntwitch.tv\ntwitter.com')
            .setValue(currentWhitelist.join('\n'))
            .setRequired(false);

        modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
        
        try {
            await i.showModal(modal);
        } catch {
            return this._showExemptSection(originalInteraction);
        }

        try {
            const modalSubmit = await i.awaitModalSubmit({
                filter: mi => mi.customId.startsWith('whitelist_links_modal_') && mi.user.id === i.user.id,
                time: 60000
            });

            await modalSubmit.deferUpdate();

            const linksInput = modalSubmit.fields.getTextInputValue('links');
            const links = linksInput
                .split('\n')
                .map(l => l.trim().toLowerCase())
                .filter(l => l && l.length > 0);

            await AutoModServiceInstance!.updateSettings(originalInteraction.guildId!, { links_whitelist: links });
            return this._showExemptSection(originalInteraction);
        } catch {
            return this._showExemptSection(originalInteraction);
        }
    }
    // ESCALATION CONFIGURATION
    private async _handleEscalationSelect(i: StringSelectMenuInteraction, originalInteraction: ChatInputCommandInteraction, setting: string): Promise<void> {
        const settingNames: Record<string, string> = {
            warn_threshold: 'Warn Threshold (violations)',
            warn_reset_hours: 'Warn Reset Time (hours)',
            mute_duration: 'Mute Duration (minutes)'
        };

        const modal = new ModalBuilder()
            .setCustomId(`escalation_${setting}_modal_${Date.now()}`)
            .setTitle(settingNames[setting] || setting);

        const input = new TextInputBuilder()
            .setCustomId('value')
            .setLabel('New Value')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(4);

        modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
        await i.showModal(modal);

        try {
            const modalSubmit = await i.awaitModalSubmit({
                filter: mi => mi.customId.startsWith(`escalation_${setting}_modal_`) && mi.user.id === i.user.id,
                time: 60000
            });

            await modalSubmit.deferUpdate();

            const value = parseInt(modalSubmit.fields.getTextInputValue('value'));
            
            if (!isNaN(value) && value >= 1) {
                await AutoModServiceInstance!.updateSettings(originalInteraction.guildId!, { [setting]: value });
            }

            return this._showEscalationConfig(originalInteraction);
        } catch {
            return this._showEscalationConfig(originalInteraction);
        }
    }

    private async _handleEscalationActionSelect(i: StringSelectMenuInteraction, originalInteraction: ChatInputCommandInteraction): Promise<void> {
        const embed = new EmbedBuilder()
            .setColor(moderationConfig?.COLORS?.INFO || 0x0099FF)
            .setTitle('⚡ Set Escalation Action')
            .setDescription('What should happen when a user reaches the warn threshold?')
            .setTimestamp();

        const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId('automod_escalation_config')
                .setLabel('Cancel')
                .setEmoji('❌')
                .setStyle(ButtonStyle.Secondary)
        );

        const actionSelect = new StringSelectMenuBuilder()
            .setCustomId('automod_escalation_action_value')
            .setPlaceholder('⚡ Select action...')
            .addOptions([
                { label: 'Mute', value: 'mute', emoji: '🔇', description: 'Timeout the user' },
                { label: 'Kick', value: 'kick', emoji: '👢', description: 'Kick from server' }
            ]);

        const row2 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(actionSelect);

        await originalInteraction.editReply({ embeds: [embed], components: [row1, row2] });
    }

    private async _handleEscalationActionValue(i: StringSelectMenuInteraction, originalInteraction: ChatInputCommandInteraction): Promise<void> {
        const actionValue = i.values[0];
        await AutoModServiceInstance!.updateSettings(originalInteraction.guildId!, { warn_action: actionValue });
        return this._showEscalationConfig(originalInteraction);
    }
}

export default new AutoModCommand();
