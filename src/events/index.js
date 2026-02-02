/**
 * Events - Presentation Layer
 * @module presentation/events
 */

const { BaseEvent } = require('./BaseEvent');
const ready = require('./ready');
const messageCreate = require('./messageCreate');
const messageUpdate = require('./messageUpdate');
const guildCreate = require('./guildCreate');
const guildDelete = require('./guildDelete');
const guildMemberAdd = require('./guildMemberAdd');
const guildMemberRemove = require('./guildMemberRemove');
const voiceStateUpdate = require('./voiceStateUpdate');

module.exports = {
    BaseEvent,
    ready,
    messageCreate,
    messageUpdate,
    guildCreate,
    guildDelete,
    guildMemberAdd,
    guildMemberRemove,
    voiceStateUpdate
};



