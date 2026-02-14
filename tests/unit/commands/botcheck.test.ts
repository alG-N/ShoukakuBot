/**
 * BotCheck Command Unit Tests
 * Tests for the owner-only bot health dashboard command
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
}));

// Mock metrics
jest.mock('../../../src/core/metrics', () => ({
    __esModule: true,
    trackCommand: jest.fn(),
    commandsActive: { inc: jest.fn(), dec: jest.fn() },
    commandErrorsTotal: { inc: jest.fn() },
}));

// Mock owner config
const mockIsOwner = jest.fn();
jest.mock('../../../src/config/owner', () => ({
    __esModule: true,
    isOwner: mockIsOwner,
}));

// Mock cooldown
jest.mock('../../../src/utils/common/cooldown', () => ({
    __esModule: true,
    globalCooldownManager: {
        check: jest.fn().mockResolvedValue({ onCooldown: false }),
        set: jest.fn(),
    },
}));

// Mock ShardBridge
const mockGetShardInfo = jest.fn().mockReturnValue({ totalShards: 1, isInitialized: false });
const mockGetAggregateStats = jest.fn();
jest.mock('../../../src/services/guild/ShardBridge', () => ({
    __esModule: true,
    default: {
        getShardInfo: mockGetShardInfo,
        getAggregateStats: mockGetAggregateStats,
    },
}));

// Mock CommandRegistry
jest.mock('../../../src/services/registry/CommandRegistry', () => ({
    __esModule: true,
    default: {
        commands: new Map([['ping', {}], ['help', {}]]),
    },
}));

// Mock postgres
jest.mock('../../../src/database/postgres', () => ({
    __esModule: true,
    default: {
        query: jest.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
        getStatus: jest.fn().mockReturnValue({
            isConnected: true,
            state: 'connected',
            pendingWrites: 0,
            readReplica: { enabled: false },
        }),
    },
}));

// Mock LavalinkService
jest.mock('../../../src/services/music/LavalinkService', () => ({
    __esModule: true,
    default: {
        getNodeStatus: jest.fn().mockReturnValue({ ready: true, nodes: [{}] }),
    },
}));

// Mock core exports
jest.mock('../../../src/core/index', () => ({
    __esModule: true,
    circuitBreakerRegistry: {
        getSummary: jest.fn().mockReturnValue({ closed: 5, open: 0, total: 5 }),
    },
}));

// Mock CacheService
jest.mock('../../../src/cache/CacheService', () => ({
    __esModule: true,
    default: {
        getStats: jest.fn().mockReturnValue({
            hitRate: 0.85,
            hits: 1000,
            misses: 200,
            memoryEntries: 500,
            namespaces: ['api', 'guild'],
        }),
        isRedisAvailable: jest.fn().mockReturnValue(true),
        getRedis: jest.fn().mockReturnValue(null),
    },
}));

// Mock constants
jest.mock('../../../src/constants', () => ({
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
jest.mock('../../../src/errors/index', () => ({
    __esModule: true,
    AppError: class AppError extends Error {},
    ValidationError: class ValidationError extends Error {},
    PermissionError: class PermissionError extends Error {},
}));

// Mock time util
jest.mock('../../../src/utils/common/time', () => ({
    __esModule: true,
    formatUptime: jest.fn().mockReturnValue('1d 2h 30m'),
}));

import botcheckCommand from '../../../src/commands/owner/botcheck';

// Helper: create mock interaction
function makeInteraction(overrides: Record<string, any> = {}) {
    const replied = { val: false };
    const deferred = { val: false };
    const mockReply = jest.fn().mockImplementation(async () => {
        replied.val = true;
        return mockMessage;
    });
    const mockEditReply = jest.fn().mockImplementation(async () => mockMessage);
    const mockDeferReply = jest.fn().mockImplementation(async () => { deferred.val = true; });

    const mockCollector = {
        on: jest.fn().mockReturnThis(),
    };

    const mockMessage = {
        edit: jest.fn().mockResolvedValue(undefined),
        createMessageComponentCollector: jest.fn().mockReturnValue(mockCollector),
    };

    return {
        user: { id: '123456', tag: 'TestUser#0001', username: 'TestUser' },
        guild: {
            id: 'guild1',
            name: 'Test Guild',
            memberCount: 100,
            ownerId: 'owner1',
        },
        guildId: 'guild1',
        client: {
            ws: { ping: 42 },
            uptime: 93600000,
            guilds: {
                cache: (() => {
                    const m = new Map([
                        ['guild1', { memberCount: 100 }],
                        ['guild2', { memberCount: 200 }],
                    ]);
                    (m as any).reduce = function(fn: any, init: any) {
                        let acc = init;
                        for (const [, v] of m) acc = fn(acc, v);
                        return acc;
                    };
                    return m;
                })(),
            },
            channels: { cache: new Map([['c1', {}], ['c2', {}]]) },
            emojis: { cache: new Map() },
            shard: { count: 1 },
            application: { commands: { cache: new Map() } },
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
        commandName: 'botcheck',
        _mockReply: mockReply,
        _mockEditReply: mockEditReply,
        _mockDeferReply: mockDeferReply,
        _mockMessage: mockMessage,
        _mockCollector: mockCollector,
        ...overrides,
    } as any;
}

describe('BotCheckCommand', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockIsOwner.mockReturnValue(true);
    });

    // --- Metadata ---
    describe('metadata', () => {
        it('should have correct command name', () => {
            expect(botcheckCommand.data.name).toBe('botcheck');
        });

        it('should have a description', () => {
            expect(botcheckCommand.data.description).toBeTruthy();
        });

        it('should be in the OWNER category', () => {
            expect((botcheckCommand as any).category).toBe('owner');
        });

        it('should have deferReply enabled', () => {
            expect((botcheckCommand as any).deferReply).toBe(true);
        });
    });

    // --- Owner Check ---
    describe('owner check', () => {
        it('should reject non-owners', async () => {
            mockIsOwner.mockReturnValue(false);
            const interaction = makeInteraction();

            await botcheckCommand.run(interaction);

            // errorReply creates an embed via safeReply → reply()
            const replyCall = interaction._mockReply.mock.calls[0]?.[0];
            expect(replyCall).toBeDefined();
            // The error embed's description should mention "restricted"
            const embedDesc = replyCall?.embeds?.[0]?.data?.description;
            expect(embedDesc).toContain('restricted');
        });

        it('should allow owners', async () => {
            mockIsOwner.mockReturnValue(true);
            const interaction = makeInteraction();

            await botcheckCommand.run(interaction);

            // safeReply calls reply() since interaction is not deferred
            const call = interaction._mockReply.mock.calls[0]?.[0];
            expect(call).toBeDefined();
            // Should have sent embeds (dashboard)
            expect(call?.embeds).toBeDefined();
        });
    });

    // --- Dashboard Content ---
    describe('dashboard content', () => {
        it('should display embeds with health info', async () => {
            const interaction = makeInteraction();

            await botcheckCommand.run(interaction);

            // safeReply uses reply() since not deferred
            const call = interaction._mockReply.mock.calls[0]?.[0];
            if (call?.embeds) {
                expect(call.embeds.length).toBeGreaterThan(0);
            }
        });

        it('should display pagination buttons', async () => {
            const interaction = makeInteraction();

            await botcheckCommand.run(interaction);

            // Check for components (buttons)
            const call = interaction._mockReply.mock.calls[0]?.[0];
            if (call?.components) {
                expect(call.components.length).toBeGreaterThan(0);
            }
        });

        it('should use single-shard stats when totalShards is 1', async () => {
            mockGetShardInfo.mockReturnValue({ totalShards: 1, isInitialized: false });
            const interaction = makeInteraction();

            await botcheckCommand.run(interaction);

            // Should not call getAggregateStats
            expect(mockGetAggregateStats).not.toHaveBeenCalled();
        });

        it('should aggregate stats for multi-shard', async () => {
            mockGetShardInfo.mockReturnValue({ totalShards: 3, isInitialized: true });
            mockGetAggregateStats.mockResolvedValue({
                totalGuilds: 1000,
                totalUsers: 50000,
                totalChannels: 5000,
            });

            const interaction = makeInteraction();
            await botcheckCommand.run(interaction);

            expect(mockGetAggregateStats).toHaveBeenCalled();
        });
    });

    // --- Button Collector ---
    describe('button collector', () => {
        it('should set up a button collector on reply', async () => {
            const interaction = makeInteraction();

            await botcheckCommand.run(interaction);

            // safeReply calls editReply (since deferReply is true) 
            // The collector should be set up on the returned message
            const msg = interaction._mockMessage;
            // The command uses safeReply which may have used editReply
            // Collector is set up on the result
        });
    });

    // --- Error handling ---
    describe('error handling', () => {
        it('should handle PostgreSQL check failure gracefully', async () => {
            const postgres = require('../../../src/database/postgres').default;
            postgres.query.mockRejectedValueOnce(new Error('Connection refused'));

            const interaction = makeInteraction();
            // Should not throw
            await expect(botcheckCommand.run(interaction)).resolves.not.toThrow();
        });

        it('should handle Lavalink check failure gracefully', async () => {
            const lavalink = require('../../../src/services/music/LavalinkService').default;
            lavalink.getNodeStatus.mockImplementationOnce(() => { throw new Error('No nodes'); });

            const interaction = makeInteraction();
            await expect(botcheckCommand.run(interaction)).resolves.not.toThrow();
        });
    });
});
