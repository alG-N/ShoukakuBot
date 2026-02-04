"use strict";
/**
 * AFK Command - Presentation Layer
 * Set AFK status (guild or global)
 * Uses AfkRepository for PostgreSQL-backed storage (shard-safe)
 * @module presentation/commands/general/afk
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatDuration = formatDuration;
exports.isUserAfk = isUserAfk;
exports.removeAfk = removeAfk;
exports.onMessage = onMessage;
const discord_js_1 = require("discord.js");
const BaseCommand_js_1 = require("../BaseCommand.js");
const AfkRepository_js_1 = __importDefault(require("../../repositories/general/AfkRepository.js"));
// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================
/**
 * Format duration from seconds to readable string
 */
function formatDuration(seconds) {
    if (seconds < 60)
        return `${seconds}s`;
    if (seconds < 3600) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
    }
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours < 24) {
        return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    }
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}
/**
 * Check if user is AFK (exported for external use)
 */
async function isUserAfk(userId, guildId = null) {
    return AfkRepository_js_1.default.isUserAfk(userId, guildId);
}
/**
 * Remove user from AFK (exported for external use)
 */
async function removeAfk(userId, guildId = null) {
    return AfkRepository_js_1.default.removeAfk(userId, guildId);
}
// ============================================================================
// COMMAND CLASS
// ============================================================================
class AfkCommand extends BaseCommand_js_1.BaseCommand {
    constructor() {
        super({
            category: BaseCommand_js_1.CommandCategory.GENERAL,
            cooldown: 10,
            deferReply: false
        });
    }
    get data() {
        return new discord_js_1.SlashCommandBuilder()
            .setName('afk')
            .setDescription('Set your AFK status')
            .addStringOption(option => option.setName('type')
            .setDescription('AFK type')
            .addChoices({ name: 'guild', value: 'guild' }, { name: 'global', value: 'global' }))
            .addStringOption(option => option.setName('reason')
            .setDescription('Reason for being AFK')
            .setMaxLength(200));
    }
    async run(interaction) {
        const userId = interaction.user.id;
        const guildId = interaction.guild?.id || null;
        const type = (interaction.options.getString('type') || 'guild');
        const reason = interaction.options.getString('reason') || 'No reason provided.';
        // Set AFK status via repository
        const success = await AfkRepository_js_1.default.setAfk({
            userId,
            guildId: type === 'global' ? null : guildId,
            reason,
            type
        });
        if (!success) {
            await interaction.reply({
                content: '❌ Failed to set AFK status. Please try again.',
                ephemeral: true
            });
            return;
        }
        const embed = new discord_js_1.EmbedBuilder()
            .setColor(0x8A2BE2)
            .setTitle('AFK mode activated!')
            .setDescription(`**Type:** ${type}\n**Reason:** ${reason}`)
            .setThumbnail(interaction.user.displayAvatarURL())
            .setFooter({
            text: 'I will let others know if they mention you 💬',
            iconURL: interaction.client.user?.displayAvatarURL()
        });
        await interaction.reply({ embeds: [embed] });
    }
}
// ============================================================================
// MESSAGE HANDLER
// ============================================================================
/**
 * Handle message events for AFK system
 * Checks if author is AFK (removes them) and notifies about mentioned AFK users
 */
async function onMessage(message, client) {
    try {
        if (message.author.bot)
            return;
        if (!message.guild)
            return;
        const userId = message.author.id;
        const guildId = message.guild.id;
        // Check if message author is AFK and remove them
        const afkInfo = await AfkRepository_js_1.default.removeAfk(userId, guildId);
        if (afkInfo) {
            const timeAway = Math.floor((Date.now() - afkInfo.timestamp) / 1000);
            const embed = new discord_js_1.EmbedBuilder()
                .setColor(0x00CED1)
                .setTitle('Welcome Back!')
                .setDescription(`You were AFK for **${formatDuration(timeAway)}**. おかえりなさい！`)
                .setThumbnail(message.author.displayAvatarURL())
                .setImage('https://media.tenor.com/blCLnVdO3CgAAAAd/senko-sewayaki-kitsune-no-senko-san.gif')
                .setFooter({ text: 'We missed you! 🎌', iconURL: client.user?.displayAvatarURL() });
            message.reply({ embeds: [embed] })
                .then(msg => setTimeout(() => msg.delete().catch(() => { }), 15000))
                .catch(() => { });
            return;
        }
        // Check mentions for AFK users
        const mentionedUsers = message.mentions.users;
        if (mentionedUsers.size === 0)
            return;
        // Batch fetch AFK status for all mentioned users
        const mentionedIds = Array.from(mentionedUsers.keys());
        const afkMap = await AfkRepository_js_1.default.getMultipleAfk(mentionedIds, guildId);
        // Notify about each AFK user
        for (const [mentionedUserId, mentionedAfkInfo] of afkMap) {
            const user = mentionedUsers.get(mentionedUserId);
            if (!user)
                continue;
            const timeAway = Math.floor((Date.now() - mentionedAfkInfo.timestamp) / 1000);
            const embed = new discord_js_1.EmbedBuilder()
                .setColor(0xFFA07A)
                .setTitle(`${user.username} is currently AFK 💤`)
                .setDescription(`**AFK for:** ${formatDuration(timeAway)}\n**Reason:** ${mentionedAfkInfo.reason}`)
                .setThumbnail(user.displayAvatarURL())
                .addFields([
                {
                    name: 'While you wait...',
                    value: '🍵 Grab tea\n📺 Watch anime\n🎮 Play a game\n🈶 Practice Japanese\n🎨 Draw a fumo\n'
                }
            ])
                .setFooter({ text: 'They\'ll return soon 🌸', iconURL: client.user?.displayAvatarURL() });
            message.reply({ embeds: [embed] }).catch(() => { });
        }
    }
    catch (error) {
        const err = error;
        console.error('[AFK] onMessage error:', err.message);
    }
}
// Export command and utility functions
const command = new AfkCommand();
exports.default = command;
//# sourceMappingURL=afk.js.map