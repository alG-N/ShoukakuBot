/**
 * Music Services
 * @module services/music
 */

export { default as musicFacade } from './core/musicFacade.js';
export * from './core/musicFacade.js';

export { default as queueService } from './queue/queueService.js';
export * from './queue/index.js';

export { default as playbackService } from './playback/playbackService.js';
export * from './playback/index.js';

export { default as voiceConnectionService } from './voice/voiceConnectionService.js';
export * from './voice/index.js';

export { default as autoPlayService } from './autoplay/autoPlayService.js';
export * from './autoplay/index.js';

export { default as spotifyService } from './spotify/spotifyService.js';
export * from './spotify/index.js';

export * from './core/musicNowPlayingManager.js';
export * from './core/musicUserDataService.js';
export * from './core/musicSkipVoteManager.js';

export * from './events/index.js';

export { default as lavalinkService } from './core/lavalinkService.js';
export * from './core/lavalinkService.js';

export { musicFacade as MusicService } from './core/musicFacade.js';

