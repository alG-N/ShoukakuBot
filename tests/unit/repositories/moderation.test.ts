/**
 * Moderation Repository Tests
 * Tests for InfractionRepository and FilterRepository
 * Validates query building, parameter handling, and data flow
 */

// Mock postgres module
const mockQuery = jest.fn();
jest.mock('../../../src/database/postgres', () => ({
    __esModule: true,
    default: {
        query: mockQuery,
    },
}));

import InfractionRepository from '../../../src/repositories/moderation/InfractionRepository';
import FilterRepository from '../../../src/repositories/moderation/FilterRepository';

describe('InfractionRepository', () => {
    beforeEach(() => {
        mockQuery.mockReset();
    });

    describe('getNextCaseId()', () => {
        it('should return next case ID', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [{ next_id: 42 }] });

            const nextId = await InfractionRepository.getNextCaseId('guild-123');

            expect(nextId).toBe(42);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('COALESCE(MAX(case_id), 0) + 1'),
                ['guild-123']
            );
        });

        it('should use FOR UPDATE for atomic access', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [{ next_id: 1 }] });

            await InfractionRepository.getNextCaseId('guild-123');

            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('FOR UPDATE'),
                expect.any(Array)
            );
        });

        it('should return 1 when no rows exist', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [{ next_id: null }] });

            const nextId = await InfractionRepository.getNextCaseId('guild-123');

            expect(nextId).toBe(1);
        });
    });

    describe('create()', () => {
        it('should insert infraction with all fields', async () => {
            const mockInfraction = {
                id: 1,
                case_id: 5,
                guild_id: 'guild-123',
                user_id: 'user-456',
                moderator_id: 'mod-789',
                type: 'warn',
                reason: 'Test reason',
                active: true,
            };
            mockQuery.mockResolvedValueOnce({ rows: [mockInfraction] });

            const result = await InfractionRepository.create({
                guildId: 'guild-123',
                userId: 'user-456',
                moderatorId: 'mod-789',
                type: 'warn',
                reason: 'Test reason',
            });

            expect(result).toEqual(mockInfraction);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO mod_infractions'),
                expect.arrayContaining(['guild-123', 'user-456', 'mod-789', 'warn', 'Test reason'])
            );
        });

        it('should use atomic case_id generation in INSERT', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [{ case_id: 1 }] });

            await InfractionRepository.create({
                guildId: 'guild-123',
                userId: 'user-456',
                moderatorId: 'mod-789',
                type: 'ban',
            });

            // The INSERT should embed the subquery for atomic case_id generation
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('SELECT COALESCE(MAX(case_id), 0) + 1'),
                expect.any(Array)
            );
        });

        it('should default metadata to empty object', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [{}] });

            await InfractionRepository.create({
                guildId: 'guild-123',
                userId: 'user-456',
                moderatorId: 'mod-789',
                type: 'warn',
            });

            // Last param should be empty object for metadata
            const params = mockQuery.mock.calls[0][1];
            expect(params[params.length - 1]).toEqual({});
        });
    });

    describe('getByCaseId()', () => {
        it('should return infraction by case ID', async () => {
            const mockInfraction = { case_id: 3, guild_id: 'guild-123', type: 'warn' };
            mockQuery.mockResolvedValueOnce({ rows: [mockInfraction] });

            const result = await InfractionRepository.getByCaseId('guild-123', 3);

            expect(result).toEqual(mockInfraction);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('WHERE guild_id = $1 AND case_id = $2'),
                ['guild-123', 3]
            );
        });

        it('should return null when not found', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [] });

            const result = await InfractionRepository.getByCaseId('guild-123', 999);

            expect(result).toBeNull();
        });
    });

    describe('getByUser()', () => {
        it('should get user infractions with default options', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [{ case_id: 1 }, { case_id: 2 }] });

            const results = await InfractionRepository.getByUser('guild-123', 'user-456');

            expect(results).toHaveLength(2);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('guild_id = $1 AND user_id = $2'),
                expect.arrayContaining(['guild-123', 'user-456'])
            );
        });

        it('should filter by type when specified', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [] });

            await InfractionRepository.getByUser('guild-123', 'user-456', { type: 'warn' });

            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('AND type ='),
                expect.arrayContaining(['warn'])
            );
        });

        it('should filter active only when specified', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [] });

            await InfractionRepository.getByUser('guild-123', 'user-456', { activeOnly: true });

            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('AND active = true'),
                expect.any(Array)
            );
        });

        it('should respect limit and offset', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [] });

            await InfractionRepository.getByUser('guild-123', 'user-456', { limit: 10, offset: 20 });

            const params = mockQuery.mock.calls[0][1];
            expect(params).toContain(10);
            expect(params).toContain(20);
        });
    });

    describe('countActiveWarnings()', () => {
        it('should return active warning count', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [{ count: '3' }] });

            const count = await InfractionRepository.countActiveWarnings('guild-123', 'user-456');

            expect(count).toBe(3);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining("type = 'warn' AND active = true"),
                ['guild-123', 'user-456']
            );
        });

        it('should return 0 when no warnings', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });

            const count = await InfractionRepository.countActiveWarnings('guild-123', 'user-456');

            expect(count).toBe(0);
        });
    });

    describe('update()', () => {
        it('should update allowed fields', async () => {
            const updated = { case_id: 1, reason: 'Updated reason', active: true };
            mockQuery.mockResolvedValueOnce({ rows: [updated] });

            const result = await InfractionRepository.update('guild-123', 1, { reason: 'Updated reason' });

            expect(result).toEqual(updated);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE mod_infractions'),
                expect.arrayContaining(['guild-123', 1, 'Updated reason'])
            );
        });

        it('should return null when no fields to update', async () => {
            const result = await InfractionRepository.update('guild-123', 1, {});

            expect(result).toBeNull();
            expect(mockQuery).not.toHaveBeenCalled();
        });
    });

    describe('deactivate()', () => {
        it('should soft-delete by setting active to false', async () => {
            mockQuery.mockResolvedValueOnce({ rowCount: 1 });

            const result = await InfractionRepository.deactivate('guild-123', 5);

            expect(result).toBe(true);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('SET active = false'),
                ['guild-123', 5]
            );
        });

        it('should return false when case not found', async () => {
            mockQuery.mockResolvedValueOnce({ rowCount: 0 });

            const result = await InfractionRepository.deactivate('guild-123', 999);

            expect(result).toBe(false);
        });
    });

    describe('clearWarnings()', () => {
        it('should deactivate all active warnings for user', async () => {
            mockQuery.mockResolvedValueOnce({ rowCount: 3 });

            const count = await InfractionRepository.clearWarnings('guild-123', 'user-456');

            expect(count).toBe(3);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining("type = 'warn' AND active = true"),
                ['guild-123', 'user-456']
            );
        });
    });

    describe('getExpired()', () => {
        it('should return infractions past expiry', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [{ case_id: 1 }, { case_id: 2 }] });

            const expired = await InfractionRepository.getExpired();

            expect(expired).toHaveLength(2);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('expires_at < NOW()'),
            );
        });
    });

    describe('expireOld()', () => {
        it('should deactivate expired infractions', async () => {
            mockQuery.mockResolvedValueOnce({ rowCount: 5 });

            const count = await InfractionRepository.expireOld();

            expect(count).toBe(5);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('SET active = false'),
            );
        });
    });

    describe('search()', () => {
        it('should search with all criteria', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [] });

            await InfractionRepository.search('guild-123', {
                userId: 'user-456',
                moderatorId: 'mod-789',
                type: 'warn',
                reason: 'spam',
                limit: 25,
            });

            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('user_id ='),
                expect.arrayContaining(['guild-123', 'user-456', 'mod-789', 'warn', '%spam%', 25])
            );
        });

        it('should search with minimal criteria', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [] });

            await InfractionRepository.search('guild-123', {});

            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('WHERE guild_id = $1'),
                expect.arrayContaining(['guild-123', 50]) // default limit
            );
        });

        it('should use ILIKE for reason search', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [] });

            await InfractionRepository.search('guild-123', { reason: 'test' });

            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('ILIKE'),
                expect.arrayContaining(['%test%'])
            );
        });
    });

    describe('getStats()', () => {
        it('should return statistics by type', async () => {
            mockQuery.mockResolvedValueOnce({
                rows: [
                    { type: 'warn', total: 10, active: 5, last_7_days: 2, last_30_days: 8 },
                    { type: 'ban', total: 3, active: 3, last_7_days: 1, last_30_days: 2 },
                ],
            });

            const stats = await InfractionRepository.getStats('guild-123');

            expect(stats).toHaveLength(2);
            expect(stats[0].type).toBe('warn');
            expect(stats[0].total).toBe(10);
        });
    });
});

