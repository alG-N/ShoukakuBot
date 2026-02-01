/**
 * AFK Command - Presentation Layer
 * Set AFK status (guild or global)
 * @module presentation/commands/general/afk
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { BaseCommand, CommandCategory } = require('../BaseCommand');
const { COLORS } = require('../../constants');
const fs = require('fs');
const path = require('path');

// File path for persistence
const afkFilePath = path.join(__dirname, '..', '..', '..', 'data', 'afk.json');

// In-memory cache
let afkCache = null;
let isDirty = false;

/**
 * Format duration from seconds
 */
function formatDuration(seconds) {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
}

/**
 * Load AFK users from file
 */
function loadAfkUsers() {
    if (afkCache !== null) return afkCache;
    
    try {
        const dir = path.dirname(afkFilePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        if (!fs.existsSync(afkFilePath)) {
            afkCache = {};
            fs.writeFileSync(afkFilePath, '{}');
            return afkCache;
        }
        afkCache = JSON.parse(fs.readFileSync(afkFilePath, 'utf-8').trim() || '{}');
    } catch {
        afkCache = {};
    }
    return afkCache;
}

/**
 * Save AFK users to cache (async save)
 */
function saveAfkUsers(data) {
    afkCache = data;
    isDirty = true;
}

// Periodic save every 30s
setInterval(async () => {
    if (isDirty && afkCache !== null) {
        try {
            await fs.promises.writeFile(afkFilePath, JSON.stringify(afkCache, null, 2));
            isDirty = false;
        } catch (err) {
            console.error('[AFK] Failed to save:', err);
        }
    }
}, 30000);

/**
 * Check if user is AFK (exported for use in events)
 */
function isUserAfk(userId, guildId = null) {
    const afkData = loadAfkUsers();
    const userData = afkData[userId];
    
    if (!userData) return null;
    
    // Check global AFK
    if (userData.type === 'global') {
        return userData;
    }
    
    // Check guild-specific AFK
    if (guildId && userData[guildId]) {
        return userData[guildId];
    }
    
    return null;
}

/**
 * Remove user from AFK
 */
function removeAfk(userId, guildId = null) {
    const afkData = loadAfkUsers();
    const userData = afkData[userId];
    
    if (!userData) return null;
    
    let removed = null;
    
    if (userData.type === 'global') {
        removed = userData;
        delete afkData[userId];
    } else if (guildId && userData[guildId]) {
        removed = userData[guildId];
        delete userData[guildId];
        if (Object.keys(userData).length === 0) {
            delete afkData[userId];
        }
    }
    
    if (removed) {
        saveAfkUsers(afkData);
    }
    
    return removed;
}

class AfkCommand extends BaseCommand {
    constructor() {
        super({
            category: CommandCategory.GENERAL,
            cooldown: 10,
            deferReply: false
        });
    }

    get data() {
        return new SlashCommandBuilder()
            .setName('afk')
            .setDescription('Set your AFK status')
            .addStringOption(option =>
                option.setName('type')
                    .setDescription('AFK type')
                    .addChoices(
                        { name: '🏠 Guild Only', value: 'guild' },
                        { name: '🌐 Global', value: 'global' }
                    )
            )
            .addStringOption(option =>
                option.setName('reason')
                    .setDescription('Reason for being AFK')
                    .setMaxLength(200)
            );
    }

    async run(interaction) {
        const afkData = loadAfkUsers();
        const userId = interaction.user.id;
        const guildId = interaction.guild?.id;
        const type = interaction.options.getString('type') || 'guild';
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const timestamp = Date.now();

        // Set AFK status
        if (type === 'global') {
            afkData[userId] = { reason, timestamp, type: 'global' };
        } else {
            if (!afkData[userId] || afkData[userId].type === 'global') {
                afkData[userId] = {};
            }
            afkData[userId][guildId] = { reason, timestamp, type: 'guild' };
        }

        saveAfkUsers(afkData);

        const embed = new EmbedBuilder()
            .setColor(COLORS.INFO)
            .setTitle('💤 AFK Status Set')
            .setDescription(`You are now AFK: **${reason}**`)
            .addFields(
                { name: 'Type', value: type === 'global' ? '🌐 Global' : '🏠 This Server Only', inline: true }
            )
            .setFooter({ text: 'You will be removed from AFK when you send a message' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
}

// Export command and utility functions
const command = new AfkCommand();
module.exports = command;
module.exports.isUserAfk = isUserAfk;
module.exports.removeAfk = removeAfk;
module.exports.formatDuration = formatDuration;



