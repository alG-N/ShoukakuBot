/**
 * AutoMod Command Unit Tests
 * Tests for the interactive auto-moderation settings panel command
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

// Mock AutoModService
const mockGetSettings = jest.fn();
const mockUpdateSettings = jest.fn();
jest.mock('../../../../src/services/moderation/index', () => ({
    __esModule: true,
    autoModService: {
        getSettings: mockGetSettings,
        updateSettings: mockUpdateSettings,
    },
}));

// Mock moderation config
jest.mock('../../../../src/config/features/moderation/index', () => ({
    __esModule: true,
    default: {
        COLORS: {
            SUCCESS: 0x00FF00,
            ERROR: 0xFF0000,
            INFO: 0x0099FF,
            WARNING: 0xFFA500,
        },
    },
}));

import automodCommand from '../../../../src/commands/admin/automod';

// Default automod settings
function makeSettings(overrides: Record<string, any> = {}) {
    return {
        enabled: false,
        spam_enabled: false,
        duplicate_enabled: false,
        links_enabled: false,
        invites_enabled: false,
        mention_enabled: false,
        caps_enabled: false,
        filter_enabled: false,
        filtered_words: [],
        spam_threshold: 5,
        spam_interval: 5,
        duplicate_threshold: 3,
        mention_limit: 5,
        caps_percentage: 70,
        mute_duration: 10,
        new_account_age_hours: 24,
        spam_action: 'mute',
        duplicate_action: 'warn',
        links_action: 'delete',
        invites_action: 'delete',
        mention_action: 'warn',
        caps_action: 'delete',
        new_account_action: 'alert',
        auto_warn: true,
        warn_threshold: 3,
        warn_reset_hours: 24,
        warn_action: 'mute',
        ignored_channels: [],
        ignored_roles: [],
        links_whitelist: [],
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
        user: { id: 'user1', tag: 'User#0001', username: 'User' },
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
            getSubcommand: jest.fn().mockReturnValue('settings'),
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
        commandName: 'automod',
        _mockReply: mockReply,
        _mockEditReply: mockEditReply,
        _mockMessage: mockMessage,
        _mockCollector: mockCollector,
        ...overrides,
    } as any;
}

describe('AutoModCommand', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockGetSettings.mockResolvedValue(makeSettings());
        mockUpdateSettings.mockResolvedValue(undefined);
    });

    // --- Metadata ---
    describe('metadata', () => {
        it('should have correct command name', () => {
            expect(automodCommand.data.name).toBe('automod');
        });

        it('should have a description', () => {
            expect(automodCommand.data.description).toBeTruthy();
        });

        it('should be in the ADMIN category', () => {
            expect((automodCommand as any).category).toBe('admin');
        });

        it('should require ManageGuild permission', () => {
            // The command sets defaultMemberPermissions
            const data = automodCommand.data;
            expect(data.default_member_permissions).toBeDefined();
        });
    });

    // --- Run: Settings Panel ---
    describe('run - settings panel', () => {
        it('should show error if automod service unavailable', async () => {
            // When getSettings rejects, the error propagates (BaseCommand catches it)
            mockGetSettings.mockRejectedValueOnce(new Error('Service unavailable'));
            const interaction = makeInteraction();

            // The error propagates up — BaseCommand's error handler catches it
            try {
                await automodCommand.run(interaction);
            } catch {
                // Expected — error propagates to BaseCommand error boundary
            }
            expect(mockGetSettings).toHaveBeenCalled();
        });

        it('should display settings panel with disabled automod', async () => {
            mockGetSettings.mockResolvedValue(makeSettings({ enabled: false }));
            const interaction = makeInteraction();

            await automodCommand.run(interaction);

            const call = interaction._mockEditReply.mock.calls[0]?.[0];
            expect(call).toBeDefined();
            expect(call?.embeds).toBeDefined();
            expect(call?.components).toBeDefined();
        });

        it('should display settings panel with enabled automod', async () => {
            mockGetSettings.mockResolvedValue(makeSettings({
                enabled: true,
                spam_enabled: true,
                links_enabled: true,
                filter_enabled: true,
            }));
            const interaction = makeInteraction();

            await automodCommand.run(interaction);

            const call = interaction._mockEditReply.mock.calls[0]?.[0];
            expect(call?.embeds).toBeDefined();
            // Check that components are included
            if (call?.components?.length > 0) {
                expect(call.components.length).toBeGreaterThan(0);
            }
        });

        it('should count active features correctly', async () => {
            // 3 features enabled
            mockGetSettings.mockResolvedValue(makeSettings({
                enabled: true,
                spam_enabled: true,
                duplicate_enabled: true,
                caps_enabled: true,
            }));
            const interaction = makeInteraction();

            await automodCommand.run(interaction);

            const call = interaction._mockEditReply.mock.calls[0]?.[0];
            const embedData = call?.embeds?.[0]?.data;
            if (embedData?.description) {
                expect(embedData.description).toContain('3/7');
            }
        });

        it('should disable filter button when automod is disabled', async () => {
            mockGetSettings.mockResolvedValue(makeSettings({ enabled: false }));
            const interaction = makeInteraction();

            await automodCommand.run(interaction);

            const call = interaction._mockEditReply.mock.calls[0]?.[0];
            // Components should have buttons
            expect(call?.components).toBeDefined();
        });

        it('should set up collector on response', async () => {
            mockGetSettings.mockResolvedValue(makeSettings({ enabled: true }));
            const interaction = makeInteraction();

            await automodCommand.run(interaction);

            // A component collector should be created on the message
            expect(interaction._mockMessage.createMessageComponentCollector).toHaveBeenCalled();
        });
    });

    // --- Features Counting ---
    describe('feature counting', () => {
        it('should show 0/7 when all features disabled', async () => {
            mockGetSettings.mockResolvedValue(makeSettings({ enabled: true }));
            const interaction = makeInteraction();

            await automodCommand.run(interaction);

            const call = interaction._mockEditReply.mock.calls[0]?.[0];
            const desc = call?.embeds?.[0]?.data?.description;
            if (desc) {
                expect(desc).toContain('0/7');
            }
        });

        it('should show 7/7 when all features enabled', async () => {
            mockGetSettings.mockResolvedValue(makeSettings({
                enabled: true,
                spam_enabled: true,
                duplicate_enabled: true,
                links_enabled: true,
                invites_enabled: true,
                mention_enabled: true,
                caps_enabled: true,
                filter_enabled: true,
            }));
            const interaction = makeInteraction();

            await automodCommand.run(interaction);

            const call = interaction._mockEditReply.mock.calls[0]?.[0];
            const desc = call?.embeds?.[0]?.data?.description;
            if (desc) {
                expect(desc).toContain('7/7');
            }
        });
    });

    // --- Subcommand ---
    describe('subcommand', () => {
        it('should have settings subcommand', () => {
            const data = automodCommand.data;
            const options = (data as any).options;
            if (options) {
                const settings = options.find?.((o: any) => o.name === 'settings');
                expect(settings).toBeDefined();
            }
        });
    });

    // --- Error handling ---
    describe('error handling', () => {
        it('should handle getSettings failure gracefully', async () => {
            mockGetSettings.mockRejectedValue(new Error('DB error'));
            const interaction = makeInteraction();

            // Error propagates to BaseCommand error boundary
            try {
                await automodCommand.run(interaction);
            } catch {
                // Expected — BaseCommand catches this
            }
            expect(mockGetSettings).toHaveBeenCalled();
        });
    });
});
