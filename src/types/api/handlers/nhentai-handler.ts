import type { EmbedBuilder } from 'discord.js';
import type { NHentaiGallery } from '../../../repositories/api/nhentaiRepository.js';
import type { NHentaiTitle, NHentaiTag, NHentaiImages } from '../nhentai.js';
import type {
    NHentaiPageSession,
    NHentaiSearchSession,
    NHentaiFavouriteEntry
} from '../content-session.js';

export type Gallery = NHentaiGallery;
export type GalleryTitle = NHentaiTitle;
export type GalleryTag = NHentaiTag;
export type GalleryImages = NHentaiImages;
export type PageSession = NHentaiPageSession;
export type SearchSession = NHentaiSearchSession;

export interface FavouritesData {
    embed: EmbedBuilder;
    totalPages: number;
    totalCount: number;
}

export type Favourite = NHentaiFavouriteEntry;
