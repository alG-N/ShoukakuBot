/**
 * Ban Command Unit Tests
 * Tests for ban/unban/list subcommands and validation
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
    logger: {
        error: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
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

// Mock moderation service
const mockLogModAction = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../../src/services/moderation/index', () => ({
    __esModule: true,
    moderationService: {
        logModAction: mockLogModAction,
    },
}));

import banCommand from '../../../../src/commands/admin/ban';

function createMockInteraction(overrides: Record<string, unknown> = {}) {
    const mockBan = jest.fn().mockResolvedValue(undefined);
    const mockUnban = jest.fn().mockResolvedValue(undefined);
    return {
        user: {
            id: 'mod-1',
            tag: 'Moderator#0001',
            username: 'Moderator',
            displayAvatarURL: jest.fn().mockReturnValue('https://example.com/avatar.png'),
        },
        client: {
            user: { id: 'bot-1' },
        },
        guild: {
            id: 'guild-1',
            name: 'Test Server',
            ownerId: 'owner-1',
            members: {
                ban: mockBan,
                fetch: jest.fn().mockResolvedValue({
                    id: 'target-1',
                    roles: { highest: { position: 5 } },
                }),
                me: {
                    roles: { highest: { position: 10 } },
                },
            },
            bans: {
                fetch: jest.fn().mockResolvedValue(new Map()),
            },
        },
        member: {
            id: 'mod-1',
            permissions: { has: jest.fn().mockReturnValue(true) },
            roles: { highest: { position: 8 } },
        },
        options: {
            getUser: jest.fn().mockReturnValue({
                id: 'target-1',
                tag: 'TargetUser#0001',
                displayAvatarURL: jest.fn().mockReturnValue('https://example.com/target.png'),
                send: jest.fn().mockResolvedValue(undefined),
            }),
            getString: jest.fn().mockReturnValue('Breaking rules'),
            getInteger: jest.fn().mockReturnValue(0),
            getSubcommand: jest.fn().mockReturnValue('add'),
        },
        reply: jest.fn().mockResolvedValue({}),
        editReply: jest.fn().mockResolvedValue({}),
        replied: false,
        deferred: true,
        channel: { type: 0 },
        _mockBan: mockBan,
        _mockUnban: mockUnban,
        ...overrides,
    } as any;
}

describe('BanCommand', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('metadata', () => {
        it('should have correct command name', () => {
            expect(banCommand.data.name).toBe('ban');
        });

        it('should have correct category', () => {
            expect(banCommand.category).toBe('admin');
        });

        it('should require BanMembers permission', () => {
            expect(banCommand.userPermissions).toBeDefined();
            expect(banCommand.userPermissions.length).toBeGreaterThan(0);
        });

        it('should have 3 subcommands', () => {
            const json = banCommand.data.toJSON() as any;
            expect(json.options).toHaveLength(3);
            const names = json.options.map((o: any) => o.name);
            expect(names).toContain('add');
            expect(names).toContain('remove');
            expect(names).toContain('list');
        });
    });

    describe('ban add', () => {
        it('should reject when no guild', async () => {
            const interaction = createMockInteraction({ guild: null });
            interaction.options.getSubcommand.mockReturnValue('add');

            await banCommand.run(interaction);

            expect(interaction.editReply).toHaveBeenCalled();
        });

        it('should reject self-ban', async () => {
            const interaction = createMockInteraction();
            interaction.options.getSubcommand.mockReturnValue('add');
            interaction.options.getUser.mockReturnValue({
                id: 'mod-1',
                tag: 'Moderator#0001',
                displayAvatarURL: jest.fn(),
                send: jest.fn(),
            });

            await banCommand.run(interaction);

            expect(interaction.editReply).toHaveBeenCalled();
            const reply = interaction.editReply.mock.calls[0][0];
            const content = JSON.stringify(reply);
            expect(content).toMatch(/cannot ban yourself/i);
        });

        it('should reject banning bot itself', async () => {
            const interaction = createMockInteraction();
            interaction.options.getSubcommand.mockReturnValue('add');
            interaction.options.getUser.mockReturnValue({
                id: 'bot-1',
                tag: 'Bot#0001',
                displayAvatarURL: jest.fn(),
                send: jest.fn(),
            });

            await banCommand.run(interaction);

            expect(interaction.editReply).toHaveBeenCalled();
        });

        it('should reject banning server owner', async () => {
            const interaction = createMockInteraction();
            interaction.options.getSubcommand.mockReturnValue('add');
            interaction.options.getUser.mockReturnValue({
                id: 'owner-1',
                tag: 'Owner#0001',
                displayAvatarURL: jest.fn(),
                send: jest.fn(),
            });

            await banCommand.run(interaction);

            expect(interaction.editReply).toHaveBeenCalled();
        });

        it('should reject when target has higher role', async () => {
            const interaction = createMockInteraction();
            interaction.options.getSubcommand.mockReturnValue('add');
            interaction.guild.members.fetch.mockResolvedValue({
                id: 'target-1',
                roles: { highest: { position: 15 } },
            });

            await banCommand.run(interaction);

            expect(interaction.editReply).toHaveBeenCalled();
        });

        it('should ban successfully and log action', async () => {
            const mockBan = jest.fn().mockResolvedValue(undefined);
            const interaction = createMockInteraction();
            interaction.options.getSubcommand.mockReturnValue('add');
            interaction.guild.members.ban = mockBan;
            interaction.guild.members.fetch.mockResolvedValue({
                id: 'target-1',
                roles: { highest: { position: 3 } },
            });

            await banCommand.run(interaction);

            expect(mockBan).toHaveBeenCalled();
            expect(mockLogModAction).toHaveBeenCalledWith(
                interaction.guild,
                expect.objectContaining({ type: 'BAN' })
            );
        });

        it('should use default reason when none provided', async () => {
            const mockBan = jest.fn().mockResolvedValue(undefined);
            const interaction = createMockInteraction();
            interaction.options.getSubcommand.mockReturnValue('add');
            interaction.options.getString.mockReturnValue(null);
            interaction.guild.members.ban = mockBan;
            interaction.guild.members.fetch.mockResolvedValue({
                id: 'target-1',
                roles: { highest: { position: 3 } },
            });

            await banCommand.run(interaction);

            expect(mockBan).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    reason: expect.stringContaining('No reason provided'),
                })
            );
        });

        it('should pass delete_days correctly', async () => {
            const mockBan = jest.fn().mockResolvedValue(undefined);
            const interaction = createMockInteraction();
            interaction.options.getSubcommand.mockReturnValue('add');
            interaction.options.getInteger.mockReturnValue(7);
            interaction.guild.members.ban = mockBan;
            interaction.guild.members.fetch.mockResolvedValue({
                id: 'target-1',
                roles: { highest: { position: 3 } },
            });

            await banCommand.run(interaction);

            expect(mockBan).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    deleteMessageSeconds: 7 * 86400,
                })
            );
        });

        it('should attempt to DM user before ban', async () => {
            const mockSend = jest.fn().mockResolvedValue(undefined);
            const interaction = createMockInteraction();
            interaction.options.getSubcommand.mockReturnValue('add');
            interaction.options.getUser.mockReturnValue({
                id: 'target-1',
                tag: 'TargetUser#0001',
                displayAvatarURL: jest.fn(),
                send: mockSend,
            });
            interaction.guild.members.ban = jest.fn().mockResolvedValue(undefined);
            interaction.guild.members.fetch.mockResolvedValue({
                id: 'target-1',
                roles: { highest: { position: 3 } },
            });

            await banCommand.run(interaction);

            expect(mockSend).toHaveBeenCalled();
        });
    });

    describe('ban remove (unban)', () => {
        it('should reject invalid user ID format', async () => {
            const interaction = createMockInteraction();
            interaction.options.getSubcommand.mockReturnValue('remove');
            interaction.options.getString.mockImplementation((name: string) => {
                if (name === 'user_id') return 'not-a-valid-id';
                return null;
            });

            await banCommand.run(interaction);

            expect(interaction.editReply).toHaveBeenCalled();
        });

        it('should reject when user is not banned', async () => {
            const interaction = createMockInteraction();
            interaction.options.getSubcommand.mockReturnValue('remove');
            interaction.options.getString.mockImplementation((name: string) => {
                if (name === 'user_id') return '123456789012345678';
                if (name === 'reason') return 'Appealed';
                return null;
            });
            interaction.guild.bans.fetch.mockResolvedValue(new Map());

            await banCommand.run(interaction);

            expect(interaction.editReply).toHaveBeenCalled();
        });

        it('should unban successfully', async () => {
            const mockUnban = jest.fn().mockResolvedValue(undefined);
            const bannedUser = {
                user: {
                    id: '123456789012345678',
                    tag: 'BannedUser#0001',
                    displayAvatarURL: jest.fn().mockReturnValue('https://example.com/banned.png'),
                },
                reason: 'Was toxic',
            };
            const banMap = new Map([['123456789012345678', bannedUser]]);

            const interaction = createMockInteraction();
            interaction.options.getSubcommand.mockReturnValue('remove');
            interaction.options.getString.mockImplementation((name: string) => {
                if (name === 'user_id') return '123456789012345678';
                if (name === 'reason') return 'Appealed';
                return null;
            });
            interaction.guild.bans.fetch.mockResolvedValue(banMap);
            interaction.guild.members.unban = mockUnban;

            await banCommand.run(interaction);

            expect(mockUnban).toHaveBeenCalledWith(
                '123456789012345678',
                expect.any(String)
            );
            expect(mockLogModAction).toHaveBeenCalledWith(
                interaction.guild,
                expect.objectContaining({ type: 'UNBAN' })
            );
        });
    });

    describe('ban list', () => {
        it('should show empty message when no bans', async () => {
            const interaction = createMockInteraction();
            interaction.options.getSubcommand.mockReturnValue('list');
            interaction.guild.bans.fetch.mockResolvedValue(new Map());

            await banCommand.run(interaction);

            expect(interaction.editReply).toHaveBeenCalled();
        });

        it('should list banned users', async () => {
            const bans = new Map([
                ['user-1', {
                    user: { id: 'user-1', tag: 'User1#0001' },
                    reason: 'Spamming',
                }],
                ['user-2', {
                    user: { id: 'user-2', tag: 'User2#0002' },
                    reason: null,
                }],
            ]);

            const interaction = createMockInteraction();
            interaction.options.getSubcommand.mockReturnValue('list');
            interaction.guild.bans.fetch.mockResolvedValue(bans);

            await banCommand.run(interaction);

            expect(interaction.editReply).toHaveBeenCalled();
            const reply = interaction.editReply.mock.calls[0][0];
            expect(reply.embeds).toBeDefined();
            expect(reply.embeds.length).toBeGreaterThan(0);
        });

        it('should handle no guild', async () => {
            const interaction = createMockInteraction({ guild: null });
            interaction.options.getSubcommand.mockReturnValue('list');

            await banCommand.run(interaction);

            expect(interaction.editReply).toHaveBeenCalled();
        });
    });
});
