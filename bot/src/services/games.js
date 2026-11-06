import { ObjectId } from 'mongodb';
import { applyScore, MIN_TEAMS, MAX_TEAMS, STEP, SUITS } from '../../shared/rules.js';
import { HttpError, cleanName, userName } from '../util.js';

const LOG_LIMIT = 300;
const LIVE_FRESH_MS = 12 * 3600 * 1000;     // 12 soatdan beri tegilmagan o'yin umumiy "jonli" ro'yxatda ko'rinmaydi

export function toObjectId(id, what = "O'yin") {
    if (id instanceof ObjectId) return id;
    if (typeof id !== 'string' || id.length !== 24 || !ObjectId.isValid(id)) throw new HttpError(404, `${what} topilmadi`);
    return new ObjectId(id);
}

export function createGameService({ db, users }) {
    const { games } = db;
    const hooks = { onGameFinished: null };

    /** Ochkoni o'zgartirish huquqi: o'yinni ochgan, ishtirokchilar va (kod bilan kirgan) admin. */
    function canEdit(game, tgId, adminUnlocked) {
        if (game.status !== 'live') return false;
        return !!adminUnlocked || game.createdBy?.tgId === tgId || (game.players || []).includes(tgId);
    }

    function canCancel(game, tgId, adminUnlocked) {
        return game.status === 'live' && (!!adminUnlocked || game.createdBy?.tgId === tgId);
    }

    async function create({ creator, teams: input, rematchOf = null }) {
        if (!Array.isArray(input) || input.length < MIN_TEAMS || input.length > MAX_TEAMS) {
            throw new HttpError(400, `Komandalar soni ${MIN_TEAMS}–${MAX_TEAMS} bo'lishi kerak`);
        }
        const ids = [];
        for (const t of input) {
            for (const m of (t?.members || [])) if (m?.tgId) ids.push(Number(m.tgId));
        }
        if (new Set(ids).size !== ids.length) throw new HttpError(400, "Bitta o'yinchi ikki komandada bo'la olmaydi");
        const known = await users.getMany(ids);

        const teams = input.map((t, i) => {
            const members = (t?.members || []).slice(0, 3).map(m => {
                if (m?.tgId) {
                    const u = known.get(Number(m.tgId));
                    if (!u) throw new HttpError(400, "O'yinchi topilmadi — u botni ochgan bo'lishi kerak");
                    if (users.banInfo(u)) throw new HttpError(400, `${userName(u)} vaqtincha bloklangan — o'yinga qo'shib bo'lmaydi`);
                    return { tgId: u.tgId, name: userName(u), username: u.username || null, photo: u.photoUrl || null };
                }
                const name = cleanName(m?.name);
                if (!name) throw new HttpError(400, "Mehmon o'yinchining ismi bo'sh");
                return { tgId: null, name, username: null, photo: null };
            });
            if (!members.length) members.push({ tgId: null, name: `${i + 1}-komanda`, username: null, photo: null });
            return { members, score: 0, eliminated: false };
        });

        const now = new Date();
        const doc = {
            status: 'live',
            createdBy: { tgId: creator.tgId, name: userName(creator) },
            teams,
            players: ids,
            suit: null,
            winner: null,
            version: 1,
            log: [],
            createdAt: now,
            updatedAt: now,
            finishedAt: null,
            rematchOf: rematchOf ? toObjectId(rematchOf) : null
        };
        const { insertedId } = await games.insertOne(doc);
        return { ...doc, _id: insertedId };
    }

    async function get(id) {
        const game = await games.findOne({ _id: toObjectId(id) });
        if (!game) throw new HttpError(404, "O'yin topilmadi");
        return game;
    }

    async function finishSideEffects(game) {
        await applyResultToStats(game, +1);
        if (hooks.onGameFinished) {
            Promise.resolve().then(() => hooks.onGameFinished(game)).catch(err => console.error('[notify]', err.message));
        }
    }

    /** G'olib komanda a'zolariga g'alaba, qolganlarga mag'lubiyat yoziladi (sign = -1 — qaytarish). */
    async function applyResultToStats(game, sign) {
        if (game.winner === null || game.winner === undefined) return;
        const winners = [];
        const losers = [];
        game.teams.forEach((t, i) => {
            for (const m of t.members) if (m.tgId) (i === game.winner ? winners : losers).push(m.tgId);
        });
        const set = sign > 0 ? { $set: { lastGameAt: game.finishedAt || new Date() } } : {};
        const ops = [];
        if (winners.length) {
            ops.push(db.users.updateMany({ tgId: { $in: winners } }, { $inc: { 'stats.games': sign, 'stats.wins': sign }, ...set }));
        }
        if (losers.length) {
            ops.push(db.users.updateMany({ tgId: { $in: losers } }, { $inc: { 'stats.games': sign, 'stats.losses': sign }, ...set }));
        }
        await Promise.all(ops);
        [...winners, ...losers].forEach(id => users.forget(id));
    }

    /**
     * Ochko: +2 yoki −2. Qoidalar shared/rules.js da (asl kalkulyator bilan bir xil).
     * expectedVersion boshqa qurilmadagi o'zgarishdan eski bo'lsa — 409 (ikki marta sanalmasligi uchun).
     */
    async function score({ id, team, delta, actor, expectedVersion, adminUnlocked = false }) {
        const game = await get(id);
        if (game.status !== 'live') throw new HttpError(409, "O'yin allaqachon tugagan", { game });
        if (!canEdit(game, actor.tgId, adminUnlocked)) throw new HttpError(403, "Bu o'yinda ochkoni faqat ishtirokchilar o'zgartira oladi");
        if (delta !== STEP && delta !== -STEP) throw new HttpError(400, "Ochko faqat ±2 o'zgaradi");
        if (!Number.isInteger(team) || team < 0 || team >= game.teams.length) throw new HttpError(400, "Komanda noto'g'ri");
        if (Number.isInteger(expectedVersion) && expectedVersion !== game.version) {
            throw new HttpError(409, "O'yin boshqa qurilmada yangilandi", { game });
        }

        const result = applyScore(game.teams, team, delta);
        if (!result.changed) return { game, changed: false, finished: false };

        const now = new Date();
        const teams = game.teams.map((t, i) => ({ ...t, score: result.teams[i].score, eliminated: result.teams[i].eliminated }));
        const set = { teams, updatedAt: now };
        const finished = result.winner !== null;
        if (finished) Object.assign(set, { status: 'finished', winner: result.winner, finishedAt: now });
        const entry = { at: now, by: actor.tgId, byName: userName(actor), team, delta, score: teams[team].score };

        const updated = await games.findOneAndUpdate(
            { _id: game._id, version: game.version, status: 'live' },
            { $set: set, $inc: { version: 1 }, $push: { log: { $each: [entry], $slice: -LOG_LIMIT } } },
            { returnDocument: 'after' }
        );
        if (!updated) {
            throw new HttpError(409, "O'yin boshqa qurilmada yangilandi", { game: await games.findOne({ _id: game._id }) });
        }
        if (finished) await finishSideEffects(updated);
        return { game: updated, changed: true, finished };
    }

    async function setSuit({ id, suit, actor, adminUnlocked = false }) {
        const game = await get(id);
        if (!canEdit(game, actor.tgId, adminUnlocked)) throw new HttpError(403, 'Kozirni faqat ishtirokchilar belgilay oladi');
        if (suit !== null && !SUITS.includes(suit)) throw new HttpError(400, "Kozir noto'g'ri");
        const updated = await games.findOneAndUpdate(
            { _id: game._id, status: 'live' },
            { $set: { suit, updatedAt: new Date() }, $inc: { version: 1 } },
            { returnDocument: 'after' }
        );
        if (!updated) throw new HttpError(409, "O'yin allaqachon tugagan", { game: await games.findOne({ _id: game._id }) });
        return updated;
    }

    async function cancel({ id, actor, adminUnlocked = false }) {
        const game = await get(id);
        if (!canCancel(game, actor.tgId, adminUnlocked)) throw new HttpError(403, "O'yinni faqat uni ochgan odam yoki admin bekor qila oladi");
        const now = new Date();
        const updated = await games.findOneAndUpdate(
            { _id: game._id, status: 'live' },
            { $set: { status: 'cancelled', cancelledAt: now, updatedAt: now }, $inc: { version: 1 } },
            { returnDocument: 'after' }
        );
        if (!updated) throw new HttpError(409, "O'yin allaqachon tugagan");
        return updated;
    }

    /** Admin: o'yinni butunlay o'chirish (tugagan bo'lsa, statistikadan ham ayriladi). */
    async function remove(id) {
        const game = await get(id);
        if (game.status === 'finished') await applyResultToStats(game, -1);
        await games.deleteOne({ _id: game._id });
        return game;
    }

    async function rematch({ id, actor }) {
        const game = await get(id);
        const teams = game.teams.map(t => ({
            members: t.members.map(m => (m.tgId ? { tgId: m.tgId } : { name: m.name }))
        }));
        return create({ creator: actor, teams, rematchOf: game._id });
    }

    async function feed({ before = null, limit = 15 } = {}) {
        const freshFrom = new Date(Date.now() - LIVE_FRESH_MS);
        const finishedFilter = { status: 'finished' };
        if (before) finishedFilter.finishedAt = { $lt: new Date(before) };
        const [live, finished] = await Promise.all([
            before ? [] : games.find({ status: 'live', updatedAt: { $gte: freshFrom } }).sort({ updatedAt: -1 }).limit(30).toArray(),
            games.find(finishedFilter).sort({ finishedAt: -1 }).limit(limit + 1).toArray()
        ]);
        return { live, finished: finished.slice(0, limit), hasMore: finished.length > limit };
    }

    async function forPlayer(tgId, limit = 10) {
        const id = Number(tgId);
        const [recent, open] = await Promise.all([
            games.find({ players: id, status: 'finished' }).sort({ finishedAt: -1 }).limit(limit).toArray(),
            games.find({ status: 'live', $or: [{ 'createdBy.tgId': id }, { players: id }] }).sort({ updatedAt: -1 }).limit(10).toArray()
        ]);
        return { recent, open };
    }

    async function list({ status = null, skip = 0, limit = 20 } = {}) {
        const filter = status ? { status } : {};
        const [items, total] = await Promise.all([
            games.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
            games.countDocuments(filter)
        ]);
        return { items, total };
    }

    async function counts() {
        const dayAgo = new Date(Date.now() - 24 * 3600 * 1000);
        const [total, live, finished, cancelled, today] = await Promise.all([
            games.countDocuments({}),
            games.countDocuments({ status: 'live' }),
            games.countDocuments({ status: 'finished' }),
            games.countDocuments({ status: 'cancelled' }),
            games.countDocuments({ createdAt: { $gte: dayAgo } })
        ]);
        return { total, live, finished, cancelled, today };
    }

    /** Mini App uchun ko'rinish. */
    function toPublic(game, viewerId, adminUnlocked = false, { withLog = false } = {}) {
        return {
            id: String(game._id),
            status: game.status,
            version: game.version,
            teams: game.teams.map(t => ({
                members: t.members.map(m => ({ id: m.tgId || null, name: m.name, username: m.username || null, photo: m.photo || null })),
                score: t.score,
                eliminated: t.eliminated
            })),
            suit: game.suit || null,
            winner: game.winner ?? null,
            createdBy: game.createdBy,
            createdAt: game.createdAt,
            updatedAt: game.updatedAt,
            finishedAt: game.finishedAt || null,
            canEdit: canEdit(game, viewerId, adminUnlocked),
            canCancel: canCancel(game, viewerId, adminUnlocked),
            ...(withLog ? {
                log: (game.log || []).slice(-60).reverse().map(e => ({ at: e.at, byName: e.byName, team: e.team, delta: e.delta, score: e.score }))
            } : {})
        };
    }

    return { hooks, canEdit, canCancel, create, get, score, setSuit, cancel, remove, rematch, feed, forPlayer, list, counts, toPublic, applyResultToStats };
}
