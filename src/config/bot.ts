/**
 * Bot Configuration
 * Main configuration file for Shoukaku Discord Bot
 * @module config/bot
 */

export const clientId = process.env.CLIENT_ID || '';

export const autoDeploy = process.env.AUTO_DEPLOY !== 'false';

export const presence = {
    status: 'online' as const,
    activity: 'Teasing {members} shikkans with /help',
    activityType: 'CUSTOM' as const
};

export default {
    clientId,
    autoDeploy,
    presence
};
