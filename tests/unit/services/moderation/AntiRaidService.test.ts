/**
 * AntiRaidService Unit Tests
 * Tests for join tracking, raid detection, similar username pattern detection,
 * raid mode activation/deactivation, account age checks, flagged accounts
 */

// Mock CacheService
const mockPeek = jest.fn();
const mockSet = jest.fn();
const mockDelete = jest.fn();
const mockRegisterNamespace = jest.fn();

jest.mock('../../../../src/cache/CacheService', () => ({
    __esModule: true,
    default: {
        peek: mockPeek,
        set: mockSet,
        delete: mockDelete,
        registerNamespace: mockRegisterNamespace,
    },
}));

jest.mock('../../../../src/core/Logger', () => ({
    __esModule: true,
    default: { error: jest.fn(), debug: jest.fn(), info: jest.fn(), warn: jest.fn(), success: jest.fn() },
    logger: { error: jest.fn(), debug: jest.fn(), info: jest.fn(), warn: jest.fn(), success: jest.fn() },
}));

jest.mock('../../../../src/config/features/moderation/automod', () => ({
    __esModule: true,
    default: {
        raid: {
            windowMs: 30000,
            joinThreshold: 10,
            minAccountAgeDays: 7,
            action: 'lockdown',
        },
    },
}));

import antiRaidService, { AntiRaidService, JoinAnalysis } from '../../../../src/services/moderation/AntiRaidService.js';
import logger from '../../../../src/core/Logger.js';

// Helper to create mock GuildMember
const createMockMember = (id: string, username: string, createdDaysAgo: number = 30) => ({
    id,
    guild: { id: '111' },
    user: {
        id,
        username,
        createdTimestamp: Date.now() - createdDaysAgo * 24 * 60 * 60 * 1000,
    },
} as any);

