/**
 * NHentai Handler
 * Creates embeds and buttons for nhentai command
 * @module handlers/api/nhentaiHandler
 */

import { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ButtonInteraction,
    ModalSubmitInteraction
} from 'discord.js';
import nhentaiRepository, { NHentaiGallery, NHentaiFavourite } from '../../repositories/api/nhentaiRepository.js';
import cacheService from '../../cache/CacheService.js';

import { getDefault } from '../../utils/common/moduleHelper.js';
const nhentaiService = getDefault(require('../../services/api/nhentaiService'));
// TYPES & INTERFACES
interface GalleryTitle {
    english?: string;
    japanese?: string;
    pretty?: string;
}

interface GalleryImage {
    t: string; // 'j' | 'p' | 'g'
}

interface GalleryImages {
    cover?: GalleryImage;
    pages?: GalleryImage[];
}

interface GalleryTag {
    type: string;
    name: string;
}

interface Gallery {
    id: number;
    media_id: string;
    title: GalleryTitle;
    tags: GalleryTag[];
    num_pages: number;
    upload_date: number;
    images?: GalleryImages;
}

interface ParsedTags {
    artists: string[];
    characters: string[];
    parodies: string[];
    groups: string[];
    tags: string[];
    languages: string[];
    categories: string[];
}

interface PageSession {
    galleryId: number;
    gallery: Gallery;
    currentPage: number;
    totalPages: number;
    expiresAt: number;
}

interface SearchSession {
    query?: string;
    sort?: string;
    results?: Gallery[];
    currentPage?: number;
    numPages?: number;
    favPage?: number;
    expiresAt: number;
}

interface SearchData {
    results: Gallery[];
    numPages: number;
    totalResults: number;
}

interface FavouritesData {
    embed: EmbedBuilder;
    totalPages: number;
    totalCount: number;
}

interface Favourite {
    gallery_id: number;
    gallery_title: string;
    num_pages: number;
}
// CONSTANTS
const COLORS = {
    NHENTAI: 0xED2553,
    ERROR: 0xFF0000,
    SUCCESS: 0x00FF00,
    FAVOURITE: 0xFFD700
} as const;
// NHENTAI HANDLER CLASS
class NHentaiHandler {
    private readonly CACHE_NS = 'api:nhentai';
    private readonly SESSION_TTL = 1800; // 30 minutes in seconds for longer reading sessions
    private readonly CDN_MIRRORS = ['i1', 'i2', 'i3', 'i5', 'i7'];
    private readonly THUMB_MIRRORS = ['t1', 't2', 't3', 't5', 't7'];
    private cdnIndex = 0;
    private thumbIndex = 0;
    private _cleanupInterval: NodeJS.Timeout | null = null;

    constructor() {
        // Sessions are now managed by CacheService with Redis TTL — no local cleanup needed
    }


    /**
     * Create gallery info embed
     */
    createGalleryEmbed(gallery: Gallery, options: { isRandom?: boolean; isPopular?: boolean } = {}): EmbedBuilder {
        const { isRandom = false, isPopular = false } = options;
        const { id, media_id, title, tags, num_pages, upload_date, images } = gallery;
        
        const embed = new EmbedBuilder()
            .setColor(COLORS.NHENTAI)
            .setTitle(this._getTitle(title))
            .setURL(`https://nhentai.net/g/${id}/`)
            .setFooter({ text: `ID: ${id} • ${num_pages} pages • Uploaded: ${this._formatDate(upload_date)}` });

        // Set thumbnail (cover image)
        const coverType = images?.cover?.t || 'j';
        embed.setThumbnail(this._getThumbnailUrl(media_id, coverType));

        // Add author badge
        if (isRandom) {
            embed.setAuthor({ name: '🎲 Random Gallery' });
        } else if (isPopular) {
            embed.setAuthor({ name: '🔥 Popular Gallery' });
        }

        // Parse and add tags
        const parsedTags = this._parseTags(tags);
        const fields: { name: string; value: string; inline: boolean }[] = [];

        if (parsedTags.artists.length > 0) {
            fields.push({ name: '🎨 Artist', value: this._formatTagList(parsedTags.artists), inline: true });
        }
        if (parsedTags.parodies.length > 0) {
            fields.push({ name: '📚 Parody', value: this._formatTagList(parsedTags.parodies), inline: true });
        }
        if (parsedTags.characters.length > 0) {
            fields.push({ name: '👤 Characters', value: this._formatTagList(parsedTags.characters), inline: true });
        }
        if (parsedTags.groups.length > 0) {
            fields.push({ name: '👥 Group', value: this._formatTagList(parsedTags.groups), inline: true });
        }
        if (parsedTags.languages.length > 0) {
            fields.push({ name: '🌐 Language', value: this._formatTagList(parsedTags.languages), inline: true });
        }
        if (parsedTags.categories.length > 0) {
            fields.push({ name: '📂 Category', value: this._formatTagList(parsedTags.categories), inline: true });
        }
        if (parsedTags.tags.length > 0) {
            fields.push({ name: '🏷️ Tags', value: this._formatTagList(parsedTags.tags, 500), inline: false });
        }

        if (fields.length > 0) {
            embed.addFields(fields);
        }

        // Add Japanese title if different
        if (title.japanese && title.japanese !== title.english) {
            embed.setDescription(`*${title.japanese}*`);
        }

        return embed;
    }

