/**
 * AutoModService Unit Tests
 * Tests for message processing, individual checks (invites, links, spam, duplicates, mentions, caps),
 * bypass logic, settings management, action execution, ignored channels/roles
 */

// Mock dependencies
const mockCheckMessage = jest.fn();
jest.mock('../../../../src/services/moderation/FilterService', () => ({
    __esModule: true,
    checkMessage: mockCheckMessage,
    default: { checkMessage: mockCheckMessage },
}));

const mockLogAutoMod = jest.fn();
jest.mock('../../../../src/services/moderation/InfractionService', () => ({
    __esModule: true,
    logAutoMod: mockLogAutoMod,
    default: { logAutoMod: mockLogAutoMod },
}));

const mockGetOrSet = jest.fn();
const mockCacheDelete = jest.fn();
const mockTrackSpamMessage = jest.fn();
const mockResetSpamTracker = jest.fn();
const mockTrackDuplicateMessage = jest.fn();
const mockResetDuplicateTracker = jest.fn();
const mockTrackAutomodWarn = jest.fn();
const mockResetAutomodWarn = jest.fn();

jest.mock('../../../../src/cache/CacheService', () => ({
    __esModule: true,
    default: {
        getOrSet: mockGetOrSet,
        delete: mockCacheDelete,
        trackSpamMessage: mockTrackSpamMessage,
        resetSpamTracker: mockResetSpamTracker,
        trackDuplicateMessage: mockTrackDuplicateMessage,
        resetDuplicateTracker: mockResetDuplicateTracker,
        trackAutomodWarn: mockTrackAutomodWarn,
        resetAutomodWarn: mockResetAutomodWarn,
    },
}));

jest.mock('../../../../src/core/metrics', () => ({
    trackAutomodViolation: jest.fn(),
}));

const mockGetOrCreate = jest.fn();
const mockAutoModRepoUpdate = jest.fn();
const mockToggleFeature = jest.fn();

jest.mock('../../../../src/repositories/moderation/AutoModRepository', () => ({
    __esModule: true,
    default: {
        getOrCreate: mockGetOrCreate,
        update: mockAutoModRepoUpdate,
        toggleFeature: mockToggleFeature,
    },
}));

jest.mock('../../../../src/config/features/moderation/automod', () => ({
    __esModule: true,
    default: {
        links: {
            allowMedia: true,
            mediaExtensions: ['.jpg', '.png', '.gif'],
            blacklist: ['malware.com', 'phishing.net'],
            whitelistMode: false,
        },
    },
}));

jest.mock('../../../../src/core/Logger', () => ({
    __esModule: true,
    default: { error: jest.fn(), debug: jest.fn(), info: jest.fn(), warn: jest.fn(), success: jest.fn() },
    logger: { error: jest.fn(), debug: jest.fn(), info: jest.fn(), warn: jest.fn(), success: jest.fn() },
}));

import {
    getSettings,
    invalidateCache,
    updateSettings,
    toggleFeature,
    shouldBypass,
    shouldIgnoreChannel,
    processMessage,
    checkWordFilter,
    checkInvites,
    checkLinks,
    checkSpam,
    checkDuplicates,
    checkMentions,
    checkCaps,
    executeAction,
    addIgnoredChannel,
    removeIgnoredChannel,
    addIgnoredRole,
    removeIgnoredRole,
} from '../../../../src/services/moderation/AutoModService.js';

