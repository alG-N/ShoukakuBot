/**
 * Music Core Services
 * Core music functionality: Lavalink, Facade, Types, Managers
 * @module services/music/core
 */

export { default as lavalinkService, LavalinkService } from './lavalinkService.js';
export { type LavalinkSearchResult, type PlaylistResult, type PreservedState, type NodeStatus } from './lavalinkService.js';

export { default as musicFacade, musicFacade as MusicFacade } from './musicFacade.js';
export { musicFacade as MusicService } from './musicFacade.js';

export { MusicNowPlayingManager } from './musicNowPlayingManager.js';
export { MusicUserDataService } from './musicUserDataService.js';
export { MusicSkipVoteManager } from './musicSkipVoteManager.js';

export type { Track, TrackInfo } from '../../../types/music/track.js';
export type { LoopMode, NowPlayingOptions, PlayNextResult } from '../../../types/music/playback.js';
export type { QueueState } from '../../../types/music/queue.js';
export type { PlayerEventHandlers } from '../../../types/music/events.js';
export type { SkipResult, VoteSkipResult, ControlButtonOptions, MusicStats } from '../../../types/music/facade.js';



