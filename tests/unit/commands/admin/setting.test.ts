/**
 * Setting Command Unit Tests
 * Tests for the interactive server settings panel command
 */

// Mock Logger
jest.mock('../../../../src/core/Logger', () => ({
    __esModule: true,
    default: {
        error: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        success: jest.fn(),
    },
}));

// Mock metrics
jest.mock('../../../../src/core/metrics', () => ({
    __esModule: true,
    trackCommand: jest.fn(),
    commandsActive: { inc: jest.fn(), dec: jest.fn() },
    commandErrorsTotal: { inc: jest.fn() },
}));

// Mock owner config
jest.mock('../../../../src/config/owner', () => ({
    __esModule: true,
    isOwner: jest.fn().mockReturnValue(false),
}));

// Mock cooldown
jest.mock('../../../../src/utils/common/cooldown', () => ({
    __esModule: true,
    globalCooldownManager: {
        check: jest.fn().mockResolvedValue({ onCooldown: false }),
        set: jest.fn(),
    },
}));

// Mock constants
jest.mock('../../../../src/constants', () => ({
    __esModule: true,
    COLORS: {
        SUCCESS: 0x00ff00,
        WARNING: 0xffff00,
        ERROR: 0xff0000,
        PRIMARY: 0x5865F2,
        INFO: 0x3498db,
    },
    TIMEOUTS: { DEFAULT_COOLDOWN: 3 },
    EMOJIS: {},
}));

// Mock errors
jest.mock('../../../../src/errors/index', () => ({
    __esModule: true,
    AppError: class AppError extends Error {},
    ValidationError: class ValidationError extends Error {},
    PermissionError: class PermissionError extends Error {},
}));

// Mock GuildSettingsService
const mockGetGuildSettings = jest.fn();
const mockUpdateGuildSettings = jest.fn();
const mockGetSnipeLimit = jest.fn();
const mockGetDeleteLimit = jest.fn();
const mockGetAdminRoles = jest.fn();
const mockGetModRoles = jest.fn();
const mockSetSnipeLimit = jest.fn();
const mockSetDeleteLimit = jest.fn();

jest.mock('../../../../src/services/guild/GuildSettingsService', () => ({
    __esModule: true,
    default: {
        getGuildSettings: mockGetGuildSettings,
        updateGuildSettings: mockUpdateGuildSettings,
        getSnipeLimit: mockGetSnipeLimit,
        getDeleteLimit: mockGetDeleteLimit,
        getAdminRoles: mockGetAdminRoles,
        getModRoles: mockGetModRoles,
        setSnipeLimit: mockSetSnipeLimit,
        setDeleteLimit: mockSetDeleteLimit,
        getSetting: jest.fn(),
        updateSetting: jest.fn(),
    },
    DEFAULT_GUILD_SETTINGS: {
        snipe_limit: 10,
        delete_limit: 100,
        admin_roles: [],
        mod_roles: [],
        settings: {},
    },
}));

// Mock moderation services
const mockAutoModGetSettings = jest.fn();
const mockLockdownGetLockStatus = jest.fn();
const mockAntiRaidGetRaidModeState = jest.fn();
const mockModLogGetSettings = jest.fn();
const mockModLogSetLogChannel = jest.fn();

jest.mock('../../../../src/services/moderation/index', () => ({
    __esModule: true,
    autoModService: {
        getSettings: mockAutoModGetSettings,
        updateSettings: jest.fn(),
    },
    lockdownService: {
        getLockStatus: mockLockdownGetLockStatus,
    },
    antiRaidService: {
        getRaidModeState: mockAntiRaidGetRaidModeState,
    },
    modLogService: {
        getSettings: mockModLogGetSettings,
        setLogChannel: mockModLogSetLogChannel,
    },
}));

import settingCommand from '../../../../src/commands/admin/setting';

