/**
 * Music Events Module
 * @module services/music/events
 */

export { default as musicEventBus, MusicEventBus } from './MusicEventBus.js';
export { default as MusicEvents } from './MusicEvents.js';
export { default as playbackEventHandler, PlaybackEventHandler } from './PlaybackEventHandler.js';

// Re-export types
export { type MusicEventName, type TrackEventData, type PlaybackEventData, type QueueEventData, type VoiceEventData, type AutoPlayEventData, type SkipVoteEventData, type NowPlayingEventData, type SystemEventData, type MusicTrack, type TrackInfo } from './MusicEvents.js';



