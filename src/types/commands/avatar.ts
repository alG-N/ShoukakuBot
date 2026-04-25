export type ImageFormat = 'auto' | 'png' | 'jpg' | 'webp' | 'gif';

export interface EmbedField {
    name: string;
    value: string;
    inline: boolean;
}