/**
 * Environment Variable Validation
 * Fail-fast on missing required configuration
 * Call this before any other initialization
 * @module config/validation
 */

interface EnvRule {
    /** Environment variable name */
    name: string;
    /** Whether the variable is required (fatal if missing) */
    required: boolean;
    /** Description for error messages */
    description: string;
    /** Category for grouping in output */
    category: 'core' | 'database' | 'api' | 'music' | 'video';
}

/**
 * All environment variables the application uses
 */
const ENV_RULES: EnvRule[] = [
    // ── Core (required) ──
    { name: 'BOT_TOKEN', required: true, description: 'Discord bot token', category: 'core' },
    { name: 'CLIENT_ID', required: true, description: 'Discord application client ID', category: 'core' },
    { name: 'OWNER_ID', required: false, description: 'Bot owner Discord user ID', category: 'core' },

    // ── Database (required) ──
    { name: 'DB_HOST', required: true, description: 'PostgreSQL host', category: 'database' },
    { name: 'DB_PORT', required: false, description: 'PostgreSQL port (default: 5432)', category: 'database' },
    { name: 'DB_USER', required: true, description: 'PostgreSQL username', category: 'database' },
    { name: 'DB_PASSWORD', required: true, description: 'PostgreSQL password', category: 'database' },
    { name: 'DB_NAME', required: true, description: 'PostgreSQL database name', category: 'database' },
    
    // ── Redis (optional — falls back to in-memory) ──
    { name: 'REDIS_URL', required: false, description: 'Redis connection URL', category: 'database' },

    // ── API Keys (optional — features disabled if missing) ──
    { name: 'GOOGLE_API_KEY', required: false, description: 'Google Custom Search API key', category: 'api' },
    { name: 'GOOGLE_SEARCH_CX', required: false, description: 'Google Custom Search engine ID', category: 'api' },
    { name: 'STEAM_API_KEY', required: false, description: 'Steam Web API key', category: 'api' },
    { name: 'REDDIT_CLIENT_ID', required: false, description: 'Reddit API client ID', category: 'api' },
    { name: 'REDDIT_SECRET_KEY', required: false, description: 'Reddit API secret', category: 'api' },
    { name: 'PIXIV_REFRESH_TOKEN', required: false, description: 'Pixiv OAuth refresh token', category: 'api' },
    { name: 'PIXIV_CLIENT_ID', required: false, description: 'Pixiv API client ID', category: 'api' },
    { name: 'PIXIV_CLIENT_SECRET', required: false, description: 'Pixiv API client secret', category: 'api' },

    // ── Owner/Logging (optional — features degrade if missing) ──
    { name: 'OWNER_IDS', required: false, description: 'Comma-separated owner Discord user IDs', category: 'core' },
    { name: 'DEVELOPER_ID', required: false, description: 'Primary developer Discord user ID', category: 'core' },
    { name: 'GUILD_LOG_CHANNEL_ID', required: false, description: 'Guild join/leave log channel', category: 'core' },
    { name: 'REPORT_CHANNEL_ID', required: false, description: 'User report channel', category: 'core' },
    { name: 'SYSTEM_LOG_CHANNEL_ID', required: false, description: 'System log channel', category: 'core' },
    { name: 'SUPPORT_GUILD_ID', required: false, description: 'Support server guild ID', category: 'core' },

    // ── Music (optional — disabled if not configured) ──
    { name: 'LAVALINK_HOST_1', required: false, description: 'Lavalink node-1 host', category: 'music' },
    { name: 'LAVALINK_PASSWORD', required: false, description: 'Lavalink server password', category: 'music' },

    // ── Video (optional) ──
    { name: 'COBALT_INSTANCES', required: false, description: 'Cobalt API instance URLs (comma-separated)', category: 'video' },
];

/**
 * Validation result
 */
export interface ValidationResult {
    valid: boolean;
    missing: { name: string; description: string; category: string }[];
    warnings: { name: string; description: string; category: string }[];
}

/**
 * Validate all required environment variables are present.
 * Logs warnings for missing optional variables.
 * @returns Validation result
 */
export function validateEnvironment(): ValidationResult {
    const result: ValidationResult = {
        valid: true,
        missing: [],
        warnings: [],
    };

    for (const rule of ENV_RULES) {
        const value = process.env[rule.name];
        const isMissing = !value || value.trim() === '';

        if (isMissing) {
            if (rule.required) {
                result.valid = false;
                result.missing.push({
                    name: rule.name,
                    description: rule.description,
                    category: rule.category,
                });
            } else {
                result.warnings.push({
                    name: rule.name,
                    description: rule.description,
                    category: rule.category,
                });
            }
        }
    }

    return result;
}

/**
 * Validate and exit if critical variables are missing.
 * Call this at the very start of the application.
 */
export function validateOrExit(): void {
    const result = validateEnvironment();

    // Print warnings for optional missing vars
    if (result.warnings.length > 0) {
        // console intentional: Logger may not be initialized
        console.warn('\n⚠️  Missing optional environment variables:');
        const byCategory = groupByCategory(result.warnings);
        for (const [category, vars] of Object.entries(byCategory)) {
            console.warn(`  [${category}]`);
            for (const v of vars) {
                console.warn(`    - ${v.name}: ${v.description}`);
            }
        }
        console.warn('  These features will be disabled or use fallbacks.\n');
    }

    // Fatal error for required missing vars
    if (!result.valid) {
        // console intentional: Logger may not be initialized
        console.error('\n❌ FATAL: Missing required environment variables:');
        const byCategory = groupByCategory(result.missing);
        for (const [category, vars] of Object.entries(byCategory)) {
            console.error(`  [${category}]`);
            for (const v of vars) {
                console.error(`    - ${v.name}: ${v.description}`);
            }
        }
        console.error('\nSet these variables in your .env file or environment.\n');
        process.exit(1);
    }
}

/**
 * Group items by category for display
 */
function groupByCategory<T extends { category: string }>(items: T[]): Record<string, T[]> {
    const groups: Record<string, T[]> = {};
    for (const item of items) {
        if (!groups[item.category]) groups[item.category] = [];
        groups[item.category].push(item);
    }
    return groups;
}

// Named exports only — use `import { validateEnvironment, validateOrExit } from '...'`
