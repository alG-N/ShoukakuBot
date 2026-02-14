/**
 * Music Services
 * 
 * Architecture (Phase 2 Week 6-7):
 * - MusicFacade: Orchestrator providing backward-compatible API
 * - QueueService: Queue CRUD operations
 * - PlaybackService: Play, pause, skip, stop operations
 * - VoiceConnectionService: Voice channel connection and monitoring
 * - AutoPlayService: Similar track discovery for auto-play
 * - LavalinkService: Low-level Lavalink connection management
 * 
 * Event System (Week 7):
 * - MusicEventBus: Central event emitter for decoupled communication
 * - MusicEvents: Event name constants
 * - PlaybackEventHandler: Handles player lifecycle events
 * @module services/music
 */

// New architecture (Phase 2)
export { default as musicFacade, musicFacade as MusicFacade } from './MusicFacade.js';
export { queueService, QueueService } from './queue/index.js';
export { playbackService, PlaybackService } from './playback/index.js';
export { voiceConnectionService, VoiceConnectionService } from './voice/index.js';
export { autoPlayService, AutoPlayService } from './autoplay/index.js';

// Extracted modules (Phase P)
export { MusicNowPlayingManager } from './MusicNowPlayingManager.js';
export { MusicUserDataService } from './MusicUserDataService.js';
export { MusicSkipVoteManager } from './MusicSkipVoteManager.js';

// Event system (Week 7)
export { musicEventBus, MusicEventBus, MusicEvents, playbackEventHandler, PlaybackEventHandler } from './events/index.js';

// Core services
export { default as lavalinkService, LavalinkService } from './LavalinkService.js';

// Re-export MusicFacade as MusicService for backward compatibility
export { musicFacade as MusicService } from './MusicFacade.js';

// Type exports
export type { MusicQueue, QueueState } from './queue/index.js';
export type { PlaybackState, PlayNextResult } from './playback/index.js';
export type { ConnectionState, PlayerEventHandlers } from './voice/index.js';
export type { SearchResult, PlaylistResult, PreservedState, NodeStatus } from './LavalinkService.js';
export type {
    MusicEventName,
    TrackEventData,
    PlaybackEventData,
    QueueEventData,
    VoiceEventData,
    AutoPlayEventData,
    SkipVoteEventData,
    NowPlayingEventData,
    SystemEventData,
    MusicTrack,
    TrackInfo
} from './events/index.js';