// Helpers
const defaultSettings = {
    enabled: true,
    filter_enabled: true,
    filtered_words: ['badword'],
    invites_enabled: true,
    invites_action: 'delete_warn',
    invites_whitelist: [],
    links_enabled: true,
    links_action: 'delete_warn',
    links_whitelist: ['discord.com'],
    spam_enabled: true,
    spam_threshold: 5,
    spam_window_ms: 5000,
    spam_action: 'delete_warn',
    spam_mute_duration_ms: 300000,
    duplicate_enabled: true,
    duplicate_threshold: 3,
    duplicate_window_ms: 30000,
    duplicate_action: 'delete_warn',
    mention_enabled: true,
    mention_limit: 5,
    mention_action: 'delete_warn',
    caps_enabled: true,
    caps_percent: 70,
    caps_min_length: 10,
    caps_action: 'delete',
    ignored_channels: [] as string[],
    ignored_roles: [] as string[],
    warn_threshold: 3,
    warn_reset_hours: 1,
    warn_action: 'mute',
    mute_duration: 15,
};

const createMockMessage = (content: string, overrides: any = {}) => ({
    content,
    guild: { id: '111' },
    channelId: 'ch-1',
    author: { id: '222', bot: false, tag: 'User#0001' },
    member: {
        id: '222',
        user: { bot: false },
        guild: { ownerId: 'owner-1' },
        permissions: { has: jest.fn().mockReturnValue(false) },
        roles: { cache: { some: jest.fn().mockReturnValue(false) } },
        timeout: jest.fn().mockResolvedValue(undefined),
    },
    mentions: {
        users: { size: 0 },
        roles: { size: 0 },
        everyone: false,
    },
    delete: jest.fn().mockResolvedValue(undefined),
    ...overrides,
});

