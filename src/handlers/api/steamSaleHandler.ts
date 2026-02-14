/**
 * Steam Sale Handler
 * Handles Steam sale command display
 * @module handlers/api/steamSaleHandler
 */

import { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ComponentType,
    ChatInputCommandInteraction,
    Message
} from 'discord.js';
import logger from '../../core/Logger.js';
import steamService from '../../services/api/steamService.js';
// TYPES & INTERFACES
interface SteamGame {
    id: number;
    name: string;
    original_price: number;
    final_price: number;
    discount_percent: number;
    usdPrice?: {
        currency: string;
        initial: number;
        final: number;
        discount_percent: number;
    };
    owners?: string;
    positive?: number;
    negative?: number;
}

interface SaleState {
    games: SteamGame[];
    currentPage: number;
    minDiscount: number;
    showDetailed: boolean;
}
// CONSTANTS
const ITEMS_PER_PAGE = 5;
const COLLECTOR_TIMEOUT = 300000; // 5 minutes
// COMMAND HANDLER
async function handleSaleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const minDiscount = interaction.options.getInteger('discount') || 0;
    const showDetailed = interaction.options.getBoolean('detailed') || false;

    await interaction.deferReply();
    await interaction.editReply({ content: '🔍 Searching Steam store for games on sale...' });

    try {
        let allGames: SteamGame[] = await steamService.fetchSteamSales();

        // Fallback to featured if no games found
        if (allGames.length === 0) {
            allGames = await steamService.fetchFeaturedSales();
        }

        if (allGames.length === 0) {
            await interaction.editReply({
                content: '❌ Unable to fetch Steam sales data. Please try again later.'
            });
            return;
        }

        logger.info('SteamSale', `Found ${allGames.length} total games on sale`);

        const filteredGames = steamService.filterGamesByDiscount(allGames, minDiscount);

        if (filteredGames.length === 0) {
            const embed = new EmbedBuilder()
                .setColor(0x1b2838)
                .setTitle('🎮 No Games Found')
                .setDescription(minDiscount === 0
                    ? 'No games are currently free (100% off).'
                    : `No games found with at least ${minDiscount}% discount.`)
                .setFooter({ text: 'Try a lower discount percentage' })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed], content: '' });
            return;
        }

        // Enrich with USD prices
        const enrichedGames: SteamGame[] = filteredGames.map((game: SteamGame) => ({
            ...game,
            usdPrice: {
                currency: 'USD',
                initial: game.original_price,
                final: game.final_price,
                discount_percent: game.discount_percent
            }
        }));

        // Fetch detailed info if requested
        if (showDetailed) {
            await interaction.editReply({ content: '📊 Fetching detailed stats from SteamSpy...' });
            await enrichWithSteamSpyData(enrichedGames.slice(0, 15));
        }

        const state: SaleState = {
            games: enrichedGames,
            currentPage: 0,
            minDiscount,
            showDetailed
        };

        const totalPages = Math.ceil(enrichedGames.length / ITEMS_PER_PAGE);
        const embed = generateSaleEmbed(state);
        const components = totalPages > 1 ? [createPaginationButtons(0, totalPages, interaction.user.id)] : [];

        const message = await interaction.editReply({ content: '', embeds: [embed], components }) as Message;

        if (totalPages <= 1) return;

        setupCollector(message, interaction.user.id, state);

    } catch (error) {
        logger.error('SteamSale', `Command error: ${(error as Error).message}`);
        await interaction.editReply({
            content: '❌ An error occurred while fetching Steam sales. Please try again later.'
        });
    }
}
// HELPER FUNCTIONS
async function enrichWithSteamSpyData(games: SteamGame[]): Promise<void> {
    for (const game of games) {
        const spyData = await steamService.getSteamSpyData(game.id);
        if (spyData) {
            game.owners = spyData.owners;
            game.positive = spyData.positive;
            game.negative = spyData.negative;
        }
        await new Promise(resolve => setTimeout(resolve, 300));
    }
}

