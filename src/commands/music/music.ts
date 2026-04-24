/**
 * Music Command
 * Comprehensive music bot with play, queue, and playback controls
 * @module commands/music/MusicCommand
 */

import { SlashCommandBuilder, ChatInputCommandInteraction, ButtonInteraction, AutocompleteInteraction } from 'discord.js';
import { BaseCommand, CommandCategory, CommandData } from '../BaseCommand.js';
import { checkAccess, AccessType } from '../../services/index.js';
import logger from '../../core/Logger.js';
import _musicHandlers, { historyHandler } from '../../handlers/music/index.js';
import lavalinkService from '../../services/music/core/LavalinkService.js';
import type { MusicHandler, MusicHandlers } from '../../types/commands/music-command.js';
// COMMAND
class MusicCommand extends BaseCommand {
    private _handlers: MusicHandlers | null = null;

    constructor() {
        super({
            category: CommandCategory.MUSIC,
            cooldown: 2,
            deferReply: false // Handlers manage their own defer
        });
    }

    get handlers(): MusicHandlers {
        if (!this._handlers) {
            this._handlers = _musicHandlers as MusicHandlers;
        }
        return this._handlers!;
    }

    get data(): CommandData {
        return new SlashCommandBuilder()
            .setName('music')
            .setDescription('Music player commands')
            
            // Play subcommand
            .addSubcommand(sub => sub
                .setName('play')
                .setDescription('Play a song or playlist')
                .addStringOption(opt => opt
                    .setName('query')
                    .setDescription('Song name, URL, or playlist URL')
                    .setRequired(true)
                    .setAutocomplete(true)
                )
                .addBooleanOption(opt => opt
                    .setName('shuffle')
                    .setDescription('Shuffle the playlist')
                    .setRequired(false)
                )
            )
            
            // Stop subcommand
            .addSubcommand(sub => sub
                .setName('stop')
                .setDescription('Stop music and clear the queue')
            )
            
            // Skip subcommand
            .addSubcommand(sub => sub
                .setName('skip')
                .setDescription('Skip the current track')
            )
            
            // Pause subcommand
            .addSubcommand(sub => sub
                .setName('pause')
                .setDescription('Pause or resume playback')
            )
            
            // Queue subcommand
            .addSubcommand(sub => sub
                .setName('queue')
                .setDescription('View the queue')
                .addIntegerOption(opt => opt
                    .setName('page')
                    .setDescription('Page number')
                    .setRequired(false)
                    .setMinValue(1)
                )
            )
            
            // Now Playing subcommand
            .addSubcommand(sub => sub
                .setName('nowplaying')
                .setDescription('Show currently playing track')
            )
            
            // Volume subcommand
            .addSubcommand(sub => sub
                .setName('volume')
                .setDescription('Set the volume')
                .addIntegerOption(opt => opt
                    .setName('level')
                    .setDescription('Volume level (0-200)')
                    .setRequired(true)
                    .setMinValue(0)
                    .setMaxValue(200)
                )
            )
            
            // Loop subcommand
            .addSubcommand(sub => sub
                .setName('loop')
                .setDescription('Toggle loop mode')
                .addStringOption(opt => opt
                    .setName('mode')
                    .setDescription('Loop mode')
                    .setRequired(false)
                    .addChoices(
                        { name: '➡️ Off', value: 'off' },
                        { name: '🔂 Track', value: 'track' },
                        { name: '🔁 Queue', value: 'queue' }
                    )
                )
            )
            
            // Shuffle subcommand
            .addSubcommand(sub => sub
                .setName('shuffle')
                .setDescription('Toggle shuffle mode')
            )
            
            // Remove subcommand
            .addSubcommand(sub => sub
                .setName('remove')
                .setDescription('Remove a track from queue')
                .addIntegerOption(opt => opt
                    .setName('position')
                    .setDescription('Position in queue (1 = first)')
                    .setRequired(true)
                    .setMinValue(1)
                )
            )
            
            // Move subcommand
            .addSubcommand(sub => sub
                .setName('move')
                .setDescription('Move a track in the queue')
                .addIntegerOption(opt => opt
                    .setName('from')
                    .setDescription('Current position')
                    .setRequired(true)
                    .setMinValue(1)
                )
                .addIntegerOption(opt => opt
                    .setName('to')
                    .setDescription('New position')
                    .setRequired(true)
                    .setMinValue(1)
                )
            )
            
            // Clear subcommand
            .addSubcommand(sub => sub
                .setName('clear')
                .setDescription('Clear the queue (keeps current track)')
            )
            
            // History subcommand
            .addSubcommand(sub => sub
                .setName('history')
                .setDescription('View your listening history')
                .addIntegerOption(opt => opt
                    .setName('page')
                    .setDescription('Page number')
                    .setRequired(false)
                    .setMinValue(1)
                )
            )
            
            // Autoplay subcommand
            .addSubcommand(sub => sub
                .setName('autoplay')
                .setDescription('Toggle autoplay mode')
            )
            
;
    }

