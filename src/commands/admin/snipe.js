/**
 * Snipe Command - Presentation Layer
 * Recover deleted messages
 * @module presentation/commands/admin/snipe
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { BaseCommand, CommandCategory } = require('../BaseCommand');
const { COLORS } = require('../../constants');

/**
 * Format time ago from timestamp
 * @param {number} timestamp - Timestamp in ms
 * @returns {string} Formatted time ago
 */
function formatTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    
    const intervals = [
        { label: 'year', seconds: 31536000 },
        { label: 'month', seconds: 2592000 },
        { label: 'week', seconds: 604800 },
        { label: 'day', seconds: 86400 },
        { label: 'hour', seconds: 3600 },
        { label: 'minute', seconds: 60 },
        { label: 'second', seconds: 1 }
    ];

    for (const interval of intervals) {
        const count = Math.floor(seconds / interval.seconds);
        if (count >= 1) {
            return `${count} ${interval.label}${count !== 1 ? 's' : ''} ago`;
        }
    }
    
    return 'just now';
}

/**
 * Create snipe embed for a deleted message
 * @param {Object} msg - Deleted message data
 * @param {number} index - Current message index
 * @param {number} total - Total messages
 * @returns {EmbedBuilder} Embed for the message
 */
function createSnipeEmbed(msg, index, total) {
    const embed = new EmbedBuilder()
        .setColor(COLORS.SNIPE || 0x9B59B6)
        .setAuthor({
            name: `${msg.author.displayName} (${msg.author.tag})`,
            iconURL: msg.author.avatarURL
        })
        .setFooter({ 
            text: `Message ${index}/${total} • Deleted ${formatTimeAgo(msg.deletedAt)}` 
        })
        .setTimestamp(msg.deletedAt);

    if (msg.content) {
        const content = msg.content.length > 4096 
            ? msg.content.slice(0, 4093) + '...' 
            : msg.content;
        embed.setDescription(content);
    }

    embed.addFields({
        name: 'Channel',
        value: `<#${msg.channel.id}>`,
        inline: true
    });

    embed.addFields({
        name: 'Sent',
        value: `<t:${Math.floor(msg.createdAt / 1000)}:R>`,
        inline: true
    });

    // Handle attachments
    if (msg.attachments && msg.attachments.length > 0) {
        const attachmentList = msg.attachments
            .map(a => `📎 [${a.name}](${a.url})`)
            .join('\n');
        
        embed.addFields({
            name: `Attachments (${msg.attachments.length})`,
            value: attachmentList.slice(0, 1024)
        });

        // Show image preview if available
        const imageAttachment = msg.attachments.find(a => 
            a.type?.startsWith('image/') || 
            /\.(png|jpg|jpeg|gif|webp)$/i.test(a.name)
        );
        
        if (imageAttachment) {
            embed.setImage(imageAttachment.proxyUrl || imageAttachment.url);
        }
    }

    // Handle embeds
    if (msg.embeds && msg.embeds.length > 0) {
        const embedInfo = msg.embeds
            .map(e => e.title || e.description?.slice(0, 50) || 'Embed')
            .join(', ');
        
        embed.addFields({
            name: 'Embeds',
            value: `${msg.embeds.length} embed(s): ${embedInfo}`.slice(0, 1024),
            inline: true
        });
    }

    return embed;
}

class SnipeCommand extends BaseCommand {
    constructor() {
        super({
            category: CommandCategory.ADMIN,
            cooldown: 3,
            deferReply: true,
            requiredPermissions: [PermissionFlagsBits.ManageMessages]
        });
    }

    get data() {
        return new SlashCommandBuilder()
            .setName('snipe')
            .setDescription('Recover recently deleted messages')
            .addIntegerOption(opt =>
                opt.setName('count')
                    .setDescription('Number of messages to recover (default: 1)')
                    .setRequired(false)
                    .setMinValue(1)
                    .setMaxValue(10))
            .addChannelOption(opt =>
                opt.setName('channel')
                    .setDescription('Specific channel to snipe from (default: current channel)')
                    .setRequired(false))
            .addUserOption(opt =>
                opt.setName('user')
                    .setDescription('Only show deleted messages from this user')
                    .setRequired(false));
    }

    async run(interaction) {
        const count = interaction.options.getInteger('count') || 1;
        const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
        const targetUser = interaction.options.getUser('user');

        try {
            // Get snipe limit from settings
            let snipeLimit = 10;
            try {
                const { GuildSettingsService } = require('../../../services');
                snipeLimit = await GuildSettingsService.getSnipeLimit(interaction.guild.id);
            } catch {
                // Use default
            }

            const effectiveCount = Math.min(count, snipeLimit);

            // Get deleted messages from SnipeService
            let messages = [];
            try {
                const { SnipeService } = require('../../../services');
                
                if (targetUser) {
                    messages = SnipeService.getDeletedMessagesByUser(
                        interaction.guild.id, 
                        targetUser.id, 
                        effectiveCount
                    );
                } else {
                    messages = SnipeService.getDeletedMessages(
                        interaction.guild.id, 
                        effectiveCount, 
                        targetChannel.id
                    );
                }
            } catch {
                return this.errorReply(interaction, 'SnipeService is not available.');
            }

            if (messages.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor(COLORS.WARNING)
                    .setDescription('📭 No deleted messages found.')
                    .setFooter({ text: `Tracking up to ${snipeLimit} messages` });

                return this.safeReply(interaction, { embeds: [embed] });
            }

            // Create embeds for each message
            const embeds = messages.map((msg, index) => 
                createSnipeEmbed(msg, index + 1, messages.length)
            );

            // Discord only allows 10 embeds per message
            if (embeds.length > 10) {
                embeds.splice(10);
            }

            await this.safeReply(interaction, { embeds });

        } catch (error) {
            console.error('[Snipe] Error:', error);
            return this.errorReply(interaction, 'An error occurred while fetching deleted messages.');
        }
    }
}

// Export utilities
module.exports = new SnipeCommand();
module.exports.formatTimeAgo = formatTimeAgo;
module.exports.createSnipeEmbed = createSnipeEmbed;



