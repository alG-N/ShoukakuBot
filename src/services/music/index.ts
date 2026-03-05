/**
 * Music Services
 * @module services/music
 */

export { default as musicFacade } from './core/MusicFacade.js';
export * from './core/MusicFacade.js';

export { default as queueService } from './queue/QueueService.js';
export * from './queue/index.js';

export { default as playbackService } from './playback/PlaybackService.js';
export * from './playback/index.js';

export { default as voiceConnectionService } from './voice/VoiceConnectionService.js';
export * from './voice/index.js';

export { default as autoPlayService } from './autoplay/AutoPlayService.js';
export * from './autoplay/index.js';

export { default as spotifyService } from './spotify/SpotifyService.js';
export * from './spotify/index.js';

export * from './core/MusicNowPlayingManager.js';
export * from './core/MusicUserDataService.js';
export * from './core/MusicSkipVoteManager.js';

export * from './events/index.js';

export { default as lavalinkService } from './core/LavalinkService.js';
export * from './core/LavalinkService.js';

export { musicFacade as MusicService } from './core/MusicFacade.js';

