/**
 * Dependency Injection Container
 * Manages service lifecycle and dependencies
 * Replaces singleton pattern for better testability and scalability
 * @module container
 */

import { logger } from './core/Logger.js';
// Types
/**
 * Service registration options
 */
export interface ServiceOptions {
    /** Whether to cache the instance (default: true) */
    singleton?: boolean;
    /** Tags for grouping services */
    tags?: string[];
}

/**
 * Service registration entry
 */
interface ServiceRegistration<T = unknown> {
    factory: (container: Container) => T;
    options: Required<ServiceOptions>;
}

/**
 * Service with optional lifecycle methods
 */
export interface Service {
    initialize?(): Promise<void> | void;
    shutdown?(): Promise<void> | void;
    destroy?(): Promise<void> | void;
    close?(): Promise<void> | void;
    shutdownAll?(): Promise<void> | void;
    destroyAll?(): Promise<void> | void;
}

/**
 * Container debug info
 */
export interface ContainerDebugInfo {
    registered: string[];
    instantiated: string[];
    tags: Record<string, string[]>;
}
// Container Class
export class Container {
    /** Service factories */
    private factories: Map<string, ServiceRegistration> = new Map();
    
    /** Cached singleton instances */
    private instances: Map<string, unknown> = new Map();
    
    /** Tag to service name mapping */
    private tagMap: Map<string, string[]> = new Map();
    
    /** Whether container is currently booting */
    private isBooting: boolean = false;
    
    /** Services currently being resolved (for circular dependency detection) */
    private resolving: Set<string> = new Set();

    /**
     * Register a service factory
     * 
     * ⚠️  RESERVED — Not currently used in production.
     * All services are registered via `container.instance()` in `bootstrap/services.ts`.
     * Do NOT use `register()` for new services — it creates factory-based singletons
     * separate from module-level singletons, causing the dual-instance problem.
     * See SYSTEM_REVIEW_V3 §4.1 for details.
     * 
     * @param name - Service name
     * @param factory - Factory function (container) => instance
     * @param options - Registration options
     * @returns this (for chaining)
     */
    register<T>(
        name: string, 
        factory: (container: Container) => T, 
        options: ServiceOptions = {}
    ): this {
        const opts: Required<ServiceOptions> = { 
            singleton: true, 
            tags: [], 
            ...options 
        };
        
        this.factories.set(name, { factory, options: opts });
        
        // Register tags
        for (const tag of opts.tags) {
            if (!this.tagMap.has(tag)) {
                this.tagMap.set(tag, []);
            }
            this.tagMap.get(tag)!.push(name);
        }
        
        logger.debug('Container', `Registered service: ${name}`);
        return this;
    }

    /**
     * Register a pre-built instance
     * @param name - Service name
     * @param inst - Service instance
     * @returns this (for chaining)
     */
    instance<T>(name: string, inst: T): this {
        this.instances.set(name, inst);
        logger.debug('Container', `Registered instance: ${name}`);
        return this;
    }

    /**
     * Resolve a service by name
     * @param name - Service name
     * @returns Service instance
     * @throws Error if service not found or circular dependency
     */
    resolve<T = unknown>(name: string): T {
        // Check for cached singleton
        if (this.instances.has(name)) {
            return this.instances.get(name) as T;
        }

        // Check if factory exists
        const registration = this.factories.get(name);
        if (!registration) {
            throw new Error(`Service not found: ${name}`);
        }

        // Check for circular dependencies
        if (this.resolving.has(name)) {
            const chain = [...this.resolving, name].join(' -> ');
            throw new Error(`Circular dependency detected: ${chain}`);
        }

        // Mark as resolving
        this.resolving.add(name);

        try {
            // Create instance
            const inst = registration.factory(this);

            // Cache if singleton
            if (registration.options.singleton) {
                this.instances.set(name, inst);
            }

            return inst as T;
        } finally {
            this.resolving.delete(name);
        }
    }

    /**
     * Check if a service is registered
     * @param name - Service name
     * @returns true if registered
     */
    has(name: string): boolean {
        return this.factories.has(name) || this.instances.has(name);
    }

    /**
     * Get all services with a specific tag
     * 
     * ⚠️  RESERVED — Not currently used. Tags are only set via `register()`,
     * which is also unused. See `register()` comment.
     * 
     * @param tag - Tag name
     * @returns Array of service instances
     */
    tagged<T = unknown>(tag: string): T[] {
        const names = this.tagMap.get(tag) || [];
        return names.map(name => this.resolve<T>(name));
    }

    /**
     * Reset container (for testing)
     * Clears all instances but keeps factories
     */
    reset(): void {
        this.instances.clear();
        this.resolving.clear();
        logger.debug('Container', 'Reset all instances');
    }

    /**
     * Clear everything (for testing)
     */
    clear(): void {
        this.factories.clear();
        this.instances.clear();
        this.tagMap.clear();
        this.resolving.clear();
        logger.debug('Container', 'Cleared all registrations');
    }

    /**
     * Boot all services (initialize singletons)
     * 
     * ⚠️  RESERVED — Not currently used. Services are initialized directly
     * by their own module-level init patterns, not through container.boot().
     * 
     * @param serviceNames - Specific services to boot, or all if empty
     */
    async boot(serviceNames: string[] = []): Promise<void> {
        if (this.isBooting) {
            throw new Error('Container is already booting');
        }

        this.isBooting = true;
        const toResolve = serviceNames.length > 0 
            ? serviceNames 
            : [...this.factories.keys()];

        logger.info('Container', `Booting ${toResolve.length} services...`);

        for (const name of toResolve) {
            try {
                const inst = this.resolve<Service>(name);
                
                // Call initialize() if exists
                if (inst && typeof inst.initialize === 'function') {
                    await inst.initialize();
                    logger.debug('Container', `Initialized: ${name}`);
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                logger.error('Container', `Failed to boot ${name}: ${message}`);
                throw error;
            }
        }

        this.isBooting = false;
        logger.info('Container', 'All services booted');
    }

    /**
     * Graceful shutdown of all services
     */
    async shutdown(): Promise<void> {
        logger.info('Container', 'Shutting down services...');

        for (const [name, inst] of this.instances) {
            try {
                const service = inst as Service;
                if (!service) continue;
                
                // Try lifecycle methods in priority order
                if (typeof service.shutdown === 'function') {
                    await service.shutdown();
                } else if (typeof service.shutdownAll === 'function') {
                    await service.shutdownAll();
                } else if (typeof service.destroy === 'function') {
                    await service.destroy();
                } else if (typeof service.destroyAll === 'function') {
                    await service.destroyAll();
                } else if (typeof service.close === 'function') {
                    await service.close();
                } else {
                    continue; // No lifecycle method — skip logging
                }
                logger.debug('Container', `Shutdown: ${name}`);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                logger.warn('Container', `Error shutting down ${name}: ${message}`);
            }
        }

        this.reset();
        logger.info('Container', 'All services shutdown');
    }

    /**
     * Get debug info about registered services
     * @returns Debug info object
     */
    getDebugInfo(): ContainerDebugInfo {
        return {
            registered: [...this.factories.keys()],
            instantiated: [...this.instances.keys()],
            tags: Object.fromEntries(this.tagMap)
        };
    }
}

// Export singleton container (but can create new instances for testing)
export const container = new Container();
export default container;