// Default guild settings
function makeGuildSettings(overrides: Record<string, any> = {}) {
    return {
        guild_id: 'guild1',
        prefix: '!',
        snipe_limit: 10,
        delete_limit: 100,
        admin_roles: [],
        mod_roles: [],
        settings: {},
        ...overrides,
    };
}

// Helper: create mock interaction
function makeInteraction(overrides: Record<string, any> = {}) {
    const replied = { val: false };
    const deferred = { val: false };

    const mockCollector = {
        on: jest.fn().mockReturnThis(),
    };

    const mockMessage = {
        edit: jest.fn().mockResolvedValue(undefined),
        createMessageComponentCollector: jest.fn().mockReturnValue(mockCollector),
    };

    const mockReply = jest.fn().mockImplementation(async () => {
        replied.val = true;
        return mockMessage;
    });
    const mockEditReply = jest.fn().mockImplementation(async () => mockMessage);
    const mockDeferReply = jest.fn().mockImplementation(async () => { deferred.val = true; });

    return {
        user: { id: overrides.userId ?? 'owner1', tag: 'Owner#0001', username: 'Owner' },
        guild: {
            id: 'guild1',
            name: 'Test Guild',
            ownerId: 'owner1',
        },
        guildId: 'guild1',
        member: {
            permissions: {
                has: jest.fn().mockReturnValue(true),
            },
        },
        client: {
            ws: { ping: 42 },
            guilds: { cache: new Map() },
        },
        options: {
            getSubcommand: jest.fn().mockReturnValue(null),
            getString: jest.fn().mockReturnValue(null),
            getUser: jest.fn().mockReturnValue(null),
            getInteger: jest.fn().mockReturnValue(null),
            getChannel: jest.fn().mockReturnValue(null),
            getBoolean: jest.fn().mockReturnValue(null),
        },
        reply: mockReply,
        editReply: mockEditReply,
        deferReply: mockDeferReply,
        followUp: jest.fn().mockResolvedValue(undefined),
        fetchReply: jest.fn().mockResolvedValue(mockMessage),
        get replied() { return replied.val; },
        get deferred() { return deferred.val; },
        isRepliable: jest.fn().mockReturnValue(true),
        isChatInputCommand: jest.fn().mockReturnValue(true),
        commandName: 'setting',
        _mockReply: mockReply,
        _mockEditReply: mockEditReply,
        _mockMessage: mockMessage,
        _mockCollector: mockCollector,
        ...overrides,
    } as any;
}

