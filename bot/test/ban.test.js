import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startHarness, USERS, CODE, waitFor } from './helpers.js';

let h;
before(async () => {
    h = await startHarness();
    for (const u of Object.values(USERS)) await h.api(u, '/me');
    await h.message(USERS.ali, '/start');
    await h.message(USERS.vali, '/start');
    await h.api(USERS.admin, '/admin/unlock', { method: 'POST', body: { code: CODE } });
});
after(async () => { await h.close(); });

const { admin, ali, vali, sardor, jasur } = USERS;
const sent = () => h.tg.of('sendMessage');
const lastTo = id => sent().filter(c => c.params.chat_id === id).at(-1);
const lastEdit = () => h.tg.last('editMessageText');
const buttons = markup => (markup?.inline_keyboard || []).flat();

test("Mini App: vaqtincha ban — user to'xtaydi, xabar oladi, o'yinga qo'shilmaydi; muddatidan oldin ochiladi", async () => {
    assert.equal((await h.api(admin, `/admin/users/${admin.id}/ban`, { method: 'POST', body: { minutes: 60 } })).status, 400, "adminni bloklab bo'lmaydi");
    assert.equal((await h.api(ali, `/admin/users/${vali.id}/ban`, { method: 'POST', body: { minutes: 60 } })).status, 403, "oddiy user bloklay olmaydi");

    const before = sent().length;
    const r = await h.api(admin, `/admin/users/${vali.id}/ban`, { method: 'POST', body: { minutes: 120, reason: "o'yinni buzdi" } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.user.ban.reason, "o'yinni buzdi");
    const left = (new Date(r.body.user.ban.until) - Date.now()) / 60000;
    assert.ok(left > 118 && left <= 120, `muddat ~120 daqiqa: ${left}`);

    const note = await waitFor(() => sent().slice(before).find(c => c.params.chat_id === vali.id));
    assert.match(note.params.text, /Admin sizni vaqtincha blokladi/);
    assert.match(note.params.text, /Sabab: o'yinni buzdi/);

    const blocked = await h.api(vali, '/me');
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.code, 'banned');
    assert.equal(blocked.body.reason, "o'yinni buzdi");
    assert.equal((await h.api(vali, '/games')).status, 403);

    const pick = await h.api(ali, '/users?q=vali');
    assert.equal(pick.body.users[0].banned, true, "tanlash ro'yxatida bloklangan deb ko'rinadi");
    const add = await h.api(ali, '/games', { method: 'POST', body: { teams: [{ members: [{ tgId: ali.id }] }, { members: [{ tgId: vali.id }] }] } });
    assert.equal(add.status, 400);
    assert.match(add.body.error, /bloklangan/);

    const list = await h.api(admin, '/admin/users?kind=banned');
    assert.deepEqual(list.body.items.map(u => u.id), [vali.id]);
    assert.equal((await h.api(admin, '/admin/overview')).body.users.banned, 1);

    // bot ham javob bermaydi (bir daqiqada bitta ogohlantirish)
    h.tg.clear();
    await h.message(vali, '/stats');
    await h.message(vali, '/top');
    const toVali = sent().filter(c => c.params.chat_id === vali.id);
    assert.equal(toVali.length, 1);
    assert.match(toVali[0].params.text, /Siz vaqtincha bloklangansiz/);

    // muddatidan oldin ochish
    const un = await h.api(admin, `/admin/users/${vali.id}/unban`, { method: 'POST' });
    assert.equal(un.body.user.ban, null);
    await waitFor(() => sent().some(c => c.params.chat_id === vali.id && /blokdan chiqarildingiz/.test(c.params.text)));
    assert.equal((await h.api(vali, '/me')).status, 200);
});

test("Mini App: userni o'chirish va o'chirish tavsiyasi", async () => {
    // Jasur 40 kundan beri kirmagan va o'ynamagan
    await h.db.users.updateOne({ tgId: jasur.id }, { $set: { lastSeenAt: new Date(Date.now() - 40 * 86400000) } });
    h.srv.services.users.forget(jasur.id);
    const sug = await h.api(admin, '/admin/users?kind=suggest');
    assert.deepEqual(sug.body.items.map(u => u.id), [jasur.id]);
    assert.equal(sug.body.items[0].suggestDelete, true);

    assert.equal((await h.api(admin, `/admin/users/${admin.id}`, { method: 'DELETE' })).status, 400, "adminni o'chirib bo'lmaydi");
    assert.equal((await h.api(admin, `/admin/users/${jasur.id}`, { method: 'DELETE' })).status, 200);
    assert.equal(await h.db.users.countDocuments({ tgId: jasur.id }), 0);
    assert.equal((await h.api(admin, `/admin/users/${jasur.id}`, { method: 'DELETE' })).status, 404);
    // qaytib kirsa — yangi user sifatida yoziladi
    assert.equal((await h.api(jasur, '/me')).status, 200);
    assert.equal(await h.db.users.countDocuments({ tgId: jasur.id }), 1);
});

test('bot: admin menyusidan bloklash, boshqa muddat + sabab, blokdan chiqarish, o\'chirish', async () => {
    await h.message(admin, '/admin');
    await h.message(admin, CODE);

    await h.callback(admin, 'a:users:0');
    assert.ok(buttons(lastEdit().params.reply_markup).some(b => b.callback_data === 'a:users:0.b'), 'filtr tugmalari');

    await h.callback(admin, `a:user:${sardor.id}:0`);
    assert.ok(buttons(lastEdit().params.reply_markup).some(b => b.callback_data === `a:banmenu:${sardor.id}:0`));
    assert.ok(buttons(lastEdit().params.reply_markup).some(b => b.callback_data === `a:udel:${sardor.id}:0`));

    // admin kartasida ban/o'chirish tugmalari yo'q
    await h.callback(admin, `a:user:${admin.id}:0`);
    assert.ok(!buttons(lastEdit().params.reply_markup).some(b => /banmenu|udel/.test(b.callback_data)));
    await h.callback(admin, `a:ban:${admin.id}:60:0`);
    assert.match(h.tg.last('answerCallbackQuery').params.text, /Adminni bloklab bo'lmaydi/);

    await h.callback(admin, `a:banmenu:${sardor.id}:0`);
    assert.match(lastEdit().params.text, /qancha muddatga bloklansin/);
    assert.ok(buttons(lastEdit().params.reply_markup).some(b => b.callback_data === `a:ban:${sardor.id}:1440:0`));

    await h.callback(admin, `a:ban:${sardor.id}:1440:0`);
    assert.match(h.tg.last('answerCallbackQuery').params.text, /1 kunga bloklandi/);
    assert.match(lastEdit().params.text, /Bloklangan:/);
    assert.ok(buttons(lastEdit().params.reply_markup).some(b => b.callback_data === `a:unban:${sardor.id}:0`));
    assert.equal((await h.api(sardor, '/me')).status, 403);

    // boshqa muddat + sabab
    await h.callback(admin, `a:bancustom:${sardor.id}:0`);
    await h.message(admin, 'bilmadim');
    assert.match(lastTo(admin.id).params.text, /tushunmadim/);
    await h.message(admin, "3 kun — o'yinni buzdi");
    const u = await h.db.users.findOne({ tgId: sardor.id });
    const days = (u.ban.until - Date.now()) / 86400000;
    assert.ok(days > 2.99 && days <= 3, `3 kun: ${days}`);
    assert.equal(u.ban.reason, "o'yinni buzdi");

    await h.callback(admin, 'a:users:0.b');
    assert.match(lastEdit().params.text, /bloklanganlar/);
    assert.match(lastEdit().params.text, /Sardor/);

    await h.callback(admin, `a:unban:${sardor.id}:0.b`);
    assert.match(h.tg.last('answerCallbackQuery').params.text, /Blokdan chiqarildi/);
    assert.equal((await h.api(sardor, '/me')).status, 200);

    await h.callback(admin, `a:udel:${sardor.id}:0`);
    assert.match(lastEdit().params.text, /o'chirilsinmi/);
    await h.callback(admin, `a:udelok:${sardor.id}:0`);
    assert.equal(await h.db.users.countDocuments({ tgId: sardor.id }), 0);
    assert.match(h.tg.last('answerCallbackQuery').params.text, /o'chirildi/);
});
