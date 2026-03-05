export interface ShutdownHandler {
    name: string;
    handler: () => Promise<void>;
    priority: number;
}

export interface ShutdownResult {
    name: string;
    success: boolean;
    error?: string;
}

export interface ShutdownOptions {
    timeout?: number;
}
