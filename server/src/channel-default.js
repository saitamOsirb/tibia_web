"use strict";

const Channel = require("./channel");

const DefaultChannel = function(id, name) {

  /*
   * Class DefaultChannel
   * Wrapper for the default channel that broadcasts to all characters inside a particular range
   */

  // Inherits from channel
  Channel.call(this, id, name);

}

DefaultChannel.prototype = Object.create(Channel.prototype);
DefaultChannel.prototype.constructor = DefaultChannel;

DefaultChannel.prototype.send = function(player, packet) {

  /*
   * Function DefaultChannel.send
   * Sends a message to all players near this player in the gameworld
   */

  let message = packet.message;
  let loudness = packet.loudness;

  let color = player.characterStatistics.admin
    ? CONST.COLOR.RED
    : CONST.COLOR.YELLOW;

  // Whisper
  if (loudness === 0) {
    return player.internalCreatureWhisper(message, color);
  }

  // Yell
  if (loudness === 2) {
    return player.internalCreatureYell(message, color);
  }

  // Say normal
  player.internalCreatureSay(message, color);

  this.__NPCListen(player, message.toLowerCase());
};

DefaultChannel.prototype.__NPCListen = function(player, message) {

  /*
   * Function DefaultChannel.__NPCListen
   * Handler called when a player says a message and NPCs are nearby
   */

  process.gameServer.world.forEachNearbyNPC(player.position, function(npc) {

    // Do not accept anything when in a scene
    if (npc.isScene()) {
      return;
    }

    // If in range
    if (npc.isWithinRangeOf(player, npc.hearingRange)) {
      return npc.handleResponse(player, message);
    }

  });

}

module.exports = DefaultChannel;