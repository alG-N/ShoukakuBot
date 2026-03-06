/**
 * Rule34 Command - Presentation Layer
 * Search Rule34 for images and videos
 * @module presentation/commands/api/rule34
 */

import { 
    SlashCommandBuilder, 
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ChatInputCommandInteraction,
    AutocompleteInteraction,
    ButtonInteraction,
    StringSelectMenuInteraction
} from 'discord.js';
import { BaseCommand, CommandCategory, CommandData } from '../BaseCommand.js';
import { checkAccess, AccessType } from '../../services/index.js';
import _rule34Service from '../../services/api/rule34Service.js';
import _rule34Cache from '../../repositories/api/rule34Cache.js';
import _postHandler from '../../handlers/api/rule34/index.js';
import {
    handleRule34ButtonInteraction,
    handleRule34SelectMenuInteraction
} from '../../handlers/api/rule34/interactions.js';
import {
    handleRule34GetByIdCommand,
    handleRule34RandomCommand,
    handleRule34RelatedCommand,
    handleRule34SearchCommand,
    handleRule34SettingsCommand,
    handleRule34TrendingCommand
} from '../../handlers/api/rule34/commandHandlers.js';
import logger from '../../core/Logger.js';
import type {
    Rule34ServiceContract,
    Rule34CacheContract,
    Rule34PostHandlerContract
} from '../../types/api/commands/rule34-command.js';
// TYPES
// SERVICE IMPORTS — static ESM imports (converted from CJS require())
const rule34Service: Rule34ServiceContract = _rule34Service as any;
const rule34Cache: Rule34CacheContract = _rule34Cache as any;
const postHandler: Rule34PostHandlerContract = _postHandler as any;
// COMMAND
class Rule34Command extends BaseCommand {
    private _normalizeMinScore(value: unknown, fallback: number = 1): number {
        if (typeof value !== 'number' || Number.isNaN(value)) {
            return fallback;
        }
        return Math.max(1, Math.min(100000, Math.floor(value)));
    }

    constructor() {
        super({
            category: CommandCategory.API,
            cooldown: 3,
            deferReply: false,
            nsfw: true
        });
    }

