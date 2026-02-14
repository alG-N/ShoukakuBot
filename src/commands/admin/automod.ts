/**
 * AutoMod Command - Interactive Panel with Sections
 * Fixed: Use deferUpdate() + editReply() pattern to prevent timeout
 * Refactored: Panels -> automodPanels.ts, Handlers -> automodHandlers.ts, Types -> automodTypes.ts
 * @module commands/admin/automod
 */

import { 
    SlashCommandBuilder, 
    PermissionFlagsBits,
    ChatInputCommandInteraction,
    ButtonInteraction,
    StringSelectMenuInteraction,
    ChannelSelectMenuInteraction,
    RoleSelectMenuInteraction,
    Message,
    MessageComponentInteraction
} from 'discord.js';
import { BaseCommand, CommandCategory, type CommandData } from '../BaseCommand.js';
import logger from '../../core/Logger.js';
import { autoModService as _autoModService } from '../../services/moderation/index.js';
import _moderationConfigModule from '../../config/features/moderation/index.js';
import type { AutoModService, ModerationConfig } from './automodTypes.js';
import { showMainPanel, showToggleSection, showFilterSection, showConfigSection, showActionsSection, showExemptSection, showEscalationConfig } from './automodPanels.js';
import {
    handleFilterAction,
    handleFilterActionDeferred,
    handleConfigSelect,
    handleIgnoreChannel,
    handleIgnoreRole,
    handleActionSelect,
    handleActionValue,
    handleWhitelistLinks,
    handleEscalationSelect,
    handleEscalationActionSelect,
    handleEscalationActionValue
} from './automodHandlers.js';

