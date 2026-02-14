/**
 * InfractionService Unit Tests
 * Tests for infraction creation, warnings, escalation, case management, embed building
 */

// Mock dependencies
const mockCreate = jest.fn();
const mockGetByCaseId = jest.fn();
const mockGetByUser = jest.fn();
const mockCountActiveWarnings = jest.fn();
const mockUpdate = jest.fn();
const mockDeactivate = jest.fn();
const mockGetRecent = jest.fn();
const mockGetStats = jest.fn();
const mockExpireOld = jest.fn();

jest.mock('../../../../src/repositories/moderation/InfractionRepository', () => ({
    __esModule: true,
    default: {
        create: mockCreate,
        getByCaseId: mockGetByCaseId,
        getByUser: mockGetByUser,
        countActiveWarnings: mockCountActiveWarnings,
        update: mockUpdate,
        deactivate: mockDeactivate,
        getRecent: mockGetRecent,
        getStats: mockGetStats,
        expireOld: mockExpireOld,
    },
}));

const mockLogInfraction = jest.fn();
jest.mock('../../../../src/services/moderation/ModLogService', () => ({
    __esModule: true,
    logInfraction: mockLogInfraction,
    default: { logInfraction: mockLogInfraction },
}));

const mockDbQuery = jest.fn();
jest.mock('../../../../src/database/index', () => ({
    __esModule: true,
    default: { query: mockDbQuery },
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
        INFRACTION_TYPES: {
            WARN: 'warn',
            MUTE: 'mute',
            UNMUTE: 'unmute',
            KICK: 'kick',
            BAN: 'ban',
            UNBAN: 'unban',
            AUTOMOD: 'automod',
            FILTER: 'filter',
        },
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
        punishments: {
            defaultReasons: { warn: 'No reason', kick: 'Rule violation' },
            warnings: { defaultExpiryDays: 7 },
            defaultThresholds: [
                { warnCount: 3, action: 'mute', durationMs: 3600000 },
                { warnCount: 5, action: 'ban' },
            ],
        },
    },
}));

jest.mock('../../../../src/core/Logger', () => ({
    __esModule: true,
    default: { error: jest.fn(), debug: jest.fn(), info: jest.fn(), warn: jest.fn(), success: jest.fn() },
    logger: { error: jest.fn(), debug: jest.fn(), info: jest.fn(), warn: jest.fn(), success: jest.fn() },
}));

import {
    createInfraction,
    createWarning,
    logMute,
    logUnmute,
    logKick,
    logBan,
    logUnban,
    logAutoMod,
    logFilter,
    getCase,
    getUserHistory,
    getWarningCount,
    clearWarnings,
    updateReason,
    deleteCase,
    checkEscalation,
    getRecentCases,
    getStats,
    buildCaseEmbed,
    expireOldInfractions,
    INFRACTION_TYPES,
    COLORS,
    EMOJIS,
} from '../../../../src/services/moderation/InfractionService.js';

// Helpers
const mockGuild = {
    id: '111',
    client: { user: { id: 'bot-id' } },
    channels: { fetch: jest.fn() },
} as any;

const mockUser = {
    id: '222',
    tag: 'TestUser#0001',
    username: 'TestUser',
    displayAvatarURL: jest.fn().mockReturnValue('https://avatar.url'),
} as any;

const mockModerator = {
    id: '333',
    tag: 'Mod#0001',
    username: 'Mod',
} as any;

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

