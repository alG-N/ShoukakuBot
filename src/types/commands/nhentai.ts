import type {
    ActionRowBuilder,
    AttachmentBuilder,
    ButtonBuilder,
    ButtonInteraction,
    EmbedBuilder,
    StringSelectMenuInteraction,
    ModalSubmitInteraction
} from 'discord.js';
import type { NHentaiGallery, SearchData } from '../api/nhentai/model.js';

export type GalleryData = NHentaiGallery;

export type NHentaiService = typeof import('../../services/api/nhentaiService.js').default;

export interface NHentaiHandler {
    createGalleryEmbed: (data: GalleryData, options?: { isRandom?: boolean; isPopular?: boolean }) => EmbedBuilder;
    createGalleryResponse: (data: GalleryData, options?: { isRandom?: boolean; isPopular?: boolean; popularPeriod?: string; spoilerCover?: boolean }) => Promise<{ embed: EmbedBuilder; files: AttachmentBuilder[] }>;
    createMainButtons: (id: number, userId: string, numPages: number, data: GalleryData, sessionId?: string) => Promise<ActionRowBuilder<ButtonBuilder>[]>;
    createSearchResultsEmbed?: (query: string, data: SearchData, page: number, sort: string) => EmbedBuilder;
    createSearchButtons?: (query: string, data: SearchData, page: number, userId: string, sessionId?: string) => ActionRowBuilder<ButtonBuilder>[];
    setSearchSession?: (userId: string, data: any, sessionId?: string) => Promise<void>;
    createFavouritesEmbed: (userId: string, page?: number, perPage?: number, sessionId?: string) => Promise<{ embed?: EmbedBuilder; buttons?: ActionRowBuilder<ButtonBuilder>[] }>;
    getUserPreferences?: (userId: string) => Promise<{ popularPeriod: 'today' | 'week' | 'month' | 'all'; randomPeriod: 'today' | 'week' | 'month' | 'all' }>;
    createSettingsEmbed?: (userId: string, prefs: { popularPeriod: 'today' | 'week' | 'month' | 'all'; randomPeriod: 'today' | 'week' | 'month' | 'all' }) => EmbedBuilder;
    createSettingsComponents?: (userId: string, prefs: { popularPeriod: 'today' | 'week' | 'month' | 'all'; randomPeriod: 'today' | 'week' | 'month' | 'all' }, galleryId?: number | null) => ActionRowBuilder<ButtonBuilder>[] | ActionRowBuilder<any>[];
    handleButton?: (interaction: ButtonInteraction) => Promise<void>;
    handleSelectMenu?: (interaction: StringSelectMenuInteraction) => Promise<void>;
    handleModal?: (interaction: ModalSubmitInteraction) => Promise<void>;
}