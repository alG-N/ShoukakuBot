/**
 * FilterService Unit Tests
 * Tests for word filtering, normalization, and pattern matching
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
}));

// Mock CacheService
const mockGetOrSet = jest.fn();
const mockDelete = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../../src/cache/CacheService', () => ({
    __esModule: true,
    default: {
        getOrSet: mockGetOrSet,
        delete: mockDelete,
    },
}));

// Mock FilterRepository
const mockFilterRepoGetAll = jest.fn().mockResolvedValue([]);
const mockFilterRepoAdd = jest.fn();
const mockFilterRepoAddBulk = jest.fn();
const mockFilterRepoRemove = jest.fn();
const mockFilterRepoRemoveByPattern = jest.fn();
const mockFilterRepoRemoveAll = jest.fn();
const mockFilterRepoCount = jest.fn();
const mockFilterRepoSearch = jest.fn();

jest.mock('../../../../src/repositories/moderation/FilterRepository', () => ({
    __esModule: true,
    default: {
        getAll: mockFilterRepoGetAll,
        add: mockFilterRepoAdd,
        addBulk: mockFilterRepoAddBulk,
        remove: mockFilterRepoRemove,
        removeByPattern: mockFilterRepoRemoveByPattern,
        removeAll: mockFilterRepoRemoveAll,
        count: mockFilterRepoCount,
        search: mockFilterRepoSearch,
    },
}));

// Mock filter config
jest.mock('../../../../src/config/features/moderation/filters', () => ({
    __esModule: true,
    default: {
        settings: {
            defaultAction: 'delete_warn',
            ignoreCase: true,
            normalizeUnicode: true,
            checkLeetspeak: true,
            stripZalgo: true,
            minWordLength: 2,
            logContent: false,
            logChannel: null,
        },
        matchTypes: {
            EXACT: 'exact',
            CONTAINS: 'contains',
            WORD: 'word',
            REGEX: 'regex',
        },
        leetspeak: {
            '0': 'o',
            '1': 'i',
            '3': 'e',
            '4': 'a',
            '5': 's',
            '7': 't',
            '@': 'a',
        },
        unicodeMap: {},
        zalgoPattern: /[\u0300-\u036f\u0489]/g,
        presets: {
            basic: {
                name: 'basic',
                description: 'Basic bad words',
                words: [
                    { pattern: 'badword', matchType: 'word', severity: 1 },
                    { pattern: 'verybad', matchType: 'contains', severity: 2 },
                ],
            },
        },
        exemptPatterns: [/https?:\/\/\S+/g],
    },
}));

import {
    normalizeText,
    matchesFilter,
    checkMessage,
    addFilter,
    removeFilter,
    clearFilters,
    importPreset,
    getFilterCount,
    invalidateCache,
    type Filter,
} from '../../../../src/services/moderation/FilterService';

describe('FilterService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // ========== normalizeText() ==========
    describe('normalizeText()', () => {
        it('should lowercase text', () => {
            expect(normalizeText('HELLO WORLD')).toBe('hello world');
        });

        it('should strip zalgo characters', () => {
            const zalgoText = 'h̷e̸l̵l̶o̴'; // has combining diacritical marks
            const result = normalizeText(zalgoText);
            expect(result).toBe('hello');
        });

        it('should convert leetspeak for @ symbol', () => {
            expect(normalizeText('h@ck')).toBe('hack');
        });

        it('should convert digit-based leetspeak', () => {
            // Previously broken due to regex backreference bug (\\${char} → \\3).
            // Fixed by properly escaping chars with char.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')
            expect(normalizeText('h3ll0')).toBe('hello');
            expect(normalizeText('l33t')).toBe('leet');
            expect(normalizeText('n00b')).toBe('noob');
            expect(normalizeText('4tt4ck')).toBe('attack');
            expect(normalizeText('7e57')).toBe('test');
            expect(normalizeText('5p4m')).toBe('spam');
        });

        it('should handle empty string', () => {
            expect(normalizeText('')).toBe('');
        });

        it('should handle normal text without changes', () => {
            expect(normalizeText('hello world')).toBe('hello world');
        });
    });

    // ========== matchesFilter() ==========
    describe('matchesFilter()', () => {
        const createFilter = (overrides: Partial<Filter> = {}): Filter => ({
            id: 1,
            guild_id: '123',
            pattern: 'badword',
            match_type: 'contains',
            action: 'delete_warn',
            severity: 1,
            created_by: '999',
            created_at: new Date(),
            ...overrides,
        });

        describe('exact match', () => {
            it('should match exact text', () => {
                const filter = createFilter({ match_type: 'exact', pattern: 'badword' });
                expect(matchesFilter('badword', filter)).toBe(true);
            });

            it('should match case-insensitively', () => {
                const filter = createFilter({ match_type: 'exact', pattern: 'badword' });
                expect(matchesFilter('BADWORD', filter)).toBe(true);
            });

            it('should not match partial text', () => {
                const filter = createFilter({ match_type: 'exact', pattern: 'bad' });
                expect(matchesFilter('badword', filter)).toBe(false);
            });
        });

        describe('word match', () => {
            it('should match whole words', () => {
                const filter = createFilter({ match_type: 'word', pattern: 'bad' });
                expect(matchesFilter('this is bad', filter)).toBe(true);
            });

            it('should not match partial words', () => {
                const filter = createFilter({ match_type: 'word', pattern: 'bad' });
                expect(matchesFilter('badminton', filter)).toBe(false);
            });

            it('should match at start of text', () => {
                const filter = createFilter({ match_type: 'word', pattern: 'bad' });
                expect(matchesFilter('bad thing', filter)).toBe(true);
            });

            it('should match at end of text', () => {
                const filter = createFilter({ match_type: 'word', pattern: 'bad' });
                expect(matchesFilter('very bad', filter)).toBe(true);
            });
        });

        describe('contains match', () => {
            it('should match substring', () => {
                const filter = createFilter({ match_type: 'contains', pattern: 'bad' });
                expect(matchesFilter('verybadstuff', filter)).toBe(true);
            });

            it('should not match non-present text', () => {
                const filter = createFilter({ match_type: 'contains', pattern: 'xyz' });
                expect(matchesFilter('hello world', filter)).toBe(false);
            });
        });

        describe('regex match', () => {
            it('should match regex patterns', () => {
                const filter = createFilter({ match_type: 'regex', pattern: 'b[a4]d\\s*w[o0]rd' });
                expect(matchesFilter('b4d word', filter)).toBe(true);
            });

            it('should handle invalid regex gracefully', () => {
                const filter = createFilter({ match_type: 'regex', pattern: '[invalid' });
                expect(matchesFilter('test', filter)).toBe(false);
            });
        });

        describe('leetspeak bypass detection', () => {
            it('should catch @ leetspeak in contains mode', () => {
                const filter = createFilter({ match_type: 'contains', pattern: 'hack' });
                expect(matchesFilter('h@ck', filter)).toBe(true);
            });

            it('should catch digit-based leetspeak after regex fix', () => {
                // Previously broken: normalizeText used `\\${char}` which created regex
                // backreferences for digits. Fixed by properly escaping chars.
                const filter = createFilter({ match_type: 'contains', pattern: 'hello' });
                expect(matchesFilter('h3ll0', filter)).toBe(true);
            });
        });
    });

    // ========== checkMessage() ==========
    describe('checkMessage()', () => {
        it('should return null for empty content', async () => {
            const result = await checkMessage('guild-1', '');
            expect(result).toBeNull();
        });

        it('should return null for content shorter than min word length', async () => {
            const result = await checkMessage('guild-1', 'a');
            expect(result).toBeNull();
        });

        it('should return null when no filters exist', async () => {
            mockGetOrSet.mockResolvedValue([]);
            const result = await checkMessage('guild-1', 'hello world');
            expect(result).toBeNull();
        });

        it('should return matching filter when content matches', async () => {
            const filter: Filter = {
                id: 1,
                guild_id: 'guild-1',
                pattern: 'badword',
                match_type: 'contains',
                action: 'delete_warn',
                severity: 2,
                created_by: '999',
                created_at: new Date(),
            };
            mockGetOrSet.mockResolvedValue([filter]);

            const result = await checkMessage('guild-1', 'this has a badword in it');

            expect(result).not.toBeNull();
            expect(result!.matched).toBe(true);
            expect(result!.pattern).toBe('badword');
            expect(result!.severity).toBe(2);
            expect(result!.action).toBe('delete_warn');
        });

        it('should strip URLs before checking (exempt patterns)', async () => {
            const filter: Filter = {
                id: 1,
                guild_id: 'guild-1',
                pattern: 'bad',
                match_type: 'exact',
                action: 'delete_warn',
                severity: 1,
                created_by: '999',
                created_at: new Date(),
            };
            mockGetOrSet.mockResolvedValue([filter]);

            // URL contains 'bad' but should be stripped
            const result = await checkMessage('guild-1', 'https://bad.example.com');
            // After stripping URL, the remaining content is empty
            expect(result).toBeNull();
        });
    });

    // ========== addFilter() ==========
    describe('addFilter()', () => {
        it('should add filter and invalidate cache', async () => {
            const filterData = { guildId: 'guild-1', pattern: 'test', match_type: 'contains' as const };
            mockFilterRepoAdd.mockResolvedValue({ id: 1, ...filterData });

            await addFilter(filterData);

            expect(mockFilterRepoAdd).toHaveBeenCalled();
            expect(mockDelete).toHaveBeenCalledWith('guild', 'filters:guild-1');
        });
    });

    // ========== removeFilter() ==========
    describe('removeFilter()', () => {
        it('should remove filter by pattern and invalidate cache', async () => {
            mockFilterRepoRemoveByPattern.mockResolvedValue(true);

            const result = await removeFilter('guild-1', 'badword');

            expect(result).toBe(true);
            expect(mockFilterRepoRemoveByPattern).toHaveBeenCalledWith('guild-1', 'badword');
            expect(mockDelete).toHaveBeenCalledWith('guild', 'filters:guild-1');
        });
    });

    // ========== clearFilters() ==========
    describe('clearFilters()', () => {
        it('should clear all filters and invalidate cache', async () => {
            mockFilterRepoRemoveAll.mockResolvedValue(5);

            const count = await clearFilters('guild-1');

            expect(count).toBe(5);
            expect(mockDelete).toHaveBeenCalledWith('guild', 'filters:guild-1');
        });
    });

    // ========== importPreset() ==========
    describe('importPreset()', () => {
        it('should import a known preset', async () => {
            mockFilterRepoAddBulk.mockResolvedValue(2);

            const count = await importPreset('guild-1', 'basic', 'user-1');

            expect(count).toBe(2);
            expect(mockFilterRepoAddBulk).toHaveBeenCalledWith(
                'guild-1',
                expect.arrayContaining([
                    expect.objectContaining({ pattern: 'badword' }),
                ]),
                'user-1'
            );
        });

        it('should throw for unknown preset', async () => {
            await expect(importPreset('guild-1', 'nonexistent', 'user-1'))
                .rejects.toThrow('Preset "nonexistent" not found');
        });
    });

    // ========== getFilterCount() ==========
    describe('getFilterCount()', () => {
        it('should return count from repository', async () => {
            mockFilterRepoCount.mockResolvedValue(42);

            const count = await getFilterCount('guild-1');
            expect(count).toBe(42);
        });
    });

    // ========== invalidateCache() ==========
    describe('invalidateCache()', () => {
        it('should delete guild filter cache', async () => {
            await invalidateCache('guild-1');
            expect(mockDelete).toHaveBeenCalledWith('guild', 'filters:guild-1');
        });
    });
});
