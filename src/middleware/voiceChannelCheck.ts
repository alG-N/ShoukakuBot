/**
 * Voice Channel Check Middleware
 * Voice channel validation for music commands
 */

import trackHandler from '../handlers/music/trackHandler.js';
import { MessageFlags } from 'discord.js';
import type { 
    GuildMember, 
    VoiceBasedChannel
} from 'discord.js';
import type { MusicInteraction, VoiceCheckResult } from '../types/middleware/voice-channel-check.js';
// Validators
const validators = {
    isInVoiceChannel: (member: GuildMember | null | undefined): boolean => {
        return !!(member?.voice?.channel);
    },
    
    isInSameVoiceChannel: (member: GuildMember | null | undefined, botChannelId: string | null | undefined): boolean => {
        return member?.voice?.channelId === botChannelId;
    },
    
    hasVoicePermissions: (channel: VoiceBasedChannel | null | undefined): boolean => {
        if (!channel) return false;
        const permissions = channel.permissionsFor(channel.guild.members.me!);
        if (!permissions) return false;
        return permissions.has('Connect') && permissions.has('Speak');
    }
};
// Sync Functions
/**
 * Check if user is in voice channel (sync version)
 */
function checkVoiceChannelSync(interaction: MusicInteraction): VoiceCheckResult {
    const member = interaction.member as GuildMember;
    if (!validators.isInVoiceChannel(member)) {
        return { valid: false, error: "Join a voice channel first." };
    }
    return { valid: true };
}

/**
 * Check voice permissions (sync version)
 */
function checkVoicePermissionsSync(interaction: MusicInteraction): VoiceCheckResult {
    const member = interaction.member as GuildMember;
    const voiceChannel = member.voice?.channel;
    
    if (!voiceChannel) {
        return { valid: false, error: "Join a voice channel first." };
    }

    if (!validators.hasVoicePermissions(voiceChannel)) {
        return { valid: false, error: "I don't have permission to connect or speak in your voice channel." };
    }

    return { valid: true };
}
// Async Functions (Legacy)
/**
 * Check if user is in voice channel (async with reply)
 */
async function checkVoiceChannel(interaction: MusicInteraction): Promise<boolean> {
    const member = interaction.member as GuildMember;
    
    if (!member?.voice?.channel) {
        await interaction.reply({
            embeds: [trackHandler.createInfoEmbed("❌ No Voice Channel", "Join a voice channel first.")],
            flags: MessageFlags.Ephemeral,
        });
        return false;
    }
    return true;
}

/**
 * Check if user is in same voice channel as bot (async with reply)
 */
async function checkSameVoiceChannel(
    interaction: MusicInteraction, 
    botChannelId: string | null | undefined
): Promise<boolean> {
    const member = interaction.member as GuildMember;
    
    // First check: User must be in a voice channel
    if (!member?.voice?.channel) {
        await interaction.reply({
            flags: MessageFlags.Ephemeral,
            content: "❌ You must be in a voice channel to use these controls.",
        });
        return false;
    }

    // If bot is not in a channel, allow (for initial join)
    if (!botChannelId) {
        return true;
    }

    // Second check: User must be in the SAME voice channel as the bot
    if (!validators.isInSameVoiceChannel(member, botChannelId)) {
        await interaction.reply({
            flags: MessageFlags.Ephemeral,
            content: "❌ You must be in the same voice channel as the bot to use these controls.",
        });
        return false;
    }
    return true;
}

/**
 * Check voice permissions (async with reply)
 */
async function checkVoicePermissions(interaction: MusicInteraction): Promise<boolean> {
    const member = interaction.member as GuildMember;
    const voiceChannel = member.voice?.channel;
    
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
// Exports
export {
    checkVoiceChannel,
    checkSameVoiceChannel,
    checkVoicePermissions,
    checkVoiceChannelSync,
    checkVoicePermissionsSync,
    validators
};

export { type VoiceCheckResult, type MusicInteraction };

export default {
    checkVoiceChannel,
    checkSameVoiceChannel,
    checkVoicePermissions,
    checkVoiceChannelSync,
    checkVoicePermissionsSync,
    validators
};




