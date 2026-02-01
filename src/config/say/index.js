/**
 * Say Command Config
 */
module.exports = {
    TYPE_COLORS: {
        default: 0x5865F2,
        success: 0x57F287,
        warning: 0xFEE75C,
        error: 0xED4245
    },
    OWNER_ID: process.env.OWNER_ID || '',
    LOG_CHANNEL_ID: process.env.LOG_CHANNEL_ID || ''
};
