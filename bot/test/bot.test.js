import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startHarness, USERS, CODE, waitFor } from './helpers.js';

let h;
before(async () => { h = await startHarness(); });
after(async () => { await h.close(); });

const { admin, ali, vali, jasur } = USERS;
const sent = () => h.tg.of('sendMessage');
const lastTo = id => sent().filter(c => c.params.chat_id === id).at(-1);
const lastEdit = () => h.tg.last('editMessageText');
const buttons = markup => (markup?.inline_keyboard || []).flat();

test('webhook: maxfiy kalitsiz so\'rov rad etiladi, setWebhook va menyu tugmasi o\'rnatilgan', async () => {
    const res = await fetch(h.base + '/tg/webhook', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"update_id":1}' });
    assert.equal(res.status, 401);
    const wh = h.tg.last('setWebhook');
    assert.equal(wh.params.url, 'https://bura.test/tg/webhook');
    assert.equal(wh.params.secret_token, h.config.webhookSecret);
    const menu = h.tg.last('setChatMenuButton');
    assert.equal(menu.params.menu_button.web_app.url, 'https://bura.test/');
    assert.ok(h.tg.of('setMyCommands').some(c => c.params.scope?.chat_id === admin.id && c.params.commands.some(x => x.command === 'admin')));
});

test('/start: salom, Mini App tugmasi va tezkor tugmalar; statistika va reyting', async () => {
    await h.message(ali, '/start');
    const calls = sent().filter(c => c.params.chat_id === ali.id);
    assert.match(calls[0].params.text, /Assalomu alaykum, <b>Ali<\/b>/);
    assert.equal(buttons(calls[0].params.reply_markup)[0].web_app.url, 'https://bura.test/');
    assert.ok(calls[1].params.reply_markup.keyboard.flat().some(b => b.text === '📊 Statistikam'));
    assert.equal((await h.db.users.findOne({ tgId: ali.id })).canMessage, true);

    await h.message(ali, '📊 Statistikam');
    assert.match(lastTo(ali.id).params.text, /Sizning statistikangiz/);
    await h.message(ali, '/top');
    assert.match(lastTo(ali.id).params.text, /Reyting/);
    await h.message(ali, '/start game_0123456789abcdef01234567');
    assert.equal(buttons(lastTo(ali.id).params.reply_markup)[0].web_app.url, 'https://bura.test/?game=0123456789abcdef01234567');
});

test("oddiy foydalanuvchi admin panelga kira olmaydi va musiqa qo'sha olmaydi", async () => {
    await h.message(ali, '/admin');
    assert.match(lastTo(ali.id).params.text, /faqat admin/);
    await h.message(ali, null, { audio: { file_id: 'X', file_unique_id: 'X1', duration: 10, mime_type: 'audio/mpeg', file_size: 10 } });
    assert.match(lastTo(ali.id).params.text, /faqat admin/);
    await h.callback(ali, 'a:music');
    assert.match(h.tg.last('answerCallbackQuery').params.text, /Faqat admin/);
});

test('admin: kod so\'raladi, kod xabari o\'chiriladi, noto\'g\'ri va to\'g\'ri kod', async () => {
    await h.message(admin, '/start');
    await h.message(admin, '/admin');
    assert.match(lastTo(admin.id).params.text, /admin kodini yuboring/);
    assert.equal(lastTo(admin.id).params.reply_markup.force_reply, true);

    // kod kiritilmaguncha musiqa qo'shib bo'lmaydi
    await h.message(admin, null, { audio: { file_id: 'A0', file_unique_id: 'U0', duration: 5, mime_type: 'audio/mpeg', file_size: 5 } });
    assert.equal(await h.db.tracks.countDocuments({}), 0);

    const delBefore = h.tg.of('deleteMessage').length;
    await h.message(admin, 'notogri');
    assert.equal(h.tg.of('deleteMessage').length, delBefore + 1, "kod yozilgan xabar o'chirildi");
    assert.match(lastTo(admin.id).params.text, /Kod noto'g'ri\. Qolgan urinishlar: 4/);

    await h.message(admin, CODE);
    assert.equal(h.tg.of('deleteMessage').length, delBefore + 2);
    const menu = lastTo(admin.id);
    assert.match(menu.params.text, /Admin panel/);
    assert.ok(buttons(menu.params.reply_markup).some(b => b.callback_data === 'a:music'));
    assert.ok((await h.db.users.findOne({ tgId: admin.id })).adminUntil > new Date());
});

