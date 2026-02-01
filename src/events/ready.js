/**
 * Ready Event - Presentation Layer
 * Fired when the bot successfully connects to Discord
 * @module presentation/events/ready
 */

const { Events } = require('discord.js');
const { BaseEvent } = require('./BaseEvent');
const logger = require('../core/Logger');
const { setPresence, ActivityType } = require('../core/Client');
const { bot } = require('../config');

class ReadyEvent extends BaseEvent {
    constructor() {
        super({
            name: Events.ClientReady,
            once: true
        });
    }

    async execute(client) {
        logger.success('Ready', `Logged in as ${client.user.tag}`);
        
        // Initialize logger with client
        logger.initialize(client);
        
        // Set presence
        setPresence(client, bot.presence.status, bot.presence.activity, ActivityType.Playing);
        
        // Log statistics
        logger.info('Ready', `Serving ${client.guilds.cache.size} guilds`);
        
        // Log startup to Discord
        await logger.logSystemEvent(
            'Bot Started', 
            `alterGolden is now online with ${client.guilds.cache.size} guilds`
        );
        
        logger.success('Ready', '🚀 alterGolden is fully operational!');
    }
}

module.exports = new ReadyEvent();



