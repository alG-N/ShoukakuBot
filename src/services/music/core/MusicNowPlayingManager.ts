/**
 * Music Facade — Now Playing Manager
 * Handles now-playing message lifecycle: create, update, disable controls, loop updates.
 * Extracted from MusicFacade.ts for modularity.
 * @module services/music/MusicNowPlayingManager
 */

import { Message, TextBasedChannel, TextChannel } from 'discord.js';
import musicCache from '../../../cache/music/MusicCacheFacade.js';
import type { MessageRef } from '../../../cache/music/QueueCache.js';
import trackHandler from '../../../handlers/music/trackHandler.js';
import { queueService } from '../queue/index.js';
import { voiceConnectionService } from '../voice/index.js';
import type { Track, LoopMode } from './MusicTypes.js';

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

    /** @deprecated Use getNowPlayingMessageRef() + resolveMessage() */
    getNowPlayingMessage(guildId: string): MessageRef | null {
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
            const disabledRows = message.components.map((row: any) => ({
                type: row.type,
                components: row.components.map((c: any) => ({
                    ...c.data,
                    disabled: true
                }))
            }));

            // Cast: manually-constructed component objects don't match MessageActionRowComponentData
            await message.edit({ components: disabledRows as any });
        } catch (error: any) {
            if (error.code === 10008) {
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
            const listenerCount = voiceConnectionService.getListenerCount(guildId, queue.textChannel?.guild);
            const voteSkipStatus = musicCache.getVoteSkipStatus(guildId, listenerCount);

            const embed = trackHandler.createNowPlayingEmbed(currentTrack as any, {
                volume: queueService.getVolume(guildId),
                isPaused: queue.isPaused || false,
                loopMode: queueService.getLoopMode(guildId) as LoopMode,
                isShuffled: queueService.isShuffled(guildId),
                queueLength: queueList.length,
                nextTrack: (queueList[0] || null) as any,
                loopCount: 0,
                voteSkipCount: voteSkipStatus.count,
                voteSkipRequired: voteSkipStatus.required,
                listenerCount: listenerCount
            });

            const rows = trackHandler.createControlButtons(guildId, {
                isPaused: queue.isPaused || false,
                loopMode: queueService.getLoopMode(guildId) as LoopMode,
                isShuffled: queueService.isShuffled(guildId),
                autoPlay: queueService.isAutoPlayEnabled(guildId),
                trackUrl: currentTrack.url,
                userId: currentTrack.requestedBy?.id || '',
                listenerCount: listenerCount
            });

            const nowMessage = await queue.textChannel.send({ embeds: [embed], components: rows });
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
            const listenerCount = voiceConnectionService.getListenerCount(guildId, queue.textChannel?.guild);
            const voteSkipStatus = musicCache.getVoteSkipStatus(guildId, listenerCount);

            const embed = trackHandler.createNowPlayingEmbed(currentTrack as any, {
                volume: queueService.getVolume(guildId),
                isPaused: queue.isPaused || false,
                loopMode: queueService.getLoopMode(guildId) as LoopMode,
                isShuffled: queueService.isShuffled(guildId),
                queueLength: queueList.length,
                nextTrack: (queueList[0] || null) as any,
                loopCount: loopCount,
                voteSkipCount: voteSkipStatus.count,
                voteSkipRequired: voteSkipStatus.required,
                listenerCount: listenerCount
            });

            const rows = trackHandler.createControlButtons(guildId, {
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
