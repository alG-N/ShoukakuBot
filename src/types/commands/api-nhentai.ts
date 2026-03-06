import type {
    ActionRowBuilder,
    AttachmentBuilder,
    ButtonBuilder,
    ButtonInteraction,
    EmbedBuilder,
    StringSelectMenuInteraction,
    ModalSubmitInteraction
} from 'discord.js';
import type { NHentaiGallery, SearchData } from '../api/nhentai.js';

export type GalleryData = NHentaiGallery;

export type NHentaiService = typeof import('../../services/api/nhentaiService.js').default;

export interface NHentaiHandler {
    createGalleryEmbed: (data: GalleryData, options?: { isRandom?: boolean; isPopular?: boolean }) => EmbedBuilder;
    createGalleryResponse: (data: GalleryData, options?: { isRandom?: boolean; isPopular?: boolean; popularPeriod?: string; spoilerCover?: boolean }) => Promise<{ embed: EmbedBuilder; files: AttachmentBuilder[] }>;
    createMainButtons: (id: number, userId: string, numPages: number, data: GalleryData) => Promise<ActionRowBuilder<ButtonBuilder>[]>;
    createSearchResultsEmbed?: (query: string, data: SearchData, page: number, sort: string) => EmbedBuilder;
    createSearchButtons?: (query: string, data: SearchData, page: number, userId: string) => ActionRowBuilder<ButtonBuilder>[];
    setSearchSession?: (userId: string, data: any) => Promise<void>;
    createFavouritesEmbed: (userId: string) => Promise<{ embed?: EmbedBuilder; buttons?: ActionRowBuilder<ButtonBuilder>[] }>;
    handleButton?: (interaction: ButtonInteraction) => Promise<void>;
    handleSelectMenu?: (interaction: StringSelectMenuInteraction) => Promise<void>;
    handleModal?: (interaction: ModalSubmitInteraction) => Promise<void>;
}
