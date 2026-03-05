import { EmbedBuilder } from 'discord.js';
import anilistService from '../../../services/api/anilistService.js';
import { MEDIA_CONFIG } from './constants.js';
import { formatNumber } from './helpers.js';
import type { AnimeMedia } from '../../../types/api/anime.js';
import type { MALMediaType as AnimeMediaType } from '../../../types/api/mal.js';

export async function createMALAnimeEmbed(anime: AnimeMedia): Promise<EmbedBuilder> {
    const title = anime.title.romaji || anime.title.english || anime.title.native || 'Unknown';
    const description = anime.description
        ? anilistService.truncate(anime.description.replace(/<\/?[^>]+(>|$)/g, ''), 400)
        : 'No description available.';

    const startDate = anilistService.formatDate(anime.startDate as any);
    const endDate = anime.endDate?.year
        ? anilistService.formatDate(anime.endDate as any)
        : anime.status === 'RELEASING' ? 'Ongoing' : 'Unknown';

    const episodeText = anime.episodes ? `${anime.episodes} episodes` : 'Unknown';
    const scoreText = anime.score ? `⭐ ${anime.score}/10` : 'N/A';
    const memberText = anime.members ? formatNumber(anime.members) : 'N/A';
    const favoritesText = anime.favorites ? formatNumber(anime.favorites) : 'N/A';
    const rankText = anime.rank ? `#${anime.rank}` : 'N/A';
    const popularityText = anime.popularity_rank ? `#${anime.popularity_rank}` : 'N/A';

    const trailerUrl = anime.trailer?.id
        ? `[Watch Trailer](https://youtube.com/watch?v=${anime.trailer.id})`
        : 'N/A';

    return new EmbedBuilder()
        .setTitle(`📗 ${title}`)
        .setURL(anime.siteUrl)
        .setColor(0x2E51A2)
        .setThumbnail(anime.coverImage?.large || null)
        .setDescription(description)
        .addFields(
            { name: '📊 Score', value: scoreText, inline: true },
            { name: '📈 Ranked', value: rankText, inline: true },
            { name: '🔥 Popularity', value: popularityText, inline: true },
            { name: '📺 Episodes', value: episodeText, inline: true },
            { name: '⏱️ Duration', value: anime.duration ? `${anime.duration} min/ep` : 'N/A', inline: true },
            { name: '📅 Aired', value: `${startDate} → ${endDate}`, inline: true },
            { name: '🎬 Type', value: anime.format || 'Unknown', inline: true },
            { name: '📡 Status', value: anime.status || 'Unknown', inline: true },
            { name: '🎬 Rating', value: anime.rating || 'N/A', inline: true },
            { name: '🎵 Studio', value: anime.studios?.nodes?.[0]?.name || 'Unknown', inline: true },
            { name: '📺 Broadcast', value: anime.broadcast || 'N/A', inline: true },
            { name: '🎥 Trailer', value: trailerUrl, inline: true },
            { name: '🏷️ Genres', value: anime.genres?.join(', ') || 'None', inline: false },
            { name: '👥 Community', value: `${memberText} members • ${favoritesText} favorites`, inline: false }
        )
        .setFooter({ text: `MyAnimeList • Scored by ${anime.scoredBy ? formatNumber(anime.scoredBy) : '?'} users` });
}

export async function createMALMangaEmbed(manga: AnimeMedia, mediaType: AnimeMediaType = 'manga'): Promise<EmbedBuilder> {
    const config = MEDIA_CONFIG[mediaType] || MEDIA_CONFIG.manga;
    const title = manga.title.romaji || manga.title.english || manga.title.native || 'Unknown';
    const description = manga.description
        ? anilistService.truncate(manga.description.replace(/<\/?[^>]+(>|$)/g, ''), 400)
        : 'No description available.';

    const startDate = anilistService.formatDate(manga.startDate as any);
    const endDate = manga.endDate?.year
        ? anilistService.formatDate(manga.endDate as any)
        : manga.status === 'RELEASING' ? 'Ongoing' : 'Unknown';

    const chaptersText = manga.chapters ? `${manga.chapters} chapters` : 'Unknown';
    const volumesText = manga.volumes ? `${manga.volumes} volumes` : 'Unknown';
    const scoreText = manga.score ? `⭐ ${manga.score}/10` : 'N/A';
    const memberText = manga.members ? formatNumber(manga.members) : 'N/A';
    const favoritesText = manga.favorites ? formatNumber(manga.favorites) : 'N/A';
    const rankText = manga.rank ? `#${manga.rank}` : 'N/A';
    const popularityText = manga.popularity_rank ? `#${manga.popularity_rank}` : 'N/A';

    const authorsText = manga.authors && manga.authors.length > 0
        ? manga.authors.map(a => `${a.name} (${a.role})`).join(', ')
        : 'Unknown';

    const serializationText = manga.serialization && manga.serialization.length > 0
        ? manga.serialization.join(', ')
        : 'N/A';

    const themesText = [...(manga.themes || []), ...(manga.demographics || [])].join(', ') || 'None';

    return new EmbedBuilder()
        .setTitle(`${config.emoji} ${title}`)
        .setURL(manga.siteUrl)
        .setColor(parseInt(config.color.replace('#', ''), 16))
        .setThumbnail(manga.coverImage?.large || null)
        .setDescription(description)
        .addFields(
            { name: '📊 Score', value: scoreText, inline: true },
            { name: '📈 Ranked', value: rankText, inline: true },
            { name: '🔥 Popularity', value: popularityText, inline: true },
            { name: '📖 Chapters', value: chaptersText, inline: true },
            { name: '📚 Volumes', value: volumesText, inline: true },
            { name: '📅 Published', value: `${startDate} → ${endDate}`, inline: true },
            { name: '📝 Type', value: manga.format || config.label, inline: true },
            { name: '📡 Status', value: manga.status || 'Unknown', inline: true },
            { name: '📰 Serialization', value: serializationText, inline: true },
            { name: '✍️ Authors', value: anilistService.truncate(authorsText, 100), inline: false },
            { name: '🏷️ Genres', value: manga.genres?.join(', ') || 'None', inline: false },
            { name: '🎯 Themes', value: themesText, inline: false },
            { name: '👥 Community', value: `${memberText} members • ${favoritesText} favorites`, inline: false }
        )
        .setFooter({ text: `MyAnimeList ${config.label} • Scored by ${manga.scoredBy ? formatNumber(manga.scoredBy) : '?'} users` });
}
