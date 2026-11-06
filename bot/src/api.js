import express from 'express';
import { z } from 'zod';
import { validateInitData } from './auth.js';
import { HttpError, formatWhen } from './util.js';

const member = z.union([
    z.object({ tgId: z.number().int().positive() }).strict(),
    z.object({ name: z.string().trim().min(1).max(24) }).strict()
]);
const schemas = {
    createGame: z.object({ teams: z.array(z.object({ members: z.array(member).max(3) })).min(2).max(6) }),
    score: z.object({ team: z.number().int().min(0).max(5), delta: z.union([z.literal(2), z.literal(-2)]), v: z.number().int().positive().optional() }),
    suit: z.object({ suit: z.enum(['clubs', 'hearts', 'spades', 'diamonds']).nullable() }),
    code: z.object({ code: z.string().max(200) }),
    trackPatch: z.object({ title: z.string().trim().min(1).max(80).optional(), startAt: z.number().int().min(0).max(36000).optional() }),
    ban: z.object({ minutes: z.number().int().min(1).max(525600), reason: z.string().trim().max(200).optional() }),
    active: z.object({ id: z.string().min(1).max(40) })
};

function page(query, maxLimit = 50) {
    const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || 20));
    const skip = Math.max(0, parseInt(query.skip, 10) || 0);
    return { limit, skip };
}

/**
 * Mini App uchun REST API. Har bir so'rov Telegram initData bilan imzolanadi:
 *   Authorization: tma <initData>
 * Admin bo'limi: ADMIN_IDS + .env dagi ADMIN_CODE bilan ochilgan sessiya (bot bilan umumiy).
 */
