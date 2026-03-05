export interface ProgressOptions {
    stage?: string;
    percent?: number;
    downloaded?: number;
    total?: number;
    speed?: number;
    eta?: number;
    method?: string;
}

export interface SuccessOptions {
    platformName?: string;
    platformId?: string;
    sizeMB?: number;
    format?: string;
    duration?: string | null;
    quality?: string | null;
    method?: string;
}
