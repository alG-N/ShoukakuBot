/**
 * URL Validator Middleware
 * SSRF protection and URL validation
 */

import videoEmbedBuilder from '../utils/video/videoEmbedBuilder.js';
import type { ChatInputCommandInteraction } from 'discord.js';
// Constants
/**
 * SSRF Protection - Blocked hostname patterns
 * Covers IPv4, IPv6, private ranges, localhost, and cloud metadata endpoints
 */
const BLOCKED_HOST_PATTERNS: RegExp[] = [
    // Localhost variations
    /^localhost$/i,
    /^localhost\..*/i,
    /^.*\.localhost$/i,
    
    // IPv4 loopback
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
    
    // IPv4 private ranges (RFC 1918)
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
    /^192\.168\.\d{1,3}\.\d{1,3}$/,
    /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/,
    
    // Link-local (APIPA)
    /^169\.254\.\d{1,3}\.\d{1,3}$/,
    
    // IPv4 zeros
    /^0\.0\.0\.0$/,
    /^0+\.0+\.0+\.0+$/,
    
    // IPv6 localhost
    /^\[?::1\]?$/,
    /^\[?0:0:0:0:0:0:0:1\]?$/,
    
    // IPv6 mapped IPv4 (::ffff:127.0.0.1)
    /^\[?::ffff:127\./i,
    /^\[?::ffff:10\./i,
    /^\[?::ffff:192\.168\./i,
    /^\[?::ffff:172\.(1[6-9]|2\d|3[0-1])\./i,
    
    // AWS/Cloud metadata endpoints
    /^169\.254\.169\.254$/,
    /^metadata\.google\.internal$/i,
    /^metadata\.goog$/i,
    
    // Kubernetes internal
    /^kubernetes\.default/i,
    /^\.internal$/i,

    // Single-label hostnames (no dots) — internal Docker container names,
    // intranet names, etc. (e.g. "redis", "postgres", "lavalink-1").
    // All public DNS names contain at least one dot.
    /^[^.]+$/,
];
// Functions
/**
 * Check if hostname matches any blocked pattern
 */
function isBlockedHost(hostname: string | null | undefined): boolean {
    if (!hostname) return true;
    
    const normalizedHost = hostname.toLowerCase().replace(/^\[|\]$/g, '');
    
    return BLOCKED_HOST_PATTERNS.some(pattern => pattern.test(normalizedHost));
}

/**
 * Validate a video URL
 */
async function validateUrl(interaction: ChatInputCommandInteraction, url: string): Promise<boolean> {
    // Basic protocol check
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        await interaction.editReply({ 
            embeds: [videoEmbedBuilder.buildInvalidUrlEmbed()] 
        });
        return false;
    }
    
    // Try to parse URL to ensure it's valid
    try {
        const parsedUrl = new URL(url);
        
        // Block dangerous protocols
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
            await interaction.editReply({ 
                embeds: [videoEmbedBuilder.buildInvalidUrlEmbed('Only HTTP/HTTPS URLs are supported.')] 
            });
            return false;
        }
        
        // SSRF Protection: Check against blocked patterns
        if (isBlockedHost(parsedUrl.hostname)) {
            await interaction.editReply({ 
                embeds: [videoEmbedBuilder.buildInvalidUrlEmbed('This URL is not allowed for security reasons.')] 
            });
            return false;
        }
        
        // Block URLs with credentials
        if (parsedUrl.username || parsedUrl.password) {
            await interaction.editReply({ 
                embeds: [videoEmbedBuilder.buildInvalidUrlEmbed('URLs with credentials are not allowed.')] 
            });
            return false;
        }
        
    } catch (error) {
        await interaction.editReply({ 
            embeds: [videoEmbedBuilder.buildInvalidUrlEmbed('The URL format is invalid.')] 
        });
        return false;
    }
    
    return true;
}
// Exports
export {
    validateUrl,
    isBlockedHost,
    BLOCKED_HOST_PATTERNS
};

export default {
    validateUrl,
    isBlockedHost,
    BLOCKED_HOST_PATTERNS
};
