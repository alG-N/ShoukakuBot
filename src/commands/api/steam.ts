/**
 * Steam Command - Presentation Layer
 * Steam game utilities
 * @module presentation/commands/api/steam
 */

import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { BaseCommand, CommandCategory, type CommandData } from '../BaseCommand.js';
import { checkAccess, AccessType } from '../../services/index.js';
import logger from '../../core/Logger.js';
import * as _steamHandler from '../../handlers/api/steamSaleHandler.js';
import _steamService from '../../services/api/steamService.js';
// TYPES
type SaleHandler = (interaction: ChatInputCommandInteraction) => Promise<void>;
// SERVICE IMPORTS
const handleSaleCommand: SaleHandler | undefined = (_steamHandler as any)?.handleSaleCommand;
const steamService: any = _steamService;
// COMMAND
class SteamCommand extends BaseCommand {
    constructor() {
        super({
            category: CommandCategory.API,
            cooldown: 10,
            deferReply: false // Handler manages defer
        });
    }

    get data(): CommandData {
        return new SlashCommandBuilder()
            .setName('steam')
            .setDescription('Steam game utilities')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('sale')
                    .setDescription('Find games on sale with a minimum discount percentage')
                    .addIntegerOption(option =>
                        option
                            .setName('discount')
                            .setDescription('Minimum discount percentage (0-100, 0 = free games)')
                            .setRequired(true)
                            .setMinValue(0)
                            .setMaxValue(100)
                    )
                    .addBooleanOption(option =>
                        option
                            .setName('detailed')
                            .setDescription('Show detailed info (owners, ratings) from SteamSpy')
                            .setRequired(false)
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('game')
                    .setDescription('Look up a specific game on Steam')
                    .addStringOption(option =>
                        option
                            .setName('name')
                            .setDescription('Game name to search for')
                            .setRequired(true)
                            .setMaxLength(200)
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('free')
                    .setDescription('Show currently free games on Steam')
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('featured')
                    .setDescription('Show featured deals on Steam')
            );
    }

    async run(interaction: ChatInputCommandInteraction): Promise<void> {
        // Access control
        const access = await checkAccess(interaction, AccessType.SUB);
        if (access.blocked) {
            await interaction.reply({ embeds: [access.embed!], ephemeral: true });
            return;
        }

        const subcommand = interaction.options.getSubcommand();

        try {
            switch (subcommand) {
                case 'sale':
                    if (handleSaleCommand) {
                        await handleSaleCommand(interaction);
                    } else {
                        await this.errorReply(interaction, 'Steam sale handler not available.');
                    }
                    break;
                case 'game':
                    await this._handleGame(interaction);
                    break;
                case 'free':
                    await this._handleFree(interaction);
                    break;
                case 'featured':
                    await this._handleFeatured(interaction);
                    break;
            }
        } catch (error) {
            logger.error('Steam', `Command error: ${(error as Error).message}`);
            await this.errorReply(interaction, 'An error occurred while fetching Steam data.');
        }
    }

    private async _handleGame(interaction: ChatInputCommandInteraction): Promise<void> {
        await interaction.deferReply();
        
        const name = interaction.options.getString('name', true);

        try {
            // Search for the game using Steam store search
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
            const searchUrl = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(name)}&l=english&cc=us`;
            const searchResponse = await fetch(searchUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en-US,en;q=0.9' },
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!searchResponse.ok) {
                await interaction.editReply({ embeds: [this._errorEmbed('Failed to search Steam store.')] });
                return;
            }

            interface SteamStoreSearchItem {
                id: number;
                name: string;
                tiny_image?: string;
                metascore?: string;
                price?: {
                    currency: string;
                    initial: number;
                    final: number;
                    discount_percent: number;
                };
            }

            const searchData = await searchResponse.json() as { total: number; items?: SteamStoreSearchItem[] };
            
            if (!searchData.items || searchData.items.length === 0) {
                await interaction.editReply({ embeds: [this._errorEmbed(`No games found for **${name}**.`)] });
                return;
            }

            const game = searchData.items[0];

            // Fetch detailed app info
            const detailController = new AbortController();
            const detailTimeoutId = setTimeout(() => detailController.abort(), 10000);
            
            const detailResponse = await fetch(
                `https://store.steampowered.com/api/appdetails?appids=${game.id}&cc=us&l=english`,
                {
                    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en-US,en;q=0.9' },
                    signal: detailController.signal
                }
            );
            clearTimeout(detailTimeoutId);

            interface SteamAppDetail {
                success: boolean;
                data?: {
                    name: string;
                    steam_appid: number;
                    short_description?: string;
                    header_image?: string;
                    developers?: string[];
                    publishers?: string[];
                    release_date?: { coming_soon: boolean; date: string };
                    genres?: Array<{ description: string }>;
                    metacritic?: { score: number; url: string };
                    price_overview?: {
                        currency: string;
                        initial: number;
                        final: number;
                        discount_percent: number;
                        initial_formatted: string;
                        final_formatted: string;
                    };
                    platforms?: { windows: boolean; mac: boolean; linux: boolean };
                    recommendations?: { total: number };
                    categories?: Array<{ description: string }>;
                    is_free?: boolean;
                };
            }

            let detail: SteamAppDetail['data'] | undefined;
            if (detailResponse.ok) {
                const detailData = await detailResponse.json() as Record<string, SteamAppDetail>;
                const appDetail = detailData[game.id];
                if (appDetail?.success) {
                    detail = appDetail.data;
                }
            }

            // Build rich embed
            const embed = new EmbedBuilder()
                .setColor(0x1b2838)
                .setTitle(`🎮 ${detail?.name || game.name}`)
                .setURL(`https://store.steampowered.com/app/${game.id}`)
                .setTimestamp();

            if (detail?.header_image) {
                embed.setImage(detail.header_image);
            } else if (game.tiny_image) {
                embed.setThumbnail(game.tiny_image);
            }

            if (detail?.short_description) {
                embed.setDescription(detail.short_description.replace(/<[^>]*>/g, '').slice(0, 500));
            }

            // Price info
            if (detail?.is_free) {
                embed.addFields({ name: '💰 Price', value: '**Free to Play**', inline: true });
            } else if (detail?.price_overview) {
                const price = detail.price_overview;
                const priceText = price.discount_percent > 0
                    ? `~~$${(price.initial / 100).toFixed(2)}~~ → **$${(price.final / 100).toFixed(2)}** (${price.discount_percent}% OFF)`
                    : `**$${(price.final / 100).toFixed(2)}**`;
                embed.addFields({ name: '💰 Price', value: priceText, inline: true });
            }

            // Developer/Publisher
            if (detail?.developers && detail.developers.length > 0) {
                embed.addFields({ name: '🛠️ Developer', value: detail.developers.slice(0, 2).join(', '), inline: true });
            }

            // Release date
            if (detail?.release_date) {
                const releaseText = detail.release_date.coming_soon 
                    ? `🔜 ${detail.release_date.date}` 
                    : detail.release_date.date;
                embed.addFields({ name: '📅 Release', value: releaseText, inline: true });
            }

            // Genres
            if (detail?.genres && detail.genres.length > 0) {
                embed.addFields({ 
                    name: '🏷️ Genres', 
                    value: detail.genres.slice(0, 5).map(g => `\`${g.description}\``).join(' '), 
                    inline: true 
                });
            }

            // Metacritic
            if (detail?.metacritic) {
                const score = detail.metacritic.score;
                const scoreEmoji = score >= 75 ? '🟢' : score >= 50 ? '🟡' : '🔴';
                embed.addFields({ name: '📊 Metacritic', value: `${scoreEmoji} **${score}**/100`, inline: true });
            }

            // Platforms
            if (detail?.platforms) {
                const platforms: string[] = [];
                if (detail.platforms.windows) platforms.push('🪟 Windows');
                if (detail.platforms.mac) platforms.push('🍎 macOS');
                if (detail.platforms.linux) platforms.push('🐧 Linux');
                if (platforms.length > 0) {
                    embed.addFields({ name: '💻 Platforms', value: platforms.join(' • '), inline: true });
                }
            }

            // Reviews
            if (detail?.recommendations) {
                embed.addFields({ 
                    name: '👥 Reviews', 
                    value: `${detail.recommendations.total.toLocaleString()} reviews`, 
                    inline: true 
                });
            }

            // SteamSpy data
            try {
                const spyData = await steamService.getSteamSpyData(game.id);
                if (spyData) {
                    const owners = steamService.formatOwners(spyData.owners);
                    const totalReviews = (spyData.positive || 0) + (spyData.negative || 0);
                    const rating = totalReviews > 0 ? Math.round((spyData.positive / totalReviews) * 100) : 0;
                    const ratingEmoji = rating >= 80 ? '👍' : rating >= 60 ? '👌' : '👎';
                    
                    let spyText = `👤 Owners: **${owners}**`;
                    if (totalReviews > 0) {
                        spyText += `\n${ratingEmoji} Rating: **${rating}%** (${totalReviews.toLocaleString()} reviews)`;
                    }
                    embed.addFields({ name: '📈 Statistics', value: spyText, inline: false });
                }
            } catch {
                // SteamSpy data is optional
            }

            embed.setFooter({ text: `Steam App ID: ${game.id}` });

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setLabel('View on Steam')
                    .setStyle(ButtonStyle.Link)
                    .setURL(`https://store.steampowered.com/app/${game.id}`)
                    .setEmoji('🔗'),
                new ButtonBuilder()
                    .setLabel('SteamDB')
                    .setStyle(ButtonStyle.Link)
                    .setURL(`https://steamdb.info/app/${game.id}`)
                    .setEmoji('📊')
            );