describe('FilterRepository', () => {
    beforeEach(() => {
        mockQuery.mockReset();
    });

    describe('getAll()', () => {
        it('should return all filters for guild', async () => {
            mockQuery.mockResolvedValueOnce({
                rows: [
                    { id: 1, pattern: 'badword', severity: 3 },
                    { id: 2, pattern: 'spam', severity: 1 },
                ],
            });

            const filters = await FilterRepository.getAll('guild-123');

            expect(filters).toHaveLength(2);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('ORDER BY severity DESC'),
                ['guild-123']
            );
        });
    });

    describe('getById()', () => {
        it('should return filter by ID', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, pattern: 'test' }] });

            const filter = await FilterRepository.getById(1);

            expect(filter).toEqual({ id: 1, pattern: 'test' });
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('WHERE id = $1'),
                [1]
            );
        });

        it('should return null when not found', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [] });

            const filter = await FilterRepository.getById(999);

            expect(filter).toBeNull();
        });
    });

    describe('getByPattern()', () => {
        it('should find filter case-insensitively', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, pattern: 'BADWORD' }] });

            const filter = await FilterRepository.getByPattern('guild-123', 'badword');

            expect(filter).toBeDefined();
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('LOWER(pattern) = LOWER($2)'),
                ['guild-123', 'badword']
            );
        });
    });

    describe('add()', () => {
        it('should insert filter with defaults', async () => {
            const mockFilter = { id: 1, pattern: 'spam', match_type: 'contains', action: 'delete_warn', severity: 1 };
            mockQuery.mockResolvedValueOnce({ rows: [mockFilter] });

            const result = await FilterRepository.add({
                guildId: 'guild-123',
                pattern: 'spam',
                createdBy: 'mod-456',
            });

            expect(result).toEqual(mockFilter);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO word_filters'),
                ['guild-123', 'spam', 'contains', 'delete_warn', 1, 'mod-456']
            );
        });

        it('should upsert on conflict', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [{}] });

            await FilterRepository.add({
                guildId: 'guild-123',
                pattern: 'existing',
                createdBy: 'mod-456',
            });

            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('ON CONFLICT'),
                expect.any(Array)
            );
        });

        it('should accept custom options', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [{}] });

            await FilterRepository.add({
                guildId: 'guild-123',
                pattern: 'test',
                matchType: 'regex',
                action: 'ban',
                severity: 5,
                createdBy: 'mod-456',
            });

            expect(mockQuery).toHaveBeenCalledWith(
                expect.any(String),
                ['guild-123', 'test', 'regex', 'ban', 5, 'mod-456']
            );
        });
    });

    describe('addBulk()', () => {
        it('should insert multiple filters', async () => {
            mockQuery.mockResolvedValueOnce({ rowCount: 3 });

            const count = await FilterRepository.addBulk(
                'guild-123',
                [
                    { pattern: 'word1' },
                    { pattern: 'word2', matchType: 'exact' },
                    { pattern: 'word3', action: 'ban', severity: 5 },
                ],
                'mod-456'
            );

            expect(count).toBe(3);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('ON CONFLICT'),
                expect.any(Array)
            );
        });

        it('should return 0 for empty array', async () => {
            const count = await FilterRepository.addBulk('guild-123', [], 'mod-456');

            expect(count).toBe(0);
            expect(mockQuery).not.toHaveBeenCalled();
        });
    });

    describe('remove()', () => {
        it('should delete filter by ID', async () => {
            mockQuery.mockResolvedValueOnce({ rowCount: 1 });

            const result = await FilterRepository.remove(1);

            expect(result).toBe(true);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('DELETE FROM word_filters WHERE id = $1'),
                [1]
            );
        });

        it('should return false when filter not found', async () => {
            mockQuery.mockResolvedValueOnce({ rowCount: 0 });

            const result = await FilterRepository.remove(999);

            expect(result).toBe(false);
        });
    });

    describe('removeByPattern()', () => {
        it('should delete filter by pattern (case-insensitive)', async () => {
            mockQuery.mockResolvedValueOnce({ rowCount: 1 });

            const result = await FilterRepository.removeByPattern('guild-123', 'badword');

            expect(result).toBe(true);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('LOWER(pattern) = LOWER($2)'),
                ['guild-123', 'badword']
            );
        });
    });

    describe('removeAll()', () => {
        it('should delete all filters for guild', async () => {
            mockQuery.mockResolvedValueOnce({ rowCount: 10 });

            const count = await FilterRepository.removeAll('guild-123');

            expect(count).toBe(10);
        });
    });

    describe('count()', () => {
        it('should return filter count', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [{ count: '15' }] });

            const count = await FilterRepository.count('guild-123');

            expect(count).toBe(15);
        });
    });

    describe('getBySeverity()', () => {
        it('should return filters above severity threshold', async () => {
            mockQuery.mockResolvedValueOnce({
                rows: [
                    { id: 1, pattern: 'severe', severity: 5 },
                    { id: 2, pattern: 'bad', severity: 3 },
                ],
            });

            const filters = await FilterRepository.getBySeverity('guild-123', 3);

            expect(filters).toHaveLength(2);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('severity >= $2'),
                ['guild-123', 3]
            );
        });
    });

    describe('search()', () => {
        it('should search filters by pattern (case-insensitive)', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, pattern: 'badword' }] });

            const results = await FilterRepository.search('guild-123', 'bad');

            expect(results).toHaveLength(1);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('ILIKE'),
                ['guild-123', '%bad%']
            );
        });
    });
});
