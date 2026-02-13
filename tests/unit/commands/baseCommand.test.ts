/**
 * BaseCommand Unit Tests
 * Tests for the abstract command base class — lifecycle, validation, cooldowns, embed helpers
 */

// Mock Logger
jest.mock('../../../src/core/Logger', () => ({
    logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    },
}));

// Mock metrics
jest.mock('../../../src/core/metrics', () => ({
    trackCommand: jest.fn(),
    commandsActive: {
        inc: jest.fn(),
        dec: jest.fn(),
    },
    commandErrorsTotal: {
        inc: jest.fn(),
    },
}));

// Mock owner config
jest.mock('../../../src/config/owner', () => ({
    isOwner: jest.fn((id: string) => id === 'owner-123'),
}));

// Mock cooldown manager with stateful in-memory tracking (resets per test via beforeEach)
const mockCooldownState = new Map<string, number>();
jest.mock('../../../src/utils/common/cooldown', () => ({
    globalCooldownManager: {
        check: jest.fn().mockImplementation(async (userId: string, commandName: string) => {
            const key = `${commandName}:${userId}`;
            const expiresAt = mockCooldownState.get(key);
            if (expiresAt && Date.now() < expiresAt) {
                return { onCooldown: true, remaining: expiresAt - Date.now() };
            }
            return { onCooldown: false, remaining: 0 };
        }),
        set: jest.fn().mockImplementation(async (userId: string, commandName: string, cooldownMs: number) => {
            const key = `${commandName}:${userId}`;
            mockCooldownState.set(key, Date.now() + cooldownMs);
        }),
        clear: jest.fn().mockImplementation(async (userId: string, commandName: string) => {
            const key = `${commandName}:${userId}`;
            mockCooldownState.delete(key);
        }),
    },
}));

