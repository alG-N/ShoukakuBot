import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import nhentaiRepository, { NHentaiFavourite } from '../../../repositories/api/nhentaiRepository.js';
import type { SearchData } from '../../../types/api/nhentai.js';
import type { Gallery } from '../../../types/api/handlers/nhentai-handler.js';

function isEnglishGallery(gallery: Gallery | null): boolean {
    if (!gallery?.tags) return false;
    const languageTags = gallery.tags
        .filter(tag => tag.type === 'language')
        .map(tag => tag.name.toLowerCase());
    return languageTags.includes('english');
}

export async function createMainButtons(
    galleryId: number,
    userId: string,
    numPages: number,
    gallery: Gallery | null = null
): Promise<ActionRowBuilder<ButtonBuilder>[]> {
    let isFavourited = false;
    try {
        isFavourited = await nhentaiRepository.isFavourited(userId, galleryId);
    } catch {
        // ignore
    }

    const translationDisabled = isEnglishGallery(gallery);

    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setLabel('View on nhentai')
            .setStyle(ButtonStyle.Link)
            .setURL(`https://nhentai.net/g/${galleryId}/`)
            .setEmoji('🔗'),
        new ButtonBuilder()
            .setCustomId(`nhentai_read_${galleryId}_${userId}`)
            .setLabel(`Read (${numPages} pages)`)
            .setStyle(ButtonStyle.Success)
            .setEmoji('📖'),
        new ButtonBuilder()
            .setCustomId(`nhentai_fav_${galleryId}_${userId}`)
            .setLabel(isFavourited ? 'Unfavourite' : 'Favourite')
            .setStyle(isFavourited ? ButtonStyle.Danger : ButtonStyle.Secondary)
            .setEmoji(isFavourited ? '💔' : '❤️'),
        new ButtonBuilder()
            .setCustomId(`nhentai_random_${userId}`)
            .setLabel('Random')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🎲')
    );

    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`nhentai_popular_${userId}`)
            .setLabel('Popular')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🔥'),
        new ButtonBuilder()
            .setCustomId(`nhentai_translate_${galleryId}_${userId}`)
            .setLabel('Translation')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🌐')
            .setDisabled(translationDisabled),
        new ButtonBuilder()
            .setCustomId(`nhentai_myfavs_${userId}`)
            .setLabel('My Favourites')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📚'),
        new ButtonBuilder()
            .setCustomId(`nhentai_settings_${userId}`)
            .setLabel('Settings')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('⚙️')
    );

    return [row1, row2];
}

export function createFavouritesButtons(
    userId: string,
    currentPage: number,
    totalPages: number,
    favourites: NHentaiFavourite[]
): ActionRowBuilder<ButtonBuilder>[] {
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];

    if (favourites.length > 0) {
        const row1 = new ActionRowBuilder<ButtonBuilder>();
        const firstFive = favourites.slice(0, 5);
        firstFive.forEach((fav, index) => {
            row1.addComponents(
                new ButtonBuilder()
                    .setCustomId(`nhentai_view_${fav.gallery_id}_${userId}`)
                    .setLabel(`${index + 1}`)
                    .setStyle(ButtonStyle.Secondary)
            );
        });
        rows.push(row1);
    }

    const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`nhentai_favpage_prev_${userId}`)
            .setLabel('Prev')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('◀️')
            .setDisabled(currentPage <= 1),
        new ButtonBuilder()
            .setCustomId(`nhentai_favpage_num_${userId}`)
            .setLabel(`${currentPage}/${totalPages}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`nhentai_favpage_next_${userId}`)
            .setLabel('Next')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('▶️')
            .setDisabled(currentPage >= totalPages),
        new ButtonBuilder()
            .setCustomId(`nhentai_random_${userId}`)
            .setLabel('Random')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🎲')
    );
    rows.push(navRow);

    return rows;
}

export function createPageButtons(
    galleryId: number,
    userId: string,
    currentPage: number,
    totalPages: number
): ActionRowBuilder<ButtonBuilder>[] {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`nhentai_first_${galleryId}_${userId}`)
            .setLabel('First')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('⏮️')
            .setDisabled(currentPage <= 1),
        new ButtonBuilder()
            .setCustomId(`nhentai_prev_${galleryId}_${userId}`)
            .setLabel('Prev')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('◀️')
            .setDisabled(currentPage <= 1),
        new ButtonBuilder()
            .setCustomId(`nhentai_page_${galleryId}_${userId}`)
            .setLabel(`${currentPage}/${totalPages}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`nhentai_next_${galleryId}_${userId}`)
            .setLabel('Next')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('▶️')
            .setDisabled(currentPage >= totalPages),
        new ButtonBuilder()
            .setCustomId(`nhentai_last_${galleryId}_${userId}`)
            .setLabel('Last')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('⏭️')
            .setDisabled(currentPage >= totalPages)
    );

    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`nhentai_jump_${galleryId}_${userId}`)
            .setLabel('Jump to Page')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🔢'),
        new ButtonBuilder()
            .setCustomId(`nhentai_info_${galleryId}_${userId}`)
            .setLabel('Gallery Info')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('ℹ️'),
        new ButtonBuilder()
            .setLabel('Open Page')
            .setStyle(ButtonStyle.Link)
            .setURL(`https://nhentai.net/g/${galleryId}/${currentPage}/`)
            .setEmoji('🔗')
    );

    return [row, row2];
}

export function createSearchButtons(_query: string, data: SearchData, page: number, userId: string): ActionRowBuilder<ButtonBuilder>[] {
    const { results, numPages, totalResults } = data;

    const row1 = new ActionRowBuilder<ButtonBuilder>();
    const firstFive = results.slice(0, 5);
    firstFive.forEach((gallery, index) => {
        row1.addComponents(
            new ButtonBuilder()
                .setCustomId(`nhentai_view_${gallery.id}_${userId}`)
                .setLabel(`${index + 1}`)
                .setStyle(ButtonStyle.Secondary)
        );
    });

    const row2 = new ActionRowBuilder<ButtonBuilder>();
    const secondFive = results.slice(5, 10);
    if (secondFive.length > 0) {
        secondFive.forEach((gallery, index) => {
            row2.addComponents(
                new ButtonBuilder()
                    .setCustomId(`nhentai_view_${gallery.id}_${userId}`)
                    .setLabel(`${index + 6}`)
                    .setStyle(ButtonStyle.Secondary)
            );
        });
    }

    const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`nhentai_sprev_${userId}`)
            .setLabel('Prev Page')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('◀️')
            .setDisabled(page <= 1),
        new ButtonBuilder()
            .setCustomId(`nhentai_spage_${userId}`)
            .setLabel(`${page}/${numPages}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`nhentai_snext_${userId}`)
            .setLabel('Next Page')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('▶️')
            .setDisabled(page >= numPages),
        new ButtonBuilder()
            .setCustomId(`nhentai_scount_${userId}`)
            .setLabel(`${totalResults}+ results`)
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📊')
            .setDisabled(true)
    );

    const rows = [row1];
    if (secondFive.length > 0) rows.push(row2);
    rows.push(row3);

    return rows;
}
