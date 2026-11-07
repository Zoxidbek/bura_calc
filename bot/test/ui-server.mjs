// UI sinovi uchun: soxta Telegram + xotiradagi baza bilan serverni ishga tushiradi,
// namunaviy o'yinchi va o'yinlarni yaratadi, initData satrlarini faylga yozadi.
// Ishlatish: node test/ui-server.mjs <port> <chiqish.json>
import { writeFileSync, readFileSync } from 'node:fs';
import { startHarness, USERS, CODE } from './helpers.js';

const port = process.argv[2] || '8790';
const out = process.argv[3] || 'ui-users.json';
const h = await startHarness({ PORT: port });
const { admin, ali, vali, sardor, jasur } = USERS;

const all = [admin, ali, vali, sardor, jasur];
for (const u of all) await h.api({ ...u, allows: u !== jasur }, '/me');
await h.message(ali, '/start');
await h.message(vali, '/start');

async function finishGame(creator, teams, order) {
    let g = (await h.api(creator, '/games', { method: 'POST', body: { teams } })).body.game;
    for (const team of order) {
        for (let i = 0; i < 6; i++) {
            const r = await h.api(creator, `/games/${g.id}/score`, { method: 'POST', body: { team, delta: 2, v: g.version } });
            g = r.body.game;
            if (g.status !== 'live') return g;
        }
    }
    return g;
}

await finishGame(ali, [{ members: [{ tgId: ali.id }] }, { members: [{ tgId: vali.id }] }, { members: [{ tgId: sardor.id }] }], [1, 2]);
await finishGame(vali, [{ members: [{ tgId: vali.id }] }, { members: [{ tgId: sardor.id }, { name: 'Bobur' }] }], [1]);
await finishGame(sardor, [{ members: [{ tgId: ali.id }] }, { members: [{ tgId: jasur.id }] }, { members: [{ tgId: sardor.id }] }], [0, 2]);

// jonli o'yin: Vali ochgan, Ali va Jasur o'ynayapti
let live = (await h.api(vali, '/games', { method: 'POST', body: { teams: [{ members: [{ tgId: vali.id }] }, { members: [{ tgId: jasur.id }] }, { members: [{ name: 'Mehmon' }] }] } })).body.game;
for (const [team, times] of [[0, 2], [1, 3], [2, 1]]) {
    for (let i = 0; i < times; i++) live = (await h.api(vali, `/games/${live.id}/score`, { method: 'POST', body: { team, delta: 2, v: live.version } })).body.game;
}
await h.api(vali, `/games/${live.id}/suit`, { method: 'POST', body: { suit: 'spades' } });

// admin musiqa qo'shadi (botga audio yuborib)
await h.message(admin, '/admin');
await h.message(admin, CODE);
// Haqiqiy audio fayl (UI_AUDIO_FILE) bo'lsa — o'shani, bo'lmasa bo'sh buferni yuklaymiz
const audioBuf = process.env.UI_AUDIO_FILE ? readFileSync(process.env.UI_AUDIO_FILE) : Buffer.alloc(4096, 0);
h.tg.files.set('AUDIO_UI', { path: 'music/ui.mp3', buf: audioBuf });
await h.message(admin, null, { audio: { file_id: 'AUDIO_UI', file_unique_id: 'UQUI', duration: 30, title: "G'alaba qo'shig'i", performer: 'Guruh', mime_type: 'audio/mpeg', file_size: audioBuf.length } });
await h.message(admin, '0:05');            // bot so'raydi: qaysi soniyadan — 5-soniyadan
await h.api(admin, '/admin/lock', { method: 'POST' });

// 40 kundan beri kirmagan va o'ynamagan user — o'chirish tavsiyasi uchun
const bekzod = { id: 2005, first_name: 'Bekzod', username: 'bekzod' };
await h.api(bekzod, '/me');
await h.db.users.updateOne({ tgId: bekzod.id }, { $set: { lastSeenAt: new Date(Date.now() - 40 * 86400000) } });
h.srv.services.users.forget(bekzod.id);

const ids = {};
for (const [key, u] of Object.entries(USERS)) ids[key] = { id: u.id, initData: h.initDataFor({ ...u, allows: u !== jasur }) };
writeFileSync(out, JSON.stringify({ base: h.base, code: CODE, users: ids, liveGame: live.id }, null, 2));
console.log('UI-SERVER-READY', h.base);