    /**
     * Create page reader embed
     */
    createPageEmbed(gallery: Gallery, pageNum: number): EmbedBuilder {
        const { id, media_id, title, num_pages, images } = gallery;
        const pages = images?.pages || [];
        
        if (pageNum < 1 || pageNum > pages.length) {
            return this.createErrorEmbed('Invalid page number.');
        }

        const page = pages[pageNum - 1];
        const imageUrl = this._getPageImageUrl(media_id, pageNum, page.t);
        const thumbUrl = this._getPageThumbUrl(media_id, pageNum, page.t);

        const embed = new EmbedBuilder()
            .setColor(COLORS.NHENTAI)
            .setAuthor({ 
                name: this._truncate(this._getTitle(title), 100),
                url: `https://nhentai.net/g/${id}/`
            })
            .setImage(imageUrl)
            .setThumbnail(thumbUrl) // Small thumbnail loads faster as visual hint while full image loads
            .setFooter({ text: `Page ${pageNum}/${num_pages} • ID: ${id}` });

        return embed;
    }

    /**
     * Create main action buttons
     */
    async createMainButtons(
        galleryId: number, 
        userId: string, 
        numPages: number, 
        _gallery: Gallery | null = null
    ): Promise<ActionRowBuilder<ButtonBuilder>[]> {
        // Check if user has favourited this gallery
        let isFavourited = false;
        try {
            isFavourited = await nhentaiRepository.isFavourited(userId, galleryId);
        } catch {
            // ignore
        }

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
                .setCustomId(`nhentai_myfavs_${userId}`)
                .setLabel('My Favourites')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('📚')
        );

