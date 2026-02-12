/**
 * Base Event - Presentation Layer
 * Abstract base class for all events with error boundary
 * @module presentation/events/BaseEvent
 */

import type { Client } from 'discord.js';
import logger from '../core/Logger.js';
// TYPES
export interface EventOptions {
    name: string;
    once?: boolean;
}
// BASE EVENT CLASS
/**
 * Abstract base class for events
 * Provides safeExecute() error boundary analogous to BaseCommand.execute()
 * @abstract
 */
export abstract class BaseEvent {
    public readonly name: string;
    public readonly once: boolean;

    /**
     * @param options - Event configuration
     */
    constructor(options: EventOptions) {
        if (new.target === BaseEvent) {
            throw new Error('BaseEvent is abstract and cannot be instantiated directly');
        }

        this.name = options.name;
        this.once = options.once || false;
    }

    /**
     * Safe execution wrapper with error boundary
     * Catches all errors from execute() to prevent shard crashes
     * @param client - Discord client
     * @param args - Event arguments
     */
    async safeExecute(client: Client, ...args: unknown[]): Promise<void> {
        try {
            await this.execute(client, ...args);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger.error('Event', `[${this.name}] Unhandled error: ${message}`);
            
            // Log stack trace for debugging
            if (error instanceof Error && error.stack) {
                logger.debug('Event', `[${this.name}] Stack: ${error.stack}`);
            }
        }
    }

    /**
     * Execute the event handler
     * @abstract
     * @param client - Discord client
     * @param args - Event arguments
     */
    abstract execute(client: Client, ...args: unknown[]): Promise<void>;
}

export default BaseEvent;
