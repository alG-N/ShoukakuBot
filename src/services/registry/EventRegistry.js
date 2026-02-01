/**
 * Event Registry - Application Layer
 * Centralized event registration and management
 * @module application/EventRegistry
 */

const path = require('path');
const fs = require('fs');

/**
 * Event Registry for managing Discord events
 */
class EventRegistry {
    constructor() {
        /** @type {Map<string, Object>} */
        this.events = new Map();
    }

    /**
     * Load events from presentation layer
     * @param {Object} options - Load options
     * @param {boolean} [options.useLegacy=true] - Also load legacy events
     * @returns {Map} Loaded events
     */
    loadEvents(options = { useLegacy: true }) {
        console.log('[EventRegistry] Loading events...');
        
        // Load presentation layer events
        this._loadPresentationEvents();
        
        // Load legacy events if enabled
        if (options.useLegacy) {
            this._loadLegacyEvents();
        }
        
        console.log(`[EventRegistry] Loaded ${this.events.size} events`);
        return this.events;
    }

    /**
     * Load events from events directory
     * @private
     */
    _loadPresentationEvents() {
        const eventFiles = ['ready', 'messageCreate', 'guildCreate', 'guildDelete', 'voiceStateUpdate'];
        
        for (const eventFile of eventFiles) {
            try {
                const event = require(`../../events/${eventFile}`);
                
                if (event?.name) {
                    this.events.set(event.name, event);
                    console.log(`[EventRegistry] Loaded: ${event.name}`);
                }
            } catch (error) {
                console.error(`[EventRegistry] Error loading ${eventFile}:`, error.message);
            }
        }
    }

    /**
     * Load legacy events from events folder
     * @private
     */
    _loadLegacyEvents() {
        const eventsPath = path.join(__dirname, '..', '..', 'events');
        
        if (!fs.existsSync(eventsPath)) {
            return;
        }

        const eventFiles = fs.readdirSync(eventsPath)
            .filter(f => f.endsWith('.js'));
        
        for (const file of eventFiles) {
            try {
                const event = require(path.join(eventsPath, file));
                
                if (event?.name) {
                    // Only add if not already loaded from presentation layer
                    if (!this.events.has(event.name)) {
                        this.events.set(event.name, event);
                        console.log(`[EventRegistry] Loaded legacy: ${event.name}`);
                    }
                }
            } catch (error) {
                console.error(`[EventRegistry] Error loading ${file}:`, error.message);
            }
        }
    }

    /**
     * Register all events with a Discord client
     * @param {Client} client - Discord client
     */
    registerWithClient(client) {
        for (const [name, event] of this.events) {
            if (event.once) {
                client.once(name, (...args) => event.execute(client, ...args));
            } else {
                client.on(name, (...args) => event.execute(client, ...args));
            }
            console.log(`[EventRegistry] Registered: ${name} (once: ${event.once || false})`);
        }
    }

    /**
     * Get an event by name
     * @param {string} name - Event name
     * @returns {Object|undefined}
     */
    get(name) {
        return this.events.get(name);
    }

    /**
     * Check if an event exists
     * @param {string} name - Event name
     * @returns {boolean}
     */
    has(name) {
        return this.events.has(name);
    }

    /**
     * Get event count
     * @returns {number}
     */
    get size() {
        return this.events.size;
    }
}

module.exports = new EventRegistry();
