/**
 * Event Registry - Application Layer
 * Centralized event registration and management
 * @module services/registry/EventRegistry
 */

import path from 'path';
import fs from 'fs';
import type { Client as DiscordClient } from 'discord.js';
// TYPES
interface Event {
    name: string;
    once?: boolean;
    execute: (client: DiscordClient, ...args: unknown[]) => Promise<void> | void;
}
// EVENT REGISTRY CLASS
class EventRegistry {
    public events: Map<string, Event> = new Map();

    /**
     * Load events from presentation layer
     */
    loadEvents(): Map<string, Event> {
        console.log('[EventRegistry] Loading events...');

        // Load presentation layer events
        this._loadPresentationEvents();

        console.log(`[EventRegistry] Loaded ${this.events.size} events`);
        return this.events;
    }

    /**
     * Load events from events directory
     */
    private _loadPresentationEvents(): void {
        const eventFiles = ['ready', 'messageCreate', 'messageUpdate', 'guildCreate', 'guildDelete', 'guildMemberAdd', 'guildMemberRemove', 'voiceStateUpdate'];

        for (const eventFile of eventFiles) {
            try {
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const mod = require(`../../events/${eventFile}`);
                const event = (mod.default || mod) as Event;

                if (event?.name) {
                    this.events.set(event.name, event);
                    console.log(`[EventRegistry] Loaded: ${event.name}`);
                }
            } catch (error) {
                console.error(`[EventRegistry] Error loading ${eventFile}:`, (error as Error).message);
            }
        }
    }

    /**
     * Register all events with a Discord client
     */
    registerWithClient(client: DiscordClient): void {
        for (const [name, event] of this.events) {
            if (event.once) {
                client.once(name, (...args: unknown[]) => event.execute(client, ...args));
            } else {
                client.on(name, (...args: unknown[]) => event.execute(client, ...args));
            }
            console.log(`[EventRegistry] Registered: ${name} (once: ${event.once || false})`);
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
