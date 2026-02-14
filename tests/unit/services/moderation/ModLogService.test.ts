/**
 * ModLogService Unit Tests
 * Tests for logging infractions, message deletes/edits, member join/leave, settings management
 */

// Mock dependencies
const mockModLogRepoGet = jest.fn();
const mockModLogRepoUpdate = jest.fn();

jest.mock('../../../../src/repositories/moderation/ModLogRepository', () => ({
    __esModule: true,
    default: {
        get: mockModLogRepoGet,
        update: mockModLogRepoUpdate,
    },
}));

jest.mock('../../../../src/core/Logger', () => ({
    __esModule: true,
    default: { error: jest.fn(), debug: jest.fn(), info: jest.fn(), warn: jest.fn(), success: jest.fn() },
    logger: { error: jest.fn(), debug: jest.fn(), info: jest.fn(), warn: jest.fn(), success: jest.fn() },
}));

jest.mock('../../../../src/utils/common/time', () => ({
    formatDuration: jest.fn((ms: number) => {
        if (ms >= 86400000) return `${Math.floor(ms / 86400000)}d`;
        if (ms >= 3600000) return `${Math.floor(ms / 3600000)}h`;
        if (ms >= 60000) return `${Math.floor(ms / 60000)}m`;
        return `${Math.floor(ms / 1000)}s`;
    }),
}));

jest.mock('../../../../src/config/features/moderation/index', () => ({
    __esModule: true,
    default: {
        COLORS: {
            WARN: 0xFFAA00,
            MUTE: 0xFF6600,
            KICK: 0xFF4444,
            BAN: 0xFF0000,
            DEFAULT: 0x5865F2,
        },
        EMOJIS: {
            WARN: '⚠️',
            MUTE: '🔇',
            KICK: '👢',
            BAN: '🔨',
            CASE: '📋',
            USER: '👤',
            MODERATOR: '🛡️',
            DURATION: '⏱️',
            REASON: '📝',
            EXPIRES: '⏳',
        },
    },
}));

import {
    logInfraction,
    logMessageDelete,
    logMessageEdit,
    logMemberJoin,
    logMemberLeave,
    getSettings,
    updateSettings,
    setLogChannel,
} from '../../../../src/services/moderation/ModLogService.js';
import logger from '../../../../src/core/Logger.js';

// Helpers
const mockSend = jest.fn().mockResolvedValue(undefined);

const createMockGuild = (channelExists = true) => ({
    id: '111',
    channels: {
        fetch: jest.fn().mockImplementation(() =>
            channelExists
                ? Promise.resolve({ send: mockSend })
                : Promise.resolve(null)
        ),
    },
    memberCount: 100,
} as any);

const defaultSettings = {
    log_channel_id: 'log-channel-1',
    include_moderator: true,
    include_reason: true,
    log_warns: true,
    log_mutes: true,
    log_kicks: true,
    log_bans: true,
    log_automod: true,
    log_filters: true,
    log_message_deletes: true,
    log_message_edits: true,
};

const mockInfraction = {
    id: 1,
    case_id: 42,
    guild_id: '111',
    user_id: '222',
    moderator_id: '333',
    type: 'warn',
    reason: 'Test reason',
    active: true,
    created_at: new Date('2026-01-01'),
};

const mockUser = {
    id: '222',
    tag: 'TestUser#0001',
    username: 'TestUser',
    displayAvatarURL: jest.fn().mockReturnValue('https://cdn.discordapp.com/avatars/222/abc.png'),
};

const mockModerator = {
    id: '333',
    tag: 'Mod#0001',
    username: 'Mod',
};

