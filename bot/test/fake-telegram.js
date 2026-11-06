// Soxta Telegram Bot API serveri: bot qilgan har bir chaqiruvni yozib boradi.
import http from 'node:http';

export async function startFakeTelegram({ token }) {
    const calls = [];
    const blocked = new Set();
    const files = new Map();             // file_id → { path, buf }
    let messageId = 100;

    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://local');
        const send = (code, obj, type = 'application/json') => {
            res.statusCode = code;
            res.setHeader('content-type', type);
            res.end(type === 'application/json' ? JSON.stringify(obj) : obj);
        };

        const filePrefix = `/file/bot${token}/`;
        if (url.pathname.startsWith(filePrefix)) {
            const p = decodeURIComponent(url.pathname.slice(filePrefix.length));
            const f = [...files.values()].find(x => x.path === p);
            return f ? send(200, f.buf, 'audio/mpeg') : send(404, { ok: false });
        }

        const m = new RegExp(`^/bot${token}/(\\w+)$`).exec(url.pathname);
        if (!m) return send(404, { ok: false, error_code: 404, description: 'Not Found' });

        const chunks = [];
        for await (const c of req) chunks.push(c);
        let params = {};
        const raw = Buffer.concat(chunks).toString('utf8');
        if (raw && /json/.test(req.headers['content-type'] || '')) params = JSON.parse(raw);
        const method = m[1];
        calls.push({ method, params });

        const ok = result => send(200, { ok: true, result });
        const fail = (code, description) => send(200, { ok: false, error_code: code, description });
        const date = Math.floor(Date.now() / 1000);

        switch (method) {
            case 'getMe':
                return ok({ id: 999000, is_bot: true, first_name: 'Bura', username: 'bura_test_bot', can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false });
            case 'sendMessage':
            case 'sendAudio':
            case 'sendVoice':
            case 'sendDocument':
                if (blocked.has(Number(params.chat_id))) return fail(403, 'Forbidden: bot was blocked by the user');
                return ok({ message_id: ++messageId, date, chat: { id: Number(params.chat_id), type: 'private' }, text: params.text });
            case 'editMessageText':
                return ok({ message_id: params.message_id, date, chat: { id: Number(params.chat_id), type: 'private' }, text: params.text });
            case 'getFile': {
                const f = files.get(params.file_id);
                if (!f) return fail(400, 'Bad Request: invalid file_id');
                return ok({ file_id: params.file_id, file_unique_id: 'uniq', file_size: f.buf.length, file_path: f.path });
            }
            default:
                return ok(true);
        }
    });

    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    return {
        url: `http://127.0.0.1:${port}`,
        calls,
        blocked,
        files,
        of: method => calls.filter(c => c.method === method),
        last: method => calls.filter(c => c.method === method).at(-1),
        clear: () => { calls.length = 0; },
        close: () => new Promise(resolve => server.close(resolve))
    };
}
