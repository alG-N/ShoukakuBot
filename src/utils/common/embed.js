/**
 * Embed Utilities
 * Shared embed creation helpers
 * @module shared/utils/embed
 */

const { EmbedBuilder } = require('discord.js');

// Default colors
const EMBED_COLORS = {
    SUCCESS: '#00FF00',
    ERROR: '#FF0000',
    WARNING: '#FFA500',
    INFO: '#00BFFF',
    PRIMARY: '#5865F2',
    LOADING: '#FFAA00'
};

/**
 * Create an error embed
 * @param {string} title - Error title
 * @param {string} description - Error description
 * @param {string} footerText - Optional footer
 * @returns {EmbedBuilder}
 */
function createErrorEmbed(title, description, footerText = null) {
    const embed = new EmbedBuilder()
        .setColor(EMBED_COLORS.ERROR)
        .setTitle(`❌ ${title}`)
        .setDescription(description)
        .setTimestamp();

    if (footerText) {
        embed.setFooter({ text: footerText });
    }

    return embed;
}

/**
 * Create a success embed
 * @param {string} title - Success title
 * @param {string} description - Success description
 * @param {string} color - Optional custom color
 * @returns {EmbedBuilder}
 */
function createSuccessEmbed(title, description, color = EMBED_COLORS.SUCCESS) {
    return new EmbedBuilder()
        .setColor(color)
        .setTitle(`✅ ${title}`)
        .setDescription(description)
        .setTimestamp();
}

/**
 * Create a warning embed
 * @param {string} title - Warning title
 * @param {string} description - Warning description
 * @returns {EmbedBuilder}
 */
function createWarningEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(EMBED_COLORS.WARNING)
        .setTitle(`⚠️ ${title}`)
        .setDescription(description)
        .setTimestamp();
}

/**
 * Create an info embed
 * @param {string} title - Info title
 * @param {string} description - Info description
 * @returns {EmbedBuilder}
 */
function createInfoEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(EMBED_COLORS.INFO)
        .setTitle(`ℹ️ ${title}`)
        .setDescription(description)
        .setTimestamp();
}

/**
 * Create a loading embed
 * @param {string} title - Loading title
 * @param {string} description - Loading description
 * @param {string} thumbnailUrl - Optional thumbnail
 * @returns {EmbedBuilder}
 */
function createLoadingEmbed(title, description, thumbnailUrl = null) {
    const embed = new EmbedBuilder()
        .setColor(EMBED_COLORS.LOADING)
        .setTitle(`⏳ ${title}`)
        .setDescription(description)
        .setTimestamp();

    if (thumbnailUrl) {
        embed.setThumbnail(thumbnailUrl);
    }

    return embed;
}

/**
 * Truncate text to max length with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string}
 */
function truncateText(text, maxLength = 4000) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 3) + '...';
}

/**
 * Format a number with K/M suffixes
 * @param {number} num - Number to format
 * @returns {string}
 */
function formatNumber(num) {
    if (num === null || num === undefined) return '0';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

/**
 * Strip HTML tags from text
 * @param {string} html - HTML string
 * @returns {string}
 */
function stripHtml(html) {
    if (!html) return '';
    return html.replace(/<\/?[^>]+(>|$)/g, '');
}

/**
 * Format a field value ensuring it fits Discord limits
 * @param {string} value - Field value
 * @param {number} maxLength - Max length (default 1024)
 * @returns {string}
 */
function formatFieldValue(value, maxLength = 1024) {
    if (!value) return 'N/A';
    const str = String(value);
    return truncateText(str, maxLength) || 'N/A';
}

/**
 * Create a progress bar string
 * @param {number} current - Current value
 * @param {number} total - Total value
 * @param {number} length - Bar length
 * @returns {string}
 */
function createProgressBar(current, total, length = 20) {
    const percentage = Math.min(current / total, 1);
    const filled = Math.round(length * percentage);
    const empty = length - filled;
    
    return '▓'.repeat(filled) + '░'.repeat(empty);
}

module.exports = {
    EMBED_COLORS,
    createErrorEmbed,
    createSuccessEmbed,
    createWarningEmbed,
    createInfoEmbed,
    createLoadingEmbed,
    truncateText,
    formatNumber,
    stripHtml,
    formatFieldValue,
    createProgressBar
};
