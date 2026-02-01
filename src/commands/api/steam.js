/**
 * Steam Command - Presentation Layer
 * Steam game utilities
 * @module presentation/commands/api/steam
 */

const { SlashCommandBuilder } = require('discord.js');
const { BaseCommand, CommandCategory } = require('../BaseCommand');
const { checkAccess, AccessType } = require('../../services');

// Import handler
let handleSaleCommand;
try {
    const steamHandler = require('../../handlers/api/steamSaleHandler');
    handleSaleCommand = steamHandler.handleSaleCommand;
} catch (e) {
    console.warn('[Steam] Could not load handler:', e.message);
}

class SteamCommand extends BaseCommand {
    constructor() {
        super({
            category: CommandCategory.API,
            cooldown: 10,
            deferReply: false // Handler manages defer
        });
    }

    get data() {
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

    async run(interaction) {
        // Access control
        const access = await checkAccess(interaction, AccessType.SUB);
        if (access.blocked) {
            return interaction.reply({ embeds: [access.embed], ephemeral: true });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'sale' && handleSaleCommand) {
            return handleSaleCommand(interaction);
        }

        return this.errorReply(interaction, 'Steam sale handler not available.');
    }
}

module.exports = new SteamCommand();



