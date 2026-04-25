import { EmbedBuilder } from 'discord.js';
import nhentaiRepository, { NHentaiFavourite } from '../../../repositories/api/nhentaiRepository.js';
import logger from '../../../core/Logger.js';
import type { FavouritesData, Gallery } from '../../../types/api/nhentai/handler.js';
import { COLORS, truncate } from './utils.js';
import { createFavouritesButtons } from './buttons.js';

export async function handleFavouriteToggle(
    userId: string,
    gallery: Gallery
): Promise<{ added: boolean; removed: boolean; error?: string }> {
    try {
        return await nhentaiRepository.toggleFavourite(userId, gallery);
    } catch (error) {
        logger.error('NHentai', `Error toggling favourite: ${(error as Error).message}`);
        return { added: false, removed: false, error: (error as Error).message };
    }
}

export async function createFavouritesEmbed(userId: string, page: number = 1, perPage: number = 10, sessionId: string = 'latest'): Promise<FavouritesData> {
    const offset = (page - 1) * perPage;
    const { favourites, totalCount } = await nhentaiRepository.getUserFavouritesPage(userId, perPage, offset);
    const totalPages = Math.ceil(totalCount / perPage) || 1;

    const embed = new EmbedBuilder()
        .setColor(COLORS.FAVOURITE)
        .setTitle('❤️ Your NHentai Favourites')
        .setFooter({ text: `Page ${page}/${totalPages} • Total: ${totalCount} favourites` });

    if (favourites.length === 0) {
        embed.setDescription('You have no favourites yet!\nClick the ❤️ button on any gallery to add it.');
    } else {
        let description = '';
        favourites.forEach((fav: NHentaiFavourite, index: number) => {
            const num = offset + index + 1;
            const favTitle = truncate(fav.gallery_title, 40);
            description += `**${num}.** \`${fav.gallery_id}\` - ${favTitle} (${fav.num_pages}p)\n`;
        });
        embed.setDescription(description);
    }

    const buttons = createFavouritesButtons(userId, page, totalPages, favourites, sessionId);

    return { embed, totalPages, totalCount, buttons };
}
