/**
 * Handlers - Business logic handlers organized by feature
 * @module handlers
 */

// API handlers
import * as apiHandlers from './api/index.js';
export { apiHandlers as api };
export * from './api/index.js';

// Music handlers
import musicHandlers from './music/index.js';
export { musicHandlers as music };
export * from './music/index.js';

// Moderation handlers
import * as moderationHandlers from './moderation/index.js';
export { moderationHandlers as moderation };
export * from './moderation/index.js';

// General handlers
import * as generalHandlers from './general/index.js';
export { generalHandlers as general };
export * from './general/index.js';
