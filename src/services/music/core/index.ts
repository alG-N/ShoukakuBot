/**
 * Music Core Services
 * Core music functionality: Lavalink, Facade, Types, Managers
 * @module services/music/core
 */

export { default as lavalinkService, LavalinkService } from './LavalinkService.js';
export type { SearchResult, PlaylistResult, PreservedState, NodeStatus } from './LavalinkService.js';

export { default as musicFacade, musicFacade as MusicFacade } from './MusicFacade.js';
export { musicFacade as MusicService } from './MusicFacade.js';

export { MusicNowPlayingManager } from './MusicNowPlayingManager.js';
export { MusicUserDataService } from './MusicUserDataService.js';
export { MusicSkipVoteManager } from './MusicSkipVoteManager.js';

export type * from './MusicTypes.js';
