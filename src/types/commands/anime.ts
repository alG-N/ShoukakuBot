import type { EmbedBuilder } from 'discord.js';
import type { AnimeFavourite as AnimeRepositoryFavourite } from '../../repositories/api/animeRepository.js';
import type {
    AnimeLookupItem as Anime
} from '../api/models/content-session.js';
import type { AnimeContentSource, MALMediaType } from '../api/models/mal.js';

export type AnilistService = {
    searchAnime: (name: string) => Promise<Anime | null>;
    searchAnimeAutocomplete: (query: string) => Promise<Anime[]>;
};

export type MyAnimeListService = {
    searchMedia: (name: string, type: MALMediaType) => Promise<Anime | null>;
    searchMediaAutocomplete: (query: string, type: MALMediaType) => Promise<Anime[]>;
};

export interface AnimeHandler {
    createMediaEmbed: (anime: Anime, source: AnimeContentSource, mediaType: MALMediaType) => Promise<EmbedBuilder>;
}

export interface AnimeRepository {
    getUserFavourites: (userId: string) => Promise<AnimeRepositoryFavourite[]>;
    isFavourited: (userId: string, animeId: number | string) => Promise<boolean>;
    addFavourite: (userId: string, animeId: number | string, title: string, source?: string) => Promise<void>;
    removeFavourite: (userId: string, animeId: number | string) => Promise<void>;
}