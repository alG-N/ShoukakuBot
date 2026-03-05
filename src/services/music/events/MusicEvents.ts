/**
 * Music Event Constants
 * Centralized event names for the music system
 * @module services/music/events/MusicEvents
 */

import type { MusicTrack } from '../../../types/music/events.js';
import type {
    TrackEventData,
    PlaybackEventData,
    QueueEventData,
    VoiceEventData,
    AutoPlayEventData,
    SkipVoteEventData,
    NowPlayingEventData,
    SystemEventData
} from '../../../types/music/session.js';
import type { MusicEventName } from '../../../types/music/events-constants.js';
export { type TrackInfo } from '../../../types/music/track.js';
export { type MusicTrack } from '../../../types/music/events.js';
export { type TrackEventData, type PlaybackEventData, type QueueEventData, type VoiceEventData, type AutoPlayEventData, type SkipVoteEventData, type NowPlayingEventData, type SystemEventData } from '../../../types/music/session.js';
export { type MusicEventName } from '../../../types/music/events-constants.js';

export const MusicEvents = {
    // TRACK LIFECYCLE EVENTS
    /** Emitted when a track starts playing */
    TRACK_START: 'track:start',
    
    /** Emitted when a track ends (natural end, not skip) */
    TRACK_END: 'track:end',
    
    /** Emitted when a track is skipped */
    TRACK_SKIP: 'track:skip',
    
    /** Emitted when a track encounters an error/exception */
    TRACK_ERROR: 'track:error',
    
    /** Emitted when a track gets stuck */
    TRACK_STUCK: 'track:stuck',
    // PLAYBACK STATE EVENTS
    /** Emitted when playback is paused */
    PLAYBACK_PAUSE: 'playback:pause',
    
    /** Emitted when playback is resumed */
    PLAYBACK_RESUME: 'playback:resume',
    
    /** Emitted when playback is stopped */
    PLAYBACK_STOP: 'playback:stop',
    
    /** Emitted when volume changes */
    VOLUME_CHANGE: 'playback:volume',
    
    /** Emitted when seek operation occurs */
    PLAYBACK_SEEK: 'playback:seek',
    // QUEUE EVENTS
    /** Emitted when a track is added to queue */
    QUEUE_ADD: 'queue:add',
    
    /** Emitted when multiple tracks are added (playlist) */
    QUEUE_ADD_MANY: 'queue:addMany',
    
    /** Emitted when a track is removed from queue */
    QUEUE_REMOVE: 'queue:remove',
    
    /** Emitted when queue is cleared */
    QUEUE_CLEAR: 'queue:clear',
    
    /** Emitted when queue is shuffled */
    QUEUE_SHUFFLE: 'queue:shuffle',
    
    /** Emitted when a track is moved in queue */
    QUEUE_MOVE: 'queue:move',
    
    /** Emitted when queue finishes (no more tracks) */
    QUEUE_END: 'queue:end',
    
    /** Emitted when loop mode changes */
    LOOP_CHANGE: 'queue:loop',
    // VOICE CONNECTION EVENTS
    /** Emitted when bot connects to voice channel */
    VOICE_CONNECT: 'voice:connect',
    
    /** Emitted when bot disconnects from voice channel */
    VOICE_DISCONNECT: 'voice:disconnect',
    
    /** Emitted when voice connection is closed/dropped */
    VOICE_CLOSED: 'voice:closed',
    
    /** Emitted when voice channel becomes empty */
    VOICE_EMPTY: 'voice:empty',
    
    /** Emitted when inactivity timeout triggers */
    INACTIVITY_TIMEOUT: 'voice:inactivity',
    // AUTO-PLAY EVENTS
    /** Emitted when auto-play finds a similar track */
    AUTOPLAY_FOUND: 'autoplay:found',
    
    /** Emitted when auto-play fails to find tracks */
    AUTOPLAY_FAILED: 'autoplay:failed',
    
    /** Emitted when auto-play is enabled/disabled */
    AUTOPLAY_TOGGLE: 'autoplay:toggle',
    // SKIP VOTE EVENTS
    /** Emitted when skip vote starts */
    SKIPVOTE_START: 'skipvote:start',
    
    /** Emitted when user votes to skip */
    SKIPVOTE_ADD: 'skipvote:add',
    
    /** Emitted when skip vote succeeds */
    SKIPVOTE_SUCCESS: 'skipvote:success',
    
    /** Emitted when skip vote fails/times out */
    SKIPVOTE_FAIL: 'skipvote:fail',
    // NOW PLAYING EVENTS
    /** Emitted to send now playing message */
    NOWPLAYING_SEND: 'nowplaying:send',
    
    /** Emitted to update now playing message */
    NOWPLAYING_UPDATE: 'nowplaying:update',
    
    /** Emitted to disable/delete now playing message */
    NOWPLAYING_DISABLE: 'nowplaying:disable',
    // SYSTEM EVENTS
    /** Emitted when a critical error occurs */
    ERROR: 'system:error',
    
    /** Emitted when cleanup starts for a guild */
    CLEANUP_START: 'system:cleanup',
    
    /** Emitted when cleanup completes for a guild */
    CLEANUP_COMPLETE: 'system:cleanupComplete',
    
    /** Emitted for debug/logging purposes */
    DEBUG: 'system:debug'
} as const;

// Music track interface (placeholder - should match actual track structure)
export default MusicEvents;