            await interaction.editReply({ embeds: [embed], components: [row] });
        } catch (error) {
            logger.error('Steam', `Game lookup error: ${(error as Error).message}`);
            await interaction.editReply({ embeds: [this._errorEmbed('Failed to look up the game. Please try again.')] });
        }
    }

    private async _handleFree(interaction: ChatInputCommandInteraction): Promise<void> {
        if (handleSaleCommand) {
            // Override the options to force 0 discount (free games)
            const fakeInteraction = Object.create(interaction);
            fakeInteraction.options = {
                ...interaction.options,
                getInteger: (name: string) => name === 'discount' ? 0 : interaction.options.getInteger(name),
                getBoolean: (name: string) => name === 'detailed' ? false : interaction.options.getBoolean(name),
                getSubcommand: () => 'sale'
            };
            await handleSaleCommand(fakeInteraction);
        } else {
            await this.errorReply(interaction, 'Steam sale handler not available.');
        }
    }

    private async _handleFeatured(interaction: ChatInputCommandInteraction): Promise<void> {
        await interaction.deferReply();

        try {
            const games = await steamService.fetchFeaturedSales();

            if (!games || games.length === 0) {
                await interaction.editReply({ embeds: [this._errorEmbed('No featured deals available right now.')] });
                return;
            }

            const embed = new EmbedBuilder()
                .setColor(0x1b2838)
                .setTitle('⭐ Featured Steam Deals')
                .setDescription(`Showing **${Math.min(games.length, 10)}** featured deals`)
                .setTimestamp()
                .setFooter({ text: 'Steam Featured Deals • Prices in USD' });

            const displayGames = games.slice(0, 10);
            for (const game of displayGames) {
                const originalPrice = game.original_price.toFixed(2);
                const finalPrice = game.final_price.toFixed(2);

                const priceText = game.discount_percent === 100 || finalPrice === '0.00'
                    ? `~~$${originalPrice}~~ → **FREE** (100% OFF)`
                    : `~~$${originalPrice}~~ → **$${finalPrice}** (**${game.discount_percent}% OFF**)`;

                embed.addFields({
                    name: `🎮 ${game.name}`,
                    value: `${priceText}\n[View on Steam](https://store.steampowered.com/app/${game.id})`,
                    inline: false
                });
            }

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setLabel('Steam Store')
                    .setStyle(ButtonStyle.Link)
                    .setURL('https://store.steampowered.com/specials')
                    .setEmoji('🏪')
            );

            await interaction.editReply({ embeds: [embed], components: [row] });
        } catch (error) {
            logger.error('Steam', `Featured error: ${(error as Error).message}`);
            await interaction.editReply({ embeds: [this._errorEmbed('Failed to fetch featured deals.')] });
        }
    }

    private _errorEmbed(message: string): EmbedBuilder {
        return new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('❌ Error')
            .setDescription(message)
            .setTimestamp();
    }
}

export default new SteamCommand();