describe('AutoModService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockGetOrSet.mockImplementation((_ns: string, _key: string, fetcher: () => any) => fetcher());
        mockGetOrCreate.mockResolvedValue(defaultSettings);
        mockCheckMessage.mockResolvedValue(null);
    });

    // --- Settings management ---
    describe('getSettings', () => {
        it('should use cacheService.getOrSet', async () => {
            const result = await getSettings('111');
            expect(mockGetOrSet).toHaveBeenCalledWith('guild', 'automod:111', expect.any(Function), 300);
            expect(result).toEqual(defaultSettings);
        });
    });

    describe('invalidateCache', () => {
        it('should delete settings from cache', async () => {
            await invalidateCache('111');
            expect(mockCacheDelete).toHaveBeenCalledWith('guild', 'automod:111');
        });
    });

    describe('updateSettings', () => {
        it('should update via repository and invalidate cache', async () => {
            const updated = { ...defaultSettings, caps_percent: 80 };
            mockAutoModRepoUpdate.mockResolvedValue(updated);

            const result = await updateSettings('111', { caps_percent: 80 });

            expect(mockAutoModRepoUpdate).toHaveBeenCalledWith('111', { caps_percent: 80 });
            expect(mockCacheDelete).toHaveBeenCalledWith('guild', 'automod:111');
            expect(result.caps_percent).toBe(80);
        });
    });

    describe('toggleFeature', () => {
        it('should toggle via repository and invalidate cache', async () => {
            const updated = { ...defaultSettings, spam_enabled: false };
            mockToggleFeature.mockResolvedValue(updated);

            const result = await toggleFeature('111', 'spam', false);

            expect(mockToggleFeature).toHaveBeenCalledWith('111', 'spam', false);
            expect(result.spam_enabled).toBe(false);
        });
    });

    // --- Bypass checks ---
    describe('shouldBypass', () => {
        it('should bypass for bots', () => {
            const member = { user: { bot: true }, id: '222', guild: { ownerId: '999' }, permissions: { has: jest.fn() }, roles: { cache: { some: jest.fn() } } } as any;
            expect(shouldBypass(member, defaultSettings)).toBe(true);
        });

        it('should bypass for guild owner', () => {
            const member = { user: { bot: false }, id: 'owner-1', guild: { ownerId: 'owner-1' }, permissions: { has: jest.fn() }, roles: { cache: { some: jest.fn() } } } as any;
            expect(shouldBypass(member, defaultSettings)).toBe(true);
        });

        it('should bypass for admins', () => {
            const member = { user: { bot: false }, id: '222', guild: { ownerId: '999' }, permissions: { has: jest.fn().mockReturnValue(true) }, roles: { cache: { some: jest.fn() } } } as any;
            expect(shouldBypass(member, defaultSettings)).toBe(true);
        });

        it('should bypass for ignored roles', () => {
            const settings = { ...defaultSettings, ignored_roles: ['role-1'] };
            const member = {
                user: { bot: false },
                id: '222',
                guild: { ownerId: '999' },
                permissions: { has: jest.fn().mockReturnValue(false) },
                roles: { cache: { some: jest.fn().mockReturnValue(true) } },
            } as any;
            expect(shouldBypass(member, settings)).toBe(true);
        });

        it('should not bypass for normal users', () => {
            const member = {
                user: { bot: false },
                id: '222',
                guild: { ownerId: '999' },
                permissions: { has: jest.fn().mockReturnValue(false) },
                roles: { cache: { some: jest.fn().mockReturnValue(false) } },
            } as any;
            expect(shouldBypass(member, defaultSettings)).toBe(false);
        });
    });

    describe('shouldIgnoreChannel', () => {
        it('should return true for ignored channels', () => {
            const settings = { ...defaultSettings, ignored_channels: ['ch-1'] };
            expect(shouldIgnoreChannel('ch-1', settings)).toBe(true);
        });

        it('should return false for non-ignored channels', () => {
            expect(shouldIgnoreChannel('ch-1', defaultSettings)).toBe(false);
        });
    });

    // --- Individual checks ---
    describe('checkInvites', () => {
        it('should detect discord.gg invite links', () => {
            const msg = createMockMessage('Join discord.gg/abc123');
            const result = checkInvites(msg as any, defaultSettings);
            expect(result).not.toBeNull();
            expect(result!.type).toBe('invites');
        });

        it('should detect discordapp.com/invite links', () => {
            const msg = createMockMessage('Join https://discordapp.com/invite/abc');
            const result = checkInvites(msg as any, defaultSettings);
            expect(result).not.toBeNull();
        });

        it('should return null when invites disabled', () => {
            const msg = createMockMessage('discord.gg/abc');
            const result = checkInvites(msg as any, { ...defaultSettings, invites_enabled: false });
            expect(result).toBeNull();
        });

        it('should return null for normal messages', () => {
            const msg = createMockMessage('Hello world!');
            const result = checkInvites(msg as any, defaultSettings);
            expect(result).toBeNull();
        });
    });

    describe('checkLinks', () => {
        it('should allow whitelisted links', () => {
            const msg = createMockMessage('Check https://discord.com/channels/123');
            const result = checkLinks(msg as any, defaultSettings);
            expect(result).toBeNull();
        });

        it('should detect blacklisted links', () => {
            const msg = createMockMessage('Visit https://malware.com/payload');
            const result = checkLinks(msg as any, defaultSettings);
            expect(result).not.toBeNull();
            expect(result!.type).toBe('links');
            expect(result!.trigger).toContain('Blacklisted');
        });

        it('should allow media links when allowMedia is true', () => {
            const msg = createMockMessage('https://example.com/photo.jpg');
            const result = checkLinks(msg as any, defaultSettings);
            expect(result).toBeNull();
        });

        it('should return null when links disabled', () => {
            const msg = createMockMessage('https://malware.com');
            const result = checkLinks(msg as any, { ...defaultSettings, links_enabled: false });
            expect(result).toBeNull();
        });

        it('should return null for messages without URLs', () => {
            const msg = createMockMessage('Just text, no links');
            const result = checkLinks(msg as any, defaultSettings);
            expect(result).toBeNull();
        });
    });

    describe('checkMentions', () => {
        it('should detect mention spam', () => {
            const msg = createMockMessage('@everyone', {
                mentions: { users: { size: 6 }, roles: { size: 0 }, everyone: false },
            });
            const result = checkMentions(msg as any, defaultSettings);
            expect(result).not.toBeNull();
            expect(result!.type).toBe('mentions');
        });

        it('should count all mention types', () => {
            const msg = createMockMessage('mentions', {
                mentions: { users: { size: 2 }, roles: { size: 3 }, everyone: true },
            });
            const result = checkMentions(msg as any, defaultSettings);
            // 2 + 3 + 1 = 6 > 5 limit
            expect(result).not.toBeNull();
        });

        it('should return null when under limit', () => {
            const msg = createMockMessage('hey @someone', {
                mentions: { users: { size: 1 }, roles: { size: 0 }, everyone: false },
            });
            const result = checkMentions(msg as any, defaultSettings);
            expect(result).toBeNull();
        });

        it('should return null when mentions disabled', () => {
            const msg = createMockMessage('mentions', {
                mentions: { users: { size: 20 }, roles: { size: 0 }, everyone: false },
            });
            const result = checkMentions(msg as any, { ...defaultSettings, mention_enabled: false });
            expect(result).toBeNull();
        });
    });

    describe('checkCaps', () => {
        it('should detect caps spam', () => {
            const msg = createMockMessage('THIS IS ALL CAPS AND VERY LONG MESSAGE FOR TESTING!!');
            const result = checkCaps(msg as any, defaultSettings);
            expect(result).not.toBeNull();
            expect(result!.type).toBe('caps');
        });

        it('should return null for short messages', () => {
            const msg = createMockMessage('SHORT');
            const result = checkCaps(msg as any, defaultSettings);
            expect(result).toBeNull();
        });

        it('should return null for normal case messages', () => {
            const msg = createMockMessage('This is a perfectly normal message that should pass.');
            const result = checkCaps(msg as any, defaultSettings);
            expect(result).toBeNull();
        });

        it('should return null when caps disabled', () => {
            const msg = createMockMessage('ALL CAPS MESSAGE THAT IS VERY LONG');
            const result = checkCaps(msg as any, { ...defaultSettings, caps_enabled: false });
            expect(result).toBeNull();
        });

        it('should strip emojis before checking', () => {
            const msg = createMockMessage('😀😀😀😀😀😀😀😀😀😀hello world normal text');
            const result = checkCaps(msg as any, defaultSettings);
            expect(result).toBeNull();
        });
    });

    describe('checkSpam', () => {
        it('should detect spam when threshold reached', async () => {
            mockTrackSpamMessage.mockResolvedValue(5);
            const msg = createMockMessage('spam');

            const result = await checkSpam(msg as any, defaultSettings);

            expect(result).not.toBeNull();
            expect(result!.type).toBe('spam');
            expect(mockResetSpamTracker).toHaveBeenCalledWith('111', '222');
        });

        it('should return null when under threshold', async () => {
            mockTrackSpamMessage.mockResolvedValue(2);
            const msg = createMockMessage('hi');

            const result = await checkSpam(msg as any, defaultSettings);

            expect(result).toBeNull();
        });

        it('should return null when spam disabled', async () => {
            const msg = createMockMessage('spam');
            const result = await checkSpam(msg as any, { ...defaultSettings, spam_enabled: false });
            expect(result).toBeNull();
        });
    });

    describe('checkDuplicates', () => {
        it('should detect duplicate messages', async () => {
            mockTrackDuplicateMessage.mockResolvedValue({ count: 3 });
            const msg = createMockMessage('This is a repeated message');

            const result = await checkDuplicates(msg as any, defaultSettings);

            expect(result).not.toBeNull();
            expect(result!.type).toBe('duplicate');
        });

        it('should ignore short messages', async () => {
            const msg = createMockMessage('hi');
            const result = await checkDuplicates(msg as any, defaultSettings);
            expect(result).toBeNull();
        });

        it('should return null when under threshold', async () => {
            mockTrackDuplicateMessage.mockResolvedValue({ count: 1 });
            const msg = createMockMessage('Some longer message here');
            const result = await checkDuplicates(msg as any, defaultSettings);
            expect(result).toBeNull();
        });
    });

    describe('checkWordFilter', () => {
        it('should detect FilterService matches', async () => {
            mockCheckMessage.mockResolvedValue({ pattern: 'test', action: 'delete', severity: 3 });
            const msg = createMockMessage('contains the test word');

            const result = await checkWordFilter(msg as any, defaultSettings);

            expect(result).not.toBeNull();
            expect(result!.type).toBe('filter');
        });

        it('should check filtered_words from settings', async () => {
            mockCheckMessage.mockResolvedValue(null);
            const msg = createMockMessage('you said badword here');

            const result = await checkWordFilter(msg as any, defaultSettings);

            expect(result).not.toBeNull();
            expect(result!.trigger).toContain('badword');
        });

        it('should return null when filter disabled', async () => {
            const msg = createMockMessage('badword');
            const result = await checkWordFilter(msg as any, { ...defaultSettings, filter_enabled: false });
            expect(result).toBeNull();
        });

        it('should return null for clean messages', async () => {
            mockCheckMessage.mockResolvedValue(null);
            const msg = createMockMessage('perfectly clean message');
            const result = await checkWordFilter(msg as any, { ...defaultSettings, filtered_words: [] });
            expect(result).toBeNull();
        });
    });

    // --- processMessage ---
    describe('processMessage', () => {
        it('should return null for bot messages', async () => {
            const msg = createMockMessage('test', { author: { bot: true, id: 'bot' } });
            const result = await processMessage(msg as any);
            expect(result).toBeNull();
        });

        it('should return null for non-guild messages', async () => {
            const msg = createMockMessage('test', { guild: null });
            const result = await processMessage(msg as any);
            expect(result).toBeNull();
        });

        it('should return null when automod is disabled', async () => {
            mockGetOrCreate.mockResolvedValue({ ...defaultSettings, enabled: false });
            const msg = createMockMessage('badword');
            const result = await processMessage(msg as any);
            expect(result).toBeNull();
        });

        it('should return first violation found', async () => {
            mockGetOrCreate.mockResolvedValue(defaultSettings);
            mockCheckMessage.mockResolvedValue({ pattern: 'bad', action: 'delete', severity: 5 });
            const msg = createMockMessage('bad content');

            const result = await processMessage(msg as any);

            expect(result).not.toBeNull();
            expect(result!.type).toBe('filter');
        });

        it('should return null for clean messages', async () => {
            mockGetOrCreate.mockResolvedValue({
                ...defaultSettings,
                filter_enabled: false,
                invites_enabled: false,
                links_enabled: false,
                spam_enabled: false,
                duplicate_enabled: false,
                mention_enabled: false,
                caps_enabled: false,
            });
            const msg = createMockMessage('clean message');

            const result = await processMessage(msg as any);
            expect(result).toBeNull();
        });
    });

    // --- executeAction ---
    describe('executeAction', () => {
        it('should delete message when action includes delete', async () => {
            const msg = createMockMessage('spam content');
            mockLogAutoMod.mockResolvedValue(undefined);
            mockTrackAutomodWarn.mockResolvedValue(1);

            const violation = { type: 'spam', trigger: 'Spam detected', action: 'delete_warn', severity: 3 };
            const result = await executeAction(msg as any, violation);

            expect(result.deleted).toBe(true);
            expect(msg.delete).toHaveBeenCalled();
        });

        it('should track warn count and not escalate below threshold', async () => {
            const msg = createMockMessage('spam');
            mockLogAutoMod.mockResolvedValue(undefined);
            mockTrackAutomodWarn.mockResolvedValue(1);

            const violation = { type: 'spam', trigger: 'Spam', action: 'delete_warn', severity: 3 };
            const result = await executeAction(msg as any, violation);

            expect(result.warned).toBe(true);
            expect(result.muted).toBe(false);
            expect(result.escalated).toBe(false);
            expect(result.warnCount).toBe(1);
        });

        it('should escalate to mute at threshold', async () => {
            const msg = createMockMessage('spam');
            mockLogAutoMod.mockResolvedValue(undefined);
            mockTrackAutomodWarn.mockResolvedValue(3); // threshold = 3

            const violation = { type: 'spam', trigger: 'Spam', action: 'delete_warn', severity: 3 };
            const result = await executeAction(msg as any, violation);

            expect(result.muted).toBe(true);
            expect(result.escalated).toBe(true);
            expect(msg.member.timeout).toHaveBeenCalled();
            expect(mockResetAutomodWarn).toHaveBeenCalledWith('111', '222');
        });

        it('should log infraction via InfractionService', async () => {
            const msg = createMockMessage('spam');
            mockLogAutoMod.mockResolvedValue(undefined);
            mockTrackAutomodWarn.mockResolvedValue(1);

            const violation = { type: 'spam', trigger: 'Spam', action: 'delete', severity: 3 };
            await executeAction(msg as any, violation);

            expect(mockLogAutoMod).toHaveBeenCalledWith(
                msg.guild,
                msg.author,
                'Spam',
                'delete',
                expect.objectContaining({ type: 'spam' })
            );
        });
    });

    // --- Ignored management ---
    describe('addIgnoredChannel', () => {
        it('should add channel to ignored list', async () => {
            mockGetOrCreate.mockResolvedValue({ ...defaultSettings });
            mockAutoModRepoUpdate.mockResolvedValue(defaultSettings);

            await addIgnoredChannel('111', 'ch-new');

            expect(mockAutoModRepoUpdate).toHaveBeenCalledWith('111', expect.objectContaining({
                ignored_channels: expect.arrayContaining(['ch-new']),
            }));
        });

        it('should not add duplicate channel', async () => {
            mockGetOrCreate.mockResolvedValue({ ...defaultSettings, ignored_channels: ['ch-1'] });
            mockAutoModRepoUpdate.mockResolvedValue(defaultSettings);

            await addIgnoredChannel('111', 'ch-1');

            expect(mockAutoModRepoUpdate).not.toHaveBeenCalled();
        });
    });

    describe('removeIgnoredChannel', () => {
        it('should remove channel from ignored list', async () => {
            mockGetOrCreate.mockResolvedValue({ ...defaultSettings, ignored_channels: ['ch-1', 'ch-2'] });
            mockAutoModRepoUpdate.mockResolvedValue(defaultSettings);

            await removeIgnoredChannel('111', 'ch-1');

            expect(mockAutoModRepoUpdate).toHaveBeenCalledWith('111', expect.objectContaining({
                ignored_channels: ['ch-2'],
            }));
        });
    });

    describe('addIgnoredRole', () => {
        it('should add role to ignored list', async () => {
            mockGetOrCreate.mockResolvedValue({ ...defaultSettings });
            mockAutoModRepoUpdate.mockResolvedValue(defaultSettings);

            await addIgnoredRole('111', 'role-new');

            expect(mockAutoModRepoUpdate).toHaveBeenCalledWith('111', expect.objectContaining({
                ignored_roles: expect.arrayContaining(['role-new']),
            }));
        });
    });

    describe('removeIgnoredRole', () => {
        it('should remove role from ignored list', async () => {
            mockGetOrCreate.mockResolvedValue({ ...defaultSettings, ignored_roles: ['role-1', 'role-2'] });
            mockAutoModRepoUpdate.mockResolvedValue(defaultSettings);

            await removeIgnoredRole('111', 'role-1');

            expect(mockAutoModRepoUpdate).toHaveBeenCalledWith('111', expect.objectContaining({
                ignored_roles: ['role-2'],
            }));
        });
    });
});
