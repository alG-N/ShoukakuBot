import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import nhentaiRepository, { NHentaiFavourite } from '../../../repositories/api/nhentaiRepository.js';
import type { SearchData } from '../../../types/api/models/nhentai.js';
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
    gallery: Gallery | null = null,
    sessionId: string = 'latest'
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
            .setCustomId(`nhentai_read_${galleryId}_${sessionId}_${userId}`)
            .setLabel(`Read (${numPages} pages)`)
            .setStyle(ButtonStyle.Success)
            .setEmoji('📖'),
        new ButtonBuilder()
            .setCustomId(`nhentai_fav_${galleryId}_${sessionId}_${userId}`)
            .setLabel(isFavourited ? 'Unfavourite' : 'Favourite')
            .setStyle(isFavourited ? ButtonStyle.Danger : ButtonStyle.Secondary)
            .setEmoji(isFavourited ? '💔' : '❤️'),
        new ButtonBuilder()
            .setCustomId(`nhentai_random_${sessionId}_${userId}`)
            .setLabel('Random')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🎲'),
        new ButtonBuilder()
            .setCustomId(`nhentai_popular_${sessionId}_${userId}`)
            .setLabel('Popular')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🔥'),
        new ButtonBuilder()
            .setCustomId(`nhentai_translate_${galleryId}_${sessionId}_${userId}`)
            .setLabel('Translation')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🌐')
            .setDisabled(translationDisabled)
    );

    return [row1];
}

export function createFavouritesButtons(
    userId: string,
    currentPage: number,
    totalPages: number,
    favourites: NHentaiFavourite[],
    sessionId: string = 'latest'
): ActionRowBuilder<ButtonBuilder>[] {
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];

    if (favourites.length > 0) {
        const row1 = new ActionRowBuilder<ButtonBuilder>();
        const firstFive = favourites.slice(0, 5);
        firstFive.forEach((fav, index) => {
            row1.addComponents(
                new ButtonBuilder()
                    .setCustomId(`nhentai_view_${fav.gallery_id}_${sessionId}_${userId}`)
                    .setLabel(`${index + 1}`)
                    .setStyle(ButtonStyle.Secondary)
            );
        });
        rows.push(row1);
    }

    const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`nhentai_favpage_prev_${sessionId}_${userId}`)
            .setLabel('Prev')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('◀️')
            .setDisabled(currentPage <= 1),
        new ButtonBuilder()
            .setCustomId(`nhentai_favpage_num_${sessionId}_${userId}`)
            .setLabel(`${currentPage}/${totalPages}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`nhentai_favpage_next_${sessionId}_${userId}`)
            .setLabel('Next')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('▶️')
            .setDisabled(currentPage >= totalPages),
        new ButtonBuilder()
            .setCustomId(`nhentai_random_${sessionId}_${userId}`)
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
    totalPages: number,
    sessionId: string = 'latest'
): ActionRowBuilder<ButtonBuilder>[] {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`nhentai_first_${galleryId}_${currentPage}_${sessionId}_${userId}`)
            .setLabel('First')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('⏮️')
            .setDisabled(currentPage <= 1),
        new ButtonBuilder()
            .setCustomId(`nhentai_prev_${galleryId}_${currentPage}_${sessionId}_${userId}`)
            .setLabel('Prev')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('◀️')
            .setDisabled(currentPage <= 1),
        new ButtonBuilder()
            .setCustomId(`nhentai_page_${galleryId}_${currentPage}_${sessionId}_${userId}`)
            .setLabel(`${currentPage}/${totalPages}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`nhentai_next_${galleryId}_${currentPage}_${sessionId}_${userId}`)
            .setLabel('Next')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('▶️')
            .setDisabled(currentPage >= totalPages),
        new ButtonBuilder()
            .setCustomId(`nhentai_last_${galleryId}_${currentPage}_${sessionId}_${userId}`)
            .setLabel('Last')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('⏭️')
            .setDisabled(currentPage >= totalPages)
    );

    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`nhentai_jump_${galleryId}_${sessionId}_${userId}`)
            .setLabel('Jump to Page')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🔢'),
        new ButtonBuilder()
            .setCustomId(`nhentai_info_${galleryId}_${sessionId}_${userId}`)
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

export function createSearchButtons(_query: string, data: SearchData, page: number, userId: string, sessionId: string = 'latest'): ActionRowBuilder<ButtonBuilder>[] {
    const { results, numPages, totalResults } = data;

    const row1 = new ActionRowBuilder<ButtonBuilder>();
    const firstFive = results.slice(0, 5);
    firstFive.forEach((gallery, index) => {
        row1.addComponents(
            new ButtonBuilder()
                .setCustomId(`nhentai_view_${gallery.id}_${sessionId}_${userId}`)
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
                    .setCustomId(`nhentai_view_${gallery.id}_${sessionId}_${userId}`)
                    .setLabel(`${index + 6}`)
                    .setStyle(ButtonStyle.Secondary)
            );
        });
    }

    const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`nhentai_sprev_${sessionId}_${userId}`)
            .setLabel('Prev Page')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('◀️')
            .setDisabled(page <= 1),
        new ButtonBuilder()
            .setCustomId(`nhentai_spage_${sessionId}_${userId}`)
            .setLabel(`${page}/${numPages}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`nhentai_snext_${sessionId}_${userId}`)
            .setLabel('Next Page')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('▶️')
            .setDisabled(page >= numPages),
        new ButtonBuilder()
            .setCustomId(`nhentai_scount_${sessionId}_${userId}`)
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
