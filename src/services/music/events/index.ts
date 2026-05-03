/**
 * Music Events Module
 * @module services/music/events
 */

export { default as musicEventBus, MusicEventBus } from './musicEventBus.js';
export { default as MusicEvents } from './musicEvents.js';
export { default as playbackEventHandler, PlaybackEventHandler } from './playbackEventHandler.js';

// Re-export types
export { type MusicEventName, type TrackEventData, type PlaybackEventData, type QueueEventData, type VoiceEventData, type AutoPlayEventData, type SkipVoteEventData, type NowPlayingEventData, type SystemEventData, type MusicTrack, type TrackInfo } from './musicEvents.js';



