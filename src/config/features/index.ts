/**
 * Feature Configurations Index
 * @module config/features
 */

import * as music from './music.js';
import * as video from './video.js';
import * as lavalink from './lavalink.js';

// Moderation is complex, keep JS for now - will migrate later
// import * as moderation from './moderation/index.js';

export { music, video, lavalink };

export default {
    music,
    video,
    lavalink
};
