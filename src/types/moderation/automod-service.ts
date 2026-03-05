export interface Violation {
    type: string;
    trigger: string;
    action: string;
    severity: number;
    muteDuration?: number;
    details?: unknown;
}

export interface ExecuteActionResult {
    deleted: boolean;
    warned: boolean;
    muted: boolean;
    escalated: boolean;
    warnCount: number;
    warnThreshold: number;
    muteDuration: number;
    error: string | null;
}
