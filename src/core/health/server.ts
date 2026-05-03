import * as http from 'http';
import type { Server } from 'http';
import logger from '../observability/Logger.js';
import { handleHealthRequest } from './routes.js';

export function startHealthServer(port: number = 3000): Server {
    const server = http.createServer((req, res) => {
        void handleHealthRequest(req, res);
    });

    server.listen(port, () => {
        logger.info('Health', `Health check server listening on port ${port}`);
    });

    server.on('error', (error: Error) => {
        logger.error('Health', `Health server error: ${error.message}`);
    });

    return server;
}