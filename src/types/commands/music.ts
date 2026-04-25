import type { ButtonInteraction, ChatInputCommandInteraction } from 'discord.js';

export type MusicHandler = (interaction: ChatInputCommandInteraction, guildId: string, userId: string) => Promise<void>;

export interface MusicHandlers {
    handlePlay?: MusicHandler;
    handleStop?: MusicHandler;
    handleSkip?: MusicHandler;
    handlePause?: MusicHandler;
    handleQueue?: MusicHandler;
    handleNowPlaying?: MusicHandler;
    handleVolume?: MusicHandler;
    handleLoop?: MusicHandler;
    handleShuffle?: MusicHandler;
    handleRemove?: MusicHandler;
    handleMove?: MusicHandler;
    handleClear?: MusicHandler;
    handleSeek?: MusicHandler;
    handleRecent?: MusicHandler;
    handleAutoPlay?: MusicHandler;
    handleButton?: (interaction: ButtonInteraction) => Promise<void>;
}