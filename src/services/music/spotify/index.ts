/**
 * Spotify Module Index
 * @module services/music/spotify
 */

export { default as spotifyService, SpotifyService } from './SpotifyService.js';
export type {
    SpotifyToken,
    SpotifyTrack,
    SpotifyArtist,
    SpotifyAlbum,
    SpotifyRecommendation,
    SpotifySearchResult,
    SpotifyAudioFeatures,
    MoodProfile,
} from './SpotifyService.js';