    get data(): CommandData {
        return new SlashCommandBuilder()
            .setName('rule34')
            .setDescription('Search Rule34 for images and videos')
            .setNSFW(true)
            .addSubcommand(subcommand =>
                subcommand
                    .setName('search')
                    .setDescription('Search for posts by tags')
                    .addStringOption(option =>
                        option.setName('tags')
                            .setDescription('Tags to search for (space-separated)')
                            .setRequired(true)
                            .setAutocomplete(true)
                    )
                    .addStringOption(option =>
                        option.setName('rating')
                            .setDescription('Filter by rating')
                            .setRequired(false)
                            .addChoices(
                                { name: '🟢 Safe', value: 'safe' },
                                { name: '🟡 Questionable', value: 'questionable' },
                                { name: '🔴 Explicit', value: 'explicit' },
                                { name: '⚪ All Ratings', value: 'all' }
                            )
                    )
                    .addStringOption(option =>
                        option.setName('sort')
                            .setDescription('Sort results by')
                            .setRequired(false)
                            .addChoices(
                                { name: '⭐ Score (Highest)', value: 'score:desc' },
                                { name: '⭐ Score (Lowest)', value: 'score:asc' },
                                { name: '🆕 Newest First', value: 'id:desc' },
                                { name: '📅 Oldest First', value: 'id:asc' },
                                { name: '🔄 Recently Updated', value: 'updated:desc' }
                            )
                    )
                    .addBooleanOption(option =>
                        option.setName('ai_filter')
                            .setDescription('Hide AI-generated content (Default: uses your settings)')
                            .setRequired(false)
                    )
                    .addIntegerOption(option =>
                        option.setName('min_score')
                            .setDescription('Minimum score filter (1-100000)')
                            .setRequired(false)
                            .setMinValue(1)
                            .setMaxValue(100000)
                    )
                    .addStringOption(option =>
                        option.setName('content_type')
                            .setDescription('Filter by content type')
                            .setRequired(false)
                            .addChoices(
                                { name: '🎬 Videos Only', value: 'animated' },
                                { name: '📖 Comics Only', value: 'comic' },
                                { name: '📷 Images Only', value: 'image' }
                            )
                    )
                    .addBooleanOption(option =>
                        option.setName('high_quality')
                            .setDescription('Only show high quality posts')
                            .setRequired(false)
                    )
                    .addIntegerOption(option =>
                        option.setName('min_width')
                            .setDescription('Minimum image width')
                            .setRequired(false)
                            .setMinValue(100)
                            .setMaxValue(10000)
                    )
                    .addIntegerOption(option =>
                        option.setName('min_height')
                            .setDescription('Minimum image height')
                            .setRequired(false)
                            .setMinValue(100)
                            .setMaxValue(10000)
                    )
                    .addStringOption(option =>
                        option.setName('exclude')
                            .setDescription('Tags to exclude (space-separated)')
                            .setRequired(false)
                    )
                    .addIntegerOption(option =>
                        option.setName('page')
                            .setDescription('Page number (default: 1)')
                            .setRequired(false)
                            .setMinValue(1)
                            .setMaxValue(200)
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('random')
                    .setDescription('Get random posts')
                    .addStringOption(option =>
                        option.setName('tags')
                            .setDescription('Optional tags to filter by')
                            .setRequired(false)
                            .setAutocomplete(true)
                    )
                    .addIntegerOption(option =>
                        option.setName('count')
                            .setDescription('Number of random posts (1-10)')
                            .setRequired(false)
                            .setMinValue(1)
                            .setMaxValue(10)
                    )
                    .addBooleanOption(option =>
                        option.setName('ai_filter')
                            .setDescription('Hide AI-generated content')
                            .setRequired(false)
                    )
                    .addBooleanOption(option =>
                        option.setName('follow_settings')
                            .setDescription('Follow your Rule34 settings (true) or use complete random (false)')
                            .setRequired(false)
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('id')
                    .setDescription('Get a specific post by ID')
                    .addIntegerOption(option =>
                        option.setName('post_id')
                            .setDescription('The post ID to look up')
                            .setRequired(true)
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('trending')
                    .setDescription('Get trending/popular posts')
                    .addStringOption(option =>
                        option.setName('timeframe')
                            .setDescription('Timeframe for trending')
                            .setRequired(false)
                            .addChoices(
                                { name: '📅 Today', value: 'day' },
                                { name: '📊 This Week', value: 'week' },
                                { name: '📈 This Month', value: 'month' }
                            )
                    )
                    .addBooleanOption(option =>
                        option.setName('ai_filter')
                            .setDescription('Hide AI-generated content')
                            .setRequired(false)
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('related')
                    .setDescription('Find tags related to a tag')
                    .addStringOption(option =>
                        option.setName('tag')
                            .setDescription('Tag to find related tags for')
                            .setRequired(true)
                            .setAutocomplete(true)
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('settings')
                    .setDescription('Configure your Rule34 preferences and blacklist')
            );
    }

    async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
        try {
            const focused = interaction.options.getFocused(true);
            
            if (focused.name !== 'tags' && focused.name !== 'tag') {
                await interaction.respond([]).catch(() => {});
                return;
            }

            const focusedValue = focused.value?.trim();
            
            if (!focusedValue || focusedValue.length < 2) {
                await interaction.respond([
                    { name: '💡 Type at least 2 characters...', value: ' ' }
                ]).catch(() => {});
                return;
            }

            const cached = rule34Cache?.getAutocompleteSuggestions?.(focusedValue);
            if (cached) {
                const choices = cached.map(s => ({
                    name: `${s.name}${s.count ? ` (${s.count})` : ''}`.slice(0, 100),
                    value: (s.value || s.name).slice(0, 100)
                }));
                await interaction.respond(choices).catch(() => {});
                return;
            }

            const suggestions = await rule34Service?.getAutocompleteSuggestions?.(focusedValue) || [];
            
            rule34Cache?.setAutocompleteSuggestions?.(focusedValue, suggestions);
            
            const choices = [
                { name: `🔍 "${focusedValue}"`, value: focusedValue }
            ];
            
            for (const s of suggestions.slice(0, 24)) {
                choices.push({
                    name: `${s.name}${s.count ? ` (${s.count})` : ''}`.slice(0, 100),
                    value: (s.value || s.name || '').slice(0, 100)
                });
            }

            await interaction.respond(choices).catch(() => {});
        } catch (error) {
            logger.warn('Rule34', 'Autocomplete error: ' + (error as Error).message);
            const focusedValue = interaction.options.getFocused() || '';
            await interaction.respond([
                { name: `🔍 "${focusedValue.slice(0, 90)}"`, value: focusedValue.slice(0, 100) || 'search' }
            ]).catch(() => {});
        }
    }

    async run(interaction: ChatInputCommandInteraction): Promise<void> {
        // Access control
        const access = await checkAccess(interaction, AccessType.SUB);
        if (access.blocked) {
            await interaction.reply({ embeds: [access.embed!], ephemeral: true });
            return;
        }

        // Verify NSFW channel
        const channel = interaction.channel;
        const isNsfw = channel && 'nsfw' in channel ? channel.nsfw : false;
        if (!isNsfw) {
            await this.safeReply(interaction, {
                embeds: [this.errorEmbed('🔞 This command can only be used in NSFW channels!')],
                ephemeral: true
            });
            return;
        }

        const subcommand = interaction.options.getSubcommand();
        const userId = interaction.user.id;

        try {
            switch (subcommand) {
                case 'search':
                    await handleRule34SearchCommand(interaction, userId, this._buildHandlerDeps());
                    break;
                case 'random':
                    await handleRule34RandomCommand(interaction, userId, this._buildHandlerDeps());
                    break;
                case 'id':
                    await handleRule34GetByIdCommand(interaction, userId, this._buildHandlerDeps());
                    break;
                case 'trending':
                    await handleRule34TrendingCommand(interaction, userId, this._buildHandlerDeps());
                    break;
                case 'related':
                    await handleRule34RelatedCommand(interaction, this._buildHandlerDeps());
                    break;
                case 'settings':
                    await handleRule34SettingsCommand(interaction, userId, this._buildHandlerDeps());
                    break;
                default:
                    await this.safeReply(interaction, { 
                        embeds: [this.errorEmbed('Unknown command')], 
                        ephemeral: true 
                    });
            }
        } catch (error) {
            logger.error('Rule34', `Command error: ${(error as Error).message}`);
            const errorEmbed = postHandler?.createErrorEmbed?.(error as Error) || this.errorEmbed((error as Error).message || 'An error occurred');
            
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ embeds: [errorEmbed] }).catch(() => {});
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    }

    private _buildHandlerDeps() {
        return {
            rule34Service,
            rule34Cache,
            postHandler,
            normalizeMinScore: (value: unknown, fallback?: number) => this._normalizeMinScore(value, fallback),
            errorEmbed: (message: string) => this.errorEmbed(message),
            infoEmbed: (title: string, description: string) => this.infoEmbed(title, description)
        };
    }

    async handleButton(interaction: ButtonInteraction): Promise<void> {
        await handleRule34ButtonInteraction(interaction, {
            rule34Service,
            rule34Cache,
            postHandler,
            normalizeMinScore: (value, fallback) => this._normalizeMinScore(value, fallback),
            errorEmbed: (message) => this.errorEmbed(message),
            infoEmbed: (title, description) => this.infoEmbed(title, description)
        });
    }

    async handleSelectMenu(interaction: StringSelectMenuInteraction): Promise<void> {
        await handleRule34SelectMenuInteraction(interaction, {
            rule34Service,
            rule34Cache,
            postHandler,
            normalizeMinScore: (value, fallback) => this._normalizeMinScore(value, fallback),
            errorEmbed: (message) => this.errorEmbed(message),
            infoEmbed: (title, description) => this.infoEmbed(title, description)
        });
    }
}

export default new Rule34Command();