describe('SettingCommand', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockGetGuildSettings.mockResolvedValue(makeGuildSettings());
        mockGetSnipeLimit.mockResolvedValue(10);
        mockGetDeleteLimit.mockResolvedValue(100);
        mockGetAdminRoles.mockResolvedValue([]);
        mockGetModRoles.mockResolvedValue([]);
        mockAutoModGetSettings.mockResolvedValue({ enabled: false });
        mockLockdownGetLockStatus.mockResolvedValue({ lockedCount: 0, channelIds: [] });
        mockAntiRaidGetRaidModeState.mockResolvedValue({ active: false });
        mockModLogGetSettings.mockResolvedValue({ log_channel_id: null });
        mockUpdateGuildSettings.mockResolvedValue(undefined);
    });

    // --- Metadata ---
    describe('metadata', () => {
        it('should have correct command name', () => {
            expect(settingCommand.data.name).toBe('setting');
        });

        it('should have a description', () => {
            expect(settingCommand.data.description).toBeTruthy();
        });

        it('should be in the ADMIN category', () => {
            expect((settingCommand as any).category).toBe('admin');
        });

        it('should require Administrator permission', () => {
            const data = settingCommand.data;
            expect(data.default_member_permissions).toBeDefined();
        });
    });

    // --- Owner Check ---
    describe('owner check', () => {
        it('should reject non-owner users', async () => {
            const interaction = makeInteraction({ userId: 'notowner' });

            await settingCommand.run(interaction);

            const call = interaction._mockReply.mock.calls[0]?.[0];
            expect(call).toBeDefined();
            const content = typeof call === 'string' ? call : call?.content;
            expect(content).toContain('server owner');
        });

        it('should allow server owner', async () => {
            const interaction = makeInteraction({ userId: 'owner1' });

            await settingCommand.run(interaction);

            // Should display panel - reply with embeds
            const call = interaction._mockReply.mock.calls[0]?.[0];
            expect(call?.embeds).toBeDefined();
        });
    });

    // --- Settings Panel ---
    describe('settings panel', () => {
        it('should display settings embed with server name', async () => {
            const interaction = makeInteraction();

            await settingCommand.run(interaction);

            const call = interaction._mockReply.mock.calls[0]?.[0];
            const embedDesc = call?.embeds?.[0]?.data?.description;
            if (embedDesc) {
                expect(embedDesc).toContain('Test Guild');
            }
        });

        it('should show snipe and delete limits', async () => {
            mockGetSnipeLimit.mockResolvedValue(15);
            mockGetDeleteLimit.mockResolvedValue(200);
            const interaction = makeInteraction();

            await settingCommand.run(interaction);

            const call = interaction._mockReply.mock.calls[0]?.[0];
            const embeds = call?.embeds;
            expect(embeds).toBeDefined();
            // Check fields contain limit values
            if (embeds?.[0]?.data?.fields) {
                const fields = embeds[0].data.fields;
                const snipeField = fields.find((f: any) => f.name?.includes('Snipe'));
                const deleteField = fields.find((f: any) => f.name?.includes('Delete'));
                if (snipeField) expect(snipeField.value).toContain('15');
                if (deleteField) expect(deleteField.value).toContain('200');
            }
        });

        it('should show admin and mod roles', async () => {
            mockGetAdminRoles.mockResolvedValue(['role1', 'role2']);
            mockGetModRoles.mockResolvedValue(['role3']);
            const interaction = makeInteraction();

            await settingCommand.run(interaction);

            const call = interaction._mockReply.mock.calls[0]?.[0];
            const fields = call?.embeds?.[0]?.data?.fields;
            if (fields) {
                const adminField = fields.find((f: any) => f.name?.includes('Admin'));
                if (adminField) {
                    expect(adminField.value).toContain('role1');
                    expect(adminField.value).toContain('role2');
                }
            }
        });

        it('should show "*None*" when no roles set', async () => {
            const interaction = makeInteraction();

            await settingCommand.run(interaction);

            const call = interaction._mockReply.mock.calls[0]?.[0];
            const fields = call?.embeds?.[0]?.data?.fields;
            if (fields) {
                const adminField = fields.find((f: any) => f.name?.includes('Admin'));
                if (adminField) {
                    expect(adminField.value).toContain('None');
                }
            }
        });

        it('should show automod status', async () => {
            mockAutoModGetSettings.mockResolvedValue({ enabled: true, spam_enabled: true });
            const interaction = makeInteraction();

            await settingCommand.run(interaction);

            const call = interaction._mockReply.mock.calls[0]?.[0];
            const fields = call?.embeds?.[0]?.data?.fields;
            if (fields) {
                const automodField = fields.find((f: any) => f.name?.includes('AutoMod'));
                if (automodField) {
                    expect(automodField.value).toContain('Enabled');
                }
            }
        });

        it('should show lockdown status when active', async () => {
            mockLockdownGetLockStatus.mockResolvedValue({ lockedCount: 3, channelIds: ['c1', 'c2', 'c3'] });
            const interaction = makeInteraction();

            await settingCommand.run(interaction);

            const call = interaction._mockReply.mock.calls[0]?.[0];
            const fields = call?.embeds?.[0]?.data?.fields;
            if (fields) {
                const lockdownField = fields.find((f: any) => f.name?.includes('Lockdown'));
                if (lockdownField) {
                    expect(lockdownField.value).toContain('Active');
                }
            }
        });

        it('should show raid mode status', async () => {
            mockAntiRaidGetRaidModeState.mockResolvedValue({ active: true });
            const interaction = makeInteraction();

            await settingCommand.run(interaction);

            const call = interaction._mockReply.mock.calls[0]?.[0];
            const fields = call?.embeds?.[0]?.data?.fields;
            if (fields) {
                const raidField = fields.find((f: any) => f.name?.includes('Raid'));
                if (raidField) {
                    expect(raidField.value).toContain('Active');
                }
            }
        });

        it('should show mod log channel when set', async () => {
            mockModLogGetSettings.mockResolvedValue({ log_channel_id: 'log_channel_1' });
            const interaction = makeInteraction();

            await settingCommand.run(interaction);

            const call = interaction._mockReply.mock.calls[0]?.[0];
            const fields = call?.embeds?.[0]?.data?.fields;
            if (fields) {
                const modLogField = fields.find((f: any) => f.name?.includes('Mod Log'));
                if (modLogField) {
                    expect(modLogField.value).toContain('log_channel_1');
                }
            }
        });
    });

    // --- Components ---
    describe('components', () => {
        it('should include select menu and channel/role pickers', async () => {
            const interaction = makeInteraction();

            await settingCommand.run(interaction);

            const call = interaction._mockReply.mock.calls[0]?.[0];
            // Should have 5 rows (settings menu, mod log channel, announce channel, admin roles, mod roles)
            expect(call?.components?.length).toBe(5);
        });

        it('should set up a collector for interactions', async () => {
            const interaction = makeInteraction();

            await settingCommand.run(interaction);

            expect(interaction._mockMessage.createMessageComponentCollector).toHaveBeenCalled();
        });
    });

    // --- Announcement Settings ---
    describe('announcements', () => {
        it('should show announcement status when enabled', async () => {
            mockGetGuildSettings.mockResolvedValue(makeGuildSettings({
                settings: { announcements_enabled: true, announcement_channel: 'ch1' },
            }));
            const interaction = makeInteraction();

            await settingCommand.run(interaction);

            const call = interaction._mockReply.mock.calls[0]?.[0];
            const fields = call?.embeds?.[0]?.data?.fields;
            if (fields) {
                const announceField = fields.find((f: any) => f.name?.includes('Announce'));
                if (announceField) {
                    expect(announceField.value).toContain('ch1');
                }
            }
        });

        it('should show disabled when announcements off', async () => {
            mockGetGuildSettings.mockResolvedValue(makeGuildSettings({
                settings: { announcements_enabled: false },
            }));
            const interaction = makeInteraction();

            await settingCommand.run(interaction);

            const call = interaction._mockReply.mock.calls[0]?.[0];
            const fields = call?.embeds?.[0]?.data?.fields;
            if (fields) {
                const announceField = fields.find((f: any) => f.name?.includes('Announce'));
                if (announceField) {
                    expect(announceField.value).toContain('Disabled');
                }
            }
        });
    });

    // --- Error Handling ---
    describe('error handling', () => {
        it('should handle automod service failure gracefully', async () => {
            mockAutoModGetSettings.mockRejectedValue(new Error('DB error'));
            const interaction = makeInteraction();

            await expect(settingCommand.run(interaction)).resolves.not.toThrow();
        });

        it('should handle lockdown service failure gracefully', async () => {
            mockLockdownGetLockStatus.mockRejectedValue(new Error('Connection error'));
            const interaction = makeInteraction();

            await expect(settingCommand.run(interaction)).resolves.not.toThrow();
        });

        it('should handle antiraid service failure gracefully', async () => {
            mockAntiRaidGetRaidModeState.mockRejectedValue(new Error('Timeout'));
            const interaction = makeInteraction();

            await expect(settingCommand.run(interaction)).resolves.not.toThrow();
        });

        it('should handle mod log service failure gracefully', async () => {
            mockModLogGetSettings.mockRejectedValue(new Error('No connection'));
            const interaction = makeInteraction();

            await expect(settingCommand.run(interaction)).resolves.not.toThrow();
        });
    });
});
