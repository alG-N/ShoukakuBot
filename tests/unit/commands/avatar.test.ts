/**
 * Avatar Command Unit Tests
 * Tests for avatar display with format/size options
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

import avatarCommand from '../../../src/commands/general/avatar';

function createMockInteraction(overrides: Record<string, unknown> = {}) {
    const targetUser = {
        id: 'user-1',
        tag: 'TestUser#0001',
        username: 'TestUser',
        avatar: 'abc123',
        banner: null as string | null,
        accentColor: null as number | null,
        displayAvatarURL: jest.fn().mockReturnValue('https://cdn.discordapp.com/avatars/user-1/abc123.png'),
        bannerURL: jest.fn().mockReturnValue(null),
    };

    return {
        user: {
            id: 'requester-1',
            tag: 'Requester#0001',
            username: 'Requester',
            displayAvatarURL: jest.fn().mockReturnValue('https://example.com/requester.png'),
        },
        client: {
            user: { id: 'bot-1' },
            users: {
                fetch: jest.fn().mockResolvedValue(targetUser),
            },
        },
        guild: {
            id: 'guild-1',
            members: {
                fetch: jest.fn().mockResolvedValue({
                    avatar: null,
                    displayAvatarURL: jest.fn().mockReturnValue('https://cdn.discordapp.com/guilds/guild-1/avatars/user-1/xyz.png'),
                }),
            },
        },
        member: {
            permissions: { has: jest.fn().mockReturnValue(true) },
        },
        options: {
            getUser: jest.fn().mockReturnValue(targetUser),
            getInteger: jest.fn().mockReturnValue(null), // default size
            getString: jest.fn().mockReturnValue(null), // default format
            getSubcommand: jest.fn(),
        },
        reply: jest.fn().mockResolvedValue({}),
        editReply: jest.fn().mockResolvedValue({}),
        replied: false,
        deferred: false,
        channel: { type: 0 },
        ...overrides,
    } as any;
}

describe('AvatarCommand', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('metadata', () => {
        it('should have correct command name', () => {
            expect(avatarCommand.data.name).toBe('avatar');
        });

        it('should have correct category', () => {
            expect(avatarCommand.category).toBe('general');
        });

        it('should have 3s cooldown', () => {
            expect(avatarCommand.cooldown).toBe(3);
        });

        it('should not defer reply', () => {
            expect(avatarCommand.deferReply).toBe(false);
        });
    });

    describe('run()', () => {
        it('should reply with avatar embed', async () => {
            const interaction = createMockInteraction();

            await avatarCommand.run(interaction);

            expect(interaction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: expect.stringContaining('Avatar'),
                            }),
                        }),
                    ]),
                })
            );
        });

        it('should use self when no user option provided', async () => {
            const interaction = createMockInteraction();
            interaction.options.getUser.mockReturnValue(null); // no user specified

            await avatarCommand.run(interaction);

            // Should use interaction.user as target
            expect(interaction.reply).toHaveBeenCalled();
        });

        it('should include download links in embed', async () => {
            const interaction = createMockInteraction();

            await avatarCommand.run(interaction);

            const call = interaction.reply.mock.calls[0][0];
            const embedData = call.embeds[0].data;
            // Should have download links with format names
            expect(embedData.description).toMatch(/Download/i);
            expect(embedData.description).toMatch(/PNG|JPG|WEBP/i);
        });

        it('should include GIF in download links for animated avatars', async () => {
            const interaction = createMockInteraction();
            // Set animated avatar (starts with a_)
            const animatedUser = {
                id: 'user-1',
                tag: 'TestUser#0001',
                username: 'TestUser',
                avatar: 'a_animated123',
                banner: null,
                accentColor: null,
                displayAvatarURL: jest.fn().mockReturnValue('https://cdn.discordapp.com/avatars/user-1/a_animated123.gif'),
                bannerURL: jest.fn(),
            };
            interaction.options.getUser.mockReturnValue(animatedUser);
            interaction.client.users.fetch.mockResolvedValue(animatedUser);

            await avatarCommand.run(interaction);

            const call = interaction.reply.mock.calls[0][0];
            const embedData = call.embeds[0].data;
            expect(embedData.description).toMatch(/GIF/i);
        });

        it('should show server avatar if different from global', async () => {
            const interaction = createMockInteraction();
            // Member has a guild-specific avatar
            interaction.guild.members.fetch.mockResolvedValue({
                avatar: 'guild_avatar_hash',
                displayAvatarURL: jest.fn().mockReturnValue('https://cdn.discordapp.com/guilds/guild-1/avatars/user-1/guild_avatar.png'),
            });

            await avatarCommand.run(interaction);

            const call = interaction.reply.mock.calls[0][0];
            const embedData = call.embeds[0].data;
            const serverField = embedData.fields?.find((f: any) => f.name.includes('Server Avatar'));
            expect(serverField).toBeDefined();
        });

        it('should show banner field if user has banner', async () => {
            const interaction = createMockInteraction();
            const userWithBanner = {
                id: 'user-1',
                tag: 'TestUser#0001',
                username: 'TestUser',
                avatar: 'abc123',
                banner: 'banner_hash',
                accentColor: 0xff0000,
                displayAvatarURL: jest.fn().mockReturnValue('https://cdn.discordapp.com/avatars/user-1/abc123.png'),
                bannerURL: jest.fn().mockReturnValue('https://cdn.discordapp.com/banners/user-1/banner_hash.png'),
            };
            interaction.client.users.fetch.mockResolvedValue(userWithBanner);

            await avatarCommand.run(interaction);

            const call = interaction.reply.mock.calls[0][0];
            const embedData = call.embeds[0].data;
            const bannerField = embedData.fields?.find((f: any) => f.name.includes('Banner'));
            expect(bannerField).toBeDefined();
        });

        it('should respect size option', async () => {
            const interaction = createMockInteraction();
            interaction.options.getInteger.mockReturnValue(4096);

            await avatarCommand.run(interaction);

            const call = interaction.reply.mock.calls[0][0];
            const embedData = call.embeds[0].data;
            const sizeField = embedData.fields?.find((f: any) => f.name.includes('Size'));
            expect(sizeField?.value).toContain('4096');
        });

        it('should handle guild member fetch failure', async () => {
            const interaction = createMockInteraction();
            interaction.guild.members.fetch.mockRejectedValue(new Error('Not found'));

            await avatarCommand.run(interaction);

            // Should still reply successfully without server avatar
            expect(interaction.reply).toHaveBeenCalled();
        });

        it('should handle user fetch failure gracefully', async () => {
            const interaction = createMockInteraction();
            const targetUser = interaction.options.getUser();
            interaction.client.users.fetch.mockRejectedValue(new Error('Failed'));

            await avatarCommand.run(interaction);

            // Should still reply using the original user
            expect(interaction.reply).toHaveBeenCalled();
        });

        it('should include user ID in fields', async () => {
            const interaction = createMockInteraction();

            await avatarCommand.run(interaction);

            const call = interaction.reply.mock.calls[0][0];
            const embedData = call.embeds[0].data;
            const idField = embedData.fields?.find((f: any) => f.name.includes('ID'));
            expect(idField).toBeDefined();
        });
    });
});
