import type { IncomingMessage, ServerResponse } from 'http';
import logger from '../observability/Logger.js';
import {
    getMetrics,
    getContentType,
    httpRequestDuration,
    httpRequestsTotal
} from '../observability/metrics.js';
import { runHealthChecks } from './checks.js';
import { buildDashboardHtml } from './dashboardPage.js';
import { buildDashboardData } from './snapshot.js';
import { healthState } from './state.js';

function getRequestPath(req: IncomingMessage): string {
    try {
        return new URL(req.url || '/', 'http://127.0.0.1').pathname;
    } catch {
        return (req.url || '/').split('?')[0] || '/';
    }
}

function recordRequestMetrics(method: string, path: string, statusCode: number, startedAt: number): void {
    httpRequestsTotal.inc({ method, path, status_code: String(statusCode) });
    httpRequestDuration.observe({ method, path }, (Date.now() - startedAt) / 1000);
}

function sendResponse(
    res: ServerResponse,
    method: string,
    path: string,
    startedAt: number,
    statusCode: number,
    body: string,
    contentType: string
): void {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-store');
    res.end(body);
    recordRequestMetrics(method, path, statusCode, startedAt);
}

export async function handleHealthRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const startedAt = Date.now();
    const method = req.method || 'GET';
    const path = getRequestPath(req);

    try {
        if (path === '/health' || path === '/healthz') {
            const health = await runHealthChecks();
            const statusCode = health.status === 'healthy' ? 200 : 503;
            sendResponse(res, method, path, startedAt, statusCode, JSON.stringify(health, null, 2), 'application/json');
            return;
        }

        if (path === '/ready' || path === '/readyz') {
            const status = healthState.status;
            const ready = status === 'healthy';
            sendResponse(res, method, path, startedAt, ready ? 200 : 503, JSON.stringify({ ready, status }), 'application/json');
            return;
        }

        if (path === '/live' || path === '/livez') {
            sendResponse(res, method, path, startedAt, 200, JSON.stringify({ alive: true }), 'application/json');
            return;
        }

        if (path === '/metrics') {
            const metrics = await getMetrics();
            sendResponse(res, method, path, startedAt, 200, metrics, getContentType());
            return;
        }

        if (path === '/' || path === '/dashboard') {
            sendResponse(res, method, path, startedAt, 200, buildDashboardHtml(), 'text/html; charset=utf-8');
            return;
        }

        if (path === '/dashboard.json' || path === '/stats') {
            const dashboard = await buildDashboardData();
            sendResponse(res, method, path, startedAt, 200, JSON.stringify(dashboard, null, 2), 'application/json');
            return;
        }

        sendResponse(res, method, path, startedAt, 404, JSON.stringify({ error: 'Not found' }), 'application/json');
    } catch (error) {
        const message = (error as Error).message;
        logger.error('Health', `Health server request failed for ${path}: ${message}`);
        sendResponse(res, method, path, startedAt, 500, JSON.stringify({ status: 'error', error: message }), 'application/json');
    }
}