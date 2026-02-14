/**
 * GuildSettingsService Unit Tests
 * Tests for guild settings CRUD, permission checks, and cache management
 */

// Mock Logger
jest.mock('../../../src/core/Logger', () => ({
    __esModule: true,
    default: {
        error: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        success: jest.fn(),
    },
    logger: {
        error: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
    },
}));

// Mock CacheService
const mockGetGuildSettings = jest.fn();
const mockSetGuildSettings = jest.fn().mockResolvedValue(undefined);
const mockInvalidateGuildSettings = jest.fn().mockResolvedValue(undefined);

jest.mock('../../../src/cache/CacheService', () => ({
    __esModule: true,
    default: {
        getGuildSettings: mockGetGuildSettings,
        setGuildSettings: mockSetGuildSettings,
        invalidateGuildSettings: mockInvalidateGuildSettings,
    },
}));

// Mock database
const mockGetOne = jest.fn();
const mockUpsert = jest.fn().mockResolvedValue(undefined);
const mockUpdate = jest.fn().mockResolvedValue(undefined);

jest.mock('../../../src/database/postgres', () => ({
    __esModule: true,
    default: {
        getOne: mockGetOne,
        upsert: mockUpsert,
        update: mockUpdate,
    },
}));

import {
    getGuildSettings,
    updateGuildSettings,
    getSetting,
    updateSetting,
    getSnipeLimit,
    setSnipeLimit,
    getDeleteLimit,
    setDeleteLimit,
    getLogChannel,
    setLogChannel,
    getModLogChannel,
    setModLogChannel,
    getAdminRoles,
    addAdminRole,
    removeAdminRole,
    getModRoles,
    addModRole,
    removeModRole,
    hasAdminPermission,
    hasModPermission,
    isServerOwner,
    clearCache,
    DEFAULT_GUILD_SETTINGS,
    type GuildSettings,
} from '../../../src/services/guild/GuildSettingsService';

// Helper to create mock GuildMember
function createMockMember(overrides: Record<string, unknown> = {}) {
    return {
        id: 'user-1',
        guild: {
            id: 'guild-1',
            ownerId: 'owner-1',
        },
        permissions: {
            has: jest.fn().mockReturnValue(false),
        },
        roles: {
            cache: {
                some: jest.fn().mockReturnValue(false),
            },
        },
        ...overrides,
    } as any;
}

