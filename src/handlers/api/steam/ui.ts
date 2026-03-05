import {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    Message
} from 'discord.js';
import steamService from '../../../services/api/steamService.js';
import type { SaleState } from '../../../types/api/handlers/steam-sale-handler.js';
import type { SteamGame } from '../../../types/api/steam.js';
import { COLLECTOR_TIMEOUT, ITEMS_PER_PAGE } from './constants.js';

export async function enrichWithSteamSpyData(games: SteamGame[]): Promise<void> {
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

export function generateSaleEmbed(state: SaleState): EmbedBuilder {
    const { games, currentPage, minDiscount, showDetailed } = state;
    const totalPages = Math.ceil(games.length / ITEMS_PER_PAGE);
    const start = currentPage * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    const gamesOnPage = games.slice(start, end);

    const embed = new EmbedBuilder()
        .setColor(0x1b2838)
        .setAuthor({ name: 'Steam Store', iconURL: 'https://store.steampowered.com/favicon.ico' })
        .setTitle(minDiscount === 0 ? '🆓 Free Games on Steam' : `💰 Steam Sale — ${minDiscount}%+ Off`)
        .setDescription(
            minDiscount === 0
                ? `Found **${games.length}** free game(s)!`
                : `Found **${games.length}** game(s) with **${minDiscount}%+** discount`
        )
        .setTimestamp()
        .setFooter({
            text: `Page ${currentPage + 1}/${totalPages} • ${games.length} games • Prices in USD${showDetailed && currentPage === 0 ? ' • SteamSpy Enhanced' : ''}`
        });

    gamesOnPage.forEach((game, index) => {
        const usdPrice = game.usdPrice!;
        const originalPrice = usdPrice.initial.toFixed(2);
        const finalPrice = usdPrice.final.toFixed(2);
        const gameIndex = start + index + 1;

        const discountBadge = usdPrice.discount_percent === 100 || finalPrice === '0.00'
            ? '🆓'
            : usdPrice.discount_percent >= 75 ? '🔥'
            : usdPrice.discount_percent >= 50 ? '💰'
            : '🏷️';

        const priceText = usdPrice.discount_percent === 100 || finalPrice === '0.00'
            ? `~~$${originalPrice}~~ → **FREE**`
            : `~~$${originalPrice}~~ → **$${finalPrice}** (**-${usdPrice.discount_percent}%**)`;

        let additionalInfo = '';
        if (showDetailed && game.owners) {
            const totalReviews = (game.positive || 0) + (game.negative || 0);
            const rating = totalReviews > 0 ? Math.round((game.positive! / totalReviews) * 100) : 0;

            additionalInfo += `\n📊 ${steamService.formatOwners(game.owners)} owners`;
            if (totalReviews > 0) {
                const emoji = rating >= 80 ? '👍' : rating >= 60 ? '👌' : '👎';
                additionalInfo += ` • ${emoji} ${rating}%`;
            }
        }

        embed.addFields({
            name: `${discountBadge} ${gameIndex}. ${game.name}`,
            value: `${priceText}${additionalInfo}\n[View on Steam](https://store.steampowered.com/app/${game.id})`,
            inline: false
        });
    });

    return embed;
}

export function createPaginationButtons(
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

export function setupCollector(message: Message, userId: string, state: SaleState): void {
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
