export type AppErrorCode =
    | 'UNKNOWN_ERROR'
    | 'VALIDATION_ERROR'
    | 'NOT_FOUND'
    | 'PERMISSION_DENIED'
    | 'RATE_LIMITED'
    | 'EXTERNAL_SERVICE_ERROR'
    | 'DATABASE_ERROR'
    | 'CONFIGURATION_ERROR'
    | 'TIMEOUT'
    | 'COOLDOWN';

export interface SerializedError {
    name: string;
    message: string;
    code: string;
    statusCode: number;
    timestamp: Date;
    [key: string]: unknown;
}
