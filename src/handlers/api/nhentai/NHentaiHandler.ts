import {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ButtonInteraction,
    StringSelectMenuBuilder,
    StringSelectMenuInteraction,
    ModalSubmitInteraction,
    AttachmentBuilder
} from 'discord.js';
import type { ParsedTags, SearchData } from '../../../types/api/nhentai.js';
import type {
    Gallery,
    GalleryTitle,
    GalleryTag,
    GalleryImages,
    PageSession,
    SearchSession,
    FavouritesData,
    Favourite,
    UserPreferences
} from '../../../types/api/handlers/nhentai-handler.js';
import { NhentaiCdnClient } from './cdn.js';
import { getExt } from './utils.js';
import {
    clearPageSession,
    getPageSession,
    getSearchSession,
    getUserPreferences,
    setPageSession,
    setSearchSession,
    setUserPreferences,
    updatePageSession
} from './sessionStore.js';
import {
    handleNhentaiButtonInteraction,
    handleNhentaiModalInteraction
} from './interactions.js';
import {
    createCooldownEmbed,
    createErrorEmbed,
    createGalleryEmbed,
    createPageEmbed,
    createSearchResultsEmbed,
    createSettingsEmbed
} from './embeds.js';
import {
    createFavouritesButtons,
    createMainButtons,
    createPageButtons,
    createSearchButtons
} from './buttons.js';
import {
    createFavouritesEmbed,
    handleFavouriteToggle
} from './favourites.js';

export class NHentaiHandler {
    private readonly SESSION_TTL = 1800;
    private readonly cdn = new NhentaiCdnClient();

    async createPageResponse(gallery: Gallery, pageNum: number): Promise<{ embed: EmbedBuilder; files: AttachmentBuilder[] }> {
        const { id, media_id, title, num_pages, images } = gallery;
        const pages = images?.pages || [];

        if (pageNum < 1 || pageNum > pages.length) {
            return { embed: this.createErrorEmbed('Invalid page number.'), files: [] };
        }

        const page = pages[pageNum - 1];
        const ext = getExt(page.t);
        const filename = `page_${pageNum}.${ext}`;

        const embed = new EmbedBuilder()
            .setColor(0xED2553)
            .setAuthor({
                name: title.english || title.japanese || title.pretty || 'Unknown Title',
                url: `https://nhentai.net/g/${id}/`
            })
            .setFooter({ text: `Page ${pageNum}/${num_pages} • ID: ${id}` });

        const pageUrls = this.cdn.getAllPageImageUrls(media_id, pageNum, page.t);
        const imageBuffer = await this.cdn.fetchImageWithRetry(pageUrls);
        const files: AttachmentBuilder[] = [];

        if (imageBuffer) {
            const attachment = new AttachmentBuilder(imageBuffer, { name: filename });
            files.push(attachment);
            embed.setImage(`attachment://${filename}`);
        } else {
            embed.setImage(pageUrls[0]);
        }

        return { embed, files };
    }

    async createGalleryResponse(
        gallery: Gallery,
        options: { isRandom?: boolean; isPopular?: boolean; popularPeriod?: string; spoilerCover?: boolean } = {}
    ): Promise<{ embed: EmbedBuilder; files: AttachmentBuilder[] }> {
        const embed = this.createGalleryEmbed(gallery, options);
        const { media_id, images } = gallery;
        const coverType = images?.cover?.t || 'j';
        const ext = getExt(coverType);
        const filename = options.spoilerCover ? `SPOILER_cover.${ext}` : `cover.${ext}`;

        const coverUrls = this.cdn.getAllThumbnailUrls(media_id, coverType);
        const imageBuffer = await this.cdn.fetchImageWithRetry(coverUrls);
        const files: AttachmentBuilder[] = [];

        if (imageBuffer) {
            const attachment = new AttachmentBuilder(imageBuffer, { name: filename });
            files.push(attachment);
            embed.setThumbnail(`attachment://${filename}`);
        }

        return { embed, files };
    }

    createGalleryEmbed(gallery: Gallery, options: { isRandom?: boolean; isPopular?: boolean; popularPeriod?: string } = {}): EmbedBuilder {
        return createGalleryEmbed(this.cdn, gallery, options);
    }

    createPageEmbed(gallery: Gallery, pageNum: number): EmbedBuilder {
        return createPageEmbed(this.cdn, gallery, pageNum);
    }

    async createMainButtons(
        galleryId: number,
        userId: string,
        numPages: number,
        gallery: Gallery | null = null
    ): Promise<ActionRowBuilder<ButtonBuilder>[]> {
        return createMainButtons(galleryId, userId, numPages, gallery);
    }

