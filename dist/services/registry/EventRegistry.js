"use strict";
/**
 * Event Registry - Application Layer
 * Centralized event registration and management
 * @module services/registry/EventRegistry
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventRegistry = void 0;
// EVENT REGISTRY CLASS
class EventRegistry {
    events = new Map();
    /**
     * Load events from presentation layer
     */
    loadEvents() {
        console.log('[EventRegistry] Loading events...');
        // Load presentation layer events
        this._loadPresentationEvents();
        console.log(`[EventRegistry] Loaded ${this.events.size} events`);
        return this.events;
    }
    /**
     * Load events from events directory
     */
    _loadPresentationEvents() {
        const eventFiles = ['ready', 'messageCreate', 'messageUpdate', 'guildCreate', 'guildDelete', 'guildMemberAdd', 'guildMemberRemove', 'voiceStateUpdate'];
        for (const eventFile of eventFiles) {
            try {
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const mod = require(`../../events/${eventFile}`);
                const event = (mod.default || mod);
                if (event?.name) {
                    this.events.set(event.name, event);
                    console.log(`[EventRegistry] Loaded: ${event.name}`);
                }
            }
            catch (error) {
                console.error(`[EventRegistry] Error loading ${eventFile}:`, error.message);
            }
        }
    }
    /**
     * Register all events with a Discord client
     */
    registerWithClient(client) {
        for (const [name, event] of this.events) {
            if (event.once) {
                client.once(name, (...args) => event.execute(client, ...args));
            }
            else {
                client.on(name, (...args) => event.execute(client, ...args));
            }
            console.log(`[EventRegistry] Registered: ${name} (once: ${event.once || false})`);
        }
    }
    /**
     * Get an event by name
     */
    get(name) {
        return this.events.get(name);
    }
    /**
     * Check if an event exists
     */
    has(name) {
        return this.events.has(name);
    }
    /**
     * Get event count
     */
    get size() {
        return this.events.size;
    }
}
exports.EventRegistry = EventRegistry;
// Create default instance
const eventRegistry = new EventRegistry();
exports.default = eventRegistry;
//# sourceMappingURL=EventRegistry.js.map