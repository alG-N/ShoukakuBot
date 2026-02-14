/**
 * Media Command — Embed Fix
 * Convert social media URLs to embed-fix URLs for better Discord embedding
 * Usage: /media [link]
 * Supports: Twitter/X, TikTok, Instagram, Reddit, Bluesky, Threads
 * @module commands/api/media
 */

import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
} from 'discord.js';
import { BaseCommand, CommandCategory, type CommandData } from '../BaseCommand.js';
import logger from '../../core/Logger.js';
import embedService from '../../services/api/embedService.js';

// COMMAND

class MediaCommand extends BaseCommand {
    constructor() {
        super({
            category: CommandCategory.API,
            cooldown: 3,
            deferReply: false,
        });
    }

    get data(): CommandData {
        return new SlashCommandBuilder()
            .setName('media')
            .setDescription('Fix social media embeds for Discord')
            .addStringOption(option =>
                option.setName('link')
                    .setDescription('The social media URL to fix (Twitter, TikTok, Instagram, Reddit, etc.)')
                    .setRequired(true)
                    .setMaxLength(500)
            ) as unknown as CommandData;
    }

    async run(interaction: ChatInputCommandInteraction): Promise<void> {
        const url = interaction.options.getString('link', true).trim();

        // Basic URL validation
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            await interaction.reply({ content: '❌ Invalid URL.', ephemeral: true });
            return;
        }

        // Convert
        const result = embedService.convert(url);

        if (!result.success) {
            await interaction.reply({
                content: '❌ Platform not supported.',
                ephemeral: true,
            });
            return;
        }

        // Send the fixed URL as plain text — Discord will auto-embed the video
        await interaction.reply({ content: result.fixedUrl! });

        logger.debug('MediaCommand', `Fixed ${result.platform!.name} URL for ${interaction.user.tag}`);
    }
}

export default new MediaCommand();
