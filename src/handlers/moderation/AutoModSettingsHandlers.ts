/**
 * AutoMod Command — Interaction Handlers
 * Modal, filter, config, action, and escalation handlers extracted from automod.ts.
 * @module handlers/moderation/AutoModSettingsHandlers
 */

import {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChatInputCommandInteraction,
    ButtonInteraction,
    StringSelectMenuInteraction,
    ChannelSelectMenuInteraction,
    RoleSelectMenuInteraction
} from 'discord.js';
import type { AutoModService, ModerationConfig, AutoModSettings } from './AutoModTypes.js';
import { showFilterSection, showConfigSection, showActionsSection, showExemptSection, showEscalationConfig } from './AutoModPanels.js';

// ─── FILTER ACTIONS ────────────────────────────────────────────────────────────

export async function handleFilterAction(
    i: StringSelectMenuInteraction,
    originalInteraction: ChatInputCommandInteraction,
    action: string,
    service: AutoModService,
    config: ModerationConfig
): Promise<void> {
    const guildId = originalInteraction.guildId!;

    if (action === 'clear' || action.startsWith('import_')) {
        await i.deferUpdate();
        return handleFilterActionDeferred(originalInteraction, action, service, config);
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

            const settings = await service.getSettings(guildId);
            let currentWords = settings.filtered_words || [];

            if (action === 'add') {
                const newWords = words.filter(w => !currentWords.includes(w));
                currentWords = [...currentWords, ...newWords];
            } else {
                currentWords = currentWords.filter(w => !words.includes(w));
            }

            await service.updateSettings(guildId, { filtered_words: currentWords });
            return showFilterSection(originalInteraction, service, config);
        } catch {
            return showFilterSection(originalInteraction, service, config);
        }
    }
}

export async function handleFilterActionDeferred(
    originalInteraction: ChatInputCommandInteraction,
    action: string,
    service: AutoModService,
    config: ModerationConfig
): Promise<void> {
    const guildId = originalInteraction.guildId!;
    const settings = await service.getSettings(guildId);
    let filteredWords = settings.filtered_words || [];

    if (action === 'clear') {
        await service.updateSettings(guildId, { filtered_words: [] });
        return showFilterSection(originalInteraction, service, config);
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

        await service.updateSettings(guildId, { filtered_words: filteredWords });
        return showFilterSection(originalInteraction, service, config);
    }
}

// ─── CONFIG ACTIONS ─────────────────────────────────────────────────────────────

export async function handleConfigSelect(
    i: StringSelectMenuInteraction,
    originalInteraction: ChatInputCommandInteraction,
    setting: string,
    service: AutoModService,
    config: ModerationConfig
): Promise<void> {
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
            await service.updateSettings(originalInteraction.guildId!, { [setting]: value });
        }

        return showConfigSection(originalInteraction, service, config);
    } catch {
        return showConfigSection(originalInteraction, service, config);
    }
}

// ─── EXEMPT ACTIONS ─────────────────────────────────────────────────────────────

export async function handleIgnoreChannel(
    i: ChannelSelectMenuInteraction,
    originalInteraction: ChatInputCommandInteraction,
    service: AutoModService,
    config: ModerationConfig
): Promise<void> {
    const channelId = i.values[0];
    
    if (!channelId) {
        return showExemptSection(originalInteraction, service, config);
    }

    const settings = await service.getSettings(originalInteraction.guildId!);
    let ignoredChannels = settings.ignored_channels || [];

    if (ignoredChannels.includes(channelId)) {
        ignoredChannels = ignoredChannels.filter(id => id !== channelId);
    } else {
        ignoredChannels.push(channelId);
    }

    await service.updateSettings(originalInteraction.guildId!, { ignored_channels: ignoredChannels });
    return showExemptSection(originalInteraction, service, config);
}