describe('ModLogService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockModLogRepoGet.mockResolvedValue(defaultSettings);
    });

    // --- logInfraction ---
    describe('logInfraction', () => {
        it('should send embed to log channel', async () => {
            const guild = createMockGuild();

            await logInfraction(guild, mockInfraction as any, mockUser as any, mockModerator as any);

            expect(guild.channels.fetch).toHaveBeenCalledWith('log-channel-1');
            expect(mockSend).toHaveBeenCalledWith({ embeds: [expect.any(Object)] });
        });

        it('should skip when no log_channel_id', async () => {
            mockModLogRepoGet.mockResolvedValue({ ...defaultSettings, log_channel_id: null });
            const guild = createMockGuild();

            await logInfraction(guild, mockInfraction as any, mockUser as any, mockModerator as any);

            expect(guild.channels.fetch).not.toHaveBeenCalled();
        });

        it('should skip when settings are null', async () => {
            mockModLogRepoGet.mockResolvedValue(null);
            const guild = createMockGuild();

            await logInfraction(guild, mockInfraction as any, mockUser as any, mockModerator as any);

            expect(guild.channels.fetch).not.toHaveBeenCalled();
        });

        it('should skip when channel fetch fails', async () => {
            const guild = createMockGuild(false);

            await logInfraction(guild, mockInfraction as any, mockUser as any, mockModerator as any);

            expect(mockSend).not.toHaveBeenCalled();
        });

        it('should handle errors silently', async () => {
            const guild = createMockGuild();
            mockSend.mockRejectedValueOnce(new Error('Send failed'));

            await logInfraction(guild, mockInfraction as any, mockUser as any, mockModerator as any);

            expect(logger.error).toHaveBeenCalledWith('[ModLogService]', expect.stringContaining('Send failed'));
        });

        it('should include duration in embed for mutes', async () => {
            const guild = createMockGuild();
            const muteInfraction = { ...mockInfraction, type: 'mute', duration_ms: 3600000 };

            await logInfraction(guild, muteInfraction as any, mockUser as any, mockModerator as any);

            expect(mockSend).toHaveBeenCalled();
            const embed = mockSend.mock.calls[0][0].embeds[0];
            const json = embed.toJSON();
            const durationField = json.fields?.find((f: any) => f.name.includes('Duration'));
            expect(durationField).toBeDefined();
        });

        it('should include metadata trigger and channel', async () => {
            const guild = createMockGuild();
            const automodInfraction = {
                ...mockInfraction,
                type: 'automod',
                metadata: { trigger: 'spam', channel_id: 'ch-1' },
            };

            await logInfraction(guild, automodInfraction as any, mockUser as any, mockModerator as any);

            const embed = mockSend.mock.calls[0][0].embeds[0];
            const json = embed.toJSON();
            const triggerField = json.fields?.find((f: any) => f.name.includes('Trigger'));
            const channelField = json.fields?.find((f: any) => f.name.includes('Channel'));
            expect(triggerField?.value).toBe('spam');
            expect(channelField?.value).toBe('<#ch-1>');
        });
    });

    // --- logMessageDelete ---
    describe('logMessageDelete', () => {
        const mockMessage = {
            id: 'msg-1',
            content: 'Deleted content',
            channelId: 'ch-1',
            author: { id: '222', displayAvatarURL: jest.fn().mockReturnValue('https://cdn.discordapp.com/avatars/222/abc.png') },
            attachments: { size: 0, values: jest.fn().mockReturnValue([]) },
        } as any;

        it('should send delete log embed', async () => {
            const guild = createMockGuild();

            await logMessageDelete(guild, mockMessage);

            expect(mockSend).toHaveBeenCalledWith({ embeds: [expect.any(Object)] });
        });

        it('should skip when log_message_deletes is false', async () => {
            mockModLogRepoGet.mockResolvedValue({ ...defaultSettings, log_message_deletes: false });
            const guild = createMockGuild();

            await logMessageDelete(guild, mockMessage);

            expect(mockSend).not.toHaveBeenCalled();
        });

        it('should include executor when provided', async () => {
            const guild = createMockGuild();
            const executor = { id: '444' } as any;

            await logMessageDelete(guild, mockMessage, executor);

            const embed = mockSend.mock.calls[0][0].embeds[0];
            const json = embed.toJSON();
            const deletedBy = json.fields?.find((f: any) => f.name === 'Deleted By');
            expect(deletedBy?.value).toContain('444');
        });

        it('should include attachments when present', async () => {
            const guild = createMockGuild();
            const msgWithAttachments = {
                ...mockMessage,
                attachments: {
                    size: 2,
                    values: jest.fn().mockReturnValue([
                        { name: 'image.png' },
                        { name: 'doc.pdf' },
                    ]),
                },
            };

            await logMessageDelete(guild, msgWithAttachments);

            const embed = mockSend.mock.calls[0][0].embeds[0];
            const json = embed.toJSON();
            const attachField = json.fields?.find((f: any) => f.name.includes('Attachments'));
            expect(attachField?.value).toContain('image.png');
        });

        it('should handle errors silently', async () => {
            const guild = createMockGuild();
            mockSend.mockRejectedValueOnce(new Error('Fail'));

            await logMessageDelete(guild, mockMessage);

            expect(logger.error).toHaveBeenCalledWith('[ModLogService]', expect.stringContaining('message delete'));
        });
    });

    // --- logMessageEdit ---
    describe('logMessageEdit', () => {
        it('should send edit log embed', async () => {
            const guild = createMockGuild();
            const oldMsg = { content: 'Old', channelId: 'ch-1', id: 'msg-1', author: { id: '222', displayAvatarURL: jest.fn() } } as any;
            const newMsg = { content: 'New', channelId: 'ch-1', id: 'msg-1', author: { id: '222', displayAvatarURL: jest.fn() } } as any;

            await logMessageEdit(guild, oldMsg, newMsg);

            expect(mockSend).toHaveBeenCalled();
        });

        it('should skip when content unchanged', async () => {
            const guild = createMockGuild();
            const oldMsg = { content: 'Same', channelId: 'ch-1', id: 'msg-1', author: { id: '222', displayAvatarURL: jest.fn() } } as any;
            const newMsg = { content: 'Same', channelId: 'ch-1', id: 'msg-1', author: { id: '222', displayAvatarURL: jest.fn() } } as any;

            await logMessageEdit(guild, oldMsg, newMsg);

            expect(mockSend).not.toHaveBeenCalled();
        });

        it('should skip when log_message_edits is false', async () => {
            mockModLogRepoGet.mockResolvedValue({ ...defaultSettings, log_message_edits: false });
            const guild = createMockGuild();
            const oldMsg = { content: 'Old' } as any;
            const newMsg = { content: 'New' } as any;

            await logMessageEdit(guild, oldMsg, newMsg);

            expect(mockSend).not.toHaveBeenCalled();
        });
    });

    // --- logMemberJoin ---
    describe('logMemberJoin', () => {
        it('should send join log embed', async () => {
            const member = {
                id: '222',
                guild: createMockGuild(),
                user: {
                    tag: 'NewUser#0001',
                    createdTimestamp: Date.now() - 30 * 24 * 60 * 60 * 1000, // 30 days old
                    displayAvatarURL: jest.fn().mockReturnValue('https://cdn.discordapp.com/avatars/222/abc.png'),
                },
            } as any;

            await logMemberJoin(member);

            expect(mockSend).toHaveBeenCalled();
            const embed = mockSend.mock.calls[0][0].embeds[0];
            const json = embed.toJSON();
            expect(json.author?.name).toContain('Joined');
        });

        it('should flag new accounts (< 7 days)', async () => {
            const member = {
                id: '222',
                guild: createMockGuild(),
                user: {
                    tag: 'New#0001',
                    createdTimestamp: Date.now() - 2 * 24 * 60 * 60 * 1000, // 2 days old
                    displayAvatarURL: jest.fn().mockReturnValue('https://cdn.discordapp.com/avatars/222/abc.png'),
                },
            } as any;

            await logMemberJoin(member);

            const embed = mockSend.mock.calls[0][0].embeds[0];
            const json = embed.toJSON();
            const ageField = json.fields?.find((f: any) => f.name === 'Account Age');
            expect(ageField?.value).toContain('⚠️');
        });

        it('should handle missing settings', async () => {
            mockModLogRepoGet.mockResolvedValue(null);
            const member = {
                id: '222',
                guild: createMockGuild(),
                user: { tag: 'U#0001', createdTimestamp: Date.now(), displayAvatarURL: jest.fn() },
            } as any;

            await logMemberJoin(member);
            expect(mockSend).not.toHaveBeenCalled();
        });
    });

    // --- logMemberLeave ---
    describe('logMemberLeave', () => {
        it('should send leave log embed with roles and stay duration', async () => {
            const mockGuild = createMockGuild();
            const member = {
                id: '222',
                guild: mockGuild,
                user: {
                    tag: 'Leaving#0001',
                    displayAvatarURL: jest.fn().mockReturnValue('https://cdn.discordapp.com/avatars/222/abc.png'),
                },
                joinedAt: new Date(Date.now() - 86400000 * 30), // 30 days ago
                roles: {
                    cache: new Map([
                        ['role-1', { id: 'role-1', name: 'Moderator' }],
                    ]),
                },
            } as any;
            // Override the filter method on the Map-based cache
            member.roles.cache.filter = jest.fn().mockReturnValue(
                new Map([['role-1', { id: 'role-1', name: 'Moderator' }]])
            );
            const filteredResult = member.roles.cache.filter();
            // Provide map/slice/join chain
            member.roles.cache.filter = jest.fn().mockReturnValue({
                map: jest.fn().mockReturnValue(['Moderator']),
                slice: jest.fn().mockReturnThis(),
            });
            // Simplify: mock the whole chain
            member.roles.cache = {
                filter: jest.fn().mockReturnValue({
                    map: jest.fn().mockReturnValue({
                        slice: jest.fn().mockReturnValue({
                            join: jest.fn().mockReturnValue('Moderator'),
                        }),
                    }),
                }),
            };

            await logMemberLeave(member);

            expect(mockSend).toHaveBeenCalled();
        });

        it('should handle missing joinedAt', async () => {
            const member = {
                id: '222',
                guild: createMockGuild(),
                user: {
                    tag: 'User#0001',
                    displayAvatarURL: jest.fn().mockReturnValue('https://cdn.discordapp.com/avatars/222/abc.png'),
                },
                joinedAt: null,
                roles: {
                    cache: {
                        filter: jest.fn().mockReturnValue({
                            map: jest.fn().mockReturnValue({
                                slice: jest.fn().mockReturnValue({
                                    join: jest.fn().mockReturnValue(''),
                                }),
                            }),
                        }),
                    },
                },
            } as any;

            await logMemberLeave(member);

            // Should still send, with 'Unknown' stay duration
            expect(mockSend).toHaveBeenCalled();
        });
    });

    // --- Settings management ---
    describe('Settings management', () => {
        it('getSettings should delegate to repository', async () => {
            const result = await getSettings('111');
            expect(mockModLogRepoGet).toHaveBeenCalledWith('111');
            expect(result).toEqual(defaultSettings);
        });

        it('getSettings should return null when no settings', async () => {
            mockModLogRepoGet.mockResolvedValue(null);
            const result = await getSettings('111');
            expect(result).toBeNull();
        });

        it('updateSettings should delegate to repository', async () => {
            mockModLogRepoUpdate.mockResolvedValue({ ...defaultSettings, log_warns: false });

            const result = await updateSettings('111', { log_warns: false });

            expect(mockModLogRepoUpdate).toHaveBeenCalledWith('111', { log_warns: false });
            expect(result.log_warns).toBe(false);
        });

        it('setLogChannel should update log_channel_id', async () => {
            mockModLogRepoUpdate.mockResolvedValue({ ...defaultSettings, log_channel_id: 'new-ch' });

            const result = await setLogChannel('111', 'new-ch');

            expect(mockModLogRepoUpdate).toHaveBeenCalledWith('111', { log_channel_id: 'new-ch' });
            expect(result.log_channel_id).toBe('new-ch');
        });

        it('setLogChannel should accept null to disable', async () => {
            mockModLogRepoUpdate.mockResolvedValue({ ...defaultSettings, log_channel_id: null });

            const result = await setLogChannel('111', null);

            expect(mockModLogRepoUpdate).toHaveBeenCalledWith('111', { log_channel_id: null });
            expect(result.log_channel_id).toBeNull();
        });
    });
});