test("admin: botga audio yuborib musiqa qo'shish, tanlash, tinglash, vaqt va nom", async () => {
    h.tg.files.set('AUDIO_9', { path: 'music/f9.mp3', buf: Buffer.alloc(2048, 1) });
    await h.message(admin, null, { audio: { file_id: 'AUDIO_9', file_unique_id: 'UQ9', duration: 200, title: 'Galaba qoshigi', performer: 'Ijrochi', mime_type: 'audio/mpeg', file_size: 2048 } });
    const track = await h.db.tracks.findOne({ fileUniqueId: 'UQ9' });
    assert.ok(track, "musiqa bazaga yozildi");
    const id = String(track._id);

    // yuklangan zahoti: qaysi soniyadan boshlansin?
    const ask = lastTo(admin.id);
    assert.match(ask.params.text, /Musiqa qo'shildi/);
    assert.match(ask.params.text, /qaysi soniyadan boshlansin/);
    assert.match(ask.params.text, /Galaba qoshigi<\/b> · 3:20/);
    assert.ok(buttons(ask.params.reply_markup).some(b => b.callback_data === `a:tstart0:${id}`), "«Boshidan» tugmasi");
    await h.message(admin, '45 soniya');
    assert.equal((await h.db.tracks.findOne({ _id: track._id })).startAt, 45);
    const saved = sent().filter(c => c.params.chat_id === admin.id).slice(-2);
    assert.match(saved[0].params.text, /<b>0:45<\/b> dan boshlanadi/);
    const card = saved[1];
    assert.match(card.params.text, /Galaba qoshigi/);
    assert.match(card.params.text, /0:45 dan boshlanadi/);
    assert.ok(buttons(card.params.reply_markup).some(b => b.callback_data === `a:tact:${id}`));

    // musiqa uzunligidan katta vaqt — rad etiladi, so'rov davom etadi
    await h.callback(admin, `a:tstart:${id}`);
    assert.match(lastTo(admin.id).params.text, /hozir 0:45 dan/);
    await h.message(admin, '9:00');
    assert.match(lastTo(admin.id).params.text, /uzunligidan/);
    // «Boshidan» tugmasi
    await h.callback(admin, `a:tstart0:${id}`);
    assert.equal((await h.db.tracks.findOne({ _id: track._id })).startAt, 0);
    assert.match(h.tg.last('answerCallbackQuery').params.text, /boshidan/);
    assert.equal((await h.db.users.findOne({ tgId: admin.id })).pending, undefined, "kutish holati tozalandi");

    // takror yuborilsa — ikki marta qo'shilmaydi
    await h.message(admin, null, { audio: { file_id: 'AUDIO_9b', file_unique_id: 'UQ9', duration: 200, mime_type: 'audio/mpeg', file_size: 2048 } });
    assert.equal(await h.db.tracks.countDocuments({}), 1);

    // 20 MB dan katta — rad etiladi
    await h.message(admin, null, { audio: { file_id: 'BIG', file_unique_id: 'BIG', duration: 900, mime_type: 'audio/mpeg', file_size: 25 * 1024 * 1024 } });
    assert.match(lastTo(admin.id).params.text, /20 MB/);

    await h.callback(admin, 'a:music');
    assert.match(lastEdit().params.text, /G'olib musiqalari/);
    assert.match(lastEdit().params.text, /✅ 1\. <b>G'olib qahramon kelmoqda<\/b>/);

    await h.callback(admin, `a:tact:${id}`);
    assert.match(h.tg.last('answerCallbackQuery').params.text, /Faol musiqa/);
    const act = await h.api(ali, '/music/active');
    assert.equal(act.body.music.id, id);

    await h.callback(admin, `a:tplay:${id}`);
    assert.equal(h.tg.last('sendAudio').params.audio, 'AUDIO_9');

    await h.callback(admin, `a:tstart:${id}`);
    assert.match(lastTo(admin.id).params.text, /qaysi soniyadan boshlansin/);
    await h.message(admin, 'bir daqiqa');
    assert.match(lastTo(admin.id).params.text, /tushunmadim/);
    await h.message(admin, '1:05');
    assert.equal((await h.db.tracks.findOne({ _id: track._id })).startAt, 65);

    await h.callback(admin, `a:ttitle:${id}`);
    await h.message(admin, 'Chempionlar madhiyasi');
    assert.equal((await h.db.tracks.findOne({ _id: track._id })).title, 'Chempionlar madhiyasi');
    assert.match((await h.api(ali, '/music/active')).body.music.title, /madhiyasi/);
});

test("admin: foydalanuvchilar, statistika, o'yinlarni boshqarish", async () => {
    await h.api(vali, '/me');
    await h.callback(admin, 'a:users:0');
    assert.match(lastEdit().params.text, /Foydalanuvchilar/);
    await h.callback(admin, `a:user:${ali.id}:0`);
    assert.match(lastEdit().params.text, /Botni ishga tushirgan/);
    await h.callback(admin, 'a:stats');
    assert.match(lastEdit().params.text, /Umumiy statistika/);

    const g = (await h.api(ali, '/games', { method: 'POST', body: { teams: [{ members: [{ tgId: ali.id }] }, { members: [{ tgId: vali.id }] }] } })).body.game;
    await h.callback(admin, 'a:games');
    assert.match(lastEdit().params.text, /Jonli/);
    await h.callback(admin, `a:game:${g.id}`);
    assert.ok(buttons(lastEdit().params.reply_markup).some(b => b.callback_data === `a:gcancel:${g.id}`));
    await h.callback(admin, `a:gcancel:${g.id}`);
    assert.match(lastEdit().params.text, /bekor qilinsinmi/);
    await h.callback(admin, `a:gcancelok:${g.id}`);
    assert.equal((await h.api(ali, `/games/${g.id}`)).body.game.status, 'cancelled');
    await h.callback(admin, `a:gdelok:${g.id}`);
    assert.equal((await h.api(ali, `/games/${g.id}`)).status, 404);
});

test("musiqani o'chirish va admin rejimini yopish", async () => {
    const track = await h.db.tracks.findOne({});
    await h.callback(admin, `a:tdelok:${track._id}`);
    assert.equal(await h.db.tracks.countDocuments({}), 0);
    assert.equal((await h.api(ali, '/music/active')).body.music.type, 'builtin');

    await h.callback(admin, 'a:lock');
    assert.match(lastEdit().params.text, /yopildi/);
    await h.callback(admin, 'a:menu');
    assert.match(h.tg.last('answerCallbackQuery').params.text, /yopiq/);
    assert.match(lastTo(admin.id).params.text, /admin kodini yuboring/);
    await h.message(admin, '/cancel');
    assert.match(lastTo(admin.id).params.text, /Bekor qilindi/);
});

test("botni bloklagan o'yinchiga xabar yuborilmaydi; 403 bo'lsa belgi qo'yiladi", async () => {
    await h.message(jasur, '/start');
    await h.update({
        my_chat_member: {
            chat: { id: vali.id, type: 'private' }, from: { id: vali.id, is_bot: false, first_name: 'Vali' }, date: 1,
            old_chat_member: { status: 'member', user: { id: 999000, is_bot: true, first_name: 'Bura' } },
            new_chat_member: { status: 'kicked', user: { id: 999000, is_bot: true, first_name: 'Bura' }, until_date: 0 }
        }
    });
    assert.equal((await h.db.users.findOne({ tgId: vali.id })).canMessage, false);

    h.tg.blocked.add(jasur.id);         // Jasur botni bloklagan, lekin biz hali bilmaymiz
    let g = (await h.api(ali, '/games', { method: 'POST', body: { teams: [{ members: [{ tgId: ali.id }] }, { members: [{ tgId: vali.id }] }, { members: [{ tgId: jasur.id }] }] } })).body.game;
    const before = sent().length;
    for (const team of [1, 2]) {
        for (let i = 0; i < 6; i++) {
            g = (await h.api(ali, `/games/${g.id}/score`, { method: 'POST', body: { team, delta: 2, v: g.version } })).body.game;
        }
    }
    assert.equal(g.status, 'finished');
    await waitFor(() => sent().slice(before).some(c => c.params.chat_id === ali.id));
    await waitFor(async () => (await h.db.users.findOne({ tgId: jasur.id })).canMessage === false);
    const recipients = sent().slice(before).map(c => c.params.chat_id);
    assert.ok(!recipients.includes(vali.id), "bloklagan Valiga yuborilmadi");
    assert.match(lastTo(ali.id).params.text, /Siz chempionsiz/);
});
