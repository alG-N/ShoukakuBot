export interface AnimationFrames {
    [key: string]: string[];
}

export interface ProgressStyle {
    filled: string;
    empty: string;
    length: number;
}

export interface ProgressStyles {
    [key: string]: ProgressStyle;
}

export interface StatusIcons {
    [key: string]: string;
}

export interface DetailedProgressOptions {
    percent?: number;
    downloaded?: number;
    total?: number;
    speed?: number;
    eta?: number;
    style?: string;
}

export interface StepInfo {
    name: string;
    status: string;
    detail?: string;
}

export interface PlatformStyle {
    color: string;
    emoji: string;
    gradient: string[];
}
