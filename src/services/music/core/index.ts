/**
 * Music Core Services
 * Core music functionality: Lavalink, Facade, Types, Managers
 * @module services/music/core
 */

export { default as lavalinkService, LavalinkService } from './LavalinkService.js';
export { type LavalinkSearchResult, type PlaylistResult, type PreservedState, type NodeStatus } from './LavalinkService.js';

export { default as musicFacade, musicFacade as MusicFacade } from './MusicFacade.js';
export { musicFacade as MusicService } from './MusicFacade.js';

export { MusicNowPlayingManager } from './MusicNowPlayingManager.js';
export { MusicUserDataService } from './MusicUserDataService.js';
export { MusicSkipVoteManager } from './MusicSkipVoteManager.js';

export type { Track, TrackInfo } from '../../../types/music/track.js';
export type { LoopMode, NowPlayingOptions, PlayNextResult } from '../../../types/music/playback.js';
export type { QueueState } from '../../../types/music/queue.js';
export type { PlayerEventHandlers } from '../../../types/music/events.js';
export type { SkipResult, VoteSkipResult, ControlButtonOptions, MusicStats } from '../../../types/music/facade.js';



