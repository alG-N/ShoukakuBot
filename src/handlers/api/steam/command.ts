import { ChatInputCommandInteraction, EmbedBuilder, Message } from 'discord.js';
import logger from '../../../core/Logger.js';
import steamService from '../../../services/api/steamService.js';
import { createPaginationButtons, enrichWithSteamSpyData, generateSaleEmbed, setupCollector } from './ui.js';
import { ITEMS_PER_PAGE } from './constants.js';
import type { SaleState } from '../../../types/api/handlers/steam-sale-handler.js';
import type { SteamGame } from '../../../types/api/steam.js';

export async function handleSaleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const minDiscount = interaction.options.getInteger('discount') || 0;
    const showDetailed = interaction.options.getBoolean('detailed') || false;

    await interaction.deferReply();
    await interaction.editReply({ content: '🔍 Searching Steam store for games on sale...' });

    try {
        let allGames: SteamGame[] = await steamService.fetchSteamSales();

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

        const enrichedGames: SteamGame[] = filteredGames.map((game: SteamGame) => ({
            ...game,
            usdPrice: {
                currency: 'USD',
                initial: game.original_price,
                final: game.final_price,
                discount_percent: game.discount_percent
            }
        }));

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
