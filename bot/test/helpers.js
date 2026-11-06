import { createFakeDb } from './fake-db.js';
import { startFakeTelegram } from './fake-telegram.js';
import { startServer } from '../src/server.js';
import { loadConfig } from '../src/config.js';
import { signInitData } from '../src/auth.js';

export const TOKEN = '123456:TEST_TOKEN_abcdefghijklmnopqrstuvwxyz';
export const ADMIN_ID = 1001;
export const CODE = 'sir-kod-2026';

export const USERS = {
    admin: { id: ADMIN_ID, first_name: 'Zohid', username: 'zohid' },
    ali: { id: 2001, first_name: 'Ali', username: 'ali' },
    vali: { id: 2002, first_name: 'Vali', last_name: 'Karimov', username: 'vali' },
    sardor: { id: 2003, first_name: 'Sardor' },
    jasur: { id: 2004, first_name: 'Jasur', username: 'jasur' }
};

export async function waitFor(check, { timeout = 3000, step = 25 } = {}) {
    const end = Date.now() + timeout;
    for (;;) {
        const v = await check();
        if (v) return v;
        if (Date.now() > end) throw new Error('waitFor: kutish vaqti tugadi');
        await new Promise(r => setTimeout(r, step));
    }
}

export async function startHarness(env = {}) {
    const tg = await startFakeTelegram({ token: TOKEN });
    const db = createFakeDb();
    const config = loadConfig({
        BOT_TOKEN: TOKEN,
        MONGODB_URI: 'mongodb://fake',
        ADMIN_IDS: String(ADMIN_ID),
        ADMIN_CODE: CODE,
        PUBLIC_URL: 'https://bura.test',
        PORT: '0',
        TELEGRAM_API_ROOT: tg.url,
        APP_VERSION: 'test',
        ...env
    });
    const srv = await startServer({ config, db });
    const base = `http://127.0.0.1:${srv.server.address().port}`;

    function initDataFor(user, extra = {}) {
        return signInitData({
            auth_date: String(Math.floor(Date.now() / 1000)),
            query_id: 'AAHtest',
            user: {
                id: user.id,
                first_name: user.first_name,
                last_name: user.last_name || '',
                username: user.username,
                language_code: 'uz',
                allows_write_to_pm: user.allows ?? false,
                ...(user.photo_url ? { photo_url: user.photo_url } : {})
            },
            ...extra
        }, TOKEN);
    }

    async function api(user, path, { method = 'GET', body, headers = {} } = {}) {
        const res = await fetch(base + '/api' + path, {
            method,
            headers: {
                ...(user ? { authorization: 'tma ' + initDataFor(user) } : {}),
                ...(body ? { 'content-type': 'application/json' } : {}),
                ...headers
            },
            body: body ? JSON.stringify(body) : undefined
        });
        const text = await res.text();
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch { json = text; }
        return { status: res.status, body: json, headers: res.headers };
    }

    let updateId = 1;
    let msgId = 1;
    async function update(u) {
        const res = await fetch(base + '/tg/webhook', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': config.webhookSecret },
            body: JSON.stringify({ update_id: updateId++, ...u })
        });
        return res.status;
    }

    const date = () => Math.floor(Date.now() / 1000);
    const from = user => ({ id: user.id, is_bot: false, first_name: user.first_name, ...(user.last_name ? { last_name: user.last_name } : {}), ...(user.username ? { username: user.username } : {}) });

    function message(user, text, extra = {}) {
        const cmd = text && text.startsWith('/') ? [{ type: 'bot_command', offset: 0, length: text.split(' ')[0].length }] : undefined;
        return update({
            message: {
                message_id: msgId++, date: date(),
                chat: { id: user.id, type: 'private', first_name: user.first_name },
                from: from(user),
                ...(text !== null ? { text } : {}),
                ...(cmd ? { entities: cmd } : {}),
                ...extra
            }
        });
    }

    function callback(user, data, messageId = 777) {
        return update({
            callback_query: {
                id: 'cb' + updateId, from: from(user), chat_instance: 'ci', data,
                message: { message_id: messageId, date: date(), chat: { id: user.id, type: 'private' }, text: 'eski', from: { id: 999000, is_bot: true, first_name: 'Bura' } }
            }
        });
    }

    async function close() {
        await srv.stop();
        await tg.close();
    }

    return { tg, db, config, srv, base, api, update, message, callback, initDataFor, close };
}
