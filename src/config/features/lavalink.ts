/**
 * Lavalink Feature Configuration
 * Multi-node setup for load balancing and failover
 * @module config/features/lavalink
 */

// Multi-node configuration for high availability
// Shoukaku automatically load balances players across nodes
// If one node dies, players migrate to other nodes
export const nodes = [
    {
        name: 'node-1',
        url: `${process.env.LAVALINK_HOST_1 || process.env.LAVALINK_HOST || 'localhost'}:${process.env.LAVALINK_PORT || 2333}`,
        auth: process.env.LAVALINK_PASSWORD || 'youshallnotpass',
        secure: false
    },
    {
        name: 'node-2',
        url: `${process.env.LAVALINK_HOST_2 || process.env.LAVALINK_HOST || 'localhost'}:${process.env.LAVALINK_PORT_2 || 2334}`,
        auth: process.env.LAVALINK_PASSWORD || 'youshallnotpass',
        secure: false
    },
    {
        name: 'node-3',
        url: `${process.env.LAVALINK_HOST_3 || process.env.LAVALINK_HOST || 'localhost'}:${process.env.LAVALINK_PORT_3 || 2335}`,
        auth: process.env.LAVALINK_PASSWORD || 'youshallnotpass',
        secure: false
    }
];

export const clientName = 'Shoukaku';
export const defaultSearchPlatform = 'ytsearch';
export const fallbackSearchPlatform = 'scsearch';

export const playerOptions = {
    volume: 100,
    selfDeafen: true,
    selfMute: false
};

export const shoukakuOptions = {
    resume: false,
    resumeTimeout: 30,
    resumeByLibrary: false,
    reconnectTries: 30,
    reconnectInterval: 5000,
    restTimeout: 60000,
    moveOnDisconnect: false,
    userAgent: 'Shoukaku/2.0'
};

export default {
    nodes,
    clientName,
    defaultSearchPlatform,
    fallbackSearchPlatform,
    playerOptions,
    shoukakuOptions
};
