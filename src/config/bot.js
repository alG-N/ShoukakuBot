/**
 * Bot Configuration
 * Main configuration file for alterGolden Discord Bot
 * @module config/bot
 */

module.exports = {
    // Bot identification (from environment variable)
    clientId: process.env.CLIENT_ID || '1467027746906701951',
    
    // Command deployment
    autoDeploy: process.env.AUTO_DEPLOY !== 'false',
    
    // Presence settings
    presence: {
        status: 'online',
        activity: '/help | alterGolden',
        activityType: 'PLAYING' // PLAYING, STREAMING, LISTENING, WATCHING, COMPETING
    }
};
