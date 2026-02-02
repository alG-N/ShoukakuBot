/**
 * Moderation Repository Index
 * @module repositories/moderation
 */

const InfractionRepository = require('./InfractionRepository');
const AutoModRepository = require('./AutoModRepository');
const FilterRepository = require('./FilterRepository');
const ModLogRepository = require('./ModLogRepository');

module.exports = {
    InfractionRepository,
    AutoModRepository,
    FilterRepository,
    ModLogRepository
};