export function createApi({ services, adminGuard, config, getBotInfo }) {
    const { users, games, music, notifier } = services;
    const r = express.Router();
    r.use(express.json({ limit: '32kb' }));

    const pub = req => g => games.toPublic(g, req.me.tgId, req.adminUnlocked);
    const full = (req, g) => games.toPublic(g, req.me.tgId, req.adminUnlocked, { withLog: true });

    // --- Ochiq (imzosiz) yo'llar ---
    r.get('/config', (req, res) => {
        res.json({ bot: getBotInfo()?.username || null, version: config.version });
    });

    // <audio> sarlavha yubora olmaydi — fayl ochiq, lekin faqat mavjud musiqa uchun
    r.get('/music/:id/file', async (req, res) => {
        await music.serveFile(req, res, req.params.id);
    });

    // --- Telegram initData tekshiruvi ---
    r.use(async (req, res, next) => {
        const m = /^tma\s+(.+)$/i.exec(req.get('authorization') || '');
        const data = m ? validateInitData(m[1], config.botToken, config.initDataMaxAgeSec) : null;
        if (!data) throw new HttpError(401, "Sessiya eskirgan — Mini App'ni yopib, qayta oching");
        req.me = await users.touch(data.user, {
            photoUrl: data.user.photo_url || null,
            canMessage: data.user.allows_write_to_pm === true
        });
        req.startParam = data.startParam;
        req.isAdmin = adminGuard.isAdminId(req.me.tgId);
        req.adminUnlocked = adminGuard.isUnlocked(req.me);
        const ban = users.banInfo(req.me);
        if (ban && !req.isAdmin) {
            throw new HttpError(403, `Siz ${formatWhen(ban.until)} gacha bloklangansiz`, { code: 'banned', until: ban.until, reason: ban.reason });
        }
        next();
    });

    r.get('/me', async (req, res) => {
        const rows = await users.ranking();
        const rank = users.rankFrom(rows, req.me.tgId);
        res.json({
            user: users.toPublic(req.me, rank),
            rankTotal: rank.total,
            isAdmin: req.isAdmin,
            adminUnlocked: req.adminUnlocked,
            adminUntil: req.adminUnlocked ? req.me.adminUntil : null,
            music: await music.publicActive(),
            startParam: req.startParam,
            canMessage: !!req.me.canMessage,
            bot: getBotInfo()?.username || null
        });
    });

    // Mini App ichida "Xabar yuborishga ruxsat" berilgach (requestWriteAccess)
    r.post('/me/can-message', async (req, res) => {
        await users.setCanMessage(req.me.tgId, true);
        res.json({ ok: true });
    });

    r.get('/users', async (req, res) => {
        const list = await users.search(req.query.q, 50);
        res.json({ users: list.map(u => users.toPublic(u)) });
    });

    r.get('/games', async (req, res) => {
        let before = null;
        if (req.query.before) {
            before = new Date(String(req.query.before));
            if (Number.isNaN(before.getTime())) throw new HttpError(400, "Sana noto'g'ri");
        }
        const f = await games.feed({ before });
        res.json({
            live: f.live.map(pub(req)),
            finished: f.finished.map(pub(req)),
            hasMore: f.hasMore,
            nextBefore: f.finished.length ? f.finished[f.finished.length - 1].finishedAt : null
        });
    });

    r.post('/games', async (req, res) => {
        const body = schemas.createGame.parse(req.body);
        const game = await games.create({ creator: req.me, teams: body.teams });
        res.status(201).json({ game: full(req, game) });
    });

    r.get('/games/:id', async (req, res) => {
        const game = await games.get(req.params.id);
        const since = parseInt(req.query.since, 10);
        if (Number.isInteger(since) && since === game.version) return res.status(204).end();
        res.json({ game: full(req, game) });
    });

    r.post('/games/:id/score', async (req, res) => {
        const b = schemas.score.parse(req.body);
        const out = await games.score({
            id: req.params.id, team: b.team, delta: b.delta, actor: req.me,
            expectedVersion: b.v, adminUnlocked: req.adminUnlocked
        });
        res.json({ game: full(req, out.game), changed: out.changed, finished: out.finished });
    });

    r.post('/games/:id/suit', async (req, res) => {
        const { suit } = schemas.suit.parse(req.body);
        const game = await games.setSuit({ id: req.params.id, suit, actor: req.me, adminUnlocked: req.adminUnlocked });
        res.json({ game: full(req, game) });
    });

    r.post('/games/:id/cancel', async (req, res) => {
        const game = await games.cancel({ id: req.params.id, actor: req.me, adminUnlocked: req.adminUnlocked });
        res.json({ game: full(req, game) });
    });

    r.post('/games/:id/rematch', async (req, res) => {
        const game = await games.rematch({ id: req.params.id, actor: req.me });
        res.status(201).json({ game: full(req, game) });
    });

    r.get('/rating', async (req, res) => {
        const rows = await users.ranking();
        res.json({
            rows: rows.slice(0, 100).map(({ user, rank }) => users.toPublic(user, { rank })),
            me: users.rankFrom(rows, req.me.tgId)
        });
    });

    r.get('/stats/me', async (req, res) => {
        const [rows, mine, me] = await Promise.all([users.ranking(), games.forPlayer(req.me.tgId), users.get(req.me.tgId)]);
        const rank = users.rankFrom(rows, req.me.tgId);
        res.json({
            user: users.toPublic(me || req.me, rank),
            rankTotal: rank.total,
            recent: mine.recent.map(pub(req)),
            open: mine.open.map(pub(req))
        });
    });

    r.get('/music/active', async (req, res) => {
        res.json({ music: await music.publicActive() });
    });

    // --- Admin ---
    r.post('/admin/unlock', async (req, res) => {
        if (!req.isAdmin) throw new HttpError(403, 'Admin panel faqat admin uchun');
        const { code } = schemas.code.parse(req.body);
        const result = adminGuard.checkCode(req.me.tgId, code);
        if (!result.ok) {
            throw new HttpError(result.locked ? 429 : 401,
                result.locked
                    ? `Juda ko'p noto'g'ri urinish. ${Math.ceil(result.retryAfterSec / 60)} daqiqadan keyin qayta urinib ko'ring`
                    : `Kod noto'g'ri. Qolgan urinishlar: ${result.remaining}`,
                { remaining: result.remaining, retryAfterSec: result.retryAfterSec });
        }
        const until = adminGuard.sessionUntil();
        await users.setAdminUntil(req.me.tgId, until);
        res.json({ ok: true, until });
    });

    r.post('/admin/lock', async (req, res) => {
        if (!req.isAdmin) throw new HttpError(403, 'Admin panel faqat admin uchun');
        await users.setAdminUntil(req.me.tgId, null);
        res.json({ ok: true });
    });

    r.use('/admin', (req, res, next) => {
        if (!req.isAdmin) throw new HttpError(403, 'Admin panel faqat admin uchun');
        if (!req.adminUnlocked) throw new HttpError(423, 'Admin panel yopiq — kodni kiriting');
        next();
    });

    r.get('/admin/overview', async (req, res) => {
        const [u, g, rows, track] = await Promise.all([users.counts(), games.counts(), users.ranking(), music.publicActive()]);
        res.json({
            users: u,
            games: g,
            top: rows.slice(0, 5).map(({ user, rank }) => users.toPublic(user, { rank })),
            music: track,
            adminUntil: req.me.adminUntil
        });
    });

    const adminRow = (u, ranks) => ({ ...users.toAdmin(u), rank: ranks.get(u.tgId) || null, isAdmin: adminGuard.isAdminId(u.tgId) });
    const rankMap = async () => new Map((await users.ranking()).map(x => [x.user.tgId, x.rank]));

    r.get('/admin/users', async (req, res) => {
        const { skip, limit } = page(req.query);
        const kind = ['banned', 'suggest'].includes(req.query.kind) ? req.query.kind : 'all';
        const [{ items, total }, ranks] = await Promise.all([users.list({ skip, limit, q: req.query.q, kind }), rankMap()]);
        res.json({ total, items: items.map(u => adminRow(u, ranks)) });
    });

    async function targetUser(req) {
        const id = Number(req.params.id);
        const u = Number.isSafeInteger(id) ? await users.get(id) : null;
        if (!u) throw new HttpError(404, 'Foydalanuvchi topilmadi');
        if (adminGuard.isAdminId(u.tgId)) throw new HttpError(400, "Adminni bloklab yoki o'chirib bo'lmaydi");
        return u;
    }

    // Vaqtinchalik ban (muddat — daqiqada) va ixtiyoriy sabab
    r.post('/admin/users/:id/ban', async (req, res) => {
        const u = await targetUser(req);
        const b = schemas.ban.parse(req.body);
        const updated = await users.ban(u.tgId, { until: new Date(Date.now() + b.minutes * 60000), reason: b.reason || null, by: req.me.tgId });
        notifier.banNotice(updated).catch(() => {});
        res.json({ user: adminRow(updated, await rankMap()) });
    });

    // Muddatidan oldin blokdan chiqarish
    r.post('/admin/users/:id/unban', async (req, res) => {
        const u = await targetUser(req);
        const updated = await users.unban(u.tgId);
        if (users.banInfo(u)) notifier.unbanNotice(updated).catch(() => {});
        res.json({ user: adminRow(updated, await rankMap()) });
    });

    r.delete('/admin/users/:id', async (req, res) => {
        const u = await targetUser(req);
        await users.remove(u.tgId);
        res.json({ ok: true });
    });

    r.get('/admin/games', async (req, res) => {
        const { skip, limit } = page(req.query);
        const status = ['live', 'finished', 'cancelled'].includes(req.query.status) ? req.query.status : null;
        const { items, total } = await games.list({ status, skip, limit });
        res.json({ total, items: items.map(pub(req)) });
    });

    r.post('/admin/games/:id/cancel', async (req, res) => {
        const game = await games.cancel({ id: req.params.id, actor: req.me, adminUnlocked: true });
        res.json({ game: full(req, game) });
    });

    r.delete('/admin/games/:id', async (req, res) => {
        await games.remove(req.params.id);
        res.json({ ok: true });
    });

    r.get('/admin/tracks', async (req, res) => {
        res.json(await music.publicList());
    });

    r.post('/admin/tracks/active', async (req, res) => {
        const { id } = schemas.active.parse(req.body);
        await music.setActive(id);
        res.json(await music.publicList());
    });

    r.patch('/admin/tracks/:id', async (req, res) => {
        const body = schemas.trackPatch.parse(req.body);
        await music.update(req.params.id, body);
        res.json(await music.publicList());
    });

    r.delete('/admin/tracks/:id', async (req, res) => {
        await music.remove(req.params.id);
        res.json(await music.publicList());
    });

    // --- Xatolar ---
    // eslint-disable-next-line no-unused-vars
    r.use((err, req, res, next) => {
        if (err instanceof z.ZodError) {
            return res.status(400).json({ error: "So'rov ma'lumotlari noto'g'ri", details: err.issues.map(i => `${i.path.join('.')}: ${i.message}`) });
        }
        if (err?.type === 'entity.parse.failed' || err?.type === 'entity.too.large') {
            return res.status(400).json({ error: "So'rov noto'g'ri" });
        }
        if (err instanceof HttpError) {
            if (err.status >= 500) console.error('[api]', req.method, req.originalUrl, err.message);
            const body = { error: err.message };
            for (const [k, v] of Object.entries(err.extra || {})) {
                body[k] = k === 'game' && v ? games.toPublic(v, req.me?.tgId, req.adminUnlocked, { withLog: true }) : v;
            }
            return res.status(err.status).json(body);
        }
        console.error('[api]', err);
        return res.status(500).json({ error: 'Serverda xatolik yuz berdi' });
    });

    return r;
}
