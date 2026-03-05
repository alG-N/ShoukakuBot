import type { AnimeMedia } from '../../../types/api/anime.js';
import type { AnimeContentSource as MediaSource, MALMediaType as AnimeMediaType } from '../../../types/api/mal.js';
import { createAniListEmbed } from './anilist.js';
import { createMALAnimeEmbed, createMALMangaEmbed } from './mal.js';

export async function createMediaEmbed(
    media: AnimeMedia,
    source: MediaSource = 'anilist',
    mediaType: AnimeMediaType = 'anime'
) {
    if (source === 'mal' && mediaType !== 'anime') {
        return createMALMangaEmbed(media, mediaType);
    }
    if (source === 'mal') {
        return createMALAnimeEmbed(media);
    }
    return createAniListEmbed(media);
}

export async function createAnimeEmbed(anime: AnimeMedia, source: MediaSource = 'anilist') {
    return createMediaEmbed(anime, source, 'anime');
}
