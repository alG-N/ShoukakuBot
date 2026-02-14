/**
 * Say Command Config
 * @module config/say
 */

import { PRIMARY_OWNER_ID } from '../owner.js';
// TYPE COLORS
export const TYPE_COLORS: Record<string, number> = {
    default: 0x5865F2,
    normal: 0x5865F2,
    success: 0x57F287,
    warning: 0xFEE75C,
    error: 0xED4245,
    info: 0x5865F2
};

/**
 * Primary owner ID for say command credit logic
 */
export const OWNER_ID: string = PRIMARY_OWNER_ID;
export const LOG_CHANNEL_ID: string = process.env.SYSTEM_LOG_CHANNEL_ID || '';
// DEFAULT EXPORT
export default {
    TYPE_COLORS,
    OWNER_ID,
    LOG_CHANNEL_ID
};
