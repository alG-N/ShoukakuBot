/**
 * Steam Command - Presentation Layer
 * Steam game utilities
 * @module presentation/commands/api/steam
 */

import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { BaseCommand, CommandCategory, type CommandData } from '../BaseCommand.js';
import { checkAccess, AccessType } from '../../services/index.js';
import logger from '../../core/Logger.js';
import * as _steamHandler from '../../handlers/api/steamSaleHandler.js';
// TYPES
type SaleHandler = (interaction: ChatInputCommandInteraction) => Promise<void>;
// SERVICE IMPORTS
const handleSaleCommand: SaleHandler | undefined = (_steamHandler as any)?.handleSaleCommand;
// COMMAND
class SteamCommand extends BaseCommand {
    constructor() {
        super({
            category: CommandCategory.API,
            cooldown: 10,
            deferReply: false // Handler manages defer
        });
    }

    get data(): CommandData {
        return new SlashCommandBuilder()
            .setName('steam')
            .setDescription('Steam game utilities')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('sale')
                    .setDescription('Find games on sale with a minimum discount percentage')
                    .addIntegerOption(option =>
                        option
                            .setName('discount')
                            .setDescription('Minimum discount percentage (0-100, 0 = free games)')
                            .setRequired(true)
                            .setMinValue(0)
                            .setMaxValue(100)
                    )
                    .addBooleanOption(option =>
                        option
                            .setName('detailed')
                            .setDescription('Show detailed info (owners, ratings) from SteamSpy')
                            .setRequired(false)
                    )
            );
    }

    async run(interaction: ChatInputCommandInteraction): Promise<void> {
        // Access control
        const access = await checkAccess(interaction, AccessType.SUB);
        if (access.blocked) {
            await interaction.reply({ embeds: [access.embed!], ephemeral: true });
            return;
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'sale' && handleSaleCommand) {
            await handleSaleCommand(interaction);
            return;
        }

        await this.errorReply(interaction, 'Steam sale handler not available.');
    }
}

export default new SteamCommand();
