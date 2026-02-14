/**
 * Google Command - Presentation Layer
 * Search the web using Google Custom Search or DuckDuckGo fallback
 * @module presentation/commands/api/google
 */

import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    ChatInputCommandInteraction
} from 'discord.js';
import { BaseCommand, CommandCategory, type CommandData } from '../BaseCommand.js';
import { COLORS } from '../../constants.js';
import { checkAccess, AccessType } from '../../services/index.js';
import logger from '../../core/Logger.js';
import _googleServiceModule from '../../services/api/googleService.js';
import _googleHandlerModule from '../../handlers/api/googleHandler.js';
import { globalCooldownManager } from '../../utils/common/cooldown.js';
// TYPES
interface SearchResult {
    title: string;
    link: string;
    snippet?: string;
}

interface SearchResponse {
    success: boolean;
    results?: SearchResult[];
    totalResults?: string;
    searchEngine?: string;
    error?: string;
}

interface CooldownResult {
    onCooldown: boolean;
    remaining: number;
}

interface GoogleService {
    search: (query: string, options: { safeSearch: boolean; maxResults: number }) => Promise<SearchResponse>;
    getSearchEngine?: () => string;
}

interface GoogleHandler {
    createCooldownEmbed?: (remaining: number) => EmbedBuilder;
    createResultsEmbed?: (query: string, results: SearchResult[], options: { totalResults?: string; searchEngine?: string }) => EmbedBuilder;
    createSearchButtons?: (query: string, searchEngine?: string) => ActionRowBuilder<ButtonBuilder>;
    createErrorEmbed?: (error: string) => EmbedBuilder;
}

interface CooldownManager {
    check: (userId: string, command: string, settings: number) => CooldownResult;
}
// SERVICE IMPORTS — static ESM imports (converted from CJS require())
const googleService: GoogleService = _googleServiceModule as any;
const googleHandler: GoogleHandler = _googleHandlerModule as any;
// NOTE: cooldownManager/COOLDOWN_SETTINGS were never populated (wrong export names).
// BaseCommand already handles cooldowns. These are kept as undefined for compatibility.
const cooldownManager: CooldownManager | undefined = undefined;
const COOLDOWN_SETTINGS: Record<string, number> | undefined = undefined;
// COMMAND
class GoogleCommand extends BaseCommand {
    constructor() {
        super({
            category: CommandCategory.API,
            cooldown: 3,
            deferReply: false // Manual for subcommand handling
        });
    }

    get data(): CommandData {
        return new SlashCommandBuilder()
            .setName('google')
            .setDescription('Search the web')
            .addSubcommand(sub => sub
                .setName('search')
                .setDescription('Search for websites and information')
                .addStringOption(option =>
                    option.setName('query')
                        .setDescription('What to search for')
                        .setRequired(true)
                        .setMaxLength(200)
                )
                .addBooleanOption(option =>
                    option.setName('safe')
                        .setDescription('Enable SafeSearch filter (default: true)')
                        .setRequired(false)
                )
            )
            .addSubcommand(sub => sub
                .setName('image')
                .setDescription('Open image search in browser')
                .addStringOption(option =>
                    option.setName('query')
                        .setDescription('What to search for')
                        .setRequired(true)
                        .setMaxLength(200)
                )
            );
    }

    async run(interaction: ChatInputCommandInteraction): Promise<void> {
        // Access control
        const access = await checkAccess(interaction, AccessType.SUB);
        if (access.blocked) {
            await interaction.reply({ embeds: [access.embed!], ephemeral: true });
            return;
        }

        // Cooldown check
        if (cooldownManager && COOLDOWN_SETTINGS) {
            const cooldown = cooldownManager.check(interaction.user.id, 'google', COOLDOWN_SETTINGS.google);
            if (cooldown.onCooldown) {
                const embed = googleHandler?.createCooldownEmbed?.(cooldown.remaining) ||
                    new EmbedBuilder()
                        .setColor(COLORS.WARNING)
                        .setDescription(`⏳ Please wait ${cooldown.remaining}s before searching again.`);
                await interaction.reply({ embeds: [embed], ephemeral: true });
                return;
            }
        }

        const subcommand = interaction.options.getSubcommand();
        const query = interaction.options.getString('query', true);

        if (subcommand === 'image') {
            await this._handleImageSearch(interaction, query);
            return;
        }

        await this._handleWebSearch(interaction, query);
    }

    private async _handleImageSearch(interaction: ChatInputCommandInteraction, query: string): Promise<void> {
        const searchEngine = googleService?.getSearchEngine?.() || 'Google';
        const url = searchEngine === 'Google'
            ? `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`
            : `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`;
        
        await interaction.reply({
            content: `🖼️ **Image Search:** [Click here to search "${query}"](${url})`,
            ephemeral: false
        });
    }

    private async _handleWebSearch(interaction: ChatInputCommandInteraction, query: string): Promise<void> {
        await interaction.deferReply();

        try {
            const safeSearch = interaction.options.getBoolean('safe') ?? true;
            
            const result = await googleService!.search(query, { 
                safeSearch,
                maxResults: 5 
            });

            if (!result.success) {
                const errorEmbed = googleHandler?.createErrorEmbed?.(result.error || 'Unknown error') ||
                    new EmbedBuilder()
                        .setColor(COLORS.ERROR)
                        .setTitle('❌ Search Failed')
                        .setDescription(result.error || 'Unknown error');
                await interaction.editReply({ embeds: [errorEmbed] });
                return;
            }

            const embed = googleHandler?.createResultsEmbed?.(query, result.results || [], {
                totalResults: result.totalResults,
                searchEngine: result.searchEngine
            }) || this._createResultsEmbed(query, result);
            
            const buttons = googleHandler?.createSearchButtons?.(query, result.searchEngine) ||
                this._createSearchButtons(query);

            await interaction.editReply({ embeds: [embed], components: [buttons] });
        } catch (error) {
            logger.error('Google', `Command error: ${(error as Error).message}`);
            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor(COLORS.ERROR)
                    .setTitle('❌ Error')
                    .setDescription('An unexpected error occurred. Please try again.')
                ]
            });
        }
    }

    private _createResultsEmbed(query: string, result: SearchResponse): EmbedBuilder {
        const embed = new EmbedBuilder()
            .setColor(COLORS.PRIMARY)
            .setTitle(`🔍 Search Results: ${query}`)
            .setFooter({ text: `Powered by ${result.searchEngine || 'Web Search'}` });

        if (result.results && result.results.length > 0) {
            const description = result.results.map((r, i) => 
                `**${i + 1}.** [${r.title}](${r.link})\n${r.snippet || ''}`
            ).join('\n\n');
            embed.setDescription(description.slice(0, 4096));
        } else {
            embed.setDescription('No results found.');
        }

        return embed;
    }

    private _createSearchButtons(query: string): ActionRowBuilder<ButtonBuilder> {
        return new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setLabel('View on Google')
                .setStyle(ButtonStyle.Link)
                .setURL(`https://www.google.com/search?q=${encodeURIComponent(query)}`)
                .setEmoji('🔍'),
            new ButtonBuilder()
                .setLabel('View on DuckDuckGo')
                .setStyle(ButtonStyle.Link)
                .setURL(`https://duckduckgo.com/?q=${encodeURIComponent(query)}`)
                .setEmoji('🦆')
        );
    }
}

export default new GoogleCommand();
