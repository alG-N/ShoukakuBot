/**
 * Maintenance Configuration
 * Persistence via CacheService (Redis) instead of synchronous file I/O.
 * Falls back to in-memory-only state when Redis is unavailable.
 *
 * @module config/maintenance
 */

import { EmbedBuilder } from 'discord.js';
import { DEVELOPER_ID } from './owner.js';

import { getDefault } from '../utils/common/moduleHelper.js';
// Lazy-load cacheService to avoid circular dependency at module init
let _cacheService: typeof import('../cache/CacheService').default | null = null;
const getCacheService = () => {
    if (!_cacheService) {
        try { _cacheService = getDefault(require('../cache/CacheService')); } catch { /* not ready */ }
    }
    return _cacheService;
};

// Redis key for persistent maintenance state
const REDIS_KEY = 'altergolden:maintenance:state';
const REDIS_NS = 'session'; // Long-lived namespace

// ── Types ────────────────────────────────────────────────────────────
interface ScheduledMaintenance {
    startTime: number;
    reason: string;
    estimatedDuration: number | null;
    [key: string]: unknown;
}

interface MaintenanceState {
    enabled: boolean;
    reason: string | null;
    startTime: number | null;
    estimatedEnd: number | null;
    partialMode: boolean;
    disabledFeatures: string[];
    allowedUsers: string[];
    scheduledMaintenance: ScheduledMaintenance | null;
}

interface MaintenanceOptions {
    reason?: string;
    estimatedEnd?: number | null;
    partialMode?: boolean;
    disabledFeatures?: string[];
}

interface MaintenanceStatus {
    active: boolean;
    enabled?: boolean;
    reason?: string | null;
    estimatedEnd?: number | null;
    startTime?: number | null;
    message: string | null;
    partialMode?: boolean;
    disabledFeatures?: string[];
}

// ── State ────────────────────────────────────────────────────────────
let maintenanceState: MaintenanceState = {
    enabled: false,
    reason: 'Scheduled maintenance',
    startTime: null,
    estimatedEnd: null,
    partialMode: false,
    disabledFeatures: [],
    allowedUsers: [],
    scheduledMaintenance: null
};

// ── Persistence (non-blocking, fire-and-forget) ──────────────────────

/**
 * Persist current state to Redis (fire-and-forget).
 * Uses CacheService with a 30-day TTL — maintenance state is long-lived.
 */
function persistState(): void {
    const cs = getCacheService();
    if (cs) {
        cs.set(REDIS_NS, REDIS_KEY, maintenanceState, 30 * 24 * 3600).catch(() => {});
    }
}

/**
 * Load maintenance state from Redis.
 * Called once at startup after CacheService is initialized.
 */
export async function loadMaintenanceState(): Promise<MaintenanceState> {
    try {
        const cs = getCacheService();
        if (cs) {
            const data = await cs.get<MaintenanceState>(REDIS_NS, REDIS_KEY);
            if (data) {
                maintenanceState = { ...maintenanceState, ...data };
            }
        }
    } catch (error) {
        console.error('[Maintenance] Failed to load state from Redis:', (error as Error).message);
    }
    return maintenanceState;
}

/**
 * Save maintenance state (public alias — fire-and-forget to Redis)
 */
export function saveMaintenanceState(): void {
    persistState();
}

// ── Maintenance Control ──────────────────────────────────────────────

/**
 * Enable maintenance mode
 */
export function enableMaintenance(options: MaintenanceOptions = {}): MaintenanceState {
    maintenanceState.enabled = true;
    maintenanceState.reason = options.reason || 'Scheduled maintenance';
    maintenanceState.startTime = Date.now();
    maintenanceState.estimatedEnd = options.estimatedEnd || null;
    maintenanceState.partialMode = options.partialMode || false;
    maintenanceState.disabledFeatures = options.disabledFeatures || [];

    if (!maintenanceState.allowedUsers.includes(DEVELOPER_ID)) {
        maintenanceState.allowedUsers.push(DEVELOPER_ID);
    }

    persistState();
    return maintenanceState;
}

/**
 * Disable maintenance mode
 */
export function disableMaintenance(): MaintenanceState {
    maintenanceState.enabled = false;
    maintenanceState.reason = null;
    maintenanceState.startTime = null;
    maintenanceState.estimatedEnd = null;
    maintenanceState.partialMode = false;
    maintenanceState.disabledFeatures = [];

    persistState();
    return maintenanceState;
}

/**
 * Check if maintenance is active
 */
export function isInMaintenance(): boolean {
    return maintenanceState.enabled;
}

/**
 * Check if user can bypass maintenance
 */