        return [row1, row2];
    }

    /**
     * Handle favourite toggle
     */
    async handleFavouriteToggle(
        userId: string, 
        galleryId: string, 
        gallery: Gallery
    ): Promise<{ added: boolean; removed: boolean; error?: string }> {
        try {
            const result = await nhentaiRepository.toggleFavourite(userId, gallery);
            return result;
        } catch (error) {
            console.error('[NHentai] Error toggling favourite:', error);
            return { added: false, removed: false, error: (error as Error).message };
        }
    }

    /**
     * Create favourites list embed
     */
    async createFavouritesEmbed(userId: string, page: number = 1, perPage: number = 10): Promise<FavouritesData> {
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
                const favTitle = this._truncate(fav.gallery_title, 40);
                description += `**${num}.** \`${fav.gallery_id}\` - ${favTitle} (${fav.num_pages}p)\n`;
            });
            embed.setDescription(description);
        }

        return { embed, totalPages, totalCount };
    }

    /**
     * Create favourites navigation buttons
     */
    createFavouritesButtons(
        userId: string, 
        currentPage: number, 
        totalPages: number, 
        favourites: NHentaiFavourite[]
    ): ActionRowBuilder<ButtonBuilder>[] {
        const rows: ActionRowBuilder<ButtonBuilder>[] = [];

        // Row 1: Quick view buttons (up to 5)
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

        // Row 2: Navigation
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

    /**
     * Create page navigation buttons
     */
    createPageButtons(
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

    /**
     * Create error embed
     */
    createErrorEmbed(message: string): EmbedBuilder {
        return new EmbedBuilder()
            .setColor(COLORS.ERROR)
            .setTitle('❌ Error')
            .setDescription(message)
            .setTimestamp();
    }

    /**
     * Create cooldown embed
     */
    createCooldownEmbed(remaining: number): EmbedBuilder {
        return new EmbedBuilder()
            .setColor(COLORS.ERROR)
            .setTitle('⏳ Cooldown')
            .setDescription(`Please wait **${remaining}s** before using this command again.`)
            .setTimestamp();
    }

    /**
     * Cache management for page reading sessions (shard-safe via CacheService)
     */
    async setPageSession(userId: string, gallery: Gallery, currentPage: number = 1): Promise<void> {
        await cacheService.set<PageSession>(this.CACHE_NS, `nhentai:page:${userId}`, {
            galleryId: gallery.id,
            gallery,
            currentPage,
            totalPages: gallery.num_pages,
            expiresAt: Date.now() + this.SESSION_TTL * 1000
        }, this.SESSION_TTL);
    }

    async getPageSession(userId: string): Promise<PageSession | null> {
        return cacheService.peek<PageSession>(this.CACHE_NS, `nhentai:page:${userId}`);
    }

    async updatePageSession(userId: string, currentPage: number): Promise<void> {
        const session = await this.getPageSession(userId);
        if (session) {
            session.currentPage = currentPage;
            session.expiresAt = Date.now() + this.SESSION_TTL * 1000;
            await cacheService.set<PageSession>(this.CACHE_NS, `nhentai:page:${userId}`, session, this.SESSION_TTL);
        }
    }

    async clearPageSession(userId: string): Promise<void> {
        await cacheService.delete(this.CACHE_NS, `nhentai:page:${userId}`);
    }

    // Search session management (shard-safe via CacheService)
    async setSearchSession(userId: string, data: Partial<SearchSession>): Promise<void> {
        await cacheService.set<SearchSession>(this.CACHE_NS, `nhentai:search:${userId}`, {
            ...data,
            expiresAt: Date.now() + this.SESSION_TTL * 1000
        } as SearchSession, this.SESSION_TTL);
    }

    async getSearchSession(userId: string): Promise<SearchSession | null> {
        return cacheService.peek<SearchSession>(this.CACHE_NS, `nhentai:search:${userId}`);
    }

    /**
     * Create search results embed
     */
    createSearchResultsEmbed(query: string, data: SearchData, page: number, sort: string): EmbedBuilder {
        const { results, numPages, totalResults } = data;
        
        const embed = new EmbedBuilder()
            .setColor(COLORS.NHENTAI)
            .setTitle(`🔍 Search Results: "${query}"`)
            .setDescription(`Found **${totalResults}+** results • Page **${page}** of **${numPages}** • Sorted by **${sort === 'recent' ? 'Recent' : 'Popular'}**`)
            .setFooter({ text: 'Select a gallery to view more details' });

        // Show first 10 results
        const displayResults = results.slice(0, 10);
        let resultsList = '';
        
        displayResults.forEach((gallery, index) => {
            const galleryTitle = this._truncate(this._getTitle(gallery.title), 50);
            const pages = gallery.num_pages || '?';
            const galleryId = gallery.id;
            resultsList += `**${index + 1}.** \`${galleryId}\` - ${galleryTitle} (${pages}p)\n`;
        });

        if (resultsList) {
            embed.addFields({ name: '📚 Results', value: resultsList, inline: false });
        }

        return embed;
    }

    /**
     * Create search navigation buttons
     */
    createSearchButtons(query: string, data: SearchData, page: number, userId: string): ActionRowBuilder<ButtonBuilder>[] {
        const { results, numPages } = data;
        
        const row1 = new ActionRowBuilder<ButtonBuilder>();
        
        // Add buttons for first 5 results
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
        
        // Add buttons for results 6-10
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
                .setDisabled(page >= numPages)
        );

        const rows = [row1];
        if (secondFive.length > 0) rows.push(row2);
        rows.push(row3);
        
        return rows;
    }

    // Private helper methods
    private _getTitle(title: GalleryTitle): string {
        return title.english || title.japanese || title.pretty || 'Unknown Title';
    }

    private _formatDate(timestamp: number): string {
        return new Date(timestamp * 1000).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }

    /**
     * Get thumbnail URL using rotating CDN mirrors
     */
    private _getThumbnailUrl(mediaId: string, coverType: string): string {
        const ext: Record<string, string> = { 'j': 'jpg', 'p': 'png', 'g': 'gif' };
        const extension = ext[coverType] || 'jpg';
        const mirror = this.THUMB_MIRRORS[this.thumbIndex % this.THUMB_MIRRORS.length];
        this.thumbIndex++;
        return `https://${mirror}.nhentai.net/galleries/${mediaId}/cover.${extension}`;
    }

    /**
     * Get page image URL using rotating CDN mirrors for better load distribution
     */
    private _getPageImageUrl(mediaId: string, pageNum: number, pageType: string): string {
        const ext: Record<string, string> = { 'j': 'jpg', 'p': 'png', 'g': 'gif' };
        const extension = ext[pageType] || 'jpg';
        // Rotate CDN mirrors based on page number for consistent caching per page
        const mirror = this.CDN_MIRRORS[pageNum % this.CDN_MIRRORS.length];
        return `https://${mirror}.nhentai.net/galleries/${mediaId}/${pageNum}.${extension}`;
    }

    /**
     * Get page thumbnail URL (smaller, loads faster) as fallback
     */
    private _getPageThumbUrl(mediaId: string, pageNum: number, pageType: string): string {
        const ext: Record<string, string> = { 'j': 'jpg', 'p': 'png', 'g': 'gif' };
        const extension = ext[pageType] || 'jpg';
        const mirror = this.THUMB_MIRRORS[pageNum % this.THUMB_MIRRORS.length];
        return `https://${mirror}.nhentai.net/galleries/${mediaId}/${pageNum}t.${extension}`;
    }

    private _parseTags(tags: GalleryTag[]): ParsedTags {
        const result: ParsedTags = {
            artists: [], characters: [], parodies: [], 
            groups: [], tags: [], languages: [], categories: []
        };
        
        if (!tags || !Array.isArray(tags)) return result;
        
        for (const tag of tags) {
            const type = tag.type;
            const key = (type + 's') as keyof ParsedTags;
            if (key in result) {
                result[key].push(tag.name);
            } else if (type === 'tag') {
                result.tags.push(tag.name);
            }
        }
        
        // Limit each category
        for (const key in result) {
            result[key as keyof ParsedTags] = result[key as keyof ParsedTags].slice(0, 15);
        }
        
        return result;
    }

    private _formatTagList(tags: string[], maxLength: number = 300): string {
        if (!tags || tags.length === 0) return 'None';
        let result = tags.join(', ');
        if (result.length > maxLength) {
            result = result.substring(0, maxLength - 3) + '...';
        }
        return result;
    }

    private _truncate(text: string, maxLength: number): string {
        if (!text) return '';
        return text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text;
    }

    /**
     * Handle button interactions for nhentai
     */
    async handleButton(interaction: ButtonInteraction): Promise<void> {
        const parts = interaction.customId.split('_');
        const action = parts[1];
        const userId = parts[parts.length - 1];

        // Verify button owner
        if (userId !== interaction.user.id) {
            await interaction.reply({
                content: '❌ This button is not for you!',
                ephemeral: true
            });
            return;
        }

        try {
            // Handle 'jump' BEFORE deferUpdate — modals require a non-deferred interaction
            if (action === 'jump') {
                const galleryId = parts[2];
                const session = await this.getPageSession(userId);
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
                            embeds: [this.createErrorEmbed('Gallery not found')], 
                            components: [] 
                        });
                        return;
                    }
                    const gallery = result.data;
                    const embed = this.createGalleryEmbed(gallery);
                    const rows = await this.createMainButtons(gallery.id, userId, gallery.num_pages, gallery);
                    await interaction.editReply({ embeds: [embed], components: rows });
                    break;
                }

                case 'read': {
                    const galleryId = parts[2];
                    const session = await this.getPageSession(userId);
                    let gallery: Gallery | undefined = session?.gallery;
                    
                    if (!gallery || gallery.id !== parseInt(galleryId)) {
                        const result = await nhentaiService.fetchGallery(galleryId);
                        if (!result.success || !result.data) {
                            await interaction.editReply({ 
                                embeds: [this.createErrorEmbed('Gallery not found')], 
                                components: [] 
                            });
                            return;
                        }
                        gallery = result.data as Gallery;
                        await this.setPageSession(userId, gallery, 1);
                    }
                    
                    const pageEmbed = this.createPageEmbed(gallery!, 1);
                    const pageRows = this.createPageButtons(parseInt(galleryId), userId, 1, gallery!.num_pages);
                    await interaction.editReply({ embeds: [pageEmbed], components: pageRows });
                    break;
                }

                case 'prev':
                case 'next':
                case 'first':
                case 'last': {
                    const session = await this.getPageSession(userId);
                    if (!session) {
                        await interaction.editReply({ 
                            embeds: [this.createErrorEmbed('Session expired. Please start again.')], 
                            components: [] 
                        });
                        return;
                    }
                    
                    let newPage = session.currentPage;
                    if (action === 'prev') newPage = Math.max(1, newPage - 1);
                    else if (action === 'next') newPage = Math.min(session.totalPages, newPage + 1);
                    else if (action === 'first') newPage = 1;
                    else if (action === 'last') newPage = session.totalPages;
                    
                    await this.updatePageSession(userId, newPage);
                    const pageEmbed = this.createPageEmbed(session.gallery, newPage);
                    const pageRows = this.createPageButtons(session.galleryId, userId, newPage, session.totalPages);
                    await interaction.editReply({ embeds: [pageEmbed], components: pageRows });
                    break;
                }

                case 'info': {
                    const galleryId = parts[2];
                    const result = await nhentaiService.fetchGallery(galleryId);
                    if (!result.success || !result.data) {
                        await interaction.editReply({ 
                            embeds: [this.createErrorEmbed('Gallery not found')], 
                            components: [] 
                        });
                        return;
                    }
                    const gallery = result.data;
                    const embed = this.createGalleryEmbed(gallery);
                    const rows = await this.createMainButtons(parseInt(galleryId), userId, gallery.num_pages, gallery);
                    await interaction.editReply({ embeds: [embed], components: rows });
                    break;
                }

                case 'fav': {
                    const galleryId = parts[2];
                    const session = await this.getPageSession(userId);
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
                    const searchSession = await this.getSearchSession(userId);
                    if (!searchSession) {
                        await interaction.editReply({ 
                            embeds: [this.createErrorEmbed('Search session expired. Please search again.')], 
                            components: [] 
                        });
                        return;
                    }
                    
                    const newPage = action === 'sprev' 
                        ? Math.max(1, (searchSession.currentPage || 1) - 1)
                        : Math.min(searchSession.numPages || 1, (searchSession.currentPage || 1) + 1);
                    
                    const searchResult = await nhentaiService.search(searchSession.query || '', newPage, searchSession.sort || 'popular');
                    if (!searchResult.success || !searchResult.data || searchResult.data.results.length === 0) {
                        await interaction.editReply({ 
                            embeds: [this.createErrorEmbed('No results found')], 
                            components: [] 
                        });
                        return;
                    }
                    
                    await this.setSearchSession(userId, { ...searchSession, currentPage: newPage, results: searchResult.data.results });
                    const embed = this.createSearchResultsEmbed(searchSession.query || '', searchResult.data, newPage, searchSession.sort || 'popular');
                    const rows = this.createSearchButtons(searchSession.query || '', searchResult.data, newPage, userId);
                    await interaction.editReply({ embeds: [embed], components: rows });
                    break;
                }

                case 'favpage': {
                    const direction = parts[2];
                    const searchSession = await this.getSearchSession(userId);
                    const currentPage = searchSession?.favPage || 1;
                    const newPage = direction === 'prev' 
                        ? Math.max(1, currentPage - 1) 
                        : currentPage + 1;
                    
                    const { embed, totalPages } = await this.createFavouritesEmbed(userId, newPage);
                    if (newPage > totalPages) {
                        await interaction.followUp({ content: '❌ No more pages', ephemeral: true });
                        return;
                    }
                    
                    const favourites = await nhentaiRepository.getUserFavourites(userId, 10, (newPage - 1) * 10);
                    const rows = this.createFavouritesButtons(userId, newPage, totalPages, favourites);
                    await this.setSearchSession(userId, { ...searchSession, favPage: newPage });
                    await interaction.editReply({ embeds: [embed], components: rows });
                    break;
                }

                case 'random': {
                    const result = await nhentaiService.fetchRandomGallery();
                    if (!result.success || !result.data) {
                        await interaction.editReply({ 
                            embeds: [this.createErrorEmbed('Could not fetch random gallery')], 
                            components: [] 
                        });
                        return;
                    }
                    const gallery = result.data;
                    const embed = this.createGalleryEmbed(gallery, { isRandom: true });
                    const rows = await this.createMainButtons(gallery.id, userId, gallery.num_pages, gallery);
                    await interaction.editReply({ embeds: [embed], components: rows });
                    break;
                }

                case 'popular': {
                    const result = await nhentaiService.fetchPopularGallery();
                    if (!result.success || !result.data) {
                        await interaction.editReply({ 
                            embeds: [this.createErrorEmbed('Could not fetch popular gallery')], 
                            components: [] 
                        });
                        return;
                    }
                    const gallery = result.data;
                    const embed = this.createGalleryEmbed(gallery, { isPopular: true });
                    const rows = await this.createMainButtons(gallery.id, userId, gallery.num_pages, gallery);
                    await interaction.editReply({ embeds: [embed], components: rows });
                    break;
                }

                case 'myfavs': {
                    const { embed, totalPages, totalCount } = await this.createFavouritesEmbed(userId, 1);
                    if (totalCount === 0) {
                        await interaction.editReply({ embeds: [embed], components: [] });
                        return;
                    }
                    const favourites = await nhentaiRepository.getUserFavourites(userId, 10, 0);
                    const rows = this.createFavouritesButtons(userId, 1, totalPages, favourites);
                    await this.setSearchSession(userId, { favPage: 1, expiresAt: Date.now() + this.SESSION_TTL * 1000 });
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
                            embeds: [this.createErrorEmbed('Gallery not found')], 
                            components: [] 
                        });
                        return;
                    }
                    const gallery = result.data;
                    const embed = this.createGalleryEmbed(gallery);
                    const rows = await this.createMainButtons(gallery.id, userId, gallery.num_pages, gallery);
                    await interaction.editReply({ embeds: [embed], components: rows });
                    break;
                }

                default:
                    await interaction.followUp({ content: '❌ Unknown action', ephemeral: true });
            }
        } catch (error) {
            console.error('[NHentai Button Error]', error);
            await interaction.followUp?.({ 
                content: '❌ An error occurred. Please try again.', 
                ephemeral: true 
            }).catch(() => {});
        }
    }

    /**
     * Handle modal submissions (jump to page)
     */
    async handleModal(interaction: ModalSubmitInteraction): Promise<void> {
        // Parse: nhentai_jumpmodal_${galleryId}_${userId}
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
            // Fetch gallery to get total pages
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

            // Create page embed
            const embed = this.createPageEmbed(gallery, clampedPage);
            const buttons = this.createPageButtons(galleryId, userId, clampedPage, totalPages);

            await interaction.editReply({ embeds: [embed], components: buttons });
        } catch (error) {
            console.error('[NHentai Modal Error]', error);
            await interaction.followUp?.({ 
                content: '❌ Failed to jump to page. Please try again.', 
                ephemeral: true 
            }).catch(() => {});
        }
    }

    /**
     * Destroy handler - clear intervals for clean shutdown
     */
    destroy(): void {
        if (this._cleanupInterval) {
            clearInterval(this._cleanupInterval);
        }
        // Sessions are managed by CacheService — no local state to clear
    }
}
// EXPORTS
const nhentaiHandler = new NHentaiHandler();
export default nhentaiHandler;

export { NHentaiHandler };

export type {
    Gallery,
    GalleryTitle,
    GalleryTag,
    GalleryImages,
    ParsedTags,
    PageSession,
    SearchSession,
    SearchData,
    Favourite
};
