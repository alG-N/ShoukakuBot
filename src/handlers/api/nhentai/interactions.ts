import {
    ActionRowBuilder,
    AttachmentBuilder,
    ButtonBuilder,
    ButtonInteraction,
    EmbedBuilder,
    ModalBuilder,
    ModalSubmitInteraction,
    TextInputBuilder,
    TextInputStyle
} from 'discord.js';
import logger from '../../../core/Logger.js';
import nhentaiService from '../../../services/api/nhentaiService.js';
import nhentaiRepository, { NHentaiFavourite, NHentaiGallery } from '../../../repositories/api/nhentaiRepository.js';
import type { SearchData } from '../../../types/api/nhentai.js';
import type {
    FavouritesData,
    Gallery,
    PageSession,
    SearchSession
} from '../../../types/api/handlers/nhentai-handler.js';

type GalleryResponseOptions = {
    isRandom?: boolean;
    isPopular?: boolean;
    popularPeriod?: string;
};

export interface NhentaiButtonInteractionDeps {
    sessionTtl: number;
    createErrorEmbed: (message: string) => EmbedBuilder;
    getPageSession: (userId: string) => Promise<PageSession | null>;
    setPageSession: (userId: string, gallery: Gallery, currentPage?: number) => Promise<void>;
    updatePageSession: (userId: string, currentPage: number) => Promise<void>;
    createPageResponse: (gallery: Gallery, pageNum: number) => Promise<{ embed: EmbedBuilder; files: AttachmentBuilder[] }>;
    createPageButtons: (galleryId: number, userId: string, currentPage: number, totalPages: number) => ActionRowBuilder<ButtonBuilder>[];
    createGalleryResponse: (gallery: Gallery, options?: GalleryResponseOptions) => Promise<{ embed: EmbedBuilder; files: AttachmentBuilder[] }>;
    createMainButtons: (galleryId: number, userId: string, numPages: number, gallery?: Gallery | null) => Promise<ActionRowBuilder<ButtonBuilder>[]>;
    getSearchSession: (userId: string) => Promise<SearchSession | null>;
    setSearchSession: (userId: string, data: Partial<SearchSession>) => Promise<void>;
    createSearchResultsEmbed: (query: string, data: SearchData, page: number, sort: string) => EmbedBuilder;
    createSearchButtons: (query: string, data: SearchData, page: number, userId: string) => ActionRowBuilder<ButtonBuilder>[];
    createFavouritesEmbed: (userId: string, page: number) => Promise<FavouritesData>;
    createFavouritesButtons: (userId: string, currentPage: number, totalPages: number, favourites: NHentaiFavourite[]) => ActionRowBuilder<ButtonBuilder>[];
}