describe('AntiRaidService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockPeek.mockResolvedValue(null);
        mockSet.mockResolvedValue(undefined);
        mockDelete.mockResolvedValue(undefined);
    });

    afterAll(() => {
        antiRaidService.shutdown();
    });

    // --- Constructor ---
    describe('constructor', () => {
        it('should register cache namespace on import', () => {
            // registerNamespace is called during module import (constructor runs at singleton creation)
            // The mock may have been called before clearAllMocks in beforeEach
            // Verify by creating a new instance
            const service = new AntiRaidService();
            expect(mockRegisterNamespace).toHaveBeenCalledWith('antiraid', expect.objectContaining({
                useRedis: true,
            }));
            service.shutdown();
        });

        it('should export singleton instance', () => {
            expect(antiRaidService).toBeInstanceOf(AntiRaidService);
        });
    });

    // --- trackJoin ---
    describe('trackJoin', () => {
        it('should add join entry and store in cache', async () => {
            const member = createMockMember('user-1', 'TestUser');

            await antiRaidService.trackJoin(member);

            expect(mockSet).toHaveBeenCalledWith(
                'antiraid',
                'joins:111',
                expect.arrayContaining([
                    expect.objectContaining({
                        userId: 'user-1',
                        username: 'TestUser',
                    }),
                ]),
                300 // JOIN_TRACKER_TTL
            );
        });

        it('should return non-raid for single join', async () => {
            const member = createMockMember('user-1', 'NormalUser', 30);

            const result = await antiRaidService.trackJoin(member);

            expect(result.isRaid).toBe(false);
            expect(result.stats.joinCount).toBe(1);
        });

        it('should detect raid when join threshold is exceeded', async () => {
            // Simulate existing joins in window
            const existingJoins = Array.from({ length: 10 }, (_, i) => ({
                userId: `user-${i}`,
                timestamp: Date.now() - 5000,
                accountAge: 30 * 24 * 60 * 60 * 1000,
                username: `user${i}`,
            }));
            mockPeek.mockResolvedValueOnce(existingJoins); // joins
            mockPeek.mockResolvedValueOnce(null); // raid mode check

            const member = createMockMember('user-new', 'newuser', 30);
            const result = await antiRaidService.trackJoin(member);

            expect(result.isRaid).toBe(true);
            expect(result.triggers).toContain('high_join_rate');
        });

        it('should detect mass new accounts', async () => {
            // 5 joins, all new accounts (< 7 days)
            const newAccountJoins = Array.from({ length: 5 }, (_, i) => ({
                userId: `user-${i}`,
                timestamp: Date.now() - 5000,
                accountAge: 2 * 24 * 60 * 60 * 1000, // 2 days old
                username: `different${i}name`,
            }));
            mockPeek.mockResolvedValueOnce(newAccountJoins); // joins
            mockPeek.mockResolvedValueOnce(null); // raid mode check

            const member = createMockMember('user-new', 'differentnew', 2);
            const result = await antiRaidService.trackJoin(member);

            expect(result.isRaid).toBe(true);
            expect(result.triggers).toContain('mass_new_accounts');
        });

        it('should flag account when raid mode is active', async () => {
            mockPeek.mockResolvedValueOnce([]); // joins
            mockPeek.mockResolvedValueOnce({ active: true }); // raid mode IS active
            mockPeek.mockResolvedValueOnce([]); // flagged accounts (for _flagAccount)

            const member = createMockMember('user-new', 'suspect', 30);
            const result = await antiRaidService.trackJoin(member);

            expect(result.isSuspicious).toBe(true);
            expect(result.triggers).toContain('raid_mode_active');
            // Should have been flagged in cache
            expect(mockSet).toHaveBeenCalledWith(
                'antiraid',
                'flagged:111',
                expect.arrayContaining(['user-new']),
                3600
            );
        });

        it('should detect suspicious: new account + moderate activity', async () => {
            // After adding the new join, there will be 4 entries total (3 existing + 1 new)
            // The new member is 2 days old, which is < 7 day threshold
            // 4 >= 3 join count, so new_account_high_activity should trigger
            // Use very different usernames to avoid triggering similar_usernames (which would set isRaid=true)
            const names = ['alphaBravo', 'charlieDelt', 'echoFoxtrt'];
            const existingJoins = names.map((name, i) => ({
                userId: `user-${i}`,
                timestamp: Date.now() - 5000,
                accountAge: 30 * 24 * 60 * 60 * 1000,
                username: name,
            }));
            mockPeek.mockResolvedValueOnce(existingJoins); // joins
            mockPeek.mockResolvedValueOnce(null); // raid mode check (isRaidModeActive)

            const member = createMockMember('user-sus', 'suspectuser', 2); // 2 days old
            const result = await antiRaidService.trackJoin(member);

            // With 4 joins and a new account, should be suspicious
            expect(result.isSuspicious).toBe(true);
            expect(result.triggers).toContain('new_account_high_activity');
            expect(result.recommendation).toBe('monitor');
        });
    });

    // --- activateRaidMode ---
    describe('activateRaidMode', () => {
        it('should store raid mode state in cache', async () => {
            await antiRaidService.activateRaidMode('111', 'mod-1', 'Detected raid');

            expect(mockSet).toHaveBeenCalledWith(
                'antiraid',
                'raidmode:111',
                expect.objectContaining({
                    active: true,
                    activatedBy: 'mod-1',
                    reason: 'Detected raid',
                }),
                1800 // RAID_MODE_TTL
            );
            expect(logger.info).toHaveBeenCalledWith('AntiRaidService', expect.stringContaining('activated'));
        });
    });

    // --- deactivateRaidMode ---
    describe('deactivateRaidMode', () => {
        it('should return duration and cleanup state', async () => {
            const activatedAt = Date.now() - 60000;
            mockPeek
                .mockResolvedValueOnce({ active: true, activatedAt, stats: { kickedCount: 3, bannedCount: 1 } }) // getRaidModeState
                .mockResolvedValueOnce(['user-1', 'user-2']); // getFlaggedAccounts

            const result = await antiRaidService.deactivateRaidMode('111');

            expect(result.duration).toBeGreaterThanOrEqual(59000);
            expect(result.flaggedAccounts).toBe(2);
            expect(result.stats).toEqual({ kickedCount: 3, bannedCount: 1 });
            expect(mockDelete).toHaveBeenCalledWith('antiraid', 'raidmode:111');
            expect(mockDelete).toHaveBeenCalledWith('antiraid', 'flagged:111');
        });

        it('should handle no existing raid mode', async () => {
            mockPeek.mockResolvedValue(null);

            const result = await antiRaidService.deactivateRaidMode('111');

            expect(result.duration).toBe(0);
            expect(result.flaggedAccounts).toBe(0);
        });
    });

    // --- isRaidModeActive ---
    describe('isRaidModeActive', () => {
        it('should return true when raid mode is active', async () => {
            mockPeek.mockResolvedValue({ active: true });

            const result = await antiRaidService.isRaidModeActive('111');

            expect(result).toBe(true);
        });

        it('should return false when no raid mode', async () => {
            mockPeek.mockResolvedValue(null);

            const result = await antiRaidService.isRaidModeActive('111');

            expect(result).toBe(false);
        });
    });

    // --- getRaidModeState ---
    describe('getRaidModeState', () => {
        it('should return state from cache', async () => {
            const state = { active: true, activatedAt: Date.now(), activatedBy: 'mod-1', reason: 'raid' };
            mockPeek.mockResolvedValue(state);

            const result = await antiRaidService.getRaidModeState('111');

            expect(result).toEqual(state);
        });
    });

    // --- getFlaggedAccounts ---
    describe('getFlaggedAccounts', () => {
        it('should return flagged accounts from cache', async () => {
            mockPeek.mockResolvedValue(['user-1', 'user-2']);

            const result = await antiRaidService.getFlaggedAccounts('111');

            expect(result).toEqual(['user-1', 'user-2']);
        });

        it('should return empty array when no flagged accounts', async () => {
            mockPeek.mockResolvedValue(null);

            const result = await antiRaidService.getFlaggedAccounts('111');

            expect(result).toEqual([]);
        });
    });

    // --- clearFlaggedAccounts ---
    describe('clearFlaggedAccounts', () => {
        it('should delete flagged accounts from cache', async () => {
            await antiRaidService.clearFlaggedAccounts('111');

            expect(mockDelete).toHaveBeenCalledWith('antiraid', 'flagged:111');
        });
    });

    // --- checkAccountAge ---
    describe('checkAccountAge', () => {
        it('should flag new accounts (< 7 days)', () => {
            const member = createMockMember('user-1', 'NewUser', 2);

            const result = antiRaidService.checkAccountAge(member);

            expect(result.isSuspicious).toBe(true);
            expect(result.action).toBe('flag');
            expect(result.accountAgeDays).toBe(2);
        });

        it('should allow old accounts (>= 7 days)', () => {
            const member = createMockMember('user-1', 'OldUser', 30);

            const result = antiRaidService.checkAccountAge(member);

            expect(result.isSuspicious).toBe(false);
            expect(result.action).toBe('none');
            expect(result.accountAgeDays).toBe(30);
        });

        it('should return 0 days for brand new account', () => {
            const member = createMockMember('user-1', 'BrandNew', 0);

            const result = antiRaidService.checkAccountAge(member);

            expect(result.isSuspicious).toBe(true);
            expect(result.accountAgeDays).toBe(0);
        });
    });

    // --- updateStats ---
    describe('updateStats', () => {
        it('should increment kick count', async () => {
            mockPeek.mockResolvedValue({
                active: true,
                activatedAt: Date.now(),
                activatedBy: 'mod-1',
                reason: 'raid',
                stats: { kickedCount: 2, bannedCount: 0 },
            });

            await antiRaidService.updateStats('111', 'kick');

            const updatedState = mockSet.mock.calls[0][2];
            expect(updatedState.stats.kickedCount).toBe(3);
        });

        it('should increment ban count', async () => {
            mockPeek.mockResolvedValue({
                active: true,
                activatedAt: Date.now(),
                activatedBy: 'mod-1',
                reason: 'raid',
                stats: { kickedCount: 0, bannedCount: 1 },
            });

            await antiRaidService.updateStats('111', 'ban');

            const updatedState = mockSet.mock.calls[0][2];
            expect(updatedState.stats.bannedCount).toBe(2);
        });

        it('should initialize stats if missing', async () => {
            mockPeek.mockResolvedValue({
                active: true,
                activatedAt: Date.now(),
                activatedBy: 'mod-1',
                reason: 'raid',
            });

            await antiRaidService.updateStats('111', 'kick');

            const updatedState = mockSet.mock.calls[0][2];
            expect(updatedState.stats.kickedCount).toBe(1);
            expect(updatedState.stats.bannedCount).toBe(0);
        });

        it('should do nothing for flag action', async () => {
            mockPeek.mockResolvedValue({
                active: true,
                activatedAt: Date.now(),
                activatedBy: 'mod-1',
                reason: 'raid',
                stats: { kickedCount: 0, bannedCount: 0 },
            });

            await antiRaidService.updateStats('111', 'flag');

            const updatedState = mockSet.mock.calls[0][2];
            expect(updatedState.stats.kickedCount).toBe(0);
            expect(updatedState.stats.bannedCount).toBe(0);
        });

        it('should do nothing when no raid mode state', async () => {
            mockPeek.mockResolvedValue(null);

            await antiRaidService.updateStats('111', 'kick');

            expect(mockSet).not.toHaveBeenCalled();
        });
    });

    // --- shutdown ---
    describe('shutdown', () => {
        it('should clear cleanup interval', () => {
            const service = new AntiRaidService();
            service.shutdown();
            // Should not throw on double shutdown
            service.shutdown();
        });
    });
});
