/**
 * Ping Command Unit Tests
 * Tests for the ping/latency command
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

// Mock metrics
jest.mock('../../../src/core/metrics', () => ({
    __esModule: true,
    trackCommand: jest.fn(),
    commandsActive: { inc: jest.fn(), dec: jest.fn() },
    commandErrorsTotal: { inc: jest.fn() },
}));

// Mock owner config
jest.mock('../../../src/config/owner', () => ({
    __esModule: true,
    isOwner: jest.fn().mockReturnValue(false),
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

// Mock constants
jest.mock('../../../src/constants', () => ({
    __esModule: true,
    COLORS: {
        SUCCESS: 0x00ff00,
        WARNING: 0xffff00,
        ERROR: 0xff0000,
        PRIMARY: 0x5865F2,
        INFO: 0x3498db,
        MODERATION: 0xff6b6b,
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

import pingCommand from '../../../src/commands/general/ping';

// Helper to create mock interaction
function createMockInteraction(overrides: Record<string, unknown> = {}) {
    const mockMessage = {
        createdTimestamp: Date.now() + 50, // 50ms later
    };

    return {
        user: {
            id: 'user-1',
            tag: 'TestUser#0001',
            username: 'TestUser',
            displayAvatarURL: jest.fn().mockReturnValue('https://cdn.discordapp.com/avatars/123/abc.png'),
        },
        client: {
            user: { id: 'bot-1' },
            ws: { ping: 42 },
            uptime: 86400000, // 1 day in ms
            guilds: {
                cache: {
                    size: 10,
                    reduce: jest.fn().mockReturnValue(1000),
                },
            },
        },
        guild: { id: 'guild-1' },
        member: {
            permissions: { has: jest.fn().mockReturnValue(true) },
        },
        createdTimestamp: Date.now(),
        reply: jest.fn().mockResolvedValue({
            resource: { message: mockMessage },
        }),
        editReply: jest.fn().mockResolvedValue({}),
        fetchReply: jest.fn().mockResolvedValue(mockMessage),
        replied: false,
        deferred: false,
        channel: { type: 0 },
        options: {
            getString: jest.fn(),
            getInteger: jest.fn(),
            getUser: jest.fn(),
            getSubcommand: jest.fn(),
        },
        ...overrides,
    } as any;
}

describe('PingCommand', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('metadata', () => {
        it('should have correct command name', () => {
            expect(pingCommand.data.name).toBe('ping');
        });

        it('should have correct category', () => {
            expect(pingCommand.category).toBe('general');
        });

        it('should have a cooldown', () => {
            expect(pingCommand.cooldown).toBe(3);
        });
    });

    describe('run()', () => {
        it('should reply with pong embed', async () => {
            const interaction = createMockInteraction();

            await pingCommand.run(interaction);

            expect(interaction.reply).toHaveBeenCalledWith(
                expect.objectContaining({ content: 'Pinging...' })
            );
            expect(interaction.editReply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: '',
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: '🏓 Pong!',
                            }),
                        }),
                    ]),
                })
            );
        });

        it('should show correct uptime format', async () => {
            const interaction = createMockInteraction({
                client: {
                    user: { id: 'bot-1' },
                    ws: { ping: 42 },
                    uptime: 90061000, // 1d 1h 1m 1s
                    guilds: {
                        cache: {
                            size: 10,
                            reduce: jest.fn().mockReturnValue(1000),
                        },
                    },
                },
            });

            await pingCommand.run(interaction);

            // Verify editReply was called with embed containing uptime field
            const editReplyCall = interaction.editReply.mock.calls[0][0];
            const embed = editReplyCall.embeds[0];
            const uptimeField = embed.data.fields?.find((f: any) => f.name === '⏱️ Uptime');
            expect(uptimeField?.value).toContain('1d');
        });

        it('should use single-shard stats when totalShards is 1', async () => {
            mockGetShardInfo.mockReturnValue({ totalShards: 1, isInitialized: false });
            const interaction = createMockInteraction();

            await pingCommand.run(interaction);

            expect(mockGetAggregateStats).not.toHaveBeenCalled();
        });

        it('should use aggregate stats for multi-shard', async () => {
            mockGetShardInfo.mockReturnValue({ totalShards: 3, isInitialized: true });
            mockGetAggregateStats.mockResolvedValue({ totalGuilds: 500, totalUsers: 50000 });
            const interaction = createMockInteraction();

            await pingCommand.run(interaction);

            expect(mockGetAggregateStats).toHaveBeenCalled();
        });

        it('should color green for latency < 100ms', async () => {
            const interaction = createMockInteraction();
            // Message timestamp is only 50ms later, so latency = 50
            await pingCommand.run(interaction);

            const editReplyCall = interaction.editReply.mock.calls[0][0];
            const embed = editReplyCall.embeds[0];
            expect(embed.data.color).toBe(0x00ff00); // SUCCESS color
        });
    });
});
