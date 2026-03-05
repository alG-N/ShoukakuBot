import { EmbedBuilder } from 'discord.js';
import nhentaiRepository, { NHentaiFavourite } from '../../../repositories/api/nhentaiRepository.js';
import logger from '../../../core/Logger.js';
import type { Gallery, FavouritesData } from '../../../types/api/handlers/nhentai-handler.js';
import { COLORS, truncate } from './utils.js';

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

export async function createFavouritesEmbed(userId: string, page: number = 1, perPage: number = 10): Promise<FavouritesData> {
    const offset = (page - 1) * perPage;
    const favourites = await nhentaiRepository.getUserFavourites(userId, perPage, offset);
    const totalCount = await nhentaiRepository.getFavouritesCount(userId);
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

    return { embed, totalPages, totalCount };
}