export async function handleNhentaiButtonInteraction(
    interaction: ButtonInteraction,
    deps: NhentaiButtonInteractionDeps
): Promise<void> {
    const parts = interaction.customId.split('_');
    const action = parts[1];
    const userId = parts[parts.length - 1];

    if (userId !== interaction.user.id) {
        await interaction.reply({
            content: '❌ This button is not for you!',
            ephemeral: true
        });
        return;
    }

    try {
        if (action === 'jump') {
            const galleryId = parts[2];
            const session = await deps.getPageSession(userId);
            const totalPages = session?.totalPages || 1;

            const modal = new ModalBuilder()
                .setCustomId(`nhentai_jumpmodal_${galleryId}_${userId}`)
                .setTitle('Jump to Page');

            const pageInput = new TextInputBuilder()
                .setCustomId('page_number')
                .setLabel(`Enter page number (1-${totalPages})`)
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('e.g., 10')
                .setRequired(true)
                .setMinLength(1)
                .setMaxLength(5);

            const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(pageInput);
            modal.addComponents(actionRow);

            await interaction.showModal(modal);
            return;
        }

        await interaction.deferUpdate();

        switch (action) {
            case 'view': {
                const galleryId = parts[2];
                const result = await nhentaiService.fetchGallery(galleryId);
                if (!result.success || !result.data) {
                    await interaction.editReply({
                        embeds: [deps.createErrorEmbed('Gallery not found')],
                        components: []
                    });
                    return;
                }
                const gallery = result.data;
                const { embed, files } = await deps.createGalleryResponse(gallery);
                const rows = await deps.createMainButtons(gallery.id, userId, gallery.num_pages, gallery);
                await interaction.editReply({ embeds: [embed], components: rows, files });
                break;
            }

            case 'read': {
                const galleryId = parts[2];
                const session = await deps.getPageSession(userId);
                let gallery: Gallery | undefined = session?.gallery;

                if (!gallery || gallery.id !== parseInt(galleryId)) {
                    const result = await nhentaiService.fetchGallery(galleryId);
                    if (!result.success || !result.data) {
                        await interaction.editReply({
                            embeds: [deps.createErrorEmbed('Gallery not found')],
                            components: []
                        });
                        return;
                    }
                    gallery = result.data as Gallery;
                    await deps.setPageSession(userId, gallery, 1);
                }

                const { embed: pageEmbed, files: pageFiles } = await deps.createPageResponse(gallery, 1);
                const pageRows = deps.createPageButtons(parseInt(galleryId), userId, 1, gallery.num_pages);
                await interaction.editReply({ embeds: [pageEmbed], components: pageRows, files: pageFiles });
                break;
            }

            case 'prev':
            case 'next':
            case 'first':
            case 'last': {
                const session = await deps.getPageSession(userId);
                if (!session) {
                    await interaction.editReply({
                        embeds: [deps.createErrorEmbed('Session expired. Please start again.')],
                        components: []
                    });
                    return;
                }

                let newPage = session.currentPage;
                if (action === 'prev') newPage = Math.max(1, newPage - 1);
                else if (action === 'next') newPage = Math.min(session.totalPages, newPage + 1);
                else if (action === 'first') newPage = 1;
                else if (action === 'last') newPage = session.totalPages;

                await deps.updatePageSession(userId, newPage);
                const { embed: pageEmbed, files: pageFiles } = await deps.createPageResponse(session.gallery, newPage);
                const pageRows = deps.createPageButtons(session.galleryId, userId, newPage, session.totalPages);
                await interaction.editReply({ embeds: [pageEmbed], components: pageRows, files: pageFiles });
                break;
            }

            case 'info': {
                const galleryId = parts[2];
                const result = await nhentaiService.fetchGallery(galleryId);
                if (!result.success || !result.data) {
                    await interaction.editReply({
                        embeds: [deps.createErrorEmbed('Gallery not found')],
                        components: []
                    });
                    return;
                }
                const gallery = result.data;
                const { embed, files } = await deps.createGalleryResponse(gallery);
                const rows = await deps.createMainButtons(parseInt(galleryId), userId, gallery.num_pages, gallery);
                await interaction.editReply({ embeds: [embed], components: rows, files });
                break;
            }

            case 'fav': {
                const galleryId = parts[2];
                const session = await deps.getPageSession(userId);
                let gallery: Gallery | undefined = session?.gallery;

                if (!gallery || gallery.id !== parseInt(galleryId)) {
                    const result = await nhentaiService.fetchGallery(galleryId);
                    if (!result.success || !result.data) {
                        await interaction.followUp({ content: '❌ Gallery not found', ephemeral: true });
                        return;
                    }
                    gallery = result.data as Gallery;
                }

                const isFav = await nhentaiRepository.isFavourited(userId, parseInt(galleryId));
                if (isFav) {
                    await nhentaiRepository.removeFavourite(userId, parseInt(galleryId));
                    await interaction.followUp({ content: '💔 Removed from favourites', ephemeral: true });
                } else {
                    if (!gallery) {
                        await interaction.followUp({ content: '❌ Cannot add to favourites - gallery data unavailable', ephemeral: true });
                        return;
                    }
                    await nhentaiRepository.addFavourite(userId, gallery as NHentaiGallery);
                    await interaction.followUp({ content: '❤️ Added to favourites!', ephemeral: true });
                }
                break;
            }

            case 'sprev':
            case 'snext': {
                const searchSession = await deps.getSearchSession(userId);
                if (!searchSession) {
                    await interaction.editReply({
                        embeds: [deps.createErrorEmbed('Search session expired. Please search again.')],
                        components: []
                    });
                    return;
                }

                const newPage = action === 'sprev'
                    ? Math.max(1, (searchSession.currentPage || 1) - 1)
                    : Math.min(searchSession.numPages || 1, (searchSession.currentPage || 1) + 1);

                const searchResult = await nhentaiService.searchGalleries(searchSession.query || '', newPage, searchSession.sort as 'popular' | 'recent' || 'popular');
                if (!searchResult.success || !searchResult.data || searchResult.data.results.length === 0) {
                    await interaction.editReply({
                        embeds: [deps.createErrorEmbed('No results found')],
                        components: []
                    });
                    return;
                }

                await deps.setSearchSession(userId, { ...searchSession, currentPage: newPage, results: searchResult.data.results });
                const embed = deps.createSearchResultsEmbed(searchSession.query || '', searchResult.data, newPage, searchSession.sort || 'popular');
                const rows = deps.createSearchButtons(searchSession.query || '', searchResult.data, newPage, userId);
                await interaction.editReply({ embeds: [embed], components: rows });
                break;
            }

            case 'favpage': {
                const direction = parts[2];
                const searchSession = await deps.getSearchSession(userId);
                const currentPage = searchSession?.favPage || 1;
                const newPage = direction === 'prev'
                    ? Math.max(1, currentPage - 1)
                    : currentPage + 1;

                const { embed, totalPages } = await deps.createFavouritesEmbed(userId, newPage);
                if (newPage > totalPages) {
                    await interaction.followUp({ content: '❌ No more pages', ephemeral: true });
                    return;
                }

                const favourites = await nhentaiRepository.getUserFavourites(userId, 10, (newPage - 1) * 10);
                const rows = deps.createFavouritesButtons(userId, newPage, totalPages, favourites);
                await deps.setSearchSession(userId, { ...searchSession, favPage: newPage });
                await interaction.editReply({ embeds: [embed], components: rows });
                break;
            }

            case 'random': {
                const result = await nhentaiService.fetchRandomGallery();
                if (!result.success || !result.data) {
                    await interaction.editReply({
                        embeds: [deps.createErrorEmbed('Could not fetch random gallery')],
                        components: []
                    });
                    return;
                }
                const gallery = result.data;
                const { embed, files } = await deps.createGalleryResponse(gallery, { isRandom: true });
                const rows = await deps.createMainButtons(gallery.id, userId, gallery.num_pages, gallery);
                await interaction.editReply({ embeds: [embed], components: rows, files });
                break;
            }

            case 'popular': {
                const result = await nhentaiService.fetchPopularGallery();
                if (!result.success || !result.data) {
                    await interaction.editReply({
                        embeds: [deps.createErrorEmbed('Could not fetch popular gallery')],
                        components: []
                    });
                    return;
                }
                const gallery = result.data;
                const { embed, files } = await deps.createGalleryResponse(gallery, { isPopular: true });
                const rows = await deps.createMainButtons(gallery.id, userId, gallery.num_pages, gallery);
                await interaction.editReply({ embeds: [embed], components: rows, files });
                break;
            }

            case 'myfavs': {
                const { embed, totalPages, totalCount } = await deps.createFavouritesEmbed(userId, 1);
                if (totalCount === 0) {
                    await interaction.editReply({ embeds: [embed], components: [] });
                    return;
                }
                const favourites = await nhentaiRepository.getUserFavourites(userId, 10, 0);
                const rows = deps.createFavouritesButtons(userId, 1, totalPages, favourites);
                await deps.setSearchSession(userId, { favPage: 1, expiresAt: Date.now() + deps.sessionTtl * 1000 });
                await interaction.editReply({ embeds: [embed], components: rows });
                break;
            }

            case 'randfav': {
                const favourites = await nhentaiRepository.getUserFavourites(userId, 100, 0);
                if (favourites.length === 0) {
                    await interaction.followUp({ content: '❌ You have no favourites yet!', ephemeral: true });
                    return;
                }
                const randomFav = favourites[Math.floor(Math.random() * favourites.length)];
                const result = await nhentaiService.fetchGallery(randomFav.gallery_id);
                if (!result.success || !result.data) {
                    await interaction.editReply({
                        embeds: [deps.createErrorEmbed('Gallery not found')],
                        components: []
                    });
                    return;
                }
                const gallery = result.data;
                const { embed, files } = await deps.createGalleryResponse(gallery);
                const rows = await deps.createMainButtons(gallery.id, userId, gallery.num_pages, gallery);
                await interaction.editReply({ embeds: [embed], components: rows, files });
                break;
            }

            default:
                await interaction.followUp({ content: '❌ Unknown action', ephemeral: true });
        }
    } catch (error) {
        logger.error('NHentai', `Button error: ${(error as Error).message}`);
        await interaction.followUp?.({
            content: '❌ An error occurred. Please try again.',
            ephemeral: true
        }).catch(() => {});
    }
}