function generateSaleEmbed(state: SaleState): EmbedBuilder {
    const { games, currentPage, minDiscount, showDetailed } = state;
    const totalPages = Math.ceil(games.length / ITEMS_PER_PAGE);
    const start = currentPage * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    const gamesOnPage = games.slice(start, end);

    const embed = new EmbedBuilder()
        .setColor(0x1b2838)
        .setTitle(minDiscount === 0 ? '🆓 Free Games on Steam' : `💰 Steam Games (${minDiscount}%+ Off)`)
        .setDescription(
            minDiscount === 0
                ? `Games that are currently free! (Page ${currentPage + 1}/${totalPages})`
                : `Found ${games.length} game(s) with ${minDiscount}% or more discount (Page ${currentPage + 1}/${totalPages})`
        )
        .setTimestamp()
        .setFooter({
            text: `Steam Deal Hunter • Prices in USD • Page ${currentPage + 1}/${totalPages}${showDetailed && currentPage === 0 ? ' • Enhanced with SteamSpy' : ''}`
        });

    gamesOnPage.forEach(game => {
        const usdPrice = game.usdPrice!;
        const originalPrice = usdPrice.initial.toFixed(2);
        const finalPrice = usdPrice.final.toFixed(2);

        let priceText = usdPrice.discount_percent === 100 || finalPrice === '0.00'
            ? `~~$${originalPrice}~~ → **FREE** (100% OFF)`
            : `~~$${originalPrice}~~ → **$${finalPrice}** (${usdPrice.discount_percent}% OFF)`;

        let additionalInfo = '';
        if (showDetailed && game.owners) {
            const totalReviews = (game.positive || 0) + (game.negative || 0);
            const rating = totalReviews > 0 ? Math.round((game.positive! / totalReviews) * 100) : 0;

            additionalInfo += `\n📊 Owners: ${steamService.formatOwners(game.owners)}`;
            if (totalReviews > 0) {
                const emoji = rating >= 80 ? '👍' : rating >= 60 ? '👌' : '👎';
                additionalInfo += ` | ${emoji} ${rating}% (${totalReviews.toLocaleString()} reviews)`;
            }
        }

        embed.addFields({
            name: game.name,
            value: `${priceText}${additionalInfo}\n[View on Steam](https://store.steampowered.com/app/${game.id})`,
            inline: false
        });
    });

    return embed;
}

function createPaginationButtons(
    currentPage: number, 
    totalPages: number, 
    userId: string, 
    disabled: boolean = false
): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`steam_sale_prev_${userId}`)
            .setLabel('◀ Previous')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(disabled || currentPage === 0),
        new ButtonBuilder()
            .setCustomId(`steam_sale_page_${userId}`)
            .setLabel(`Page ${currentPage + 1}/${totalPages}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`steam_sale_next_${userId}`)
            .setLabel('Next ▶')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(disabled || currentPage >= totalPages - 1)
    );
}

function setupCollector(message: Message, userId: string, state: SaleState): void {
    const totalPages = Math.ceil(state.games.length / ITEMS_PER_PAGE);

    const collector = message.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: COLLECTOR_TIMEOUT
    });

    collector.on('collect', async (buttonInteraction) => {
        if (buttonInteraction.user.id !== userId) {
            await buttonInteraction.reply({
                content: '❌ This is not your command! Run `/steam sale` yourself.',
                ephemeral: true
            });
            return;
        }

        if (buttonInteraction.customId.includes('_prev_')) {
            state.currentPage = Math.max(0, state.currentPage - 1);
        } else if (buttonInteraction.customId.includes('_next_')) {
            state.currentPage = Math.min(totalPages - 1, state.currentPage + 1);
        }

        await buttonInteraction.update({
            embeds: [generateSaleEmbed(state)],
            components: [createPaginationButtons(state.currentPage, totalPages, userId)]
        });
    });

    collector.on('end', () => {
        const disabledRow = createPaginationButtons(state.currentPage, totalPages, userId, true);
        message.edit({ components: [disabledRow] }).catch(() => {});
    });
}
// EXPORTS
export { handleSaleCommand };

export type {
    SteamGame,
    SaleState
};
