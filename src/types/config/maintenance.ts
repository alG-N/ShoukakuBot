export interface ScheduledMaintenance {
    startTime: number;
    reason: string;
    estimatedDuration: number | null;
    [key: string]: unknown;
}

export interface MaintenanceState {
    enabled: boolean;
    reason: string | null;
    startTime: number | null;
    estimatedEnd: number | null;
    partialMode: boolean;
    disabledFeatures: string[];
    allowedUsers: string[];
    scheduledMaintenance: ScheduledMaintenance | null;
}

export interface MaintenanceOptions {
    reason?: string;
    estimatedEnd?: number | null;
    partialMode?: boolean;
    disabledFeatures?: string[];
}

export interface MaintenanceStatus {
    active: boolean;
    enabled?: boolean;
    reason?: string | null;
    estimatedEnd?: number | null;
    startTime?: number | null;
    message: string | null;
    partialMode?: boolean;
    disabledFeatures?: string[];
}
