/**
 * Handler Index
 * Exports all music command handlers
 * 
 * Note: We export the entire handler modules (not individual functions)
 * to preserve 'this' context for internal method calls
 * @module handlers/music
 */

import { playHandler } from './playHandler.js';
import { controlHandler } from './controlHandler.js';
import { queueHandler } from './queueHandler.js';
import { buttonHandler } from './buttonHandler.js';
import { settingsHandler } from './settingsHandler.js';
import { favoritesHandler } from './favoritesHandler.js';
import { historyHandler } from './historyHandler.js';

// Re-export types
export { type Track, type LoopMode, type NowPlayingOptions, type ControlButtonsOptions, type QueueListOptions } from './trackHandler.js';
export { trackHandler } from './trackHandler.js';

// Export handlers with bound methods to preserve 'this' context
export const handlers = {
    // Play handlers
    handlePlay: playHandler.handlePlay.bind(playHandler),
    handlePlaylistAdd: playHandler.handlePlaylistAdd.bind(playHandler),
    handleLongTrackConfirmation: playHandler.handleLongTrackConfirmation.bind(playHandler),
    handleLongTrackButton: playHandler.handleLongTrackButton.bind(playHandler),
    handlePriorityVote: playHandler.handlePriorityVote.bind(playHandler),
    refreshNowPlayingMessage: playHandler.refreshNowPlayingMessage.bind(playHandler),
    isPlaylistUrl: playHandler.isPlaylistUrl.bind(playHandler),
    
    // Control handlers
    handleStop: controlHandler.handleStop.bind(controlHandler),
    handleSkip: controlHandler.handleSkip.bind(controlHandler),
    handleVoteSkip: controlHandler.handleVoteSkip.bind(controlHandler),
    handlePause: controlHandler.handlePause.bind(controlHandler),
    handleVolume: controlHandler.handleVolume.bind(controlHandler),
    handleLoop: controlHandler.handleLoop.bind(controlHandler),
    handleShuffle: controlHandler.handleShuffle.bind(controlHandler),
    handleSeek: controlHandler.handleSeek.bind(controlHandler),
    handleAutoPlay: controlHandler.handleAutoPlay.bind(controlHandler),
    
    // Queue handlers
    handleQueue: queueHandler.handleQueue.bind(queueHandler),
    handleNowPlaying: queueHandler.handleNowPlaying.bind(queueHandler),
    handleRemove: queueHandler.handleRemove.bind(queueHandler),
    handleMove: queueHandler.handleMove.bind(queueHandler),
    handleClear: queueHandler.handleClear.bind(queueHandler),
    handleRecent: queueHandler.handleRecent.bind(queueHandler),
    
    // Button handlers
    handleButton: buttonHandler.handleButton.bind(buttonHandler),
    handleButtonPause: buttonHandler.handleButtonPause.bind(buttonHandler),
    handleButtonStop: buttonHandler.handleButtonStop.bind(buttonHandler),
    handleButtonSkip: buttonHandler.handleButtonSkip.bind(buttonHandler),
    handleButtonLoop: buttonHandler.handleButtonLoop.bind(buttonHandler),
    handleButtonShuffle: buttonHandler.handleButtonShuffle.bind(buttonHandler),
    handleButtonAutoplay: buttonHandler.handleButtonAutoplay.bind(buttonHandler),
    handleButtonVolume: buttonHandler.handleButtonVolume.bind(buttonHandler),
    handleButtonQueue: buttonHandler.handleButtonQueue.bind(buttonHandler),
    handleButtonFavorite: buttonHandler.handleButtonFavorite.bind(buttonHandler),
    handleButtonLyrics: buttonHandler.handleButtonLyrics.bind(buttonHandler),
    handleButtonVoteSkip: buttonHandler.handleButtonVoteSkip.bind(buttonHandler),
    handleButtonQueuePage: buttonHandler.handleButtonQueuePage.bind(buttonHandler),
    handleButtonConfirm: buttonHandler.handleButtonConfirm.bind(buttonHandler),
    fetchLyrics: buttonHandler.fetchLyrics.bind(buttonHandler),
    
    // Settings handlers
    handleSettings: settingsHandler.handleSettings.bind(settingsHandler),
    handleSelectMenu: settingsHandler.handleSelectMenu.bind(settingsHandler),
    handleStatus: settingsHandler.handleStatus.bind(settingsHandler),
    handleVolumeSelect: settingsHandler.handleVolumeSelect.bind(settingsHandler),
    
    // Favorites handlers
    handleFavorites: favoritesHandler.handleFavorites.bind(favoritesHandler),
    handleFavoritesList: favoritesHandler.handleFavoritesList.bind(favoritesHandler),
    handleFavoritesPlay: favoritesHandler.handleFavoritesPlay.bind(favoritesHandler),
    handleFavoritesRemove: favoritesHandler.handleFavoritesRemove.bind(favoritesHandler),
    handleFavoritesClear: favoritesHandler.handleFavoritesClear.bind(favoritesHandler),
    
    // History handlers
    handleHistory: historyHandler.handleHistory.bind(historyHandler),
    handleHistoryList: historyHandler.handleHistoryList.bind(historyHandler),
    handleHistoryPlay: historyHandler.handleHistoryPlay.bind(historyHandler),
    handleHistoryClear: historyHandler.handleHistoryClear.bind(historyHandler)
};

// Named exports for direct imports
export { playHandler } from './playHandler.js';
export { controlHandler } from './controlHandler.js';
export { queueHandler } from './queueHandler.js';
export { buttonHandler } from './buttonHandler.js';
export { settingsHandler } from './settingsHandler.js';
export { favoritesHandler } from './favoritesHandler.js';
export { historyHandler } from './historyHandler.js';

// Default export
export default handlers;