describe('InfractionService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockCreate.mockResolvedValue(mockInfraction);
        mockLogInfraction.mockResolvedValue(undefined);
    });

    // --- Exported constants ---
    describe('Exported constants', () => {
        it('should export INFRACTION_TYPES', () => {
            expect(INFRACTION_TYPES.WARN).toBe('warn');
            expect(INFRACTION_TYPES.BAN).toBe('ban');
            expect(INFRACTION_TYPES.KICK).toBe('kick');
        });

        it('should export COLORS', () => {
            expect(COLORS.WARN).toBe(0xFFAA00);
            expect(COLORS.DEFAULT).toBe(0x5865F2);
        });

        it('should export EMOJIS', () => {
            expect(EMOJIS.WARN).toBe('⚠️');
            expect(EMOJIS.CASE).toBe('📋');
        });
    });

    // --- createInfraction ---
    describe('createInfraction', () => {
        it('should create an infraction via repository', async () => {
            const result = await createInfraction({
                guild: mockGuild,
                user: mockUser,
                moderator: mockModerator,
                type: 'warn',
                reason: 'Test reason',
            });

            expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
                guildId: '111',
                userId: '222',
                moderatorId: '333',
                type: 'warn',
                reason: 'Test reason',
            }));
            expect(result).toBe(mockInfraction);
        });

        it('should log infraction to ModLogService', async () => {
            await createInfraction({
                guild: mockGuild,
                user: mockUser,
                moderator: mockModerator,
                type: 'warn',
                reason: 'Test',
            });

            expect(mockLogInfraction).toHaveBeenCalledWith(mockGuild, mockInfraction, mockUser, mockModerator);
        });

        it('should calculate expiresAt for warnings with expiryDays', async () => {
            const before = Date.now();
            await createInfraction({
                guild: mockGuild,
                user: mockUser,
                moderator: mockModerator,
                type: 'warn',
                reason: 'Test',
                expiryDays: 7,
            });

            const call = mockCreate.mock.calls[0][0];
            expect(call.expiresAt).toBeInstanceOf(Date);
            const expectedMs = 7 * 24 * 60 * 60 * 1000;
            expect(call.expiresAt.getTime()).toBeGreaterThanOrEqual(before + expectedMs - 1000);
        });

        it('should calculate expiresAt for mutes with durationMs', async () => {
            await createInfraction({
                guild: mockGuild,
                user: mockUser,
                moderator: mockModerator,
                type: 'mute',
                reason: 'Spamming',
                durationMs: 3600000,
            });

            const call = mockCreate.mock.calls[0][0];
            expect(call.expiresAt).toBeInstanceOf(Date);
        });

        it('should use default reason if none provided', async () => {
            await createInfraction({
                guild: mockGuild,
                user: mockUser,
                moderator: mockModerator,
                type: 'warn',
                reason: '',
            });

            const call = mockCreate.mock.calls[0][0];
            expect(call.reason).toBe('No reason');
        });

        it('should include user and moderator tags in metadata', async () => {
            await createInfraction({
                guild: mockGuild,
                user: mockUser,
                moderator: mockModerator,
                type: 'kick',
                reason: 'Test',
            });

            const call = mockCreate.mock.calls[0][0];
            expect(call.metadata.userTag).toBe('TestUser#0001');
            expect(call.metadata.moderatorTag).toBe('Mod#0001');
        });

        it('should handle user with username instead of tag', async () => {
            const userNoTag = { id: '999', username: 'NoTagUser' };

            await createInfraction({
                guild: mockGuild,
                user: userNoTag,
                moderator: mockModerator,
                type: 'kick',
                reason: 'Test',
            });

            const call = mockCreate.mock.calls[0][0];
            expect(call.metadata.userTag).toBe('NoTagUser');
        });
    });

    // --- createWarning ---
    describe('createWarning', () => {
        it('should create a warning and return warnCount + escalation', async () => {
            mockCountActiveWarnings.mockResolvedValue(2);
            mockDbQuery.mockResolvedValue({ rows: [] });

            const result = await createWarning(mockGuild, mockUser, mockModerator, 'Bad behavior');

            expect(result.infraction).toBe(mockInfraction);
            expect(result.warnCount).toBe(2);
        });

        it('should use default expiryDays from config', async () => {
            mockCountActiveWarnings.mockResolvedValue(1);
            mockDbQuery.mockResolvedValue({ rows: [] });

            await createWarning(mockGuild, mockUser, mockModerator, 'Test');

            const call = mockCreate.mock.calls[0][0];
            expect(call.expiresAt).toBeInstanceOf(Date);
        });

        it('should use custom expiryDays when provided', async () => {
            mockCountActiveWarnings.mockResolvedValue(1);
            mockDbQuery.mockResolvedValue({ rows: [] });

            await createWarning(mockGuild, mockUser, mockModerator, 'Test', { expiryDays: 14 });

            // Verify expiresAt is set further in the future
            const call = mockCreate.mock.calls[0][0];
            expect(call.expiresAt).toBeInstanceOf(Date);
        });
    });

    // --- log* convenience functions ---
    describe('log convenience functions', () => {
        it('logMute should create a MUTE infraction with durationMs', async () => {
            await logMute(mockGuild, mockUser, mockModerator, 'Spamming', 600000);

            expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
                type: 'mute',
                durationMs: 600000,
            }));
        });

        it('logUnmute should create an UNMUTE infraction', async () => {
            await logUnmute(mockGuild, mockUser, mockModerator, 'Time served');

            expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
                type: 'unmute',
            }));
        });

        it('logKick should create a KICK infraction', async () => {
            await logKick(mockGuild, mockUser, mockModerator, 'Rule violation');

            expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
                type: 'kick',
            }));
        });

        it('logBan should create a BAN infraction with metadata', async () => {
            await logBan(mockGuild, mockUser, mockModerator, 'Severe', { delete_days: 7 });

            expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
                type: 'ban',
                metadata: expect.objectContaining({ delete_days: 7 }),
            }));
        });

        it('logUnban should create an UNBAN infraction', async () => {
            await logUnban(mockGuild, mockUser, mockModerator, 'Appeal accepted');

            expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
                type: 'unban',
            }));
        });

        it('logAutoMod should use bot as moderator', async () => {
            await logAutoMod(mockGuild, mockUser, 'spam', 'delete');

            expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
                moderatorId: 'bot-id',
                type: 'automod',
                reason: expect.stringContaining('spam'),
            }));
        });

        it('logFilter should use "Word Filter" as moderator tag', async () => {
            await logFilter(mockGuild, mockUser, 'badword', 'delete');

            const call = mockCreate.mock.calls[0][0];
            expect(call.metadata.moderatorTag).toBe('Word Filter');
            expect(call.type).toBe('filter');
        });
    });

    // --- Query functions ---
    describe('Query functions', () => {
        it('getCase should delegate to repository', async () => {
            mockGetByCaseId.mockResolvedValue(mockInfraction);
            const result = await getCase('111', 42);
            expect(mockGetByCaseId).toHaveBeenCalledWith('111', 42);
            expect(result).toBe(mockInfraction);
        });

        it('getUserHistory should delegate to repository', async () => {
            mockGetByUser.mockResolvedValue([mockInfraction]);
            const result = await getUserHistory('111', '222');
            expect(mockGetByUser).toHaveBeenCalledWith('111', '222');
            expect(result).toEqual([mockInfraction]);
        });

        it('getWarningCount should delegate to repository', async () => {
            mockCountActiveWarnings.mockResolvedValue(3);
            const result = await getWarningCount('111', '222');
            expect(result).toBe(3);
        });

        it('getRecentCases should use default limit of 20', async () => {
            mockGetRecent.mockResolvedValue([]);
            await getRecentCases('111');
            expect(mockGetRecent).toHaveBeenCalledWith('111', 20);
        });

        it('getRecentCases should accept custom limit', async () => {
            mockGetRecent.mockResolvedValue([]);
            await getRecentCases('111', 5);
            expect(mockGetRecent).toHaveBeenCalledWith('111', 5);
        });

        it('getStats should delegate to repository', async () => {
            mockGetStats.mockResolvedValue({ warn: 10, kick: 2 });
            const result = await getStats('111');
            expect(result).toEqual({ warn: 10, kick: 2 });
        });
    });

    // --- clearWarnings ---
    describe('clearWarnings', () => {
        it('should execute SQL to deactivate warnings and return count', async () => {
            mockDbQuery.mockResolvedValue({ rowCount: 5 });

            const result = await clearWarnings('111', '222');

            expect(mockDbQuery).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE mod_cases SET active = FALSE'),
                ['111', '222', 'warn']
            );
            expect(result).toBe(5);
        });

        it('should return 0 when no warnings cleared', async () => {
            mockDbQuery.mockResolvedValue({ rowCount: 0 });
            const result = await clearWarnings('111', '222');
            expect(result).toBe(0);
        });

        it('should return 0 when rowCount is undefined', async () => {
            mockDbQuery.mockResolvedValue({});
            const result = await clearWarnings('111', '222');
            expect(result).toBe(0);
        });
    });

    // --- updateReason ---
    describe('updateReason', () => {
        it('should update case reason via repository', async () => {
            mockUpdate.mockResolvedValue(mockInfraction);
            const result = await updateReason('111', 42, 'New reason');
            expect(mockUpdate).toHaveBeenCalledWith('111', 42, { reason: 'New reason' });
            expect(result).toBe(mockInfraction);
        });

        it('should return null when case not found', async () => {
            mockUpdate.mockResolvedValue(null);
            const result = await updateReason('111', 999, 'New reason');
            expect(result).toBeNull();
        });
    });

    // --- deleteCase ---
    describe('deleteCase', () => {
        it('should deactivate case via repository', async () => {
            mockDeactivate.mockResolvedValue(mockInfraction);
            const result = await deleteCase('111', 42);
            expect(mockDeactivate).toHaveBeenCalledWith('111', 42);
            expect(result).toBe(true);
        });

        it('should return false when case not found', async () => {
            mockDeactivate.mockResolvedValue(null);
            const result = await deleteCase('111', 999);
            expect(result).toBe(false);
        });
    });

    // --- checkEscalation ---
    describe('checkEscalation', () => {
        it('should return escalation when threshold matches from DB', async () => {
            mockDbQuery.mockResolvedValue({
                rows: [
                    { warn_count: 3, action: 'mute', duration_ms: 3600000 },
                    { warn_count: 5, action: 'ban' },
                ],
            });

            const result = await checkEscalation(mockGuild, mockUser, 3);

            expect(result).toEqual({
                action: 'mute',
                durationMs: 3600000,
                reason: expect.stringContaining('3 warnings'),
            });
        });

        it('should return null when no threshold matches', async () => {
            mockDbQuery.mockResolvedValue({ rows: [{ warn_count: 5, action: 'ban' }] });

            const result = await checkEscalation(mockGuild, mockUser, 2);
            expect(result).toBeNull();
        });

        it('should fall back to config defaults when no DB thresholds', async () => {
            mockDbQuery.mockResolvedValue({ rows: [] });

            const result = await checkEscalation(mockGuild, mockUser, 3);

            expect(result).toEqual({
                action: 'mute',
                durationMs: 3600000,
                reason: expect.stringContaining('3 warnings'),
            });
        });

        it('should use custom reason from DB threshold', async () => {
            mockDbQuery.mockResolvedValue({
                rows: [{ warn_count: 3, action: 'mute', duration_ms: 600000, reason: 'Custom mute reason' }],
            });

            const result = await checkEscalation(mockGuild, mockUser, 3);
            expect(result?.reason).toBe('Custom mute reason');
        });
    });

    // --- buildCaseEmbed ---
    describe('buildCaseEmbed', () => {
        it('should build embed with case info', () => {
            const embed = buildCaseEmbed(mockInfraction as any);
            const json = embed.toJSON();

            expect(json.title).toContain('Case #42');
            expect(json.fields).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ name: 'Type', value: 'WARN' }),
                    expect.objectContaining({ name: 'User', value: '<@222>' }),
                    expect.objectContaining({ name: 'Moderator', value: '<@333>' }),
                    expect.objectContaining({ name: 'Reason', value: 'Test reason' }),
                ])
            );
        });

        it('should show duration field when present', () => {
            const infWithDuration = { ...mockInfraction, duration_ms: 3600000 };
            const embed = buildCaseEmbed(infWithDuration as any);
            const json = embed.toJSON();

            expect(json.fields).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ name: 'Duration' }),
                ])
            );
        });

        it('should show expiry field when present', () => {
            const infWithExpiry = { ...mockInfraction, expires_at: new Date('2026-01-08') };
            const embed = buildCaseEmbed(infWithExpiry as any);
            const json = embed.toJSON();

            expect(json.fields).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ name: 'Expires' }),
                ])
            );
        });

        it('should show deactivation footer for inactive cases', () => {
            const inactive = { ...mockInfraction, active: false };
            const embed = buildCaseEmbed(inactive as any);
            const json = embed.toJSON();

            expect(json.footer?.text).toContain('deactivated');
        });

        it('should set thumbnail when user has displayAvatarURL', () => {
            const embed = buildCaseEmbed(mockInfraction as any, mockUser);
            const json = embed.toJSON();

            expect(json.thumbnail?.url).toBe('https://avatar.url');
        });

        it('should use default color for unknown type', () => {
            const unknownType = { ...mockInfraction, type: 'unknown' };
            const embed = buildCaseEmbed(unknownType as any);
            const json = embed.toJSON();

            expect(json.color).toBe(COLORS.DEFAULT);
        });
    });

    // --- expireOldInfractions ---
    describe('expireOldInfractions', () => {
        it('should delegate to repository', async () => {
            mockExpireOld.mockResolvedValue(3);
            const result = await expireOldInfractions();
            expect(mockExpireOld).toHaveBeenCalled();
            expect(result).toBe(3);
        });
    });
});
