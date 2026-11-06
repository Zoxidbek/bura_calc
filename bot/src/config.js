import { existsSync } from 'node:fs';
import crypto from 'node:crypto';

/** Mahalliy .env (yoki Render "Secret File" sifatidagi .env) bo'lsa, uni yuklaydi. */
export function loadEnvFiles() {
    for (const file of ['.env', '/etc/secrets/.env']) {
        if (existsSync(file)) {
            try { process.loadEnvFile(file); } catch { /* buzilgan fayl — o'tkazib yuboramiz */ }
        }
    }
}

function int(value, fallback) {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : fallback;
}

/**
 * Muhit o'zgaruvchilaridan sozlamalarni yig'adi va tekshiradi.
 * Majburiylari: BOT_TOKEN, MONGODB_URI, ADMIN_IDS, ADMIN_CODE.
 */
export function loadConfig(env = process.env) {
    const missing = ['BOT_TOKEN', 'MONGODB_URI', 'ADMIN_IDS', 'ADMIN_CODE'].filter(k => !String(env[k] || '').trim());
    if (missing.length) {
        throw new Error(`.env da quyidagilar to'ldirilmagan: ${missing.join(', ')} (namuna: .env.example)`);
    }
    const adminIds = String(env.ADMIN_IDS).split(/[\s,;]+/).map(s => parseInt(s, 10)).filter(Number.isFinite);
    if (!adminIds.length) throw new Error("ADMIN_IDS noto'g'ri: Telegram ID raqam(lar)ini vergul bilan yozing");
    const adminCode = String(env.ADMIN_CODE).trim();
    if (adminCode.length < 4) throw new Error("ADMIN_CODE kamida 4 belgidan iborat bo'lishi kerak");

    const botToken = String(env.BOT_TOKEN).trim();
    const publicUrl = String(env.PUBLIC_URL || env.RENDER_EXTERNAL_URL || '').trim().replace(/\/+$/, '');
    const webhookSecret = String(env.WEBHOOK_SECRET || '').trim().replace(/[^A-Za-z0-9_-]/g, '')
        || crypto.createHash('sha256').update('webhook:' + botToken).digest('hex').slice(0, 40);

    return {
        botToken,
        mongoUri: String(env.MONGODB_URI).trim(),
        dbName: String(env.MONGODB_DB || 'bura').trim(),
        adminIds,
        adminCode,
        adminSessionHours: Math.max(1, int(env.ADMIN_SESSION_HOURS, 12)),
        publicUrl,
        webhookSecret,
        port: int(env.PORT, 3000),
        telegramApiRoot: String(env.TELEGRAM_API_ROOT || 'https://api.telegram.org').replace(/\/+$/, ''),
        initDataMaxAgeSec: int(env.INIT_DATA_MAX_AGE_SEC, 24 * 3600),
        version: String(env.RENDER_GIT_COMMIT || env.APP_VERSION || Date.now().toString(36)).slice(0, 12)
    };
}