    async run(interaction: ChatInputCommandInteraction): Promise<void> {
        // Access control
        const access = await checkAccess(interaction, AccessType.SUB);
        if (access.blocked) {
            await interaction.reply({ embeds: [access.embed!], ephemeral: true });
            return;
        }

        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guild?.id;
        const userId = interaction.user?.id;
        
        if (!guildId || !userId) {
            await this.safeReply(interaction, { 
                embeds: [this.errorEmbed('This command can only be used in a server.')], 
                ephemeral: true 
            });
            return;
        }

        // Delegate to appropriate handler
        const handlers = this.handlers;
        try {
            if (subcommand === 'history') {
                await historyHandler.handleHistoryList(interaction, userId);
                return;
            }

            // Handler map with proper method names from handlers index
            const handlerMap: Record<string, MusicHandler | undefined> = {
                'play': handlers.handlePlay,
                'stop': handlers.handleStop,
                'skip': handlers.handleSkip,
                'pause': handlers.handlePause,
                'queue': handlers.handleQueue,
                'nowplaying': handlers.handleNowPlaying,
                'volume': handlers.handleVolume,
                'loop': handlers.handleLoop,
                'shuffle': handlers.handleShuffle,
                'remove': handlers.handleRemove,
                'move': handlers.handleMove,
                'clear': handlers.handleClear,
                'autoplay': handlers.handleAutoPlay,
            };

            const handler = handlerMap[subcommand];
            if (handler) {
                await handler(interaction, guildId, userId);
                return;
            }

            await this.safeReply(interaction, { 
                embeds: [this.errorEmbed(`Handler for \`${subcommand}\` not found.`)], 
                ephemeral: true 
            });
        } catch (error) {
            logger.error('Music', `${subcommand} error: ${(error as Error).message}`);
            await this.safeReply(interaction, { 
                embeds: [this.errorEmbed('An error occurred while processing the music command.')], 
                ephemeral: true 
            });
        }
    }

    async handleButton(interaction: ButtonInteraction): Promise<void> {
        try {
            const handleButton = this.handlers?.handleButton;
            if (handleButton) {
                await handleButton(interaction);
                return;
            }
        } catch (error) {
            logger.error('Music', `Button error: ${(error as Error).message}`);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ An error occurred.', ephemeral: true });
            }
        }
    }

    private static readonly PLAYLIST_PATTERNS = [
        /youtube\.com.*list=/i,
        /spotify\.com\/playlist\//i,
        /spotify\.com\/album\//i,
    ];

    private static readonly autocompleteCache = new Map<string, { results: Array<{ name: string; value: string }>; timestamp: number }>();
    private static readonly AUTOCOMPLETE_CACHE_TTL = 30000;

    async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
        const safeRespond = async (choices: Array<{ name: string; value: string }>): Promise<void> => {
            try {
                await interaction.respond(choices);
            } catch (error) {
                const err = error as { code?: number; message?: string };
                if (err?.code === 10062 || err?.code === 40060 || err?.message?.includes('already been acknowledged')) return;
                throw error;
            }
        };

        const focused = interaction.options.getFocused();

        if (focused.length < 2) {
            await safeRespond([]);
            return;
        }

        // Don't autocomplete playlist URLs
        if (MusicCommand.PLAYLIST_PATTERNS.some(p => p.test(focused))) {
            await safeRespond([{ name: focused.length > 100 ? focused.slice(0, 97) + '...' : focused, value: focused.slice(0, 100) }]);
            return;
        }

        // For single track URLs, just show the URL itself
        if (/^https?:\/\//i.test(focused)) {
            await safeRespond([{ name: focused.length > 100 ? focused.slice(0, 97) + '...' : focused, value: focused.slice(0, 100) }]);
            return;
        }

        const cacheKey = focused.toLowerCase().trim();
        const cached = MusicCommand.autocompleteCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < MusicCommand.AUTOCOMPLETE_CACHE_TTL) {
            await safeRespond(cached.results);
            return;
        }

        try {
            const results = await lavalinkService.searchMultiple(focused, 10);
            const choices = results.slice(0, 25).map(track => {
                const title = track.title || track.info?.title || 'Unknown';
                const author = track.author || track.info?.author || '';
                const display = author ? `${title} — ${author}` : title;
                return {
                    name: display.length > 100 ? display.slice(0, 97) + '...' : display,
                    value: (track.url || track.info?.uri || title).slice(0, 100)
                };
            });

            MusicCommand.autocompleteCache.set(cacheKey, { results: choices, timestamp: Date.now() });
            await safeRespond(choices);
        } catch (error) {
            logger.debug('Music', `Autocomplete error: ${(error as Error).message}`);
            try { await safeRespond([]); } catch { /* ignore */ }
        }
    }
}

export default new MusicCommand();


