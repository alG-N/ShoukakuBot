/**
 * DeathBattle Command - Presentation Layer
 * Anime-themed death battle game
 * @module presentation/commands/fun/deathbattle
 */

const { SlashCommandBuilder } = require('discord.js');
const { BaseCommand, CommandCategory } = require('../BaseCommand');
const { checkAccess, AccessType } = require('../../services');

// Import services
let skillsetService, battleService, embedBuilder, logger, config;
try {
    skillsetService = require('../../services/fun/deathbattle/SkillsetService');
    battleService = require('../../services/fun/deathbattle/BattleService');
    embedBuilder = require('../../utils/deathbattle/embedBuilder');
    logger = require('../../utils/deathbattle/logger');
    config = require('../../config/deathbattle');
} catch (e) {
    console.warn('[DeathBattle] Could not load services:', e.message);
}

const MAX_HP = config?.MAX_HP || 10000;
const DEFAULT_HP = config?.DEFAULT_HP || 1000;
const COUNTDOWN_SECONDS = config?.COUNTDOWN_SECONDS || 3;
const ROUND_INTERVAL = config?.ROUND_INTERVAL || 2000;

class DeathBattleCommand extends BaseCommand {
    constructor() {
        super({
            category: CommandCategory.FUN,
            cooldown: 30,
            deferReply: false // Manual for battle flow
        });
    }

    get data() {
        return new SlashCommandBuilder()
            .setName('deathbattle')
            .setDescription('Start a death battle with another user!')
            .addUserOption(option =>
                option.setName('opponent')
                    .setDescription('The user you want to battle')
                    .setRequired(true))
            .addStringOption(option =>
                option.setName('skillset')
                    .setDescription('Skill set to use')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Jujutsu Kaisen', value: 'jjk' },
                        { name: 'Naruto', value: 'naruto' },
                        { name: 'Demon Slayer', value: 'demonslayer' },
                        { name: 'One Piece', value: 'onepiece' }
                    ))
            .addIntegerOption(option =>
                option.setName('your_hp')
                    .setDescription(`Your HP (max ${MAX_HP.toLocaleString()})`)
                    .setRequired(false))
            .addIntegerOption(option =>
                option.setName('opponent_hp')
                    .setDescription(`Opponent HP (max ${MAX_HP.toLocaleString()})`)
                    .setRequired(false));
    }

    async run(interaction) {
        // Access control
        const access = await checkAccess(interaction, AccessType.SUB);
        if (access.blocked) {
            return interaction.reply({ embeds: [access.embed], ephemeral: true });
        }

        const opponent = interaction.options.getUser('opponent');
        const player1 = interaction.user;
        const skillsetName = interaction.options.getString('skillset');
        let player1Hp = interaction.options.getInteger('your_hp') || DEFAULT_HP;
        let player2Hp = interaction.options.getInteger('opponent_hp') || player1Hp;

        // Validation
        if (!opponent) {
            return interaction.reply({ 
                embeds: [embedBuilder.buildErrorEmbed('You need to select someone to battle!')], 
                ephemeral: true 
            });
        }

        if (!skillsetService?.isValidSkillset(skillsetName)) {
            const validSkillsets = skillsetService?.getAllSkillsets?.().join(', ') || 'jjk, naruto, demonslayer, onepiece';
            return interaction.reply({ 
                embeds: [embedBuilder.buildErrorEmbed(`Invalid skillset! Available: ${validSkillsets}`)], 
                ephemeral: true 
            });
        }

        if (opponent.id === player1.id) {
            return interaction.reply({ 
                embeds: [embedBuilder.buildErrorEmbed('You cannot fight yourself!')], 
                ephemeral: true 
            });
        }

        if (player1Hp > MAX_HP || player2Hp > MAX_HP) {
            return interaction.reply({ 
                embeds: [embedBuilder.buildErrorEmbed(`HP too high! Max is ${MAX_HP.toLocaleString()}.`)], 
                ephemeral: true 
            });
        }

        // Create battle
        const battle = battleService.createBattle(
            interaction.guild.id,
            player1,
            opponent,
            skillsetName,
            player1Hp,
            player2Hp
        );

        logger?.log(`Battle started: ${player1.tag} vs ${opponent.tag} (${skillsetName})`, interaction);

        // Start countdown
        let countdown = COUNTDOWN_SECONDS;
        let battleEmbed = embedBuilder.buildCountdownEmbed(battle, countdown);

        await interaction.reply({ embeds: [battleEmbed] });
        const message = await interaction.fetchReply();

        // Countdown interval
        const countdownInterval = setInterval(async () => {
            countdown--;
            if (countdown > 0) {
                battleEmbed = embedBuilder.buildCountdownEmbed(battle, countdown);
                await message.edit({ embeds: [battleEmbed] }).catch(() => {});
            } else {
                clearInterval(countdownInterval);
                this._startBattle(message, battle);
            }
        }, 1000);
    }

    async _startBattle(message, battle) {
        const runRound = async () => {
            if (battle.isFinished) return;

            const roundResult = battleService.executeRound(battle);
            const embed = embedBuilder.buildRoundEmbed(battle, roundResult);
            await message.edit({ embeds: [embed] }).catch(() => {});

            if (!battle.isFinished) {
                setTimeout(() => runRound(), ROUND_INTERVAL);
            } else {
                // Battle finished
                const winnerEmbed = embedBuilder.buildWinnerEmbed(battle);
                await message.edit({ embeds: [winnerEmbed] }).catch(() => {});
                battleService.endBattle(battle.id);
            }
        };

        runRound();
    }
}

module.exports = new DeathBattleCommand();