// SERVICE IMPORTS
const AutoModServiceInstance: AutoModService = _autoModService as any;
const moderationConfig: ModerationConfig = _moderationConfigModule as any;

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
            await interaction.editReply({ content: '\u274C AutoMod service unavailable.' });
            return;
        }

        await showMainPanel(interaction, AutoModServiceInstance, moderationConfig);
        const response = await interaction.fetchReply() as Message;
        this._setupCollector(response, interaction);
    }

    private _setupCollector(response: Message, originalInteraction: ChatInputCommandInteraction): void {
        const collector = response.createMessageComponentCollector({
            time: 300000 // 5 minutes
        });

        collector.on('collect', async (i: MessageComponentInteraction) => {
            if (i.user.id !== originalInteraction.user.id) {
                await i.reply({ content: '\u274C This panel is not for you!', ephemeral: true }).catch(() => {});
                return;
            }

            try {
                await this._handleInteraction(i, originalInteraction);
            } catch (error: unknown) {
                const err = error as { code?: number };
                if (err.code === 10062) return;
                logger.error('AutoMod', `Interaction error: ${error}`);
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

        // Check if this needs a modal (cannot defer before showModal)
        const needsModal = 
            (customId === 'automod_filter_action' && ['add', 'remove'].includes((i as StringSelectMenuInteraction).values?.[0])) ||
            customId === 'automod_config_select' ||
            customId === 'automod_whitelist_links' ||
            (customId === 'automod_escalation_select' && !['warn_action'].includes((i as StringSelectMenuInteraction).values?.[0]));

        if (needsModal) {
            if (customId === 'automod_filter_action') {
                return handleFilterAction(i as StringSelectMenuInteraction, originalInteraction, (i as StringSelectMenuInteraction).values[0], AutoModServiceInstance, moderationConfig);
            }
            if (customId === 'automod_config_select') {
                return handleConfigSelect(i as StringSelectMenuInteraction, originalInteraction, (i as StringSelectMenuInteraction).values[0], AutoModServiceInstance, moderationConfig);
            }
            if (customId === 'automod_escalation_select') {
                return handleEscalationSelect(i as StringSelectMenuInteraction, originalInteraction, (i as StringSelectMenuInteraction).values[0], AutoModServiceInstance, moderationConfig);
            }
            if (customId === 'automod_whitelist_links') {
                return handleWhitelistLinks(i as ButtonInteraction, originalInteraction, AutoModServiceInstance, moderationConfig);
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
            return showMainPanel(originalInteraction, AutoModServiceInstance, moderationConfig);
        }
        if (customId === 'automod_toggle_section') {
            return showToggleSection(originalInteraction, AutoModServiceInstance, moderationConfig);
        }
        if (customId === 'automod_filter_section') {
            return showFilterSection(originalInteraction, AutoModServiceInstance, moderationConfig);
        }
        if (customId === 'automod_config_section') {
            return showConfigSection(originalInteraction, AutoModServiceInstance, moderationConfig);
        }
        if (customId === 'automod_actions_section') {
            return showActionsSection(originalInteraction, AutoModServiceInstance, moderationConfig);
        }
        if (customId === 'automod_exempt_section') {
            return showExemptSection(originalInteraction, AutoModServiceInstance, moderationConfig);
        }

        // Toggle Section Actions
        if (customId === 'automod_master_toggle') {
            const settings = await AutoModServiceInstance!.getSettings(guildId);
            await AutoModServiceInstance!.updateSettings(guildId, { enabled: !settings.enabled });
            logger?.info('AutoMod', `${i.user.tag} ${settings.enabled ? 'disabled' : 'enabled'} automod in ${originalInteraction.guild!.name}`);
            return showToggleSection(originalInteraction, AutoModServiceInstance, moderationConfig);
        }

        if (customId === 'automod_feature_toggle') {
            const feature = (i as StringSelectMenuInteraction).values[0];
            const settings = await AutoModServiceInstance!.getSettings(guildId);
            const fieldName = `${feature}_enabled`;
            await AutoModServiceInstance!.updateSettings(guildId, { [fieldName]: !settings[fieldName as keyof typeof settings] });
            logger?.info('AutoMod', `${i.user.tag} toggled ${feature} in ${originalInteraction.guild!.name}`);
            return showToggleSection(originalInteraction, AutoModServiceInstance, moderationConfig);
        }

        // Filter Section Actions
        if (customId === 'automod_filter_toggle') {
            const settings = await AutoModServiceInstance!.getSettings(guildId);
            await AutoModServiceInstance!.updateSettings(guildId, { filter_enabled: !settings.filter_enabled });
            return showFilterSection(originalInteraction, AutoModServiceInstance, moderationConfig);
        }

        if (customId === 'automod_filter_action') {
            return handleFilterActionDeferred(originalInteraction, (i as StringSelectMenuInteraction).values[0], AutoModServiceInstance, moderationConfig);
        }

        // Actions Section
        if (customId === 'automod_warn_toggle') {
            const settings = await AutoModServiceInstance!.getSettings(guildId);
            await AutoModServiceInstance!.updateSettings(guildId, { auto_warn: !settings.auto_warn });
            return showActionsSection(originalInteraction, AutoModServiceInstance, moderationConfig);
        }

        if (customId === 'automod_escalation_config') {
            return showEscalationConfig(originalInteraction, AutoModServiceInstance, moderationConfig);
        }

        if (customId === 'automod_escalation_select') {
            if ((i as StringSelectMenuInteraction).values[0] === 'warn_action') {
                return handleEscalationActionSelect(i as StringSelectMenuInteraction, originalInteraction, moderationConfig);
            }
        }

        if (customId === 'automod_escalation_action_value') {
            return handleEscalationActionValue(i as StringSelectMenuInteraction, originalInteraction, AutoModServiceInstance, moderationConfig);
        }

        if (customId === 'automod_ignore_channel') {
            return handleIgnoreChannel(i as ChannelSelectMenuInteraction, originalInteraction, AutoModServiceInstance, moderationConfig);
        }

        if (customId === 'automod_ignore_role') {
            return handleIgnoreRole(i as RoleSelectMenuInteraction, originalInteraction, AutoModServiceInstance, moderationConfig);
        }

        if (customId === 'automod_action_select') {
            return handleActionSelect(i as StringSelectMenuInteraction, originalInteraction, (i as StringSelectMenuInteraction).values[0], this._pendingActionSelect, moderationConfig);
        }

        if (customId === 'automod_action_value') {
            return handleActionValue(i as StringSelectMenuInteraction, originalInteraction, this._pendingActionSelect, AutoModServiceInstance, moderationConfig);
        }
    }
}

export default new AutoModCommand();
