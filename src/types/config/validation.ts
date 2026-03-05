export interface EnvRule {
    name: string;
    required: boolean;
    description: string;
    category: 'core' | 'database' | 'api' | 'music' | 'video';
}

export interface ConfigValidationResult {
    valid: boolean;
    missing: { name: string; description: string; category: string }[];
    warnings: { name: string; description: string; category: string }[];
}
