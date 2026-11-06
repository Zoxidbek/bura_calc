import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startHarness, USERS, CODE, waitFor } from './helpers.js';

let h;
before(async () => { h = await startHarness(); });
after(async () => { await h.close(); });

const { admin, ali, vali, sardor, jasur } = USERS;

async function play(user, game, team, times, delta = 2) {
    let g = game;
    for (let i = 0; i < times; i++) {
        const r = await h.api(user, `/games/${g.id}/score`, { method: 'POST', body: { team, delta, v: g.version } });
        assert.equal(r.status, 200, JSON.stringify(r.body));
        g = r.body.game;
    }
    return g;
}

test('autentifikatsiya: initData siz va soxta initData rad etiladi', async () => {
    assert.equal((await h.api(null, '/me')).status, 401);
    const bad = await h.api(null, '/me', { headers: { authorization: 'tma user=%7B%22id%22%3A1%7D&auth_date=1&hash=' + 'a'.repeat(64) } });
    assert.equal(bad.status, 401);
    assert.match(bad.body.error, /qayta oching/);
    const health = await fetch(h.base + '/health').then(r => r.json());
    assert.equal(health.ok, true);
});

test("ro'yxatdan o'tish, o'yin yaratish, huquqlar, versiya ziddiyati", async () => {
    for (const u of [admin, ali, vali, sardor]) {
        const r = await h.api(u, '/me');
        assert.equal(r.status, 200);
        assert.equal(r.body.user.id, u.id);
    }
    // Ali va Vali botda /start bosgan — natijalar ularga boradi
    await h.message(ali, '/start');
    await h.message(vali, '/start');
    const me = await h.api(admin, '/me');
    assert.equal(me.body.isAdmin, true);
    assert.equal(me.body.adminUnlocked, false, "kodsiz admin panel yopiq");
    assert.equal(me.body.music.type, 'builtin');

    const users = await h.api(ali, '/users?q=val');
    assert.deepEqual(users.body.users.map(u => u.id), [vali.id]);

    // bir o'yinchi ikki komandada — xato
    const dup = await h.api(ali, '/games', { method: 'POST', body: { teams: [{ members: [{ tgId: ali.id }] }, { members: [{ tgId: ali.id }] }] } });
    assert.equal(dup.status, 400);
    // botni ochmagan odam — xato
    const unknown = await h.api(ali, '/games', { method: 'POST', body: { teams: [{ members: [{ tgId: 555 }] }, { members: [] }] } });
    assert.equal(unknown.status, 400);
    // 1 ta komanda — xato
    assert.equal((await h.api(ali, '/games', { method: 'POST', body: { teams: [{ members: [] }] } })).status, 400);

    const created = await h.api(ali, '/games', {
        method: 'POST',
        body: { teams: [{ members: [{ tgId: ali.id }] }, { members: [{ tgId: vali.id }, { name: 'Mehmon Bobur' }] }, { members: [] }] }
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    let game = created.body.game;
    assert.equal(game.teams.length, 3);
    assert.equal(game.teams[2].members[0].name, '3-komanda', "bo'sh komanda standart nom oladi");
    assert.equal(game.teams[1].members[1].id, null);
    assert.equal(game.canEdit, true);

    // ishtirokchi bo'lmagan Sardor faqat kuzatadi
    const view = await h.api(sardor, `/games/${game.id}`);
    assert.equal(view.body.game.canEdit, false);
    const denied = await h.api(sardor, `/games/${game.id}/score`, { method: 'POST', body: { team: 0, delta: 2, v: game.version } });
    assert.equal(denied.status, 403);

    // noto'g'ri delta
    assert.equal((await h.api(ali, `/games/${game.id}/score`, { method: 'POST', body: { team: 0, delta: 4 } })).status, 400);

    // 0 dan pastga tushmaydi
    const neg = await h.api(ali, `/games/${game.id}/score`, { method: 'POST', body: { team: 0, delta: -2, v: game.version } });
    assert.equal(neg.body.changed, false);

    game = await play(vali, game, 1, 1);           // ishtirokchi Vali ham o'zgartira oladi
    assert.equal(game.teams[1].score, 2);

    // eski versiya bilan yuborilgan bosish ikki marta sanalmaydi
    const stale = await h.api(ali, `/games/${game.id}/score`, { method: 'POST', body: { team: 0, delta: 2, v: game.version - 1 } });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.game.version, game.version);

    // polling: o'zgarmagan bo'lsa 204
    assert.equal((await h.api(sardor, `/games/${game.id}?since=${game.version}`)).status, 204);
    assert.equal((await h.api(sardor, `/games/${game.id}?since=${game.version - 1}`)).status, 200);

    // kozir
    const suit = await h.api(ali, `/games/${game.id}/suit`, { method: 'POST', body: { suit: 'hearts' } });
    assert.equal(suit.body.game.suit, 'hearts');
    assert.equal((await h.api(sardor, `/games/${game.id}/suit`, { method: 'POST', body: { suit: 'spades' } })).status, 403);
    game = suit.body.game;

    // feed: jonli o'yinlar ro'yxatida
    const feed = await h.api(sardor, '/games');
    assert.ok(feed.body.live.some(g => g.id === game.id));

    // o'yin oxirigacha: 3-komanda va Ali chiqadi → Vali + mehmon chempion
    game = await play(ali, game, 2, 6);
    assert.equal(game.teams[2].eliminated, true);
    const before = h.tg.of('sendMessage').length;
    let r;
    for (let i = 0; i < 6; i++) {
        r = await h.api(ali, `/games/${game.id}/score`, { method: 'POST', body: { team: 0, delta: 2, v: game.version } });
        game = r.body.game;
    }
    assert.equal(r.body.finished, true);
    assert.equal(game.status, 'finished');
    assert.equal(game.winner, 1);
    assert.equal(game.canEdit, false);
    assert.ok(game.log.length >= 13, "harakatlar tarixi yozilgan");

    // tugagan o'yinga ochko qo'shib bo'lmaydi
    assert.equal((await h.api(ali, `/games/${game.id}/score`, { method: 'POST', body: { team: 1, delta: 2 } })).status, 409);

    // statistika
    const sv = await h.api(vali, '/stats/me');
    assert.deepEqual([sv.body.user.stats.games, sv.body.user.stats.wins, sv.body.user.stats.losses], [1, 1, 0]);
    assert.equal(sv.body.user.rank, 1);
    const sa = await h.api(ali, '/stats/me');
    assert.deepEqual([sa.body.user.stats.games, sa.body.user.stats.wins, sa.body.user.stats.losses], [1, 0, 1]);
    assert.equal(sa.body.recent[0].id, game.id);

    // botni ishga tushirgan Ali va Valiga natija keldi
    const msgs = await waitFor(() => {
        const m = h.tg.of('sendMessage').slice(before).filter(c => [ali.id, vali.id].includes(c.params.chat_id));
        return m.length >= 2 ? m : null;
    });
    const toVali = msgs.find(m => m.params.chat_id === vali.id);
    const toAli = msgs.find(m => m.params.chat_id === ali.id);
    assert.match(toVali.params.text, /Siz chempionsiz/);
    assert.match(toAli.params.text, /omad kulib boqmadi/);
    assert.match(toAli.params.text, /Chempion: <b>Vali Karimov &amp; Mehmon Bobur<\/b>/);
    assert.equal(toAli.params.reply_markup.inline_keyboard[0][0].web_app.url, `https://bura.test/?game=${game.id}`);

    // reyting
    const rating = await h.api(sardor, '/rating');
    assert.deepEqual(rating.body.rows.map(x => x.id), [vali.id, ali.id]);
    assert.equal(rating.body.me.rank, null);

    // qayta o'ynash: shu o'yinchilar bilan yangi o'yin
    const re = await h.api(sardor, `/games/${game.id}/rematch`, { method: 'POST' });
    assert.equal(re.status, 201);
    assert.deepEqual(re.body.game.teams.map(t => t.members.map(m => m.name)), [['Ali'], ['Vali Karimov', 'Mehmon Bobur'], ['3-komanda']]);
    assert.equal(re.body.game.canEdit, true, "o'yinni ochgan (Sardor) o'zgartira oladi");

    // bekor qilish: faqat ochgan odam
    assert.equal((await h.api(ali, `/games/${re.body.game.id}/cancel`, { method: 'POST' })).status, 403);
    assert.equal((await h.api(sardor, `/games/${re.body.game.id}/cancel`, { method: 'POST' })).body.game.status, 'cancelled');
});

test('admin panel: kod bilan ochiladi, musiqa va statistika boshqaruvi', async () => {
    // oddiy foydalanuvchi
    assert.equal((await h.api(ali, '/admin/overview')).status, 403);
    assert.equal((await h.api(ali, '/admin/unlock', { method: 'POST', body: { code: CODE } })).status, 403, "kodni bilsa ham admin emas");
    // admin, lekin kodsiz
    assert.equal((await h.api(admin, '/admin/overview')).status, 423);
    const wrong = await h.api(admin, '/admin/unlock', { method: 'POST', body: { code: 'xato' } });
    assert.equal(wrong.status, 401);
    assert.equal(wrong.body.remaining, 4);
    const ok = await h.api(admin, '/admin/unlock', { method: 'POST', body: { code: CODE } });
    assert.equal(ok.status, 200);
    assert.equal((await h.api(admin, '/me')).body.adminUnlocked, true);

    const ov = await h.api(admin, '/admin/overview');
    assert.equal(ov.status, 200);
    assert.equal(ov.body.users.total, 4);
    assert.equal(ov.body.games.finished, 1);
    assert.equal(ov.body.top[0].id, vali.id);

    const us = await h.api(admin, '/admin/users?q=ali');
    assert.deepEqual(us.body.items.map(u => u.id).sort(), [ali.id, vali.id].sort(), "qidiruv: 'ali' Vali'da ham bor");
    const aliRow = us.body.items.find(u => u.id === ali.id);
    assert.equal(aliRow.canMessage, true);
    assert.equal(aliRow.rank, 2);

    const gl = await h.api(admin, '/admin/games?status=finished');
    assert.equal(gl.body.total, 1);

    // musiqa: botga audio yuboriladi (Mini App'siz)
    h.tg.files.set('AUDIO_1', { path: 'music/file_1.mp3', buf: Buffer.from('ID3' + 'x'.repeat(997)) });
    await h.message(admin, null, { audio: { file_id: 'AUDIO_1', file_unique_id: 'UQ1', duration: 180, title: 'Chempionlar', performer: 'Guruh', mime_type: 'audio/mpeg', file_size: 1000 } });
    let tracks = await h.api(admin, '/admin/tracks');
    assert.equal(tracks.body.items.length, 2);
    const track = tracks.body.items[1];
    assert.equal(track.title, 'Chempionlar');
    assert.equal(tracks.body.activeId, track.id, "botga yuklangan qo'shiq darhol faol bo'ladi");

    tracks = await h.api(admin, '/admin/tracks/active', { method: 'POST', body: { id: 'builtin' } });
    assert.equal(tracks.body.activeId, 'builtin');
    tracks = await h.api(admin, '/admin/tracks/active', { method: 'POST', body: { id: track.id } });
    assert.equal(tracks.body.activeId, track.id);
    const active = await h.api(ali, '/music/active');
    assert.equal(active.body.music.id, track.id);
    assert.equal(active.body.music.type, 'file');

    // fayl: to'liq va Range bilan (iPhone uchun)
    const full = await fetch(h.base + active.body.music.url);
    assert.equal(full.status, 200);
    assert.equal(full.headers.get('accept-ranges'), 'bytes');
    assert.equal((await full.arrayBuffer()).byteLength, 1000);
    const part = await fetch(h.base + active.body.music.url, { headers: { range: 'bytes=0-1' } });
    assert.equal(part.status, 206);
    assert.equal(part.headers.get('content-range'), 'bytes 0-1/1000');
    assert.equal(Buffer.from(await part.arrayBuffer()).toString(), 'ID');
    assert.equal((await fetch(h.base + active.body.music.url, { headers: { range: 'bytes=5000-' } })).status, 416);

    // boshlanish vaqti
    const bad = await h.api(admin, `/admin/tracks/${track.id}`, { method: 'PATCH', body: { startAt: 500 } });
    assert.equal(bad.status, 400, "musiqa uzunligidan katta");
    tracks = await h.api(admin, `/admin/tracks/${track.id}`, { method: 'PATCH', body: { startAt: 45, title: 'Yangi nom' } });
    assert.equal(tracks.body.items[1].startAt, 45);
    assert.equal(tracks.body.items[1].title, 'Yangi nom');

    // o'chirish → standart musiqa faol bo'ladi
    tracks = await h.api(admin, `/admin/tracks/${track.id}`, { method: 'DELETE' });
    assert.equal(tracks.body.activeId, 'builtin');
    assert.equal(tracks.body.items.length, 1);

    // o'yinni o'chirish statistikani qaytaradi
    const fin = gl.body.items[0];
    assert.equal((await h.api(admin, `/admin/games/${fin.id}`, { method: 'DELETE' })).status, 200);
    const sv = await h.api(vali, '/stats/me');
    assert.deepEqual([sv.body.user.stats.games, sv.body.user.stats.wins], [0, 0]);

    // yopish
    await h.api(admin, '/admin/lock', { method: 'POST' });
    assert.equal((await h.api(admin, '/admin/overview')).status, 423);
});

test('admin kodi: 5 marta xato — bloklanadi', async () => {
    let r;
    for (let i = 0; i < 5; i++) r = await h.api(admin, '/admin/unlock', { method: 'POST', body: { code: 'yo' + i } });
    assert.equal(r.status, 429);
    const blocked = await h.api(admin, '/admin/unlock', { method: 'POST', body: { code: CODE } });
    assert.equal(blocked.status, 429, "bloklangan vaqtda to'g'ri kod ham o'tmaydi");
    assert.equal(jasur.id, 2004);
});
