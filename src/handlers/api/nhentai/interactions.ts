import {
    ActionRowBuilder,
    AttachmentBuilder,
    ButtonBuilder,
    ButtonInteraction,
    ComponentType,
    EmbedBuilder,
    ModalBuilder,
    ModalSubmitInteraction,
    StringSelectMenuBuilder,
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
    SearchSession,
    UserPreferences
} from '../../../types/api/handlers/nhentai-handler.js';
import { applyTranslatedTitle } from './embeds.js';

type GalleryResponseOptions = {
    isRandom?: boolean;
    isPopular?: boolean;
    popularPeriod?: string;
    spoilerCover?: boolean;
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
    getUserPreferences: (userId: string) => Promise<UserPreferences>;
    setUserPreferences: (userId: string, prefs: Partial<UserPreferences>) => Promise<UserPreferences>;
    createSettingsEmbed: (userId: string, prefs: UserPreferences) => EmbedBuilder;
    createSettingsComponents: (userId: string, prefs: UserPreferences, galleryId?: number | null) => ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[];
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
                const result = await withNhentaiFetchingState(interaction, 'other doujin', async () =>
                    nhentaiService.fetchGallery(galleryId)
                );
                if (!result.success || !result.data) {
                    await interaction.editReply({
                        embeds: [deps.createErrorEmbed(result.error || 'Gallery not found')],
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

                const searchResult = await withNhentaiFetchingState(interaction, 'other doujin', async () =>
                    nhentaiService.searchGalleries(searchSession.query || '', newPage, searchSession.sort as 'popular' | 'recent' || 'popular')
                );
                if (!searchResult.success || !searchResult.data || searchResult.data.results.length === 0) {
                    await interaction.editReply({
                        embeds: [deps.createErrorEmbed(searchResult.error || 'No results found')],
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
                const prefs = await deps.getUserPreferences(userId);
                const result = await withNhentaiFetchingState(interaction, 'other doujin', async () =>
                    nhentaiService.fetchRandomGalleryByPeriod(prefs.randomPeriod)
                , { hideMedia: true });
                if (!result.success || !result.data) {
                    await interaction.editReply({
                        embeds: [deps.createErrorEmbed(result.error || 'Could not fetch random gallery')],
                        components: []
                    });
                    return;
                }
                const gallery = result.data;
                const { embed, files } = await deps.createGalleryResponse(gallery, { isRandom: true, spoilerCover: true });
                const rows = await deps.createMainButtons(gallery.id, userId, gallery.num_pages, gallery);
                await interaction.editReply({ embeds: [embed], components: rows, files });
                break;
            }

            case 'popular': {
                const prefs = await deps.getUserPreferences(userId);
                const result = await withNhentaiFetchingState(interaction, 'other doujin', async () =>
                    nhentaiService.fetchPopularGallery(prefs.popularPeriod)
                , { hideMedia: true });
                if (!result.success || !result.data) {
                    await interaction.editReply({
                        embeds: [deps.createErrorEmbed(result.error || 'Could not fetch popular gallery')],
                        components: []
                    });
                    return;
                }
                const gallery = result.data;
                const periodLabels: Record<UserPreferences['popularPeriod'], string> = {
                    today: 'Today',
                    week: 'This Week',
                    month: 'This Month',
                    all: 'All Time'
                };
                const { embed, files } = await deps.createGalleryResponse(gallery, {
                    isPopular: true,
                    popularPeriod: periodLabels[prefs.popularPeriod] || 'All Time'
                });
                const rows = await deps.createMainButtons(gallery.id, userId, gallery.num_pages, gallery);
                await interaction.editReply({ embeds: [embed], components: rows, files });
                break;
            }

            case 'settings': {
                const prefs = await deps.getUserPreferences(userId);
                const embed = deps.createSettingsEmbed(userId, prefs);
                const settingsGalleryId = extractGalleryIdFromMessage(interaction);
                const rows = deps.createSettingsComponents(userId, prefs, settingsGalleryId);
                await interaction.editReply({ embeds: [embed], components: rows, files: [] });
                break;
            }

            case 'settingsback': {
                const galleryId = Number.parseInt(parts[2] || '', 10);
                if (!Number.isInteger(galleryId) || galleryId <= 0) {
                    await interaction.followUp({
                        content: '❌ Back target not found. Please open a gallery again.',
                        ephemeral: true
                    });
                    break;
                }

                const result = await withNhentaiFetchingState(interaction, 'other doujin', async () =>
                    nhentaiService.fetchGallery(galleryId)
                );
                if (!result.success || !result.data) {
                    await interaction.editReply({
                        embeds: [deps.createErrorEmbed(result.error || 'Gallery not found')],
                        components: []
                    });
                    break;
                }

                const gallery = result.data;
                const { embed, files } = await deps.createGalleryResponse(gallery);
                const rows = await deps.createMainButtons(gallery.id, userId, gallery.num_pages, gallery);
                await interaction.editReply({ embeds: [embed], components: rows, files });
                break;
            }

            case 'translate': {
                const galleryId = parts[2];
                const result = await withNhentaiFetchingState(interaction, 'translation', async () =>
                    nhentaiService.fetchGallery(galleryId)
                );
                if (!result.success || !result.data) {
                    await interaction.editReply({
                        embeds: [deps.createErrorEmbed(result.error || 'Gallery not found')],
                        components: []
                    });
                    return;
                }

                const gallery = result.data;
                const { embed, files } = await deps.createGalleryResponse(gallery);
                const originalTitle = gallery.title.japanese || gallery.title.pretty || gallery.title.english || 'Unknown Title';
                const translatedTitle = await nhentaiService.translateToEnglish(originalTitle);

                const finalEmbed = translatedTitle && translatedTitle.toLowerCase() !== originalTitle.toLowerCase()
                    ? applyTranslatedTitle(embed, originalTitle, translatedTitle)
                    : embed;

                const rows = await deps.createMainButtons(gallery.id, userId, gallery.num_pages, gallery);
                await interaction.editReply({ embeds: [finalEmbed], components: rows, files });
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
                const result = await withNhentaiFetchingState(interaction, 'other doujin', async () =>
                    nhentaiService.fetchGallery(randomFav.gallery_id)
                );
                if (!result.success || !result.data) {
                    await interaction.editReply({
                        embeds: [deps.createErrorEmbed(result.error || 'Gallery not found')],
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

function buildDisabledButtonRows(interaction: ButtonInteraction): ActionRowBuilder<ButtonBuilder>[] {
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];

    for (const row of interaction.message.components) {
        if (row.type !== ComponentType.ActionRow) continue;
        const rowComponents = (row as unknown as { components?: Array<unknown> }).components || [];
        const buttonRow = new ActionRowBuilder<ButtonBuilder>();
        for (const component of rowComponents as Array<any>) {
            if (component.type !== ComponentType.Button) continue;
            buttonRow.addComponents(ButtonBuilder.from(component as any).setDisabled(true));
        }
        if (buttonRow.components.length > 0) rows.push(buttonRow);
    }

    return rows;
}

function buildFetchingEmbed(
    currentEmbed: EmbedBuilder,
    context: string,
    elapsedSec: number,
    totalSec: number = 60,
    hideMedia: boolean = false
): EmbedBuilder {
    const embed = EmbedBuilder.from(currentEmbed);
    const statusLine = `⏳ Shoukaku is fetching ${context}... (${Math.min(elapsedSec, totalSec)}s / ${totalSec}s)`;
    const currentDescription = embed.data.description || '';
    const cleaned = currentDescription.replace(/^⏳ Shoukaku is fetching[^\n]*\n\n?/i, '');
    embed.setDescription(cleaned ? `${statusLine}\n\n${cleaned}` : statusLine);
    if (hideMedia) {
        embed.setImage(null);
        embed.setThumbnail(null);
    }
    return embed;
}

function extractGalleryIdFromMessage(interaction: ButtonInteraction): number | null {
    for (const row of interaction.message.components) {
        if (row.type !== ComponentType.ActionRow) continue;
        const rowComponents = (row as unknown as { components?: Array<{ customId?: string }> }).components || [];
        for (const component of rowComponents) {
            const customId = component?.customId;
            if (!customId) continue;
            const match = customId.match(/^nhentai_(?:read|info|fav|translate|first|prev|next|last|jump|view)_(\d+)_/);
            if (!match || !match[1]) continue;
            const galleryId = Number.parseInt(match[1], 10);
            if (Number.isInteger(galleryId) && galleryId > 0) {
                return galleryId;
            }
        }
    }
    return null;
}

type FetchingStateOptions = {
    hideMedia?: boolean;
};

async function withNhentaiFetchingState<T>(
    interaction: ButtonInteraction,
    context: string,
    task: () => Promise<T>,
    options: FetchingStateOptions = {}
): Promise<T> {
    if (!interaction.message.embeds.length) {
        return task();
    }

    const baseEmbed = EmbedBuilder.from(interaction.message.embeds[0]!);
    const disabledRows = buildDisabledButtonRows(interaction);
    let elapsed = 0;
    let stopped = false;

    const pushStatus = async (): Promise<void> => {
        if (stopped) return;
        const loadingEmbed = buildFetchingEmbed(baseEmbed, context, elapsed, 60, options.hideMedia === true);
        await interaction.editReply({ embeds: [loadingEmbed], components: disabledRows, files: [] }).catch(() => {});
    };

    await pushStatus();

    const timer = setInterval(() => {
        elapsed += 1;
        if (elapsed <= 60) {
            void pushStatus();
        } else {
            clearInterval(timer);
        }
    }, 1000);

    try {
        return await task();
    } finally {
        stopped = true;
        clearInterval(timer);
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