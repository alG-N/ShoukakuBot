/**
 * ModerationService Unit Tests
 * Tests for kick/mute/ban operations, log embed creation, and duration parsing
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
        success: jest.fn(),
    },
}));

// Mock GuildSettingsService
jest.mock('../../../../src/services/guild/GuildSettingsService', () => ({
    __esModule: true,
    default: {
        getLogChannel: jest.fn().mockResolvedValue(null),
    },
}));

// Mock time utility
jest.mock('../../../../src/utils/common/time', () => ({
    formatDuration: jest.fn((ms: number) => {
        if (ms >= 86400000) return `${Math.floor(ms / 86400000)}d`;
        if (ms >= 3600000) return `${Math.floor(ms / 3600000)}h`;
        if (ms >= 60000) return `${Math.floor(ms / 60000)}m`;
        return `${Math.floor(ms / 1000)}s`;
    }),
}));

import {
    kickUser,
    muteUser,
    unmuteUser,
    banUser,
    unbanUser,
    logModAction,
    createLogEmbed,
    parseDuration,
    CONFIG,
} from '../../../../src/services/moderation/ModerationService';
import GuildSettingsService from '../../../../src/services/guild/GuildSettingsService';
import type { Guild, GuildMember, User, TextChannel } from 'discord.js';

// Helper to create mock GuildMember
function createMockMember(overrides: Record<string, unknown> = {}): GuildMember {
    return {
        id: '100',
        user: { id: '100', tag: 'TestUser#0001', displayAvatarURL: () => 'https://cdn.example.com/avatar.png' },
        guild: {
            id: '999',
            name: 'Test Guild',
            ownerId: '000',
            members: { ban: jest.fn().mockResolvedValue(undefined) },
            channels: { cache: new Map() },
            bans: { fetch: jest.fn() },
        },
        roles: { highest: { position: 5 } },
        kickable: true,
        bannable: true,
        moderatable: true,
        kick: jest.fn().mockResolvedValue(undefined),
        ban: jest.fn().mockResolvedValue(undefined),
        timeout: jest.fn().mockResolvedValue(undefined),
        send: jest.fn().mockResolvedValue(undefined),
        isCommunicationDisabled: jest.fn().mockReturnValue(false),
        ...overrides,
    } as unknown as GuildMember;
}

describe('ModerationService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // ========== parseDuration() ==========
    describe('parseDuration()', () => {
        it('should return null for null/undefined input', () => {
            expect(parseDuration(null)).toBeNull();
            expect(parseDuration(undefined)).toBeNull();
            expect(parseDuration('')).toBeNull();
        });

        it('should parse preset durations', () => {
            expect(parseDuration('1m')).toBe(60 * 1000);
            expect(parseDuration('5m')).toBe(5 * 60 * 1000);
            expect(parseDuration('1h')).toBe(60 * 60 * 1000);
            expect(parseDuration('1d')).toBe(24 * 60 * 60 * 1000);
            expect(parseDuration('7d')).toBe(7 * 24 * 60 * 60 * 1000);
            expect(parseDuration('28d')).toBe(28 * 24 * 60 * 60 * 1000);
        });

        it('should parse preset durations case-insensitively', () => {
            expect(parseDuration('1M')).toBe(60 * 1000);
            expect(parseDuration('1H')).toBe(60 * 60 * 1000);
            expect(parseDuration('1D')).toBe(24 * 60 * 60 * 1000);
        });

        it('should parse custom duration strings', () => {
            expect(parseDuration('30s')).toBe(30 * 1000);
            expect(parseDuration('15m')).toBe(15 * 60 * 1000);
            expect(parseDuration('2h')).toBe(2 * 60 * 60 * 1000);
            expect(parseDuration('3d')).toBe(3 * 24 * 60 * 60 * 1000);
            expect(parseDuration('2w')).toBe(2 * 7 * 24 * 60 * 60 * 1000);
        });

        it('should default to minutes when no unit is given', () => {
            expect(parseDuration('10')).toBe(10 * 60 * 1000);
        });

        it('should return null for invalid strings', () => {
            expect(parseDuration('abc')).toBeNull();
            expect(parseDuration('hello world')).toBeNull();
        });
    });

    // ========== CONFIG ==========
    describe('CONFIG', () => {
        it('should have all color values', () => {
            expect(CONFIG.COLORS.SUCCESS).toBe(0x00FF00);
            expect(CONFIG.COLORS.ERROR).toBe(0xFF0000);
            expect(CONFIG.COLORS.WARNING).toBe(0xFFAA00);
            expect(CONFIG.COLORS.MODERATION).toBe(0xFF5555);
        });

        it('should have all log action types', () => {
            expect(CONFIG.LOG_ACTIONS.KICK).toBe('KICK');
            expect(CONFIG.LOG_ACTIONS.MUTE).toBe('MUTE');
            expect(CONFIG.LOG_ACTIONS.UNMUTE).toBe('UNMUTE');
            expect(CONFIG.LOG_ACTIONS.BAN).toBe('BAN');
            expect(CONFIG.LOG_ACTIONS.UNBAN).toBe('UNBAN');
            expect(CONFIG.LOG_ACTIONS.DELETE).toBe('DELETE');
        });

        it('should have max mute duration of 28 days', () => {
            expect(CONFIG.MAX_MUTE_DURATION_MS).toBe(28 * 24 * 60 * 60 * 1000);
        });

        it('should have duration presets for all common intervals', () => {
            expect(Object.keys(CONFIG.DURATION_PRESETS)).toEqual(
                expect.arrayContaining(['1m', '5m', '10m', '30m', '1h', '6h', '12h', '1d', '7d', '14d', '28d'])
            );
        });
    });

    // ========== createLogEmbed() ==========
    describe('createLogEmbed()', () => {
        const mockModerator = createMockMember({ id: '200', user: { id: '200', tag: 'Mod#0001' } });

        it('should create KICK log embed', () => {
            const embed = createLogEmbed({
                type: 'KICK',
                target: createMockMember(),
                moderator: mockModerator,
                reason: 'Spamming',
            });

            const json = embed.toJSON();
            expect(json.title).toBe('👢 Member Kicked');
            expect(json.description).toContain('was kicked');
            expect(json.fields).toEqual(expect.arrayContaining([
                expect.objectContaining({ name: 'Reason', value: 'Spamming' }),
            ]));
        });

        it('should create MUTE log embed with duration', () => {
            const embed = createLogEmbed({
                type: 'MUTE',
                target: createMockMember(),
                moderator: mockModerator,
                reason: 'Being rude',
                duration: 3600000,
            });

            const json = embed.toJSON();
            expect(json.title).toBe('🔇 Member Muted');
            expect(json.fields).toEqual(expect.arrayContaining([
                expect.objectContaining({ name: 'Duration' }),
            ]));
        });

        it('should create UNMUTE log embed with success color', () => {
            const embed = createLogEmbed({
                type: 'UNMUTE',
                target: createMockMember(),
                moderator: mockModerator,
                reason: 'Appeal accepted',
            });

            const json = embed.toJSON();
            expect(json.title).toBe('🔊 Member Unmuted');
            expect(json.color).toBe(CONFIG.COLORS.SUCCESS);
        });

        it('should create BAN log embed', () => {
            const embed = createLogEmbed({
                type: 'BAN',
                target: createMockMember(),
                moderator: mockModerator,
                reason: 'Repeated violations',
                deleteMessageDays: 7,
            });

            const json = embed.toJSON();
            expect(json.title).toBe('🔨 Member Banned');
            expect(json.fields).toEqual(expect.arrayContaining([
                expect.objectContaining({ name: 'Messages Deleted', value: '7 day(s)' }),
            ]));
        });

        it('should create UNBAN log embed', () => {
            const embed = createLogEmbed({
                type: 'UNBAN',
                target: { id: '555' } as any,
                moderator: mockModerator,
                reason: 'Ban expired',
            });

            const json = embed.toJSON();
            expect(json.title).toBe('🔓 Member Unbanned');
            expect(json.color).toBe(CONFIG.COLORS.SUCCESS);
        });

        it('should create DELETE log embed', () => {
            const embed = createLogEmbed({
                type: 'DELETE',
                target: createMockMember(),
                moderator: mockModerator,
                reason: 'Purge',
                count: 50,
                channel: '#general',
                filters: 'user:12345',
            });

            const json = embed.toJSON();
            expect(json.title).toBe('🗑️ Messages Deleted');
            expect(json.color).toBe(CONFIG.COLORS.WARNING);
            expect(json.fields).toEqual(expect.arrayContaining([
                expect.objectContaining({ name: 'Count', value: '50' }),
                expect.objectContaining({ name: 'Filters', value: 'user:12345' }),
            ]));
        });

        it('should handle unknown action types with fallback', () => {
            const embed = createLogEmbed({
                type: 'CUSTOM_ACTION',
                target: createMockMember(),
                moderator: mockModerator,
                reason: 'Some reason',
            });

            const json = embed.toJSON();
            expect(json.title).toBe('📋 Moderation Action');
        });
    });

    // ========== kickUser() ==========
    describe('kickUser()', () => {
        it('should kick successfully', async () => {
            const target = createMockMember();
            const moderator = createMockMember({
                id: '200',
                user: { id: '200', tag: 'Mod#0001' },
                roles: { highest: { position: 10 } },
            });

            const result = await kickUser(target, moderator, 'Bad behavior');

            expect(result.isOk()).toBe(true);
            expect(result.data).toEqual(expect.objectContaining({
                userId: '100',
                action: 'kick',
            }));
            expect(target.kick).toHaveBeenCalledWith('Bad behavior');
        });

        it('should fail when target is not kickable', async () => {
            const target = createMockMember({ kickable: false });
            const moderator = createMockMember({
                id: '200',
                roles: { highest: { position: 10 } },
            });

            const result = await kickUser(target, moderator);

            expect(result.isErr()).toBe(true);
            expect(result.code).toBe('CANNOT_KICK');
        });

        it('should fail when moderator has lower role', async () => {
            const target = createMockMember({
                roles: { highest: { position: 10 } },
            });
            const moderator = createMockMember({
                id: '200',
                roles: { highest: { position: 5 } },
            });

            const result = await kickUser(target, moderator);

            expect(result.isErr()).toBe(true);
            expect(result.code).toBe('USER_HIGHER_ROLE');
        });

        it('should allow guild owner to kick anyone', async () => {
            const guildOwner = createMockMember({
                id: '000',
                user: { id: '000', tag: 'Owner#0001' },
                roles: { highest: { position: 1 } },
            });
            // The guild ownerId is '000'
            const target = createMockMember({
                roles: { highest: { position: 100 } },
            });

            const result = await kickUser(target, guildOwner);

            expect(result.isOk()).toBe(true);
        });

        it('should use default reason if not provided', async () => {
            const target = createMockMember();
            const moderator = createMockMember({
                id: '200',
                roles: { highest: { position: 10 } },
            });

            await kickUser(target, moderator);

            expect(target.kick).toHaveBeenCalledWith(CONFIG.DEFAULT_REASONS.KICK);
        });

        it('should handle DM failure gracefully', async () => {
            const target = createMockMember({
                send: jest.fn().mockRejectedValue(new Error('Cannot DM')),
            });
            const moderator = createMockMember({
                id: '200',
                roles: { highest: { position: 10 } },
            });

            const result = await kickUser(target, moderator);

            // Should still succeed even if DM fails
            expect(result.isOk()).toBe(true);
        });
    });

    // ========== muteUser() ==========
    describe('muteUser()', () => {
        it('should mute successfully', async () => {
            const target = createMockMember();
            const moderator = createMockMember({
                id: '200',
                roles: { highest: { position: 10 } },
            });

            const result = await muteUser(target, moderator, 3600000, 'Being loud');

            expect(result.isOk()).toBe(true);
            expect(result.data).toEqual(expect.objectContaining({
                action: 'mute',
                duration: 3600000,
                wasClamped: false,
            }));
            expect(target.timeout).toHaveBeenCalledWith(3600000, 'Being loud');
        });

        it('should clamp duration to safe max (~27d 23h)', async () => {
            const target = createMockMember();
            const moderator = createMockMember({
                id: '200',
                roles: { highest: { position: 10 } },
            });

            const thirtyDays = 30 * 24 * 60 * 60 * 1000;
            const result = await muteUser(target, moderator, thirtyDays);

            expect(result.isOk()).toBe(true);
            expect(result.data?.wasClamped).toBe(true);
            expect(result.data?.duration).toBeLessThan(thirtyDays);
        });

        it('should fail when target is not moderatable', async () => {
            const target = createMockMember({ moderatable: false });
            const moderator = createMockMember({
                id: '200',
                roles: { highest: { position: 10 } },
            });

            const result = await muteUser(target, moderator, 3600000);

            expect(result.isErr()).toBe(true);
            expect(result.code).toBe('CANNOT_MUTE');
        });
    });

    // ========== unmuteUser() ==========
    describe('unmuteUser()', () => {
        it('should unmute a muted user', async () => {
            const target = createMockMember({
                isCommunicationDisabled: jest.fn().mockReturnValue(true),
            });
            const moderator = createMockMember({
                id: '200',
                roles: { highest: { position: 10 } },
            });

            const result = await unmuteUser(target, moderator);

            expect(result.isOk()).toBe(true);
            expect(target.timeout).toHaveBeenCalledWith(null, expect.any(String));
        });

        it('should fail when user is not muted', async () => {
            const target = createMockMember({
                isCommunicationDisabled: jest.fn().mockReturnValue(false),
            });
            const moderator = createMockMember({ id: '200' });

            const result = await unmuteUser(target, moderator);

            expect(result.isErr()).toBe(true);
            expect(result.code).toBe('USER_NOT_MUTED');
        });
    });

    // ========== banUser() ==========
    describe('banUser()', () => {
        it('should ban a guild member successfully', async () => {
            const target = createMockMember();
            const moderator = createMockMember({
                id: '200',
                user: { id: '200', tag: 'Mod#0001' },
                roles: { highest: { position: 10 } },
            });

            const result = await banUser(target, moderator, 'Severe violation', 7);

            expect(result.isOk()).toBe(true);
            expect(result.data).toEqual(expect.objectContaining({
                action: 'ban',
                deleteMessageDays: 7,
            }));
        });

        it('should fail when member is not bannable', async () => {
            const target = createMockMember({ bannable: false });
            const moderator = createMockMember({
                id: '200',
                roles: { highest: { position: 10 } },
            });

            const result = await banUser(target, moderator);

            expect(result.isErr()).toBe(true);
            expect(result.code).toBe('CANNOT_BAN');
        });
    });

    // ========== unbanUser() ==========
    describe('unbanUser()', () => {
        it('should fail when user is not banned', async () => {
            const mockGuild = {
                id: '999',
                bans: { fetch: jest.fn().mockRejectedValue(new Error('Unknown Ban')) },
                members: { unban: jest.fn() },
                channels: { cache: new Map() },
            } as unknown as Guild;
            const moderator = createMockMember({ id: '200' });

            const result = await unbanUser(mockGuild, '12345', moderator);

            expect(result.isErr()).toBe(true);
            expect(result.code).toBe('USER_NOT_BANNED');
        });

        it('should unban successfully when ban exists', async () => {
            const mockGuild = {
                id: '999',
                bans: { fetch: jest.fn().mockResolvedValue({ user: { id: '12345' } }) },
                members: { unban: jest.fn().mockResolvedValue(undefined) },
                channels: { cache: new Map() },
            } as unknown as Guild;
            const moderator = createMockMember({ id: '200' });

            const result = await unbanUser(mockGuild, '12345', moderator);

            expect(result.isOk()).toBe(true);
            expect(mockGuild.members.unban).toHaveBeenCalledWith('12345', expect.any(String));
        });
    });

    // ========== logModAction() ==========
    describe('logModAction()', () => {
        it('should skip logging when no log channel is set', async () => {
            (GuildSettingsService.getLogChannel as jest.Mock).mockResolvedValue(null);

            const mockGuild = {
                id: '999',
                channels: { cache: new Map() },
            } as unknown as Guild;

            // Should not throw
            await logModAction(mockGuild, {
                type: 'KICK',
                target: createMockMember(),
                moderator: createMockMember({ id: '200' }),
                reason: 'test',
            });
        });

        it('should send log embed when log channel exists', async () => {
            const mockSend = jest.fn().mockResolvedValue(undefined);
            const mockLogChannel = { send: mockSend } as unknown as TextChannel;

            (GuildSettingsService.getLogChannel as jest.Mock).mockResolvedValue('chan-1');

            const channelMap = new Map([['chan-1', mockLogChannel]]);
            const mockGuild = {
                id: '999',
                channels: { cache: channelMap },
            } as unknown as Guild;

            await logModAction(mockGuild, {
                type: 'KICK',
                target: createMockMember(),
                moderator: createMockMember({ id: '200', user: { id: '200', tag: 'Mod#1' } }),
                reason: 'test kick',
            });

            expect(mockSend).toHaveBeenCalledWith({
                embeds: expect.arrayContaining([expect.any(Object)]),
            });
        });
    });
});
