import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export function createPostButtons(postCount: number, startIdx: number, userId: string, sessionId: string = 'latest'): ActionRowBuilder<ButtonBuilder>[] {
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    const row = new ActionRowBuilder<ButtonBuilder>();

    for (let i = 0; i < Math.min(postCount, 5); i++) {
        const globalIndex = startIdx + i;
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`reddit_show_${sessionId}_${globalIndex}_${userId}`)
                .setLabel(`Post ${globalIndex + 1}`)
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📖')
        );
    }

    rows.push(row);
    return rows;
}

export function createPaginationButtons(
    currentPage: number,
    totalPages: number,
    userId: string,
    sessionId: string = 'latest'
): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`reddit_prev_${sessionId}_${userId}`)
            .setLabel('◀️ Previous')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage === 0),
        new ButtonBuilder()
            .setCustomId(`reddit_pageinfo_${sessionId}_${userId}`)
            .setLabel(`Page ${currentPage + 1}/${totalPages}`)
            .setStyle(ButtonStyle.Success)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`reddit_next_${sessionId}_${userId}`)
            .setLabel('Next ▶️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage === totalPages - 1)
    );
}

export function createGalleryButtons(
    currentPage: number,
    totalPages: number,
    postIndex: number,
    userId: string,
    sessionId: string = 'latest'
): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`reddit_gprev_${sessionId}_${postIndex}_${userId}`)
            .setLabel('Previous')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('◀️')
            .setDisabled(currentPage === 0),
        new ButtonBuilder()
            .setCustomId(`reddit_gpage_${sessionId}_${postIndex}_${userId}`)
            .setLabel(`${currentPage + 1}/${totalPages}`)
            .setStyle(ButtonStyle.Success)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`reddit_gnext_${sessionId}_${postIndex}_${userId}`)
            .setLabel('Next')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('▶️')
            .setDisabled(currentPage === totalPages - 1),
        new ButtonBuilder()
            .setCustomId(`reddit_gclose_${sessionId}_${postIndex}_${userId}`)
            .setLabel('Back')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🔙')
    );
}

export function createBackButton(userId: string, sessionId: string = 'latest'): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`reddit_back_${sessionId}_${userId}`)
            .setLabel('Back to Posts')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🔙')
    );
}
