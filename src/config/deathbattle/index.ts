/**
 * Deathbattle Config
 * @module config/deathbattle
 */
import type { DeathbattleConfig } from '../../types/config/deathbattle.js';

const deathbattleConfig: DeathbattleConfig = {
    enabled: true,
    maxRounds: 10,
    LOG_CHANNEL_ID: process.env.SYSTEM_LOG_CHANNEL_ID || ''
};

export { type DeathbattleConfig };

export default deathbattleConfig;

