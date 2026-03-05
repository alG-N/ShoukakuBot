import type { LogLevel, SentrySeverity } from './runtime.js';

export interface StructuredLog {
    timestamp: string;
    level: SentrySeverity;
    severity: LogLevel;
    service: string;
    environment: string;
    category: string;
    message: string;
    shardId?: number;
    [key: string]: unknown;
}
