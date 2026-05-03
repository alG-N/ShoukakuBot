/**
 * Maintenance Config Unit Tests
 * Tests for maintenance mode control, user bypass, scheduling, and status
 */

// Mock CacheService before importing maintenance
jest.mock('../../../src/cache/cacheService', () => ({
    __esModule: true,
    default: {
        set: jest.fn().mockResolvedValue(undefined),
        get: jest.fn().mockResolvedValue(null),
    },
}));

// Mock owner config
jest.mock('../../../src/config/owner', () => ({
    DEVELOPER_ID: 'dev-123',
}));

// Mock discord.js EmbedBuilder
jest.mock('discord.js', () => ({
    EmbedBuilder: jest.fn().mockImplementation(() => {
        const embed: Record<string, unknown> = {};
        const methods = {
            setColor: jest.fn().mockReturnThis(),
            setTitle: jest.fn().mockReturnThis(),
            setDescription: jest.fn().mockReturnThis(),
            setFooter: jest.fn().mockReturnThis(),
            setTimestamp: jest.fn().mockReturnThis(),
            addFields: jest.fn().mockReturnThis(),
        };
        return Object.assign(embed, methods);
    }),
}));

import {
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
} from '../../../src/config/maintenance';

describe('Maintenance Config', () => {
    beforeEach(() => {
        // Reset to disabled state before each test
        disableMaintenance();
    });

    describe('enableMaintenance() / disableMaintenance()', () => {
        it('should enable maintenance mode', () => {
            enableMaintenance();

            expect(isInMaintenance()).toBe(true);
        });

        it('should disable maintenance mode', () => {
            enableMaintenance();
            disableMaintenance();

            expect(isInMaintenance()).toBe(false);
        });

        it('should set reason on enable', () => {
            enableMaintenance({ reason: 'Database migration' });

            const state = getMaintenanceState();
            expect(state.reason).toBe('Database migration');
        });

        it('should use default reason when none provided', () => {
            enableMaintenance();

            const state = getMaintenanceState();
            expect(state.reason).toBe('Scheduled maintenance');
        });

        it('should set startTime on enable', () => {
            const before = Date.now();
            enableMaintenance();
            const after = Date.now();

            const state = getMaintenanceState();
            expect(state.startTime).toBeGreaterThanOrEqual(before);
            expect(state.startTime).toBeLessThanOrEqual(after);
        });

        it('should clear all fields on disable', () => {
            enableMaintenance({
                reason: 'test',
                estimatedEnd: Date.now() + 3600000,
                partialMode: true,
                disabledFeatures: ['music', 'video'],
            });
            disableMaintenance();

            const state = getMaintenanceState();
            expect(state.enabled).toBe(false);
            expect(state.reason).toBeNull();
            expect(state.startTime).toBeNull();
            expect(state.estimatedEnd).toBeNull();
            expect(state.partialMode).toBe(false);
            expect(state.disabledFeatures).toHaveLength(0);
        });

        it('should return state object', () => {
            const state = enableMaintenance({ reason: 'test' });

            expect(state.enabled).toBe(true);
            expect(state.reason).toBe('test');
        });

        it('should auto-add DEVELOPER_ID to allowed users on enable', () => {
            enableMaintenance();

            const state = getMaintenanceState();
            expect(state.allowedUsers).toContain('dev-123');
        });

        it('should not duplicate DEVELOPER_ID in allowed users', () => {
            enableMaintenance();
            enableMaintenance(); // Enable again

            const state = getMaintenanceState();
            const devCount = state.allowedUsers.filter(id => id === 'dev-123').length;
            expect(devCount).toBe(1);
        });
    });

    describe('partial mode', () => {
        it('should enable partial mode with disabled features', () => {
            enableMaintenance({
                partialMode: true,
                disabledFeatures: ['music', 'video'],
            });

            const state = getMaintenanceState();
            expect(state.partialMode).toBe(true);
            expect(state.disabledFeatures).toEqual(['music', 'video']);
        });

        it('should set estimatedEnd when provided', () => {
            const end = Date.now() + 3600000;
            enableMaintenance({ estimatedEnd: end });

            const state = getMaintenanceState();
            expect(state.estimatedEnd).toBe(end);
        });
    });

    describe('isInMaintenance()', () => {
        it('should return false when not enabled', () => {
            expect(isInMaintenance()).toBe(false);
        });

        it('should return true when enabled', () => {
            enableMaintenance();
            expect(isInMaintenance()).toBe(true);
        });
    });

    describe('canBypassMaintenance()', () => {
        it('should allow developer to bypass', () => {
            expect(canBypassMaintenance('dev-123')).toBe(true);
        });

        it('should allow users in allowedUsers list', () => {
            addBypassUser('user-456');
            expect(canBypassMaintenance('user-456')).toBe(true);
        });

        it('should deny random users', () => {
            expect(canBypassMaintenance('random-user')).toBe(false);
        });
    });

    describe('isAllowedDuringMaintenance()', () => {
        it('should allow all users when maintenance is disabled', () => {
            expect(isAllowedDuringMaintenance('anyone')).toBe(true);
        });

        it('should deny regular users during maintenance', () => {
            enableMaintenance();
            expect(isAllowedDuringMaintenance('regular-user')).toBe(false);
        });

        it('should allow developer during maintenance', () => {
            enableMaintenance();
            expect(isAllowedDuringMaintenance('dev-123')).toBe(true);
        });

        it('should allow bypass users during maintenance', () => {
            addBypassUser('tester-789');
            enableMaintenance();
            expect(isAllowedDuringMaintenance('tester-789')).toBe(true);
        });
    });

    describe('isFeatureDisabled()', () => {
        it('should return false when maintenance is off', () => {
            expect(isFeatureDisabled('music')).toBe(false);
        });

        it('should return true for all features in full maintenance', () => {
            enableMaintenance({ partialMode: false });

            expect(isFeatureDisabled('music')).toBe(true);
            expect(isFeatureDisabled('video')).toBe(true);
            expect(isFeatureDisabled('api')).toBe(true);
        });

        it('should only disable listed features in partial mode', () => {
            enableMaintenance({
                partialMode: true,
                disabledFeatures: ['music', 'video'],
            });

            expect(isFeatureDisabled('music')).toBe(true);
            expect(isFeatureDisabled('video')).toBe(true);
            expect(isFeatureDisabled('api')).toBe(false);
            expect(isFeatureDisabled('fun')).toBe(false);
        });
    });

    describe('addBypassUser() / removeBypassUser()', () => {
        it('should add user to bypass list', () => {
            addBypassUser('user-1');

            const state = getMaintenanceState();
            expect(state.allowedUsers).toContain('user-1');
        });

        it('should not add duplicate users', () => {
            addBypassUser('user-1');
            addBypassUser('user-1');

            const state = getMaintenanceState();
            const count = state.allowedUsers.filter(id => id === 'user-1').length;
            expect(count).toBe(1);
        });

        it('should remove user from bypass list', () => {
            addBypassUser('user-1');
            removeBypassUser('user-1');

            const state = getMaintenanceState();
            expect(state.allowedUsers).not.toContain('user-1');
        });

        it('should handle removing non-existent user gracefully', () => {
            expect(() => removeBypassUser('nonexistent')).not.toThrow();
        });
    });

    describe('scheduleMaintenance() / cancelScheduledMaintenance()', () => {
        it('should schedule future maintenance', () => {
            const startTime = Date.now() + 3600000;
            const scheduled = scheduleMaintenance(startTime, {
                reason: 'Planned update',
                estimatedDuration: 1800000,
            });

            expect(scheduled.startTime).toBe(startTime);
            expect(scheduled.reason).toBe('Planned update');
            expect(scheduled.estimatedDuration).toBe(1800000);
        });

        it('should use default reason if not provided', () => {
            const scheduled = scheduleMaintenance(Date.now() + 3600000);
            expect(scheduled.reason).toBe('Scheduled maintenance');
        });

        it('should store in state', () => {
            const startTime = Date.now() + 3600000;
            scheduleMaintenance(startTime);

            const state = getMaintenanceState();
            expect(state.scheduledMaintenance).not.toBeNull();
            expect(state.scheduledMaintenance!.startTime).toBe(startTime);
        });

        it('should cancel scheduled maintenance', () => {
            scheduleMaintenance(Date.now() + 3600000);
            cancelScheduledMaintenance();

            const state = getMaintenanceState();
            expect(state.scheduledMaintenance).toBeNull();
        });
    });

    describe('getMaintenanceStatus()', () => {
        it('should return inactive status when disabled', () => {
            const status = getMaintenanceStatus();

            expect(status.active).toBe(false);
            expect(status.message).toBeNull();
        });

        it('should return active status when enabled', () => {
            enableMaintenance({ reason: 'Updating bot' });

            const status = getMaintenanceStatus();

            expect(status.active).toBe(true);
            expect(status.enabled).toBe(true);
            expect(status.reason).toBe('Updating bot');
            expect(status.message).toContain('Maintenance Active');
            expect(status.message).toContain('Updating bot');
        });

        it('should include time estimate when estimatedEnd is set', () => {
            const end = Date.now() + 7200000; // 2 hours from now
            enableMaintenance({ estimatedEnd: end });

            const status = getMaintenanceStatus();

            expect(status.estimatedEnd).toBe(end);
            expect(status.message).toContain('Estimated completion');
        });

        it('should not show time estimate if deadline has passed', () => {
            const pastEnd = Date.now() - 1000; // 1 second ago
            enableMaintenance({ estimatedEnd: pastEnd });

            const status = getMaintenanceStatus();

            // Message should not contain estimate for past deadlines
            expect(status.message).not.toContain('Estimated completion');
        });

        it('should include partial mode info', () => {
            enableMaintenance({
                partialMode: true,
                disabledFeatures: ['music'],
            });

            const status = getMaintenanceStatus();
            expect(status.partialMode).toBe(true);
            expect(status.disabledFeatures).toEqual(['music']);
        });
    });

    describe('createMaintenanceEmbed()', () => {
        it('should return an embed object', () => {
            enableMaintenance({ reason: 'Test' });
            const embed = createMaintenanceEmbed();

            expect(embed).toBeDefined();
            expect(embed.setColor).toHaveBeenCalled();
            expect(embed.setTitle).toHaveBeenCalled();
        });
    });

    describe('getMaintenanceState()', () => {
        it('should return a copy of state (not the reference)', () => {
            enableMaintenance();

            const state1 = getMaintenanceState();
            const state2 = getMaintenanceState();

            expect(state1).toEqual(state2);
            expect(state1).not.toBe(state2); // Different references
        });

        it('should include all fields', () => {
            const state = getMaintenanceState();

            expect(state).toHaveProperty('enabled');
            expect(state).toHaveProperty('reason');
            expect(state).toHaveProperty('startTime');
            expect(state).toHaveProperty('estimatedEnd');
            expect(state).toHaveProperty('partialMode');
            expect(state).toHaveProperty('disabledFeatures');
            expect(state).toHaveProperty('allowedUsers');
            expect(state).toHaveProperty('scheduledMaintenance');
        });
    });
});
