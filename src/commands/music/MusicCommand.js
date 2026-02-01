/**
 * Music Command
 * Comprehensive music bot with play, queue, controls, and settings
 * @module commands/music/MusicCommand
 */

const { SlashCommandBuilder } = require('discord.js');
const { BaseCommand, CommandCategory } = require('../BaseCommand');
const { checkAccess, AccessType } = require('../../services');

class MusicCommand extends BaseCommand {
    constructor() {
        super({
            category: CommandCategory.MUSIC,
            cooldown: 2,
            deferReply: false // Handlers manage their own defer
        });
        
        // Lazy load handlers to avoid circular dependencies
        this._handlers = null;
    }

    get handlers() {
        if (!this._handlers) {
            try {
                this._handlers = require('../../handlers/music');
            } catch (e) {
                console.warn('[Music] Could not load handlers:', e.message);
                this._handlers = {};
            }
        }
        return this._handlers;
    }

    get data() {
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
                )
                .addBooleanOption(opt => opt
                    .setName('shuffle')
                    .setDescription('Shuffle the playlist')
                    .setRequired(false)
                )
                .addBooleanOption(opt => opt
                    .setName('priority')
                    .setDescription('Add to front of queue')
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
            
            // Seek subcommand
            .addSubcommand(sub => sub
                .setName('seek')
                .setDescription('Seek to a position in the track')
                .addStringOption(opt => opt
                    .setName('position')
                    .setDescription('Position (e.g., 1:30, 90)')
                    .setRequired(true)
                )
            )
            
            // Lyrics subcommand
            .addSubcommand(sub => sub
                .setName('lyrics')
                .setDescription('Get lyrics for current or specified song')
                .addStringOption(opt => opt
                    .setName('query')
                    .setDescription('Song name (optional, uses current track if empty)')
                    .setRequired(false)
                )
            )
            
            // History subcommand
            .addSubcommand(sub => sub
                .setName('history')
                .setDescription('View recently played tracks')
            )
            
            // Autoplay subcommand
            .addSubcommand(sub => sub
                .setName('autoplay')
                .setDescription('Toggle autoplay mode')
            )
            
            // Grab subcommand
            .addSubcommand(sub => sub
                .setName('grab')
                .setDescription('Save current track info to DMs')
            );
    }

    async run(interaction) {
        // Access control
        const access = await checkAccess(interaction, AccessType.SUB);
        if (access.blocked) {
            return interaction.reply({ embeds: [access.embed], ephemeral: true });
        }

        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guild?.id;
        const userId = interaction.user?.id;
        
        // Delegate to appropriate handler
        const handlers = this.handlers;
        try {
            // Handler map with proper method names from handlers index
            const handlerMap = {
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
                'seek': handlers.handleSeek,
                'lyrics': handlers.fetchLyrics,
                'history': handlers.handleRecent,
                'autoplay': handlers.handleAutoPlay,
                'grab': handlers.handleNowPlaying, // Grab uses now playing info
            };

            const handler = handlerMap[subcommand];
            if (handler) {
                return await handler(interaction, guildId, userId);
            }

            return this.safeReply(interaction, { 
                embeds: [this.errorEmbed(`Handler for \`${subcommand}\` not found.`)], 
                ephemeral: true 
            });
        } catch (error) {
            console.error(`[Music/${subcommand}] Error:`, error);
            return this.safeReply(interaction, { 
                embeds: [this.errorEmbed('An error occurred while processing the music command.')], 
                ephemeral: true 
            });
        }
    }

    async handleButton(interaction) {
        try {
            const handleButton = this.handlers?.handleButton;
            if (handleButton) {
                return await handleButton(interaction);
            }
        } catch (error) {
            console.error('[Music Button] Error:', error);
            if (!interaction.replied && !interaction.deferred) {
                return interaction.reply({ content: '❌ An error occurred.', ephemeral: true });
            }
        }
    }
}

module.exports = new MusicCommand();
