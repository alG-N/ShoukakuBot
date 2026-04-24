import type { ActionRowBuilder, ButtonBuilder, EmbedBuilder } from 'discord.js';
import type { NHentaiGallery } from '../../../repositories/api/nhentaiRepository.js';
import type { NHentaiTitle, NHentaiTag, NHentaiImages } from '../models/nhentai.js';
import type {
    NHentaiPageSession,
    NHentaiSearchSession,
    NHentaiFavouriteEntry,
    NHentaiUserPreferences
} from '../models/content-session.js';

export type Gallery = NHentaiGallery;
export type GalleryTitle = NHentaiTitle;
export type GalleryTag = NHentaiTag;
export type GalleryImages = NHentaiImages;
export type PageSession = NHentaiPageSession;
export type SearchSession = NHentaiSearchSession;
export type UserPreferences = NHentaiUserPreferences;

export interface FavouritesData {
    embed: EmbedBuilder;
    totalPages: number;
    totalCount: number;
    buttons: ActionRowBuilder<ButtonBuilder>[];
}

export type Favourite = NHentaiFavouriteEntry;
