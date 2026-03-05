import type * as Sentry from '@sentry/node';

export interface SentryInitOptions {
    release?: string;
    tracesSampleRate?: number;
    tags?: Record<string, string>;
    [key: string]: unknown;
}

export interface SentryContext {
    user?: { id: string; tag?: string; username?: string };
    guild?: { id: string; name: string };
    command?: string;
    extra?: Record<string, unknown>;
    level?: Sentry.SeverityLevel;
    tags?: Record<string, string>;
}

export interface BreadcrumbData {
    category?: string;
    message: string;
    level?: Sentry.SeverityLevel;
    data?: Record<string, unknown>;
}
