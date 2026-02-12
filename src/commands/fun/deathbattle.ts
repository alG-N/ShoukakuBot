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
import { BaseCommand, CommandCategory, type CommandData } from '../BaseCommand.js';
import { checkAccess, AccessType } from '../../services/index.js';
import type { BattleHistoryEntry } from '../../services/fun/deathbattle/BattleService.js';

import { getDefault } from '../../utils/common/moduleHelper.js';
// TYPES
// Use the actual Battle interface from BattleService
interface Battle {
    player1: User;
    player2: User;
    skillsetName: string;
    player1Health: number;
    player2Health: number;
    player1MaxHp: number;
    player2MaxHp: number;
    roundCount: number;
    battleLog: string;
    history: BattleHistoryEntry[];
}

interface RoundResult {
    attacker: User;
    defender: User;
    damage: number;
    skill: string;
    effectLogs?: string[];
    historyEntry?: BattleHistoryEntry;
}

interface SkillsetService {
    isValidSkillset: (name: string) => boolean;
    getAllSkillsets: () => string[];
}

interface BattleService {
    createBattle: (guildId: string, p1: User, p2: User, skillset: string, hp1: number, hp2: number) => Promise<Battle | null>;
    isBattleActive: (guildId: string) => Promise<boolean>;
    executeRound: (battle: Battle) => RoundResult;
    endBattle: (battleId: string) => Promise<void>;
    getBattleHistory: (guildId: string) => Promise<BattleHistoryEntry[] | null>;
    removeBattle: (guildId: string) => Promise<void>;
}

interface EmbedBuilderService {
    buildErrorEmbed: (msg: string) => EmbedBuilder;
    buildCountdownEmbed: (battle: Battle, count: number) => EmbedBuilder;
    buildRoundEmbed: (battle: Battle, result: RoundResult) => EmbedBuilder;
    buildWinnerEmbed: (battle: Battle) => { embed: EmbedBuilder; row: ActionRowBuilder<ButtonBuilder> };
    buildBattleLogEmbed: (battle: Battle, history: BattleHistoryEntry[], page?: number) => { embed: EmbedBuilder; row: ActionRowBuilder<ButtonBuilder> | null };
}

interface LoggerService {
    log: (msg: string, interaction?: ChatInputCommandInteraction) => void;
}

interface DeathBattleConfig {
    MAX_HP?: number;
    DEFAULT_HP?: number;
    COUNTDOWN_SECONDS?: number;
    ROUND_INTERVAL?: number;
}
// SERVICE IMPORTS
let skillsetService: SkillsetService | undefined;
let battleService: BattleService | undefined;
let embedBuilder: EmbedBuilderService | undefined;
let logger: LoggerService | undefined;
let config: DeathBattleConfig | undefined;


try {
    skillsetService = getDefault(require('../../services/fun/deathbattle/SkillsetService'));
    battleService = getDefault(require('../../services/fun/deathbattle/BattleService'));
    embedBuilder = getDefault(require('../../utils/deathbattle/embedBuilder'));
    logger = getDefault(require('../../utils/deathbattle/logger'));
    config = getDefault(require('../../config/deathbattle'));
} catch (e) {
    console.warn('[DeathBattle] Could not load services:', (e as Error).message);
}

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
                        console.error('[DeathBattle] Button interaction error:', err);
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
