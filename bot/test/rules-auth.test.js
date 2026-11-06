import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyScore, findWinner } from '../shared/rules.js';
import { validateInitData, signInitData, createAdminGuard } from '../src/auth.js';
import { parseTimeInput, formatDuration } from '../src/util.js';
import { loadConfig } from '../src/config.js';

const t3 = () => [0, 0, 0].map(score => ({ score, eliminated: false }));

test("qoidalar: +2/−2, manfiy bo'lmaydi, 12 da chiqadi, oxirgisi g'olib", () => {
    let r = applyScore(t3(), 0, -2);
    assert.equal(r.changed, false, "0 dan pastga tushmaydi");
    r = applyScore(t3(), 1, 2);
    assert.equal(r.teams[1].score, 2);
    let teams = t3();
    for (let i = 0; i < 6; i++) teams = applyScore(teams, 0, 2).teams;
    assert.equal(teams[0].score, 12);
    assert.equal(teams[0].eliminated, true);
    assert.equal(applyScore(teams, 0, -2).changed, false, "chiqqan komandaga tegilmaydi");
    assert.equal(findWinner(teams), null, "ikki komanda qolganda g'olib yo'q");
    let last;
    for (let i = 0; i < 6; i++) {
        last = applyScore(teams, 1, 2);
        teams = last.teams;
    }
    assert.equal(last.eliminated, true);
    assert.equal(last.winner, 2, "faqat 3-komanda qoldi — u g'olib");
    const input = t3();
    applyScore(input, 0, 2);
    assert.equal(input[0].score, 0, "kiruvchi massiv o'zgarmaydi");
});

test('initData: to\'g\'ri imzo qabul qilinadi, soxtasi va eskirgani rad etiladi', () => {
    const token = '42:ABC';
    const now = Math.floor(Date.now() / 1000);
    const data = signInitData({ auth_date: String(now), user: { id: 7, first_name: 'Ali' } }, token);
    assert.equal(validateInitData(data, token).user.id, 7);
    assert.equal(validateInitData(data, '42:OTHER'), null, 'boshqa token');
    assert.equal(validateInitData(data.replace('Ali', 'Vali'), token), null, "o'zgartirilgan ma'lumot");
    const old = signInitData({ auth_date: String(now - 90000), user: { id: 7, first_name: 'Ali' } }, token);
    assert.equal(validateInitData(old, token, 86400), null, 'eskirgan');
    assert.equal(validateInitData('', token), null);
    assert.equal(validateInitData('hash=zz', token), null);
});

test('initData: Telegram rasmiy namunasi bilan mos (signature maydoni ham imzoga kiradi)', () => {
    const token = '5768337691:AAH5YkoiEuPk8-FZa32hStHTqXiLPtAEhx8';
    const fields = {
        auth_date: String(Math.floor(Date.now() / 1000)),
        signature: 'abc',
        user: { id: 279058397, first_name: 'Vladislav', username: 'vdkfrost', allows_write_to_pm: true }
    };
    const data = signInitData(fields, token);
    assert.ok(validateInitData(data, token));
    const withoutSig = new URLSearchParams(data);
    withoutSig.delete('signature');
    assert.equal(validateInitData(withoutSig.toString(), token), null);
});

test('admin kodi: to\'g\'ri/noto\'g\'ri, 5 urinishdan keyin bloklanadi', () => {
    const g = createAdminGuard({ adminIds: [1], adminCode: 'secret', adminSessionHours: 12 });
    assert.equal(g.isAdminId(1), true);
    assert.equal(g.isAdminId(2), false);
    assert.equal(g.checkCode(1, ' secret ').ok, true);
    for (let i = 0; i < 4; i++) assert.equal(g.checkCode(1, 'x').locked, false);
    const last = g.checkCode(1, 'x');
    assert.equal(last.locked, true);
    assert.equal(g.checkCode(1, 'secret').ok, false, "bloklanganda to'g'ri kod ham o'tmaydi");
    assert.equal(g.isUnlocked({ tgId: 1, adminUntil: new Date(Date.now() + 1000) }), true);
    assert.equal(g.isUnlocked({ tgId: 1, adminUntil: new Date(Date.now() - 1000) }), false);
    assert.equal(g.isUnlocked({ tgId: 2, adminUntil: new Date(Date.now() + 1000) }), false);
});

test('yordamchilar va sozlamalar', () => {
    assert.equal(parseTimeInput('45'), 45);
    assert.equal(parseTimeInput('1:05'), 65);
    assert.equal(parseTimeInput('1:75'), null);
    assert.equal(parseTimeInput('abc'), null);
    assert.equal(formatDuration(125), '2:05');
    assert.throws(() => loadConfig({}), /BOT_TOKEN/);
    const c = loadConfig({ BOT_TOKEN: 't', MONGODB_URI: 'm', ADMIN_IDS: '1, 2', ADMIN_CODE: '1234', RENDER_EXTERNAL_URL: 'https://x.onrender.com/' });
    assert.deepEqual(c.adminIds, [1, 2]);
    assert.equal(c.publicUrl, 'https://x.onrender.com');
    assert.match(c.webhookSecret, /^[a-f0-9]{40}$/);
});
