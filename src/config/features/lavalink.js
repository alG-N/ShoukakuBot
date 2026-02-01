/**
 * Lavalink Feature Configuration
 * Settings for the Lavalink music server
 * @module config/features/lavalink
 */

module.exports = {
    // ==========================================
    // NODES
    // ==========================================
    nodes: [
        {
            name: 'main-node',
            url: `${process.env.LAVALINK_HOST || 'localhost'}:${process.env.LAVALINK_PORT || 2333}`,
            auth: process.env.LAVALINK_PASSWORD || 'youshallnotpass',
            secure: false
        }
    ],
    
    // ==========================================
    // CLIENT SETTINGS
    // ==========================================
    clientName: 'alterGolden',
    defaultSearchPlatform: 'ytsearch',
    fallbackSearchPlatform: 'scsearch',
    
    // ==========================================
    // PLAYER OPTIONS
    // ==========================================
    playerOptions: {
        volume: 80,
        selfDeafen: true,
        selfMute: false
    },
    
    // ==========================================
    // SHOUKAKU OPTIONS
    // ==========================================
    shoukakuOptions: {
        resume: false,
        resumeTimeout: 30,
        resumeByLibrary: false,
        reconnectTries: 5,
        reconnectInterval: 5000,
        restTimeout: 60000,
        moveOnDisconnect: false,
        userAgent: 'alterGolden/2.0'
    }
};