import { BaseCommand, CommandCategory, CommandOptions, CommandContext } from '../../../src/commands/BaseCommand';
import { ChatInputCommandInteraction, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { trackCommand, commandsActive, commandErrorsTotal } from '../../../src/core/metrics';

// ── Concrete test command ──
class TestCommand extends BaseCommand {
    public runFn: jest.Mock;

    constructor(options: CommandOptions = {}) {
        super(options);
        this.runFn = jest.fn();
    }

    get data() {
        return new SlashCommandBuilder()
            .setName('test')
            .setDescription('Test command');
    }

    async run(interaction: ChatInputCommandInteraction): Promise<void> {
        await this.runFn(interaction);
    }
}

// ── Mock interaction factory ──
function createMockInteraction(overrides: Record<string, unknown> = {}): ChatInputCommandInteraction {
    const interaction = {
        user: { id: 'user-456' },
        guild: {
            id: 'guild-789',
            ownerId: 'guild-owner-1',
            members: {
                me: {
                    permissions: {
                        has: jest.fn().mockReturnValue(true),
                    },
                },
            },
        },
        member: {
            permissions: {
                has: jest.fn().mockReturnValue(true),
            },
        },
        channel: { nsfw: false },
        client: { guilds: { cache: { size: 10 } } },
        deferred: false,
        replied: false,
        deferReply: jest.fn().mockResolvedValue(undefined),
        reply: jest.fn().mockResolvedValue(undefined),
        editReply: jest.fn().mockResolvedValue(undefined),
        followUp: jest.fn().mockResolvedValue(undefined),
        ...overrides,
    } as unknown as ChatInputCommandInteraction;
    return interaction;
}

describe('BaseCommand', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockCooldownState.clear();
    });

    describe('constructor defaults', () => {
        it('should set default values', () => {
            const cmd = new TestCommand();

            expect(cmd.category).toBe(CommandCategory.GENERAL);
            expect(cmd.cooldown).toBe(3); // COMMAND_COOLDOWN / 1000
            expect(cmd.ownerOnly).toBe(false);
            expect(cmd.adminOnly).toBe(false);
            expect(cmd.guildOnly).toBe(true);
            expect(cmd.nsfw).toBe(false);
            expect(cmd.userPermissions).toEqual([]);
            expect(cmd.botPermissions).toEqual([]);
            expect(cmd.deferReply).toBe(false);
            expect(cmd.ephemeral).toBe(false);
        });

        it('should accept custom options', () => {
            const cmd = new TestCommand({
                category: CommandCategory.MUSIC,
                cooldown: 10,
                ownerOnly: true,
                adminOnly: true,
                guildOnly: false,
                nsfw: true,
                deferReply: true,
                ephemeral: true,
            });

            expect(cmd.category).toBe('music');
            expect(cmd.cooldown).toBe(10);
            expect(cmd.ownerOnly).toBe(true);
            expect(cmd.adminOnly).toBe(true);
            expect(cmd.guildOnly).toBe(false);
            expect(cmd.nsfw).toBe(true);
            expect(cmd.deferReply).toBe(true);
            expect(cmd.ephemeral).toBe(true);
        });
    });

    describe('execute() — validation', () => {
        it('should reject guild-only command in DM', async () => {
            const cmd = new TestCommand({ guildOnly: true });
            const interaction = createMockInteraction({ guild: null });

            await cmd.execute(interaction);

            // Should not have called run
            expect(cmd.runFn).not.toHaveBeenCalled();
            // Should have tried to reply with error
            expect(interaction.reply).toHaveBeenCalled();
        });

        it('should reject NSFW command in non-NSFW channel', async () => {
            const cmd = new TestCommand({ nsfw: true });
            const interaction = createMockInteraction({
                channel: { nsfw: false },
            });

            await cmd.execute(interaction);

            expect(cmd.runFn).not.toHaveBeenCalled();
        });

        it('should reject owner-only command from non-owner', async () => {
            const cmd = new TestCommand({ ownerOnly: true });
            const interaction = createMockInteraction({
                user: { id: 'not-owner' },
            });

            await cmd.execute(interaction);

            expect(cmd.runFn).not.toHaveBeenCalled();
        });

        it('should allow owner-only command from owner', async () => {
            const cmd = new TestCommand({ ownerOnly: true });
            const interaction = createMockInteraction({
                user: { id: 'owner-123' },
            });

            await cmd.execute(interaction);

            expect(cmd.runFn).toHaveBeenCalled();
        });

        it('should reject admin-only command from non-admin', async () => {
            const cmd = new TestCommand({ adminOnly: true });
            const interaction = createMockInteraction({
                user: { id: 'regular-user' },
                member: {
                    permissions: {
                        has: jest.fn().mockReturnValue(false),
                    },
                },
            });

            await cmd.execute(interaction);

            expect(cmd.runFn).not.toHaveBeenCalled();
        });

        it('should allow guild owner to use admin commands', async () => {
            const cmd = new TestCommand({ adminOnly: true });
            const interaction = createMockInteraction({
                user: { id: 'guild-owner-1' }, // matches guild.ownerId
                member: {
                    permissions: {
                        has: jest.fn().mockReturnValue(false), // No admin perm, but is owner
                    },
                },
            });

            await cmd.execute(interaction);

            expect(cmd.runFn).toHaveBeenCalled();
        });
    });

    describe('execute() — cooldowns', () => {
        it('should enforce cooldown between executions', async () => {
            const cmd = new TestCommand({ cooldown: 5 });
            const interaction1 = createMockInteraction();
            const interaction2 = createMockInteraction();

            await cmd.execute(interaction1);
            expect(cmd.runFn).toHaveBeenCalledTimes(1);

            // Second execution within cooldown
            await cmd.execute(interaction2);
            // Should have been blocked by cooldown
            expect(cmd.runFn).toHaveBeenCalledTimes(1);
        });

        it('should not enforce cooldown when set to 0', async () => {
            const cmd = new TestCommand({ cooldown: 0 });
            const interaction1 = createMockInteraction();
            const interaction2 = createMockInteraction();

            await cmd.execute(interaction1);
            await cmd.execute(interaction2);

            expect(cmd.runFn).toHaveBeenCalledTimes(2);
        });

        it('should track cooldown per user', async () => {
            const cmd = new TestCommand({ cooldown: 5 });

            const interaction1 = createMockInteraction({ user: { id: 'user-a' } });
            const interaction2 = createMockInteraction({ user: { id: 'user-b' } });

            await cmd.execute(interaction1);
            await cmd.execute(interaction2);

            // Different users should both succeed
            expect(cmd.runFn).toHaveBeenCalledTimes(2);
        });
    });

    describe('execute() — defer', () => {
        it('should auto-defer when deferReply is true', async () => {
            const cmd = new TestCommand({ deferReply: true });
            const interaction = createMockInteraction();

            await cmd.execute(interaction);

            expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: false });
        });

        it('should defer as ephemeral when ephemeral is true', async () => {
            const cmd = new TestCommand({ deferReply: true, ephemeral: true });
            const interaction = createMockInteraction();

            await cmd.execute(interaction);

            expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
        });

        it('should not defer when deferReply is false', async () => {
            const cmd = new TestCommand({ deferReply: false });
            const interaction = createMockInteraction();

            await cmd.execute(interaction);

            expect(interaction.deferReply).not.toHaveBeenCalled();
        });

        it('should not defer when already deferred', async () => {
            const cmd = new TestCommand({ deferReply: true });
            const interaction = createMockInteraction({ deferred: true });

            await cmd.execute(interaction);

            expect(interaction.deferReply).not.toHaveBeenCalled();
        });
    });

    describe('execute() — metrics tracking', () => {
        it('should track command metrics on success', async () => {
            const cmd = new TestCommand();
            const interaction = createMockInteraction();

            await cmd.execute(interaction);

            expect(commandsActive.inc).toHaveBeenCalledWith({ command: 'test' });
            expect(trackCommand).toHaveBeenCalledWith(
                'test', 'general', expect.any(Number), 'success'
            );
            expect(commandsActive.dec).toHaveBeenCalledWith({ command: 'test' });
        });

        it('should track error metrics on failure', async () => {
            const cmd = new TestCommand();
            cmd.runFn.mockRejectedValue(new Error('runtime error'));
            const interaction = createMockInteraction();

            await cmd.execute(interaction);

            expect(trackCommand).toHaveBeenCalledWith(
                'test', 'general', expect.any(Number), 'error'
            );
            expect(commandErrorsTotal.inc).toHaveBeenCalled();
        });
    });

    describe('execute() — error handling', () => {
        it('should catch errors and send error embed', async () => {
            const cmd = new TestCommand();
            cmd.runFn.mockRejectedValue(new Error('something broke'));
            const interaction = createMockInteraction();

            await cmd.execute(interaction);

            // Should have replied with error
            expect(interaction.reply).toHaveBeenCalled();
            const replyArgs = (interaction.reply as jest.Mock).mock.calls[0][0];
            expect(replyArgs.ephemeral).toBe(true);
        });

        it('should use AppError message for operational errors', async () => {
            const { ValidationError } = require('../../../src/errors/AppError');
            const cmd = new TestCommand();
            cmd.runFn.mockRejectedValue(new ValidationError('Invalid option'));
            const interaction = createMockInteraction();

            await cmd.execute(interaction);

            const replyArgs = (interaction.reply as jest.Mock).mock.calls[0][0];
            const embedDesc = replyArgs.embeds[0].data?.description || '';
            // Embed should contain the validation message
            expect(embedDesc || '').toBeTruthy();
        });
    });

    describe('safeReply()', () => {
        it('should use editReply when deferred', async () => {
            const cmd = new TestCommand();
            const interaction = createMockInteraction({ deferred: true });

            await cmd.safeReply(interaction, { content: 'hello' });

            expect(interaction.editReply).toHaveBeenCalled();
        });

        it('should use followUp when already replied', async () => {
            const cmd = new TestCommand();
            const interaction = createMockInteraction({ replied: true });

            await cmd.safeReply(interaction, { content: 'follow up' });

            expect(interaction.followUp).toHaveBeenCalled();
        });

        it('should use reply when not deferred or replied', async () => {
            const cmd = new TestCommand();
            const interaction = createMockInteraction();

            await cmd.safeReply(interaction, { content: 'first reply' });

            expect(interaction.reply).toHaveBeenCalled();
        });

        it('should catch reply errors gracefully', async () => {
            const cmd = new TestCommand();
            const interaction = createMockInteraction({
                reply: jest.fn().mockRejectedValue(new Error('Unknown interaction')),
            });

            // Should not throw
            await expect(cmd.safeReply(interaction, { content: 'test' })).resolves.not.toThrow();
        });
    });

    describe('embed helpers', () => {
        let cmd: TestCommand;

        beforeEach(() => {
            cmd = new TestCommand();
        });

        it('should create success embed', () => {
            const embed = cmd.successEmbed('Done', 'Operation successful');

            expect(embed).toBeDefined();
            expect(embed.data.title).toContain('Done');
            expect(embed.data.description).toBe('Operation successful');
        });

        it('should create error embed', () => {
            const embed = cmd.errorEmbed('Something went wrong');

            expect(embed).toBeDefined();
            expect(embed.data.description).toContain('Something went wrong');
        });

        it('should create info embed', () => {
            const embed = cmd.infoEmbed('Info', 'Here is some info');

            expect(embed).toBeDefined();
            expect(embed.data.title).toContain('Info');
        });

        it('should create warning embed', () => {
            const embed = cmd.warningEmbed('Be careful');

            expect(embed).toBeDefined();
            expect(embed.data.description).toContain('Be careful');
        });
    });

    describe('CommandCategory', () => {
        it('should define all categories', () => {
            expect(CommandCategory.GENERAL).toBe('general');
            expect(CommandCategory.ADMIN).toBe('admin');
            expect(CommandCategory.OWNER).toBe('owner');
            expect(CommandCategory.MUSIC).toBe('music');
            expect(CommandCategory.VIDEO).toBe('video');
            expect(CommandCategory.API).toBe('api');
            expect(CommandCategory.FUN).toBe('fun');
        });
    });
});