export async function handleIgnoreRole(
    i: RoleSelectMenuInteraction,
    originalInteraction: ChatInputCommandInteraction,
    service: AutoModService,
    config: ModerationConfig
): Promise<void> {
    const roleId = i.values[0];
    
    if (!roleId) {
        return showExemptSection(originalInteraction, service, config);
    }

    const settings = await service.getSettings(originalInteraction.guildId!);
    let ignoredRoles = settings.ignored_roles || [];

    if (ignoredRoles.includes(roleId)) {
        ignoredRoles = ignoredRoles.filter(id => id !== roleId);
    } else {
        ignoredRoles.push(roleId);
    }

    await service.updateSettings(originalInteraction.guildId!, { ignored_roles: ignoredRoles });
    return showExemptSection(originalInteraction, service, config);
}

// ─── ACTION CONFIGURATION ───────────────────────────────────────────────────────

export async function handleActionSelect(
    i: StringSelectMenuInteraction,
    originalInteraction: ChatInputCommandInteraction,
    actionType: string,
    pendingActionSelect: Map<string, string>,
    config: ModerationConfig
): Promise<void> {
    const actionOptions = [
        { label: 'Delete Only', value: 'delete', emoji: '🗑️', description: 'Just delete the message' },
        { label: 'Delete + Warn', value: 'delete_warn', emoji: '⚠️', description: 'Delete and warn user' },
        { label: 'Warn Only', value: 'warn', emoji: '📝', description: 'Warn without deleting' },
        { label: 'Mute', value: 'mute', emoji: '🔇', description: 'Timeout the user' },
        { label: 'Kick', value: 'kick', emoji: '👢', description: 'Kick from server' }
    ];

    pendingActionSelect.set(originalInteraction.user.id, actionType);

    const embed = new EmbedBuilder()
        .setColor(config?.COLORS?.INFO || 0x0099FF)
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

export async function handleActionValue(
    i: StringSelectMenuInteraction,
    originalInteraction: ChatInputCommandInteraction,
    pendingActionSelect: Map<string, string>,
    service: AutoModService,
    config: ModerationConfig
): Promise<void> {
    const actionType = pendingActionSelect.get(originalInteraction.user.id);
    const actionValue = i.values[0];

    if (!actionType) {
        return showActionsSection(originalInteraction, service, config);
    }

    pendingActionSelect.delete(originalInteraction.user.id);

    await service.updateSettings(originalInteraction.guildId!, { [actionType]: actionValue });
    return showActionsSection(originalInteraction, service, config);
}

// ─── WHITELIST ───────────────────────────────────────────────────────────────────

export async function handleWhitelistLinks(
    i: ButtonInteraction,
    originalInteraction: ChatInputCommandInteraction,
    service: AutoModService,
    config: ModerationConfig
): Promise<void> {
    const settings = await service.getSettings(originalInteraction.guildId!);
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
        return showExemptSection(originalInteraction, service, config);
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

        await service.updateSettings(originalInteraction.guildId!, { links_whitelist: links });
        return showExemptSection(originalInteraction, service, config);
    } catch {
        return showExemptSection(originalInteraction, service, config);
    }
}

// ─── ESCALATION CONFIGURATION ───────────────────────────────────────────────────

export async function handleEscalationSelect(
    i: StringSelectMenuInteraction,
    originalInteraction: ChatInputCommandInteraction,
    setting: string,
    service: AutoModService,
    config: ModerationConfig
): Promise<void> {
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
            await service.updateSettings(originalInteraction.guildId!, { [setting]: value });
        }

        return showEscalationConfig(originalInteraction, service, config);
    } catch {
        return showEscalationConfig(originalInteraction, service, config);
    }
}

export async function handleEscalationActionSelect(
    i: StringSelectMenuInteraction,
    originalInteraction: ChatInputCommandInteraction,
    config: ModerationConfig
): Promise<void> {
    const embed = new EmbedBuilder()
        .setColor(config?.COLORS?.INFO || 0x0099FF)
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

export async function handleEscalationActionValue(
    i: StringSelectMenuInteraction,
    originalInteraction: ChatInputCommandInteraction,
    service: AutoModService,
    config: ModerationConfig
): Promise<void> {
    const actionValue = i.values[0];
    await service.updateSettings(originalInteraction.guildId!, { warn_action: actionValue });
    return showEscalationConfig(originalInteraction, service, config);
}