export function canBypassMaintenance(userId: string): boolean {
    return userId === DEVELOPER_ID || maintenanceState.allowedUsers.includes(userId);
}

/**
 * Check if user is allowed during maintenance
 */
export function isAllowedDuringMaintenance(userId: string): boolean {
    if (!maintenanceState.enabled) return true;
    return canBypassMaintenance(userId);
}

/**
 * Check if a specific feature is disabled
 */
export function isFeatureDisabled(featureName: string): boolean {
    if (!maintenanceState.enabled) return false;
    if (!maintenanceState.partialMode) return true; // All features disabled
    return maintenanceState.disabledFeatures.includes(featureName);
}

// ── User Management ──────────────────────────────────────────────────

/**
 * Add user to bypass list
 */
export function addBypassUser(userId: string): void {
    if (!maintenanceState.allowedUsers.includes(userId)) {
        maintenanceState.allowedUsers.push(userId);
        persistState();
    }
}

/**
 * Remove user from bypass list
 */
export function removeBypassUser(userId: string): void {
    maintenanceState.allowedUsers = maintenanceState.allowedUsers.filter(id => id !== userId);
    persistState();
}

// ── Scheduling ───────────────────────────────────────────────────────

/**
 * Schedule future maintenance
 */
export function scheduleMaintenance(startTime: number, options: Partial<ScheduledMaintenance> = {}): ScheduledMaintenance {
    maintenanceState.scheduledMaintenance = {
        startTime,
        reason: options.reason || 'Scheduled maintenance',
        estimatedDuration: options.estimatedDuration || null,
        ...options
    };
    persistState();
    return maintenanceState.scheduledMaintenance;
}

/**
 * Cancel scheduled maintenance
 */
export function cancelScheduledMaintenance(): void {
    maintenanceState.scheduledMaintenance = null;
    persistState();
}

// ── Status & Display ─────────────────────────────────────────────────

/**
 * Get maintenance status for display
 */
export function getMaintenanceStatus(): MaintenanceStatus {
    if (!maintenanceState.enabled) {
        return {
            active: false,
            message: null
        };
    }

    let timeInfo = '';
    if (maintenanceState.estimatedEnd) {
        const remaining = maintenanceState.estimatedEnd - Date.now();
        if (remaining > 0) {
            const hours = Math.floor(remaining / 3600000);
            const minutes = Math.floor((remaining % 3600000) / 60000);
            timeInfo = `\n⏰ Estimated completion: ${hours}h ${minutes}m`;
        }
    }

    return {
        active: true,
        enabled: maintenanceState.enabled,
        reason: maintenanceState.reason,
        estimatedEnd: maintenanceState.estimatedEnd,
        startTime: maintenanceState.startTime,
        message: `🚧 **Maintenance Active**\n\n${maintenanceState.reason || 'Bot is undergoing maintenance.'}${timeInfo}\n\nThank you for your patience!`,
        partialMode: maintenanceState.partialMode,
        disabledFeatures: maintenanceState.disabledFeatures
    };
}

/**
 * Create maintenance embed
 */
export function createMaintenanceEmbed(): EmbedBuilder {
    const status = getMaintenanceStatus();

    const embed = new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle('🚧 Maintenance Mode')
        .setDescription(status.message || 'Bot is currently in maintenance mode.')
        .setFooter({ text: 'alterGolden Bot' })
        .setTimestamp();

    if (maintenanceState.estimatedEnd) {
        embed.addFields({
            name: '⏰ Estimated End',
            value: `<t:${Math.floor(maintenanceState.estimatedEnd / 1000)}:R>`,
            inline: true
        });
    }

    if (maintenanceState.startTime) {
        embed.addFields({
            name: '🕐 Started',
            value: `<t:${Math.floor(maintenanceState.startTime / 1000)}:R>`,
            inline: true
        });
    }

    if (maintenanceState.partialMode && maintenanceState.disabledFeatures.length > 0) {
        embed.addFields({
            name: '🔧 Disabled Features',
            value: maintenanceState.disabledFeatures.join(', '),
            inline: false
        });
    }

    return embed;
}

/**
 * Get the full state object
 */
export function getMaintenanceState(): MaintenanceState {
    return { ...maintenanceState };
}

export default {
    enableMaintenance,
    disableMaintenance,
    isInMaintenance,
    canBypassMaintenance,
    isAllowedDuringMaintenance,
    isFeatureDisabled,
    addBypassUser,
    removeBypassUser,
    scheduleMaintenance,
    cancelScheduledMaintenance,
    getMaintenanceStatus,
    createMaintenanceEmbed,
    getMaintenanceState,
    loadMaintenanceState,
    saveMaintenanceState
};
