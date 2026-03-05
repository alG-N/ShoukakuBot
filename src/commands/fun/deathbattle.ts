/**
 * DeathBattle Command - Presentation Layer
 * Anime-themed death battle game
 * @module presentation/commands/fun/deathbattle
 */

import { 
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    User,
    Message,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ComponentType
} from 'discord.js';
import { BaseCommand, CommandCategory, CommandData } from '../BaseCommand.js';
import { checkAccess, AccessType } from '../../services/index.js';
import type { Battle, BattleHistoryEntry } from '../../services/fun/deathbattle/BattleService.js';
import coreLogger from '../../core/Logger.js';
import type {
    BattleRoundResult,
    SkillsetService,
    BattleService,
    EmbedBuilderService,
    LoggerService,
    DeathBattleConfig
} from '../../types/fun/deathbattle-command.js';

import _skillsetService from '../../services/fun/deathbattle/SkillsetService.js';
import _battleService from '../../services/fun/deathbattle/BattleService.js';
import _embedBuilder from '../../utils/deathbattle/embedBuilder.js';
import deathBattleLogger from '../../utils/deathbattle/logger.js';
import deathbattleConfig from '../../config/deathbattle/index.js';
// SERVICE IMPORTS — static ESM imports (converted from CJS require())
const skillsetService: SkillsetService = _skillsetService as any;
const battleService: BattleService = _battleService as any;
const embedBuilder: EmbedBuilderService = _embedBuilder as any;
const logger: LoggerService = deathBattleLogger as any;
const config: DeathBattleConfig = deathbattleConfig as any;

const MAX_HP = config?.MAX_HP || 10000;
const DEFAULT_HP = config?.DEFAULT_HP || 1000;
const COUNTDOWN_SECONDS = config?.COUNTDOWN_SECONDS || 3;
const ROUND_INTERVAL = config?.ROUND_INTERVAL || 2000;
// COMMAND
class DeathBattleCommand extends BaseCommand {
    constructor() {
        super({
            category: CommandCategory.FUN,
            cooldown: 30,
            deferReply: false
        });
    }

