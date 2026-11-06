import express from 'express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { webhookCallback } from 'grammy';
import { createApi } from './api.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, '..', 'public');
const sharedDir = path.join(here, '..', 'shared');

// Mini App Telegram ichida (web.telegram.org da iframe sifatida ham) ochiladi
const CSP = [
    "default-src 'self'",
    "script-src 'self' https://telegram.org",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "media-src 'self' blob:",
    "connect-src 'self'",
    "font-src 'self' data:",
    "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'"
].join('; ');

export function createApp({ config, services, adminGuard, bot }) {
    const app = express();
    app.disable('x-powered-by');
    app.set('trust proxy', 1);

    app.use((req, res, next) => {
        res.set({
            'Content-Security-Policy': CSP,
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'strict-origin-when-cross-origin',
            'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
        });
        next();
    });

    // Render "Health Check Path" uchun
    app.get('/health', async (req, res) => {
        try {
            await services.db.ping();
            res.json({ ok: true, version: config.version });
        } catch {
            res.status(503).json({ ok: false });
        }
    });

    if (bot) {
        app.post('/tg/webhook', express.json({ limit: '2mb' }), webhookCallback(bot, 'express', {
            secretToken: config.webhookSecret,
            onTimeout: 'return',
            timeoutMilliseconds: 9000
        }));
    }

    const getBotInfo = () => {
        try { return bot ? bot.botInfo : null; } catch { return null; }
    };
    app.use('/api', createApi({ services, adminGuard, config, getBotInfo }));

    const indexHtml = readFileSync(path.join(publicDir, 'index.html'), 'utf8').replaceAll('%VERSION%', config.version);
    app.get('/', (req, res) => res.type('html').set('Cache-Control', 'no-cache').send(indexHtml));

    // Yangi versiya chiqqanda Telegram eski fayllarni ko'rsatmasligi uchun: no-cache + ETag
    const staticOpts = { index: false, setHeaders: res => res.set('Cache-Control', 'no-cache') };
    app.use('/shared', express.static(sharedDir, staticOpts));
    app.use(express.static(publicDir, staticOpts));

    app.use((req, res) => res.status(404).type('text').send('Topilmadi'));
    return app;
}
