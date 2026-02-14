/**
 * Event Registry - Application Layer
 * Centralized event registration and management
 * @module services/registry/EventRegistry
 */

import type { Client as DiscordClient } from 'discord.js';
import logger from '../../core/Logger.js';
// TYPES
interface Event {
    name: string;
    once?: boolean;
    execute: (client: DiscordClient, ...args: unknown[]) => Promise<void> | void;
    safeExecute?: (client: DiscordClient, ...args: unknown[]) => Promise<void>;
}
// EVENT REGISTRY CLASS
class EventRegistry {
    public events: Map<string, Event> = new Map();

    /**
     * Load events from presentation layer
     */
    async loadEvents(): Promise<Map<string, Event>> {
        logger.info('EventRegistry', 'Loading events...');

        // Load presentation layer events
        await this._loadPresentationEvents();

        logger.info('EventRegistry', `Loaded ${this.events.size} events`);
        return this.events;
    }

    /**
     * Load events from events directory
     */
    private async _loadPresentationEvents(): Promise<void> {
        const eventFiles = ['ready', 'messageCreate', 'messageUpdate', 'guildCreate', 'guildDelete', 'guildMemberAdd', 'guildMemberRemove', 'voiceStateUpdate'];

        for (const eventFile of eventFiles) {
            try {
                const mod = await import(`../../events/${eventFile}.js`);
                // CJS dynamic import wraps module.exports as 'default'
                const eventExports = (mod.default || mod) as Record<string, unknown>;
                const event = (eventExports.default || eventExports) as Event;

                if (event?.name) {
                    this.events.set(event.name, event);
                    logger.info('EventRegistry', `Loaded: ${event.name}`);
                }
            } catch (error) {
                logger.error('EventRegistry', `Error loading ${eventFile}: ${(error as Error).message}`);
            }
        }
    }

    /**
     * Register all events with a Discord client
     */
    registerWithClient(client: DiscordClient): void {
        for (const [name, event] of this.events) {
            // Use safeExecute (error boundary) if available, otherwise fall back to execute
            const handler = event.safeExecute 
                ? (...args: unknown[]) => event.safeExecute!(client, ...args)
                : (...args: unknown[]) => event.execute(client, ...args);

            if (event.once) {
                client.once(name, handler);
            } else {
                client.on(name, handler);
            }
            logger.info('EventRegistry', `Registered: ${name} (once: ${event.once || false})`);
        }
    }

    /**
     * Get an event by name
     */
    get(name: string): Event | undefined {
        return this.events.get(name);
    }

    /**
     * Check if an event exists
     */
    has(name: string): boolean {
        return this.events.has(name);
    }

    /**
     * Get event count
     */
    get size(): number {
        return this.events.size;
    }
}

// Create default instance
const eventRegistry = new EventRegistry();

export { EventRegistry };
export default eventRegistry;

// Type export
export type { Event };
