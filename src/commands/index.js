/**
 * Commands Index
 * All slash commands for the bot
 * @module commands
 */

const { BaseCommand, CommandCategory } = require('./BaseCommand');
const general = require('./general');
const admin = require('./admin');
const owner = require('./owner');
const api = require('./api');
const fun = require('./fun');
const music = require('./music');
const video = require('./video');

module.exports = {
    BaseCommand,
    CommandCategory,
    general,
    admin,
    owner,
    api,
    fun,
    music,
    video
};



