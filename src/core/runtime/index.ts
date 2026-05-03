/**
 * Core Runtime Category
 * @module core/runtime
 */

export {
    createClient,
    setPresence,
    getClientStats,
    ActivityType,
    CLIENT_OPTIONS
} from './Client.js';
export { type ClientStats } from './Client.js';

export {
    registerShutdownHandler,
    handleShutdown,
    initializeShutdownHandlers,
    getIsShuttingDown
} from './shutdown.js';