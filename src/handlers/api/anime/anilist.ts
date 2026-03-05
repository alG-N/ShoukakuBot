import { EmbedBuilder } from 'discord.js';
import anilistService from '../../../services/api/anilistService.js';
import type { AnimeMedia } from '../../../types/api/anime.js';
import type { MediaRanking } from '../../../types/api/handlers/anime-handler.js';

export async function createAniListEmbed(anime: AnimeMedia): Promise<EmbedBuilder> {
    const title = anime.title.romaji || anime.title.english || anime.title.native || 'Unknown';
    const description = anime.description
        ? anilistService.truncate(anime.description.replace(/<\/?[^>]+(>|$)/g, ''), 500)
        : 'No description available.';

    const startDate = anilistService.formatDate(anime.startDate as any);
    const endDate = anime.endDate?.year
        ? anilistService.formatDate(anime.endDate as any)
        : anime.status === 'RELEASING' ? 'Ongoing' : 'Unknown';

    const totalMinutes = anime.episodes && anime.duration ? anime.episodes * anime.duration : 0;
    const humanReadableDuration = anilistService.formatDuration(totalMinutes);

    let episodeStatus = '??';
    let nextEpisodeCountdown = '';
    let finalEpisodeMsg = '';

    if (anime.nextAiringEpisode) {
        const currentEp = anime.nextAiringEpisode.episode - 1;
        episodeStatus = `${currentEp} / ${anime.episodes || '??'}`;

        const now = Math.floor(Date.now() / 1000);
        const delta = anime.nextAiringEpisode.airingAt - now;
        nextEpisodeCountdown = `, Ep ${anime.nextAiringEpisode.episode} in: ${anilistService.formatCountdown(delta)}`;

        if (anime.nextAiringEpisode.episode === anime.episodes) {
            finalEpisodeMsg = `\n**Final Episode airs in ${anilistService.formatCountdown(delta)}!**`;
        }
    } else if (anime.episodes) {
        episodeStatus = `${anime.episodes} / ${anime.episodes}`;
    }

    const relatedEntries = anilistService.formatRelatedEntries(anime.relations?.edges as any);
    const mainCharacters = anime.characters?.edges?.map(c => c.node.name.full || 'Unknown').join(', ') || 'N/A';

    const rankingObj = anime.rankings?.find((r: MediaRanking) => r.type === 'RATED' && r.allTime);
    const rankings = rankingObj ? `#${rankingObj.rank}` : '#??? (No Info)';

    const trailerUrl = anilistService.getTrailerUrl(anime.trailer as any);

    return new EmbedBuilder()
        .setTitle(`📘 ${title} (${anime.format || 'Unknown'})`)
        .setURL(anime.siteUrl)
        .setColor(parseInt((anime.coverImage?.color || '#3498db').replace('#', ''), 16))
        .setThumbnail(anime.coverImage?.large || null)
        .setDescription(description + finalEpisodeMsg)
        .addFields(
            { name: 'Score', value: anime.averageScore ? `${anime.averageScore}/100` : 'N/A', inline: true },
            { name: 'Episodes', value: `${episodeStatus}${nextEpisodeCountdown}`, inline: true },
            { name: 'Total Watch Time', value: humanReadableDuration, inline: true },
            { name: 'Release Date', value: `${startDate} → ${endDate}`, inline: true },
            { name: 'Type', value: anime.format || 'Unknown', inline: true },
            { name: 'Source', value: anime.source?.replace('_', ' ') || 'Unknown', inline: true },
            { name: 'Status', value: anime.status || 'Unknown', inline: true },
            { name: 'Studio', value: anime.studios?.nodes?.[0]?.name || 'Unknown', inline: true },
            { name: 'Trailer', value: trailerUrl, inline: true },
            { name: 'Genres', value: anime.genres?.join(', ') || 'None', inline: false },
            { name: 'Characters', value: mainCharacters, inline: false },
            { name: 'Leaderboard Rank', value: rankings, inline: true },
            { name: 'Recommendation', value: anime.averageScore ? anilistService.getRecommendation(anime.averageScore) : 'N/A', inline: true },
            { name: 'Other Seasons/Movies', value: anilistService.truncate(relatedEntries, 800), inline: false }
        )
        .setFooter({ text: 'Powered by AniList' });
}