export interface NhentaiModalInteractionDeps {
    createPageResponse: (gallery: Gallery, pageNum: number) => Promise<{ embed: EmbedBuilder; files: AttachmentBuilder[] }>;
    createPageButtons: (galleryId: number, userId: string, currentPage: number, totalPages: number) => ActionRowBuilder<ButtonBuilder>[];
}

export async function handleNhentaiModalInteraction(
    interaction: ModalSubmitInteraction,
    deps: NhentaiModalInteractionDeps
): Promise<void> {
    const parts = interaction.customId.split('_');
    if (parts[1] !== 'jumpmodal') return;

    const galleryId = parseInt(parts[2]);
    const userId = parts[3];

    if (interaction.user.id !== userId) {
        await interaction.reply({
            content: '❌ This is not your gallery view.',
            ephemeral: true
        });
        return;
    }

    const pageInput = interaction.fields.getTextInputValue('page_number');
    const targetPage = parseInt(pageInput);

    if (isNaN(targetPage) || targetPage < 1) {
        await interaction.reply({
            content: '❌ Please enter a valid page number.',
            ephemeral: true
        });
        return;
    }

    await interaction.deferUpdate();

    try {
        const result = await nhentaiService.fetchGallery(galleryId);
        if (!result.success || !result.data) {
            await interaction.followUp({
                content: '❌ Gallery not found.',
                ephemeral: true
            });
            return;
        }

        const gallery = result.data;
        const totalPages = gallery.num_pages || 1;
        const clampedPage = Math.max(1, Math.min(targetPage, totalPages));

        const { embed, files } = await deps.createPageResponse(gallery, clampedPage);
        const buttons = deps.createPageButtons(galleryId, userId, clampedPage, totalPages);

        await interaction.editReply({ embeds: [embed], components: buttons, files });
    } catch (error) {
        logger.error('NHentai', `Modal error: ${(error as Error).message}`);
        await interaction.followUp?.({
            content: '❌ Failed to jump to page. Please try again.',
            ephemeral: true
        }).catch(() => {});
    }
}