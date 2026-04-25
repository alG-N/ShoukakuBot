import type { ActionRowBuilder, ButtonBuilder, EmbedBuilder } from 'discord.js';
import type { NHentaiGallery, NHentaiImages, NHentaiTag, NHentaiTitle } from './model.js';
import type {
    NHentaiFavouriteEntry,
    NHentaiPageSession,
    NHentaiSearchSession,
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