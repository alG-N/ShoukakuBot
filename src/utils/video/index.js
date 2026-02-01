/**
 * Video Utilities
 */
const platformDetector = require('./platformDetector');
const progressAnimator = require('./progressAnimator');
const videoEmbedBuilder = require('./videoEmbedBuilder');

module.exports = {
    ...platformDetector,
    ...progressAnimator,
    ...videoEmbedBuilder,
    platformDetector,
    progressAnimator,
    videoEmbedBuilder
};