    get data(): CommandData {
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
                        { name: 'One Piece', value: 'onepiece' },
                        { name: 'Anime Crossover (All Powers)', value: 'crossover' }
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

    async run(interaction: ChatInputCommandInteraction): Promise<void> {
        // Access control
        const access = await checkAccess(interaction, AccessType.SUB);
        if (access.blocked) {
            await interaction.reply({ embeds: [access.embed!], ephemeral: true });
            return;
        }

        const opponent = interaction.options.getUser('opponent');
        const player1 = interaction.user;
        const skillsetName = interaction.options.getString('skillset', true);
        const player1Hp = interaction.options.getInteger('your_hp') || DEFAULT_HP;
        const player2Hp = interaction.options.getInteger('opponent_hp') || player1Hp;

        // Validation
        if (!opponent) {
            await interaction.reply({ 
                embeds: [embedBuilder!.buildErrorEmbed('You need to select someone to battle!')], 
                ephemeral: true 
            });
            return;
        }

        if (!skillsetService?.isValidSkillset(skillsetName)) {
            const validSkillsets = skillsetService?.getAllSkillsets?.().join(', ') || 'jjk, naruto, demonslayer, onepiece';
            await interaction.reply({ 
                embeds: [embedBuilder!.buildErrorEmbed(`Invalid skillset! Available: ${validSkillsets}`)], 
                ephemeral: true 
            });
            return;
        }

        if (opponent.id === player1.id) {
            await interaction.reply({ 
                embeds: [embedBuilder!.buildErrorEmbed('You cannot fight yourself!')], 
                ephemeral: true 
            });
            return;
        }

        if (player1Hp > MAX_HP || player2Hp > MAX_HP) {
            await interaction.reply({ 
                embeds: [embedBuilder!.buildErrorEmbed(`HP too high! Max is ${MAX_HP.toLocaleString()}.`)], 
                ephemeral: true 
            });
            return;
        }

        // Create battle
        const battle = await battleService!.createBattle(
            interaction.guild!.id,
            player1,
            opponent,
            skillsetName,
            player1Hp,
            player2Hp
        );

        if (!battle) {
            await interaction.reply({
                embeds: [embedBuilder!.buildErrorEmbed('A battle is already in progress in this server! Wait for it to finish.')],
                ephemeral: true
            });
            return;
        }

        // Start countdown
        let countdown = COUNTDOWN_SECONDS;
        let battleEmbed = embedBuilder!.buildCountdownEmbed(battle, countdown);

        await interaction.reply({ embeds: [battleEmbed] });
        const message = await interaction.fetchReply() as Message;

        // Countdown interval
        const countdownInterval = setInterval(async () => {
            countdown--;
            if (countdown > 0) {
                battleEmbed = embedBuilder!.buildCountdownEmbed(battle, countdown);
                await message.edit({ embeds: [battleEmbed] }).catch(() => {});
            } else {
                clearInterval(countdownInterval);
                this._startBattle(message, battle);
            }
        }, 1000);
    }

    private async _startBattle(message: Message, battle: Battle): Promise<void> {
        const guildId = message.guild?.id || '';
        
        const runRound = async (): Promise<void> => {
            // Check if battle is finished (someone has 0 or less HP)
            const isFinished = battle.player1Health <= 0 || battle.player2Health <= 0;
            if (isFinished) return;

            const roundResult = battleService!.executeRound(battle);
            const embed = embedBuilder!.buildRoundEmbed(battle, roundResult);
            await message.edit({ embeds: [embed] }).catch(() => {});

            // Check again after the round
            const battleFinished = battle.player1Health <= 0 || battle.player2Health <= 0;
            
            if (!battleFinished) {
                setTimeout(() => runRound(), ROUND_INTERVAL);
            } else {
                // Battle finished - show winner with View Log button
                const { embed: winnerEmbed, row } = embedBuilder!.buildWinnerEmbed(battle);
                await message.edit({ embeds: [winnerEmbed], components: [row] }).catch(() => {});
                
                // Store history reference before ending battle
                const battleHistory = [...battle.history];
                const battleState = {
                    player1: battle.player1,
                    player2: battle.player2,
                    skillsetName: battle.skillsetName,
                    player1Health: battle.player1Health,
                    player2Health: battle.player2Health,
                    player1MaxHp: battle.player1MaxHp,
                    player2MaxHp: battle.player2MaxHp,
                    roundCount: battle.roundCount,
                    battleLog: battle.battleLog,
                    history: battleHistory
                };
                
                await battleService!.endBattle(guildId);

                // Set up button collector for View Battle Log
                const collector = message.createMessageComponentCollector({
                    componentType: ComponentType.Button,
                    time: 300000 // 5 minutes
                });

                collector.on('collect', async (buttonInteraction) => {
                    try {
                        if (buttonInteraction.customId === 'deathbattle_viewlog') {
                            const { embed: logEmbed, row: logRow } = embedBuilder!.buildBattleLogEmbed(
                                battleState as unknown as Battle, 
                                battleHistory, 
                                0
                            );
                            await buttonInteraction.reply({ 
                                embeds: [logEmbed], 
                                components: logRow ? [logRow] : [],
                                ephemeral: true 
                            });
                        } else if (buttonInteraction.customId.startsWith('deathbattle_log_')) {
                            const parts = buttonInteraction.customId.split('_');
                            const direction = parts[2]; // 'prev' or 'next'
                            const currentPage = parseInt(parts[3], 10);
                            const newPage = direction === 'next' ? currentPage + 1 : currentPage - 1;
                            
                            const { embed: logEmbed, row: logRow } = embedBuilder!.buildBattleLogEmbed(
                                battleState as unknown as Battle, 
                                battleHistory, 
                                newPage
                            );
                            await buttonInteraction.update({ 
                                embeds: [logEmbed], 
                                components: logRow ? [logRow] : []
                            });
                        }
                    } catch (err) {
                        coreLogger.error('DeathBattle', `Button interaction error: ${err}`);
                    }
                });

                collector.on('end', () => {
                    // Remove button after timeout
                    message.edit({ components: [] }).catch(() => {});
                });
            }
        };

        runRound();
    }
}

export default new DeathBattleCommand();

