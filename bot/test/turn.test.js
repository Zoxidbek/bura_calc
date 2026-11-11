import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startHarness, USERS, CODE } from './helpers.js';

let h;
before(async () => {
    h = await startHarness();
    for (const u of Object.values(USERS)) await h.api(u, '/me');
    await h.api(USERS.admin, '/admin/unlock', { method: 'POST', body: { code: CODE } });
});
after(async () => { await h.close(); });

const { admin, ali, vali, sardor, jasur } = USERS;

async function newGame(creator, teams) {
    const r = await h.api(creator, '/games', { method: 'POST', body: { teams } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    return r.body.game;
}

async function addPoints(user, game, team, times) {
    let g = game;
    for (let i = 0; i < times; i++) {
        const r = await h.api(user, `/games/${g.id}/score`, { method: 'POST', body: { team, delta: 2, v: g.version } });
        assert.equal(r.status, 200, JSON.stringify(r.body));
        g = r.body.game;
    }
    return g;
}

const pick = (user, id, mode = 'wheel') => h.api(user, `/games/${id}/turn`, { method: 'POST', body: { mode } });

test("Kim yuradi: server tasodifiy tanlaydi, natija, versiya va tarix hammaga bir xil", async () => {
    const g0 = await newGame(ali, [{ members: [{ tgId: ali.id }] }, { members: [{ tgId: vali.id }] }, { members: [{ tgId: sardor.id }] }]);
    assert.equal(g0.turn, null, "yangi o'yinda hali tanlov yo'q");

    const r = await pick(ali, g0.id, 'wheel');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const { turn } = r.body.game;
    assert.ok([0, 1, 2].includes(turn.team));
    assert.equal(turn.mode, 'wheel');
    assert.equal(turn.seq, 1);
    assert.equal(turn.byName, 'Ali');
    assert.equal(turn.sum, 0, "tanlov paytidagi ochkolar yig'indisi");
    assert.equal(r.body.game.version, g0.version + 1, "boshqa telefonlar o'zgarishni ko'rishi uchun versiya oshadi");
    assert.deepEqual(r.body.game.log[0], { kind: 'turn', at: r.body.game.log[0].at, byName: 'Ali', team: turn.team, mode: 'wheel' });

    // kuzatuvchi (o'yinda yo'q) ham xuddi shu natijani ko'radi, lekin o'zi tanlay olmaydi
    const seen = await h.api(jasur, `/games/${g0.id}`);
    assert.deepEqual(seen.body.game.turn, turn);
    assert.equal((await pick(jasur, g0.id)).status, 403);

    // ishtirokchi (ochmagan) va kod bilan kirgan admin tanlay oladi; seq oshib boradi
    const r2 = await pick(vali, g0.id, 'quick');
    assert.equal(r2.status, 200);
    assert.equal(r2.body.game.turn.seq, 2);
    assert.equal(r2.body.game.turn.mode, 'quick');
    const r3 = await pick(admin, g0.id);
    assert.equal(r3.status, 200);
    assert.equal(r3.body.game.turn.seq, 3);

    // eski versiya bilan ochko bosilsa — 409 (ikki marta sanalmaydi); yangi versiya bilan — ishlaydi
    const stale = await h.api(ali, `/games/${g0.id}/score`, { method: 'POST', body: { team: 0, delta: 2, v: g0.version } });
    assert.equal(stale.status, 409);
    const fresh = await h.api(ali, `/games/${g0.id}/score`, { method: 'POST', body: { team: 0, delta: 2, v: r3.body.game.version } });
    assert.equal(fresh.status, 200);
    assert.equal(fresh.body.game.turn.sum, 0, "tanlov o'zgarmaydi — ochko o'zgargani uchun Mini App uni eskirgan deb ko'radi");
    assert.equal(fresh.body.game.log[0].kind, 'score');
    assert.equal(fresh.body.game.log[1].kind, 'turn');

    assert.equal((await pick(ali, g0.id, 'dice')).status, 400, "noma'lum usul");
    assert.equal((await h.api(ali, '/games/000000000000000000000000/turn', { method: 'POST', body: { mode: 'quick' } })).status, 404);
});

test("Kim yuradi: faqat chiqib ketmagan komandalar tanlanadi va hammasi tasodifan chiqadi", async () => {
    let g = await newGame(sardor, [{ members: [{ tgId: sardor.id }] }, { members: [{ name: 'Bobur' }] }, { members: [{ name: 'Karim' }] }, { members: [{ name: 'Olim' }] }]);
    g = await addPoints(sardor, g, 3, 6);                  // 4-komanda 12 ga yetdi — chiqdi
    assert.equal(g.teams[3].eliminated, true);

    const counts = [0, 0, 0, 0];
    for (let i = 0; i < 90; i++) {
        const r = await pick(sardor, g.id, i % 2 ? 'quick' : 'wheel');
        assert.equal(r.status, 200);
        counts[r.body.game.turn.team]++;
    }
    assert.equal(counts[3], 0, "chiqib ketgan komanda hech qachon tanlanmaydi");
    for (const i of [0, 1, 2]) assert.ok(counts[i] > 0, `${i}-komanda ham chiqadi: ${counts}`);
    assert.equal(counts[0] + counts[1] + counts[2], 90);
});

test("Kim yuradi: tugagan yoki bekor qilingan o'yinda tanlab bo'lmaydi", async () => {
    let g = await newGame(vali, [{ members: [{ tgId: vali.id }] }, { members: [{ tgId: jasur.id }] }]);
    g = await addPoints(vali, g, 1, 6);
    assert.equal(g.status, 'finished');
    const done = await pick(vali, g.id);
    assert.equal(done.status, 409);
    assert.match(done.body.error, /tugagan/);

    const c = await newGame(vali, [{ members: [{ tgId: vali.id }] }, { members: [{ name: 'Mehmon' }] }]);
    assert.equal((await h.api(vali, `/games/${c.id}/cancel`, { method: 'POST' })).status, 200);
    const off = await pick(vali, c.id);
    assert.equal(off.status, 409);
    assert.match(off.body.error, /bekor/);
});