describe('GuildSettingsService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockGetGuildSettings.mockResolvedValue(null);
        mockGetOne.mockResolvedValue(null);
    });

    // ========== getGuildSettings() ==========
    describe('getGuildSettings()', () => {
        it('should return cached settings if available', async () => {
            const cachedSettings = { guild_id: 'guild-1', prefix: '!' };
            mockGetGuildSettings.mockResolvedValue(cachedSettings);

            const result = await getGuildSettings('guild-1');

            expect(mockGetGuildSettings).toHaveBeenCalledWith('guild-1');
            expect(result).toEqual({ ...DEFAULT_GUILD_SETTINGS, ...cachedSettings });
            expect(mockGetOne).not.toHaveBeenCalled();
        });

        it('should fetch from database if not cached', async () => {
            mockGetGuildSettings.mockResolvedValue(null);
            const dbSettings = { guild_id: 'guild-1', prefix: '?', volume: 50 };
            mockGetOne.mockResolvedValue(dbSettings);

            const result = await getGuildSettings('guild-1');

            expect(mockGetOne).toHaveBeenCalledWith(
                'SELECT * FROM guild_settings WHERE guild_id = $1',
                ['guild-1']
            );
            expect(mockSetGuildSettings).toHaveBeenCalledWith('guild-1', expect.objectContaining({
                guild_id: 'guild-1',
                prefix: '?',
                volume: 50,
            }));
            expect(result.prefix).toBe('?');
            expect(result.volume).toBe(50);
        });

        it('should create default settings if no db record', async () => {
            mockGetGuildSettings.mockResolvedValue(null);
            mockGetOne.mockResolvedValue(null);

            const result = await getGuildSettings('guild-1');

            expect(mockUpsert).toHaveBeenCalledWith('guild_settings', { guild_id: 'guild-1' }, 'guild_id');
            expect(result.guild_id).toBe('guild-1');
            expect(result.prefix).toBe('!');
        });

        it('should return defaults on database error', async () => {
            mockGetGuildSettings.mockResolvedValue(null);
            mockGetOne.mockRejectedValue(new Error('DB error'));

            const result = await getGuildSettings('guild-1');

            expect(result).toEqual({ ...DEFAULT_GUILD_SETTINGS, guild_id: 'guild-1' });
        });
    });

    // ========== updateGuildSettings() ==========
    describe('updateGuildSettings()', () => {
        it('should update database and invalidate cache', async () => {
            const result = await updateGuildSettings('guild-1', { prefix: '?' });

            expect(mockUpdate).toHaveBeenCalledWith(
                'guild_settings',
                { prefix: '?' },
                { guild_id: 'guild-1' }
            );
            expect(mockInvalidateGuildSettings).toHaveBeenCalledWith('guild-1');
            expect(result).toBe(true);
        });

        it('should return false on error', async () => {
            mockUpdate.mockRejectedValueOnce(new Error('DB error'));

            const result = await updateGuildSettings('guild-1', { prefix: '?' });

            expect(result).toBe(false);
        });
    });

    // ========== getSetting() / updateSetting() ==========
    describe('getSetting()', () => {
        it('should return a nested setting value', async () => {
            mockGetGuildSettings.mockResolvedValue({
                guild_id: 'guild-1',
                settings: { announcements_enabled: true },
            });

            const result = await getSetting('guild-1', 'announcements_enabled', false);

            expect(result).toBe(true);
        });

        it('should return default value if key not found', async () => {
            mockGetGuildSettings.mockResolvedValue({
                guild_id: 'guild-1',
                settings: {},
            });

            const result = await getSetting('guild-1', 'nonexistent', 'default');

            expect(result).toBe('default');
        });
    });

    describe('updateSetting()', () => {
        it('should merge setting into existing settings JSONB', async () => {
            mockGetGuildSettings.mockResolvedValue({
                guild_id: 'guild-1',
                settings: { existing: true },
            });

            await updateSetting('guild-1', 'newKey', 'newValue');

            expect(mockUpdate).toHaveBeenCalledWith(
                'guild_settings',
                { settings: { existing: true, newKey: 'newValue' } },
                { guild_id: 'guild-1' }
            );
        });
    });

    // ========== Snipe & Delete Limits ==========
    describe('getSnipeLimit()', () => {
        it('should return snipe_limit from settings', async () => {
            mockGetGuildSettings.mockResolvedValue({ snipe_limit: 20 });
            const result = await getSnipeLimit('guild-1');
            expect(result).toBe(20);
        });

        it('should return default if not set', async () => {
            mockGetGuildSettings.mockResolvedValue({});
            const result = await getSnipeLimit('guild-1');
            expect(result).toBe(DEFAULT_GUILD_SETTINGS.snipe_limit);
        });
    });

    describe('setSnipeLimit()', () => {
        it('should clamp to min 1', async () => {
            await setSnipeLimit('guild-1', -5);
            expect(mockUpdate).toHaveBeenCalledWith(
                'guild_settings',
                { snipe_limit: 1 },
                { guild_id: 'guild-1' }
            );
        });

        it('should clamp to max 50', async () => {
            await setSnipeLimit('guild-1', 100);
            expect(mockUpdate).toHaveBeenCalledWith(
                'guild_settings',
                { snipe_limit: 50 },
                { guild_id: 'guild-1' }
            );
        });

        it('should accept valid value', async () => {
            await setSnipeLimit('guild-1', 25);
            expect(mockUpdate).toHaveBeenCalledWith(
                'guild_settings',
                { snipe_limit: 25 },
                { guild_id: 'guild-1' }
            );
        });
    });

    describe('setDeleteLimit()', () => {
        it('should clamp between 1 and 1000', async () => {
            await setDeleteLimit('guild-1', 0);
            expect(mockUpdate).toHaveBeenCalledWith(
                'guild_settings',
                { delete_limit: 1 },
                { guild_id: 'guild-1' }
            );
        });
    });

    // ========== Log Channels ==========
    describe('log channels', () => {
        it('should get and set log channel', async () => {
            mockGetGuildSettings.mockResolvedValue({ log_channel: 'ch-1' });
            const result = await getLogChannel('guild-1');
            expect(result).toBe('ch-1');

            await setLogChannel('guild-1', 'ch-2');
            expect(mockUpdate).toHaveBeenCalledWith(
                'guild_settings',
                { log_channel: 'ch-2' },
                { guild_id: 'guild-1' }
            );
        });

        it('should get and set mod log channel', async () => {
            mockGetGuildSettings.mockResolvedValue({ mod_log_channel: 'mod-ch-1' });
            const result = await getModLogChannel('guild-1');
            expect(result).toBe('mod-ch-1');

            await setModLogChannel('guild-1', null);
            expect(mockUpdate).toHaveBeenCalledWith(
                'guild_settings',
                { mod_log_channel: null },
                { guild_id: 'guild-1' }
            );
        });
    });

    // ========== Admin Roles ==========
    describe('admin roles', () => {
        it('should get admin roles', async () => {
            mockGetGuildSettings.mockResolvedValue({ admin_roles: ['role-1', 'role-2'] });
            const result = await getAdminRoles('guild-1');
            expect(result).toEqual(['role-1', 'role-2']);
        });

        it('should return empty array if no admin roles', async () => {
            mockGetGuildSettings.mockResolvedValue({});
            const result = await getAdminRoles('guild-1');
            expect(result).toEqual([]);
        });

        it('should add admin role (deduplicates)', async () => {
            mockGetGuildSettings.mockResolvedValue({ admin_roles: ['role-1'] });
            
            // Adding existing role should no-op
            const result = await addAdminRole('guild-1', 'role-1');
            expect(result).toBe(true);
            expect(mockUpdate).not.toHaveBeenCalled();
        });

        it('should add new admin role', async () => {
            mockGetGuildSettings.mockResolvedValue({ admin_roles: ['role-1'] });
            await addAdminRole('guild-1', 'role-2');
            expect(mockUpdate).toHaveBeenCalledWith(
                'guild_settings',
                { admin_roles: ['role-1', 'role-2'] },
                { guild_id: 'guild-1' }
            );
        });

        it('should remove admin role', async () => {
            mockGetGuildSettings.mockResolvedValue({ admin_roles: ['role-1', 'role-2'] });
            await removeAdminRole('guild-1', 'role-1');
            expect(mockUpdate).toHaveBeenCalledWith(
                'guild_settings',
                { admin_roles: ['role-2'] },
                { guild_id: 'guild-1' }
            );
        });
    });

    // ========== Mod Roles ==========
    describe('mod roles', () => {
        it('should add and remove mod roles', async () => {
            mockGetGuildSettings.mockResolvedValue({ mod_roles: [] });
            await addModRole('guild-1', 'mod-1');
            expect(mockUpdate).toHaveBeenCalledWith(
                'guild_settings',
                { mod_roles: ['mod-1'] },
                { guild_id: 'guild-1' }
            );

            mockUpdate.mockClear();
            mockGetGuildSettings.mockResolvedValue({ mod_roles: ['mod-1', 'mod-2'] });
            await removeModRole('guild-1', 'mod-1');
            expect(mockUpdate).toHaveBeenCalledWith(
                'guild_settings',
                { mod_roles: ['mod-2'] },
                { guild_id: 'guild-1' }
            );
        });
    });

    // ========== Permission Checks ==========
    describe('isServerOwner()', () => {
        it('should return true for server owner', () => {
            const member = createMockMember({ id: 'owner-1' });
            expect(isServerOwner(member)).toBe(true);
        });

        it('should return false for non-owner', () => {
            const member = createMockMember({ id: 'user-1' });
            expect(isServerOwner(member)).toBe(false);
        });
    });

    describe('hasAdminPermission()', () => {
        it('should return true for server owner', async () => {
            const member = createMockMember({ id: 'owner-1' });
            expect(await hasAdminPermission(member)).toBe(true);
        });

        it('should return true for Discord Administrator', async () => {
            const member = createMockMember();
            member.permissions.has.mockReturnValue(true);
            expect(await hasAdminPermission(member)).toBe(true);
        });

        it('should return true for custom admin role', async () => {
            mockGetGuildSettings.mockResolvedValue({ admin_roles: ['admin-role-1'] });
            const member = createMockMember();
            member.roles.cache.some.mockImplementation((fn: Function) => 
                fn({ id: 'admin-role-1' })
            );

            expect(await hasAdminPermission(member)).toBe(true);
        });

        it('should return false for regular user', async () => {
            mockGetGuildSettings.mockResolvedValue({ admin_roles: [] });
            const member = createMockMember();
            expect(await hasAdminPermission(member)).toBe(false);
        });
    });

    describe('hasModPermission()', () => {
        it('should return true if user has admin', async () => {
            const member = createMockMember({ id: 'owner-1' });
            expect(await hasModPermission(member)).toBe(true);
        });

        it('should return true for mod role', async () => {
            mockGetGuildSettings.mockResolvedValue({ admin_roles: [], mod_roles: ['mod-role-1'] });
            const member = createMockMember();
            // First call is for hasAdminPermission check, second is for mod role check
            member.roles.cache.some
                .mockReturnValueOnce(false) // admin role check
                .mockImplementationOnce((fn: Function) => fn({ id: 'mod-role-1' })); // mod role check

            expect(await hasModPermission(member)).toBe(true);
        });
    });

    // ========== Cache Management ==========
    describe('clearCache()', () => {
        it('should invalidate guild settings cache', async () => {
            await clearCache('guild-1');
            expect(mockInvalidateGuildSettings).toHaveBeenCalledWith('guild-1');
        });
    });

    // ========== DEFAULT_GUILD_SETTINGS ==========
    describe('DEFAULT_GUILD_SETTINGS', () => {
        it('should have sensible defaults', () => {
            expect(DEFAULT_GUILD_SETTINGS.prefix).toBe('!');
            expect(DEFAULT_GUILD_SETTINGS.language).toBe('en');
            expect(DEFAULT_GUILD_SETTINGS.volume).toBe(100);
            expect(DEFAULT_GUILD_SETTINGS.snipe_limit).toBe(10);
            expect(DEFAULT_GUILD_SETTINGS.delete_limit).toBe(100);
            expect(DEFAULT_GUILD_SETTINGS.automod_enabled).toBe(false);
            expect(DEFAULT_GUILD_SETTINGS.admin_roles).toEqual([]);
            expect(DEFAULT_GUILD_SETTINGS.mod_roles).toEqual([]);
            expect(DEFAULT_GUILD_SETTINGS.raid_mode).toBe(false);
            expect(DEFAULT_GUILD_SETTINGS.lockdown).toBe(false);
        });
    });
});
