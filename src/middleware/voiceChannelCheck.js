const trackHandler = require('../handlers/music/trackHandler');
const { MessageFlags } = require('discord.js');

// Direct validator functions
const validators = {
    isInVoiceChannel: (member) => !!(member?.voice?.channel),
    isInSameVoiceChannel: (member, botChannelId) => member?.voice?.channelId === botChannelId,
    hasVoicePermissions: (channel) => {
        if (!channel) return false;
        const permissions = channel.permissionsFor(channel.guild.members.me);
        if (!permissions) return false;
        return permissions.has('Connect') && permissions.has('Speak');
    }
};

/**
 * Check if user is in voice channel
 * @param {Object} interaction - Discord interaction
 * @param {boolean} shouldReply - Whether to reply on failure (default true)
 * @returns {Object} { valid: boolean, error?: string }
 */
function checkVoiceChannelSync(interaction) {
    if (!validators.isInVoiceChannel(interaction.member)) {
        return { valid: false, error: "Join a voice channel first." };
    }
    return { valid: true };
}

/**
 * Check voice permissions
 * @param {Object} interaction - Discord interaction
 * @returns {Object} { valid: boolean, error?: string }
 */
function checkVoicePermissionsSync(interaction) {
    const voiceChannel = interaction.member.voice?.channel;
    
    if (!voiceChannel) {
        return { valid: false, error: "Join a voice channel first." };
    }

    if (!validators.hasVoicePermissions(voiceChannel)) {
        return { valid: false, error: "I don't have permission to connect or speak in your voice channel." };
    }

    return { valid: true };
}

// Legacy async functions for backward compatibility
async function checkVoiceChannel(interaction) {
    if (!interaction.member?.voice?.channel) {
        await interaction.reply({
            embeds: [trackHandler.createInfoEmbed("❌ No Voice Channel", "Join a voice channel first.")],
            flags: MessageFlags.Ephemeral,
        });
        return false;
    }
    return true;
}

async function checkSameVoiceChannel(interaction, botChannelId) {
    if (!botChannelId) {
        return true;
    }

    if (!validators.isInSameVoiceChannel(interaction.member, botChannelId)) {
        await interaction.reply({
            flags: MessageFlags.Ephemeral,
            content: "❌ You must be in the same voice channel as the bot to use these controls.",
        });
        return false;
    }
    return true;
}

async function checkVoicePermissions(interaction) {
    const voiceChannel = interaction.member.voice?.channel;
    
    if (!voiceChannel) {
        await interaction.reply({
            embeds: [trackHandler.createInfoEmbed("❌ No Voice Channel", "Join a voice channel first.")],
            flags: MessageFlags.Ephemeral,
        });
        return false;
    }

    if (!validators.hasVoicePermissions(voiceChannel)) {
        await interaction.reply({
            embeds: [trackHandler.createInfoEmbed(
                "❌ Missing Permissions", 
                "I don't have permission to connect or speak in your voice channel."
            )],
            flags: MessageFlags.Ephemeral,
        });
        return false;
    }

    return true;
}

module.exports = {
    checkVoiceChannel,
    checkSameVoiceChannel,
    checkVoicePermissions,
    checkVoiceChannelSync,
    checkVoicePermissionsSync
};