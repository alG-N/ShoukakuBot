/**
 * AFK Handler
 * Handles AFK-related message events: welcome-back notification and mention alerts
 * Extracted from commands/general/afk.ts to maintain proper layer boundaries
 * @module handlers/general/AfkHandler
 */

import { EmbedBuilder, Message, Client } from 'discord.js';
import afkRepository from '../../repositories/general/AfkRepository.js';
import { formatDuration } from '../../commands/general/afk.js';

/**
 * Handle message events for AFK system
 * Checks if author is AFK (removes them) and notifies about mentioned AFK users
 */
export async function handleAfkMessage(message: Message, client: Client): Promise<void> {
    try {
        if (message.author.bot) return;
        if (!message.guild) return;

        const userId = message.author.id;
        const guildId = message.guild.id;

        // Check if message author is AFK and remove them
        const afkInfo = await afkRepository.removeAfk(userId, guildId);
        
        if (afkInfo) {
            const timeAway = Math.floor((Date.now() - afkInfo.timestamp) / 1000);
            const embed = new EmbedBuilder()
                .setColor(0x00CED1)
                .setTitle('Welcome Back!')
                .setDescription(`You were AFK for **${formatDuration(timeAway)}**. おかえりなさい！`)
                .setThumbnail(message.author.displayAvatarURL())
                .setImage('https://media.tenor.com/blCLnVdO3CgAAAAd/senko-sewayaki-kitsune-no-senko-san.gif')
                .setFooter({ text: 'We missed you! 🎌', iconURL: client.user?.displayAvatarURL() });
            
            message.reply({ embeds: [embed] })
                .then(msg => setTimeout(() => msg.delete().catch(() => {}), 15000))
                .catch(() => {});
            return;
        }

        // Check mentions for AFK users
        const mentionedUsers = message.mentions.users;
        if (mentionedUsers.size === 0) return;

        // Batch fetch AFK status for all mentioned users
        const mentionedIds = Array.from(mentionedUsers.keys());
        const afkMap = await afkRepository.getMultipleAfk(mentionedIds, guildId);

        // Notify about each AFK user
        for (const [mentionedUserId, mentionedAfkInfo] of afkMap) {
            const user = mentionedUsers.get(mentionedUserId);
            if (!user) continue;

            const timeAway = Math.floor((Date.now() - mentionedAfkInfo.timestamp) / 1000);
            const embed = new EmbedBuilder()
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
            
            message.reply({ embeds: [embed] }).catch(() => {});
        }
    } catch (error: unknown) {
        const err = error as Error;
        console.error('[AFK] handleAfkMessage error:', err.message);
    }
}
