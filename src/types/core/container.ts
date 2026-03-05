export interface ContainerServiceOptions {
    singleton?: boolean;
    tags?: string[];
}

export interface ServiceRegistration<T = unknown> {
    factory: (container: any) => T;
    options: Required<ContainerServiceOptions>;
}

export interface Service {
    initialize?(): Promise<void> | void;
    shutdown?(): Promise<void> | void;
    destroy?(): Promise<void> | void;
    close?(): Promise<void> | void;
    shutdownAll?(): Promise<void> | void;
    destroyAll?(): Promise<void> | void;
}

export interface ContainerDebugInfo {
    registered: string[];
    instantiated: string[];
    tags: Record<string, string[]>;
}