    async getUserPreferences(userId: string): Promise<UserPreferences> {
        return getUserPreferences(userId);
    }

    async setUserPreferences(userId: string, prefs: Partial<UserPreferences>): Promise<UserPreferences> {
        return setUserPreferences(userId, prefs);
    }

    createSettingsEmbed(userId: string, prefs: UserPreferences): EmbedBuilder {
        return createSettingsEmbed(userId, prefs);
    }

    createSettingsComponents(
        userId: string,
        prefs: UserPreferences,
        galleryId: number | null = null
    ): ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[] {
        const popularRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`nhentai_setting_popular_${userId}`)
                .setPlaceholder('Select popular timeframe')
                .addOptions(
                    { label: 'Popular Today', value: 'today', emoji: '🔥', default: prefs.popularPeriod === 'today' },
                    { label: 'Popular This Week', value: 'week', emoji: '📊', default: prefs.popularPeriod === 'week' },
                    { label: 'Popular This Month', value: 'month', emoji: '📅', default: prefs.popularPeriod === 'month' },
                    { label: 'All Time Popular', value: 'all', emoji: '🏆', default: prefs.popularPeriod === 'all' }
                )
        );

        const randomRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`nhentai_setting_random_${userId}`)
                .setPlaceholder('Select random pool')
                .addOptions(
                    { label: 'Random from uploads today', value: 'today', emoji: '🔥', default: prefs.randomPeriod === 'today' },
                    { label: 'Random from uploads this week', value: 'week', emoji: '📊', default: prefs.randomPeriod === 'week' },
                    { label: 'Random from uploads this month', value: 'month', emoji: '📅', default: prefs.randomPeriod === 'month' },
                    { label: 'Random from all uploads', value: 'all', emoji: '🏆', default: prefs.randomPeriod === 'all' }
                )
        );

        const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(`nhentai_settingsback_${galleryId ?? 0}_${userId}`)
                .setLabel('Back')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('↩️')
                .setDisabled(!galleryId)
        );

        return [popularRow, randomRow, backRow];
    }

    private extractSettingsGalleryId(interaction: StringSelectMenuInteraction): number | null {
        for (const row of interaction.message.components) {
            const rowComponents = (row as unknown as { components?: Array<{ customId?: string }> }).components || [];
            for (const component of rowComponents) {
                const customId = component?.customId;
                if (!customId || !customId.startsWith('nhentai_settingsback_')) continue;
                const match = customId.match(/^nhentai_settingsback_(\d+)_/);
                if (!match || !match[1]) continue;
                const galleryId = Number.parseInt(match[1], 10);
                return Number.isInteger(galleryId) && galleryId > 0 ? galleryId : null;
            }
        }
        return null;
    }

    async handleFavouriteToggle(
        userId: string,
        _galleryId: string,
        gallery: Gallery
    ): Promise<{ added: boolean; removed: boolean; error?: string }> {
        return handleFavouriteToggle(userId, gallery);
    }

    async createFavouritesEmbed(userId: string, page: number = 1, perPage: number = 10): Promise<FavouritesData> {
        return createFavouritesEmbed(userId, page, perPage);
    }

    createFavouritesButtons(
        userId: string,
        currentPage: number,
        totalPages: number,
        favourites: any[]
    ): ActionRowBuilder<ButtonBuilder>[] {
        return createFavouritesButtons(userId, currentPage, totalPages, favourites as any);
    }

    createPageButtons(
        galleryId: number,
        userId: string,
        currentPage: number,
        totalPages: number
    ): ActionRowBuilder<ButtonBuilder>[] {
        return createPageButtons(galleryId, userId, currentPage, totalPages);
    }

    createErrorEmbed(message: string): EmbedBuilder {
        return createErrorEmbed(message);
    }

    createCooldownEmbed(remaining: number): EmbedBuilder {
        return createCooldownEmbed(remaining);
    }

    async setPageSession(userId: string, gallery: Gallery, currentPage: number = 1): Promise<void> {
        return setPageSession(userId, gallery, currentPage, this.SESSION_TTL);
    }

    async getPageSession(userId: string): Promise<PageSession | null> {
        return getPageSession(userId);
    }

    async updatePageSession(userId: string, currentPage: number): Promise<void> {
        return updatePageSession(userId, currentPage, this.SESSION_TTL);
    }

    async clearPageSession(userId: string): Promise<void> {
        return clearPageSession(userId);
    }

    async setSearchSession(userId: string, data: Partial<SearchSession>): Promise<void> {
        return setSearchSession(userId, data, this.SESSION_TTL);
    }

    async getSearchSession(userId: string): Promise<SearchSession | null> {
        return getSearchSession(userId);
    }

    createSearchResultsEmbed(query: string, data: SearchData, page: number, sort: string): EmbedBuilder {
        return createSearchResultsEmbed(query, data, page, sort);
    }

    createSearchButtons(query: string, data: SearchData, page: number, userId: string): ActionRowBuilder<ButtonBuilder>[] {
        return createSearchButtons(query, data, page, userId);
    }

    async handleButton(interaction: ButtonInteraction): Promise<void> {
        await handleNhentaiButtonInteraction(interaction, {
            sessionTtl: this.SESSION_TTL,
            createErrorEmbed: (message) => this.createErrorEmbed(message),
            getPageSession: (userId) => this.getPageSession(userId),
            setPageSession: (userId, gallery, currentPage) => this.setPageSession(userId, gallery, currentPage),
            updatePageSession: (userId, currentPage) => this.updatePageSession(userId, currentPage),
            createPageResponse: (gallery, pageNum) => this.createPageResponse(gallery, pageNum),
            createPageButtons: (galleryId, userId, currentPage, totalPages) => this.createPageButtons(galleryId, userId, currentPage, totalPages),
            createGalleryResponse: (gallery, options) => this.createGalleryResponse(gallery, options),
            createMainButtons: (galleryId, userId, numPages, gallery) => this.createMainButtons(galleryId, userId, numPages, gallery),
            getUserPreferences: (targetUserId) => this.getUserPreferences(targetUserId),
            setUserPreferences: (targetUserId, prefs) => this.setUserPreferences(targetUserId, prefs),
            createSettingsEmbed: (targetUserId, prefs) => this.createSettingsEmbed(targetUserId, prefs),
            createSettingsComponents: (targetUserId, prefs, galleryId) => this.createSettingsComponents(targetUserId, prefs, galleryId),
            getSearchSession: (userId) => this.getSearchSession(userId),
            setSearchSession: (userId, data) => this.setSearchSession(userId, data),
            createSearchResultsEmbed: (searchQuery, searchData, searchPage, sortBy) => this.createSearchResultsEmbed(searchQuery, searchData, searchPage, sortBy),
            createSearchButtons: (searchQuery, searchData, searchPage, targetUserId) => this.createSearchButtons(searchQuery, searchData, searchPage, targetUserId),
            createFavouritesEmbed: (targetUserId, favPage) => this.createFavouritesEmbed(targetUserId, favPage),
            createFavouritesButtons: (targetUserId, currentPage, totalPages, favourites) => this.createFavouritesButtons(targetUserId, currentPage, totalPages, favourites)
        });
    }

    async handleSelectMenu(interaction: StringSelectMenuInteraction): Promise<void> {
        const parts = interaction.customId.split('_');
        const userId = parts[parts.length - 1];

        if (interaction.user.id !== userId) {
            await interaction.reply({ content: '❌ This menu is not for you!', ephemeral: true });
            return;
        }

        if (parts[1] !== 'setting') return;

        const setting = parts[2];
        const selected = interaction.values[0];
        if (!selected) {
            await interaction.deferUpdate();
            return;
        }

        if (setting === 'popular' && ['today', 'week', 'month', 'all'].includes(selected)) {
            await this.setUserPreferences(userId, { popularPeriod: selected as UserPreferences['popularPeriod'] });
        }

        if (setting === 'random' && ['today', 'week', 'month', 'all'].includes(selected)) {
            await this.setUserPreferences(userId, { randomPeriod: selected as UserPreferences['randomPeriod'] });
        }

        const prefs = await this.getUserPreferences(userId);
        const embed = this.createSettingsEmbed(userId, prefs);
        const galleryId = this.extractSettingsGalleryId(interaction);
        const components = this.createSettingsComponents(userId, prefs, galleryId);
        await interaction.update({ embeds: [embed], components });
    }

    async handleModal(interaction: ModalSubmitInteraction): Promise<void> {
        await handleNhentaiModalInteraction(interaction, {
            createPageResponse: (gallery, pageNum) => this.createPageResponse(gallery, pageNum),
            createPageButtons: (galleryId, userId, currentPage, totalPages) => this.createPageButtons(galleryId, userId, currentPage, totalPages)
        });
    }

    destroy(): void {
        // Sessions are managed by CacheService
    }
}

const nhentaiHandler = new NHentaiHandler();

export default nhentaiHandler;
export type { Gallery, GalleryTitle, GalleryTag, GalleryImages, ParsedTags, PageSession, SearchSession, SearchData, Favourite, UserPreferences };
