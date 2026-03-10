/**
 * Music Facade — Now Playing Manager
 * Handles now-playing message lifecycle: create, update, disable controls, loop updates.
 * Extracted from MusicFacade.ts for modularity.
 * @module services/music/MusicNowPlayingManager
 */

import {
    Message,
    TextBasedChannel,
    TextChannel,
    ComponentType,
    type Guild
} from 'discord.js';
import musicCache from '../../../cache/music/MusicCacheFacade.js';
import type { MessageRef } from '../../../cache/music/QueueCache.js';
import { createNowPlayingEmbed } from '../../../handlers/music/trackEmbeds.js';
import { createControlButtons } from '../../../handlers/music/trackButtons.js';
import { queueService } from '../queue/index.js';
import { voiceConnectionService } from '../voice/index.js';
import type { Track } from '../../../types/music/track.js';
import type { LoopMode } from '../../../types/music/playback.js';

export class MusicNowPlayingManager {
    /**
     * Resolve a MessageRef to a full Discord Message by fetching from the channel.
     * Returns null if the channel or message is unavailable.
     */
    async resolveMessage(ref: MessageRef | null, guildId: string): Promise<Message | null> {
        if (!ref) return null;
        try {
            const queue = musicCache.getQueue(guildId);
            const channel = queue?.textChannel as TextBasedChannel | null;
            if (!channel || !('messages' in channel)) return null;
            return await (channel as TextChannel).messages.fetch(ref.messageId);
        } catch {
            return null;
        }
    }

    setNowPlayingMessage(guildId: string, message: Message): void {
        musicCache.setNowPlayingMessage(guildId, message);
    }

    getNowPlayingMessageRef(guildId: string): MessageRef | null {
        return musicCache.getNowPlayingMessage(guildId);
    }

    async updateNowPlayingMessage(guildId: string, payload: any): Promise<Message | null> {
        const ref = this.getNowPlayingMessageRef(guildId);
        const message = await this.resolveMessage(ref, guildId);
        if (!message) return null;

        try {
            await message.edit(payload);
            return message;
        } catch (error: any) {
            if (error.code === 10008) {
                musicCache.setNowPlayingMessage(guildId, null);
            }
            return null;
        }
    }

    async disableNowPlayingControls(guildId: string): Promise<void> {
        const ref = this.getNowPlayingMessageRef(guildId);
        const message = await this.resolveMessage(ref, guildId);
        if (!message?.components?.length) return;

        try {
            const disabledRows = message.components
                .filter(row => row.type === ComponentType.ActionRow)
                .map(row => {
                    const rowJson = row.toJSON();
                    const components = rowJson.components.map(component => {
                        if (component.type === ComponentType.Button) {
                            return {
                                ...component,
                                disabled: true
                            };
                        }
                        return component;
                    });

                    return {
                        type: ComponentType.ActionRow,
                        components
                    };
                });

            await message.edit({ components: disabledRows });
        } catch (error: unknown) {
            const err = error as { code?: number };
            if (err.code === 10008) {
                musicCache.setNowPlayingMessage(guildId, null);
            }
        }
    }

    async sendNowPlayingEmbed(guildId: string): Promise<void> {
        const queue = musicCache.getQueue(guildId);
        if (!queue?.textChannel) return;

        const currentTrack = queueService.getCurrentTrack(guildId) as Track | null;
        if (!currentTrack) return;

        try {
            await this.disableNowPlayingControls(guildId);

            const queueList = queueService.getTracks(guildId) as Track[];
            const channel = queue.textChannel;
            const guild = (channel && 'guild' in channel) ? (channel as { guild?: unknown }).guild : undefined;
            if (!guild || !('id' in (guild as object))) return;
            const listenerCount = voiceConnectionService.getListenerCount(guildId, guild as Guild);
            const voteSkipStatus = musicCache.getVoteSkipStatus(guildId, listenerCount);

            const embed = createNowPlayingEmbed(currentTrack, {
                volume: queueService.getVolume(guildId),
                isPaused: queue.isPaused || false,
                loopMode: queueService.getLoopMode(guildId) as LoopMode,
                isShuffled: queueService.isShuffled(guildId),
                queueLength: queueList.length,
                nextTrack: queueList[0] || null,
                loopCount: 0,
                voteSkipCount: voteSkipStatus.count,
                voteSkipRequired: voteSkipStatus.required,
                listenerCount: listenerCount
            });

            const rows = createControlButtons(guildId, {
                isPaused: queue.isPaused || false,
                loopMode: queueService.getLoopMode(guildId) as LoopMode,
                isShuffled: queueService.isShuffled(guildId),
                autoPlay: queueService.isAutoPlayEnabled(guildId),
                trackUrl: currentTrack.url,
                userId: currentTrack.requestedBy?.id || '',
                listenerCount: listenerCount
            });

            if (!('send' in channel) || typeof channel.send !== 'function') return;
            const nowMessage = await channel.send({ embeds: [embed], components: rows });
            this.setNowPlayingMessage(guildId, nowMessage);
        } catch (error) {
            // Silent fail
        }
    }

    async updateNowPlayingForLoop(guildId: string, loopCount: number): Promise<void> {
        const ref = this.getNowPlayingMessageRef(guildId);
        const message = await this.resolveMessage(ref, guildId);
        if (!message) return;

        const currentTrack = queueService.getCurrentTrack(guildId) as Track | null;
        if (!currentTrack) return;

        const queue = musicCache.getQueue(guildId);
        if (!queue) return;

        try {
            const queueList = queueService.getTracks(guildId) as Track[];
            const channel = queue.textChannel;
            const guild = (channel && 'guild' in channel) ? (channel as { guild?: unknown }).guild : undefined;
            if (!guild || !('id' in (guild as object))) return;
            const listenerCount = voiceConnectionService.getListenerCount(guildId, guild as Guild);
            const voteSkipStatus = musicCache.getVoteSkipStatus(guildId, listenerCount);

            const embed = createNowPlayingEmbed(currentTrack, {
                volume: queueService.getVolume(guildId),
                isPaused: queue.isPaused || false,
                loopMode: queueService.getLoopMode(guildId) as LoopMode,
                isShuffled: queueService.isShuffled(guildId),
                queueLength: queueList.length,
                nextTrack: queueList[0] || null,
                loopCount: loopCount,
                voteSkipCount: voteSkipStatus.count,
                voteSkipRequired: voteSkipStatus.required,
                listenerCount: listenerCount
            });

            const rows = createControlButtons(guildId, {
                isPaused: queue.isPaused || false,
                loopMode: queueService.getLoopMode(guildId) as LoopMode,
                isShuffled: queueService.isShuffled(guildId),
                autoPlay: queueService.isAutoPlayEnabled(guildId),
                trackUrl: currentTrack.url,
                userId: currentTrack.requestedBy?.id || '',
                listenerCount: listenerCount
            });

            await message.edit({ embeds: [embed], components: rows });
        } catch (error: any) {
            if (error.code === 10008) {
                musicCache.setNowPlayingMessage(guildId, null);
                await this.sendNowPlayingEmbed(guildId);
            }
        }
    }
}
