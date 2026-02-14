/**
 * ServerInfo Command Unit Tests
 * Tests for server information display
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

import serverInfoCommand from '../../../src/commands/general/serverinfo';

// Enum values matching discord.js ChannelType
const ChannelType = {
    GuildText: 0,
    GuildVoice: 2,
    GuildCategory: 4,
    PublicThread: 11,
    PrivateThread: 12,
};

function createMockGuild() {
    const channels = new Map<string, { type: number }>([
        ['ch-1', { type: ChannelType.GuildText }],
        ['ch-2', { type: ChannelType.GuildText }],
        ['ch-3', { type: ChannelType.GuildVoice }],
        ['ch-4', { type: ChannelType.GuildCategory }],
        ['ch-5', { type: ChannelType.PublicThread }],
    ]);

    const members = new Map<string, { user: { bot: boolean } }>([
        ['m-1', { user: { bot: false } }],
        ['m-2', { user: { bot: false } }],
        ['m-3', { user: { bot: true } }],
    ]);

    const roles = new Map<string, { name: string; position: number }>([
        ['role-1', { name: '@everyone', position: 0 }],
        ['role-2', { name: 'Admin', position: 5 }],
        ['role-3', { name: 'Moderator', position: 3 }],
    ]);

    // Create cache-like objects with .filter() and .size
    const channelCache = {
        filter: (fn: (v: any) => boolean) => {
            const filtered = [...channels.values()].filter(fn);
            return { size: filtered.length };
        },
        size: channels.size,
    };

    const memberCache = {
        filter: (fn: (v: any) => boolean) => {
            const filtered = [...members.values()].filter(fn);
            return { size: filtered.length };
        },
        size: members.size,
    };

    const roleCache = {
        sort: (fn: (a: any, b: any) => number) => {
            const sorted = [...roles.values()].sort(fn);
            return {
                first: () => sorted[0],
            };
        },
        size: roles.size,
    };

    return {
        id: 'guild-1',
        name: 'Test Server',
        description: 'A test server',
        memberCount: 100,
        createdAt: new Date('2020-01-01'),
        ownerId: 'owner-1',
        premiumTier: 2,
        premiumSubscriptionCount: 7,
        verificationLevel: 2, // Medium
        explicitContentFilter: 1, // MembersWithoutRoles
        banner: null as string | null,
        channels: { cache: channelCache },
        members: { cache: memberCache },
        roles: { cache: roleCache },
        emojis: { cache: { size: 15 } },
        iconURL: jest.fn().mockReturnValue('https://example.com/icon.png'),
        bannerURL: jest.fn().mockReturnValue(null),
        fetchOwner: jest.fn().mockResolvedValue({ id: 'owner-1', tag: 'Owner#0001' }),
    };
}

function createMockInteraction(overrides: Record<string, unknown> = {}) {
    return {
        user: {
            id: 'user-1',
            tag: 'TestUser#0001',
            username: 'TestUser',
            displayAvatarURL: jest.fn().mockReturnValue('https://example.com/avatar.png'),
        },
        client: {
            user: { id: 'bot-1' },
        },
        guild: createMockGuild(),
        member: {
            permissions: { has: jest.fn().mockReturnValue(true) },
        },
        options: {
            getString: jest.fn(),
            getInteger: jest.fn(),
            getUser: jest.fn(),
            getSubcommand: jest.fn(),
        },
        reply: jest.fn().mockResolvedValue({}),
        editReply: jest.fn().mockResolvedValue({}),
        replied: false,
        deferred: true,
        channel: { type: 0 },
        ...overrides,
    } as any;
}

describe('ServerInfoCommand', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('metadata', () => {
        it('should have correct command name', () => {
            expect(serverInfoCommand.data.name).toBe('serverinfo');
        });

        it('should have correct category', () => {
            expect(serverInfoCommand.category).toBe('general');
        });

        it('should have 5s cooldown', () => {
            expect(serverInfoCommand.cooldown).toBe(5);
        });

        it('should defer reply', () => {
            expect(serverInfoCommand.deferReply).toBe(true);
        });
    });

    describe('run()', () => {
        it('should reject when no guild', async () => {
            const interaction = createMockInteraction({ guild: null });

            await serverInfoCommand.run(interaction);

            // Should send error about server requirement
            const call = interaction.editReply.mock.calls[0]?.[0] || interaction.reply.mock.calls[0]?.[0];
            expect(call).toBeDefined();
        });

        it('should reply with server info embed', async () => {
            const interaction = createMockInteraction();

            await serverInfoCommand.run(interaction);

            expect(interaction.editReply).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: expect.stringContaining('Test Server'),
                            }),
                        }),
                    ]),
                })
            );
        });

        it('should include member counts', async () => {
            const interaction = createMockInteraction();

            await serverInfoCommand.run(interaction);

            const call = interaction.editReply.mock.calls[0][0];
            const embedData = call.embeds[0].data;
            const memberField = embedData.fields?.find((f: any) => f.name.includes('Members'));
            expect(memberField).toBeDefined();
            expect(memberField?.value).toMatch(/\d+/);
        });

        it('should include channel counts', async () => {
            const interaction = createMockInteraction();

            await serverInfoCommand.run(interaction);

            const call = interaction.editReply.mock.calls[0][0];
            const embedData = call.embeds[0].data;
            const channelField = embedData.fields?.find((f: any) => f.name.includes('Channel'));
            expect(channelField).toBeDefined();
        });

        it('should include boost info', async () => {
            const interaction = createMockInteraction();

            await serverInfoCommand.run(interaction);

            const call = interaction.editReply.mock.calls[0][0];
            const embedData = call.embeds[0].data;
            const boostField = embedData.fields?.find((f: any) => f.name.includes('Boost'));
            expect(boostField).toBeDefined();
            expect(boostField?.value).toContain('7');
        });

        it('should include verification level', async () => {
            const interaction = createMockInteraction();

            await serverInfoCommand.run(interaction);

            const call = interaction.editReply.mock.calls[0][0];
            const embedData = call.embeds[0].data;
            const verificationField = embedData.fields?.find((f: any) => f.name.includes('Verification'));
            expect(verificationField).toBeDefined();
        });

        it('should show description', async () => {
            const interaction = createMockInteraction();

            await serverInfoCommand.run(interaction);

            const call = interaction.editReply.mock.calls[0][0];
            const embedData = call.embeds[0].data;
            expect(embedData.description).toBe('A test server');
        });

        it('should handle missing description', async () => {
            const interaction = createMockInteraction();
            interaction.guild.description = null;

            await serverInfoCommand.run(interaction);

            const call = interaction.editReply.mock.calls[0][0];
            const embedData = call.embeds[0].data;
            expect(embedData.description).toContain('No description');
        });

        it('should include banner image if guild has banner', async () => {
            const interaction = createMockInteraction();
            interaction.guild.banner = 'banner_hash';
            interaction.guild.bannerURL.mockReturnValue('https://cdn.discordapp.com/banners/guild-1/banner.png');

            await serverInfoCommand.run(interaction);

            const call = interaction.editReply.mock.calls[0][0];
            const embedData = call.embeds[0].data;
            expect(embedData.image).toBeDefined();
        });

        it('should handle owner fetch failure', async () => {
            const interaction = createMockInteraction();
            interaction.guild.fetchOwner.mockRejectedValue(new Error('Failed'));

            await serverInfoCommand.run(interaction);

            expect(interaction.editReply).toHaveBeenCalled();
        });

        it('should include emoji count', async () => {
            const interaction = createMockInteraction();

            await serverInfoCommand.run(interaction);

            const call = interaction.editReply.mock.calls[0][0];
            const embedData = call.embeds[0].data;
            const emojiField = embedData.fields?.find((f: any) => f.name.includes('Emoji'));
            expect(emojiField).toBeDefined();
            expect(emojiField?.value).toContain('15');
        });
    });
});
