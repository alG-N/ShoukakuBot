/**
 * RoleInfo Command Unit Tests
 * Tests for role information display
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

import roleInfoCommand from '../../../src/commands/general/roleinfo';

function createMockRole(overrides: Record<string, unknown> = {}) {
    return {
        id: 'role-1',
        name: 'Test Role',
        color: 0xff0000,
        hexColor: '#FF0000',
        position: 5,
        mentionable: true,
        hoist: true,
        managed: false,
        createdTimestamp: 1577836800000, // 2020-01-01
        members: { size: 10 },
        permissions: {
            has: jest.fn().mockImplementation((flag: bigint) => {
                // Simulate Administrator permission
                const ADMINISTRATOR = BigInt(0x8);
                return flag === ADMINISTRATOR;
            }),
        },
        iconURL: jest.fn().mockReturnValue(null),
        toString: jest.fn().mockReturnValue('<@&role-1>'),
        ...overrides,
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
        guild: {
            id: 'guild-1',
            roles: { cache: { size: 20 } },
        },
        member: {
            permissions: { has: jest.fn().mockReturnValue(true) },
        },
        options: {
            getRole: jest.fn().mockReturnValue(createMockRole()),
            getString: jest.fn(),
            getInteger: jest.fn(),
            getUser: jest.fn(),
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

describe('RoleInfoCommand', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('metadata', () => {
        it('should have correct command name', () => {
            expect(roleInfoCommand.data.name).toBe('roleinfo');
        });

        it('should have correct category', () => {
            expect(roleInfoCommand.category).toBe('general');
        });

        it('should have 3s cooldown', () => {
            expect(roleInfoCommand.cooldown).toBe(3);
        });

        it('should not defer reply', () => {
            expect(roleInfoCommand.deferReply).toBe(false);
        });
    });

    describe('run()', () => {
        it('should reject when role is null', async () => {
            const interaction = createMockInteraction();
            interaction.options.getRole.mockReturnValue(null);

            await roleInfoCommand.run(interaction);

            // Should respond with error (either reply or editReply)
            const replyCall = interaction.reply.mock.calls[0]?.[0] || interaction.editReply.mock.calls[0]?.[0];
            expect(replyCall).toBeDefined();
        });

        it('should display role info embed', async () => {
            const interaction = createMockInteraction();

            await roleInfoCommand.run(interaction);

            expect(interaction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: expect.stringContaining('Test Role'),
                            }),
                        }),
                    ]),
                })
            );
        });

        it('should use role color in embed', async () => {
            const interaction = createMockInteraction();

            await roleInfoCommand.run(interaction);

            const call = interaction.reply.mock.calls[0][0];
            const embedData = call.embeds[0].data;
            expect(embedData.color).toBe(0xff0000);
        });

        it('should include role ID', async () => {
            const interaction = createMockInteraction();

            await roleInfoCommand.run(interaction);

            const call = interaction.reply.mock.calls[0][0];
            const embedData = call.embeds[0].data;
            const idField = embedData.fields?.find((f: any) => f.name.includes('ID'));
            expect(idField).toBeDefined();
            expect(idField?.value).toContain('role-1');
        });

        it('should show color hex value', async () => {
            const interaction = createMockInteraction();

            await roleInfoCommand.run(interaction);

            const call = interaction.reply.mock.calls[0][0];
            const embedData = call.embeds[0].data;
            const colorField = embedData.fields?.find((f: any) => f.name.includes('Color'));
            expect(colorField?.value).toBe('#FF0000');
        });

        it('should show member count', async () => {
            const interaction = createMockInteraction();

            await roleInfoCommand.run(interaction);

            const call = interaction.reply.mock.calls[0][0];
            const embedData = call.embeds[0].data;
            const membersField = embedData.fields?.find((f: any) => f.name.includes('Members'));
            expect(membersField?.value).toBe('10');
        });

        it('should show mentionable status', async () => {
            const interaction = createMockInteraction();

            await roleInfoCommand.run(interaction);

            const call = interaction.reply.mock.calls[0][0];
            const embedData = call.embeds[0].data;
            const mentionField = embedData.fields?.find((f: any) => f.name.includes('Mentionable'));
            expect(mentionField?.value).toContain('Yes');
        });

        it('should show hoisted status', async () => {
            const interaction = createMockInteraction();

            await roleInfoCommand.run(interaction);

            const call = interaction.reply.mock.calls[0][0];
            const embedData = call.embeds[0].data;
            const hoistField = embedData.fields?.find((f: any) => f.name.includes('Hoisted'));
            expect(hoistField?.value).toContain('Yes');
        });

        it('should show non-managed status', async () => {
            const interaction = createMockInteraction();

            await roleInfoCommand.run(interaction);

            const call = interaction.reply.mock.calls[0][0];
            const embedData = call.embeds[0].data;
            const managedField = embedData.fields?.find((f: any) => f.name.includes('Managed'));
            expect(managedField?.value).toContain('No');
        });

        it('should show managed (bot) role', async () => {
            const interaction = createMockInteraction();
            interaction.options.getRole.mockReturnValue(createMockRole({ managed: true }));

            await roleInfoCommand.run(interaction);

            const call = interaction.reply.mock.calls[0][0];
            const embedData = call.embeds[0].data;
            const managedField = embedData.fields?.find((f: any) => f.name.includes('Managed'));
            expect(managedField?.value).toContain('Yes');
        });

        it('should show key permissions', async () => {
            const interaction = createMockInteraction();

            await roleInfoCommand.run(interaction);

            const call = interaction.reply.mock.calls[0][0];
            const embedData = call.embeds[0].data;
            const permField = embedData.fields?.find((f: any) => f.name.includes('Permissions'));
            expect(permField).toBeDefined();
            expect(permField?.value).toContain('Administrator');
        });

        it('should show "None" for role with no key permissions', async () => {
            const role = createMockRole();
            role.permissions.has = jest.fn().mockReturnValue(false);
            const interaction = createMockInteraction();
            interaction.options.getRole.mockReturnValue(role);

            await roleInfoCommand.run(interaction);

            const call = interaction.reply.mock.calls[0][0];
            const embedData = call.embeds[0].data;
            const permField = embedData.fields?.find((f: any) => f.name.includes('Permissions'));
            expect(permField?.value).toBe('None');
        });

        it('should show role icon as thumbnail if exists', async () => {
            const role = createMockRole();
            role.iconURL.mockReturnValue('https://cdn.discordapp.com/role-icons/role-1/icon.png');
            const interaction = createMockInteraction();
            interaction.options.getRole.mockReturnValue(role);

            await roleInfoCommand.run(interaction);

            const call = interaction.reply.mock.calls[0][0];
            const embedData = call.embeds[0].data;
            expect(embedData.thumbnail?.url).toBe('https://cdn.discordapp.com/role-icons/role-1/icon.png');
        });

        it('should include position relative to total roles', async () => {
            const interaction = createMockInteraction();

            await roleInfoCommand.run(interaction);

            const call = interaction.reply.mock.calls[0][0];
            const embedData = call.embeds[0].data;
            const posField = embedData.fields?.find((f: any) => f.name.includes('Position'));
            expect(posField?.value).toBe('5/20');
        });

        it('should use PRIMARY color when role has no color', async () => {
            const interaction = createMockInteraction();
            interaction.options.getRole.mockReturnValue(createMockRole({ color: 0 }));

            await roleInfoCommand.run(interaction);

            const call = interaction.reply.mock.calls[0][0];
            const embedData = call.embeds[0].data;
            // Should use COLORS.PRIMARY (0x5865F2) as fallback
            expect(embedData.color).toBe(0x5865F2);
        });
    });
});
