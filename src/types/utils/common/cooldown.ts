export interface CooldownCheckResult {
    onCooldown: boolean;
    remaining: number;
}

export interface CooldownCheckAndSetResult {
    passed: boolean;
    remaining: number;
}

export interface CooldownManagerOptions {
    defaultCooldown?: number;
    prefix?: string;
}
