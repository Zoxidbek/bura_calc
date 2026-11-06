import { escapeRegex, userName, percent } from '../util.js';

const TOUCH_TTL_MS = 5 * 60 * 1000;
const SUGGEST_INACTIVE_DAYS = 30;          // shuncha kun kirmagan va o'ynamagan user o'chirishga tavsiya etiladi

/** Amaldagi ban (muddati o'tmagan bo'lsa) yoki null. */
export function banInfo(u) {
    if (!u?.ban?.until) return null;
    const until = new Date(u.ban.until);
    if (!(until > new Date())) return null;
    return { until, reason: u.ban.reason || null, at: u.ban.at || null, by: u.ban.by || null };
}

export function suggestDelete(u) {
    const cutoff = Date.now() - SUGGEST_INACTIVE_DAYS * 86400000;
    return (u.stats?.games || 0) === 0 && (!u.lastSeenAt || new Date(u.lastSeenAt).getTime() < cutoff);
}

export function createUserService({ db }) {
    const { users } = db;
    const touchCache = new Map();   // tgId → { at, user } — har so'rovda bazaga yozmaslik uchun

    function profileOf(tg) {
        return {
            firstName: String(tg.first_name || '').slice(0, 64),
            lastName: String(tg.last_name || '').slice(0, 64),
            username: tg.username ? String(tg.username).slice(0, 64) : null,
            languageCode: tg.language_code || null
        };
    }

    /**
     * Telegram foydalanuvchisini bazaga yozadi/yangilaydi.
     * started — /start bosilgan (bot unga xabar yubora oladi).
     */
    async function upsertFromTelegram(tg, { started = false, canMessage = false, photoUrl = null } = {}) {
        const now = new Date();
        const set = { ...profileOf(tg), lastSeenAt: now };
        const insert = { tgId: tg.id, createdAt: now, stats: { games: 0, wins: 0, losses: 0 } };
        if (photoUrl && /^https:\/\//.test(photoUrl)) set.photoUrl = String(photoUrl).slice(0, 512);
        if (started) {
            set.canMessage = true;
            set.startedAt = now;
        } else if (canMessage) {
            set.canMessage = true;
        } else {
            insert.canMessage = false;
        }
        const user = await users.findOneAndUpdate(
            { tgId: tg.id },
            { $set: set, $setOnInsert: insert },
            { upsert: true, returnDocument: 'after' }
        );
        touchCache.set(tg.id, { at: Date.now(), user });
        return user;
    }

    /** Ko'p so'rovlar uchun: 5 daqiqada bir martadan ko'p yozmaydi (ma'lumot o'zgarmagan bo'lsa). */
    async function touch(tg, opts = {}) {
        const hit = touchCache.get(tg.id);
        const changed = hit && (
            hit.user.firstName !== String(tg.first_name || '').slice(0, 64) ||
            (hit.user.username || null) !== (tg.username || null) ||
            (opts.photoUrl && hit.user.photoUrl !== opts.photoUrl) ||
            (opts.canMessage && !hit.user.canMessage)
        );
        if (hit && !changed && Date.now() - hit.at < TOUCH_TTL_MS) return hit.user;
        return upsertFromTelegram(tg, opts);
    }

    function forget(tgId) {
        touchCache.delete(Number(tgId));
    }

    async function get(tgId) {
        return users.findOne({ tgId: Number(tgId) });
    }

    async function getMany(ids) {
        if (!ids.length) return new Map();
        const list = await users.find({ tgId: { $in: ids.map(Number) } }).toArray();
        return new Map(list.map(u => [u.tgId, u]));
    }

    async function search(q, limit = 40) {
        const text = String(q || '').trim().slice(0, 40);
        let filter = {};
        if (text) {
            const rx = { $regex: escapeRegex(text.replace(/^@/, '')), $options: 'i' };
            filter = { $or: [{ firstName: rx }, { lastName: rx }, { username: rx }] };
            if (/^\d{3,}$/.test(text)) filter.$or.push({ tgId: Number(text) });
        }
        return users.find(filter).sort({ 'stats.games': -1, lastSeenAt: -1 }).limit(limit).toArray();
    }

    async function list({ skip = 0, limit = 20, q = '', kind = 'all' } = {}) {
        const parts = [];
        const text = String(q || '').trim().slice(0, 40);
        if (text) {
            const rx = { $regex: escapeRegex(text.replace(/^@/, '')), $options: 'i' };
            const or = [{ firstName: rx }, { lastName: rx }, { username: rx }];
            if (/^\d{3,}$/.test(text)) or.push({ tgId: Number(text) });
            parts.push({ $or: or });
        }
        if (kind === 'banned') parts.push({ 'ban.until': { $gt: new Date() } });
        if (kind === 'suggest') {
            parts.push({ 'stats.games': { $lte: 0 } });
            parts.push({ lastSeenAt: { $lt: new Date(Date.now() - SUGGEST_INACTIVE_DAYS * 86400000) } });
        }
        const filter = parts.length > 1 ? { $and: parts } : (parts[0] || {});
        const [items, total] = await Promise.all([
            users.find(filter).sort({ lastSeenAt: -1 }).skip(skip).limit(limit).toArray(),
            users.countDocuments(filter)
        ]);
        return { items, total };
    }

    async function setCanMessage(tgId, value) {
        forget(tgId);
        await users.updateOne({ tgId: Number(tgId) }, { $set: { canMessage: !!value } });
    }

    async function setPending(tgId, pending) {
        forget(tgId);
        const update = pending
            ? { $set: { pending: { ...pending, until: new Date(Date.now() + 10 * 60 * 1000) } } }
            : { $unset: { pending: '' } };
        await users.updateOne({ tgId: Number(tgId) }, update);
    }

    async function ban(tgId, { until, reason = null, by = null }) {
        forget(tgId);
        return users.findOneAndUpdate(
            { tgId: Number(tgId) },
            { $set: { ban: { until, reason: reason || null, by, at: new Date() } } },
            { returnDocument: 'after' }
        );
    }

    async function unban(tgId) {
        forget(tgId);
        return users.findOneAndUpdate({ tgId: Number(tgId) }, { $unset: { ban: '' } }, { returnDocument: 'after' });
    }

    /** Userni bazadan o'chiradi (o'yinlar tarixida ismi qoladi). Qaytib kirsa — yangi user bo'lib yoziladi. */
    async function remove(tgId) {
        forget(tgId);
        const r = await users.deleteOne({ tgId: Number(tgId) });
        return r.deletedCount > 0;
    }

    async function setAdminUntil(tgId, until) {
        forget(tgId);
        const update = until ? { $set: { adminUntil: until } } : { $unset: { adminUntil: '' } };
        await users.updateOne({ tgId: Number(tgId) }, update);
    }

    function rate(u) {
        return u.stats.games ? u.stats.wins / u.stats.games : 0;
    }

    /** Reyting: chempionliklar → g'alaba foizi → o'yinlar soni. Teng natijalar bir xil o'rin oladi. */
    async function ranking() {
        const list = await users.find({ 'stats.games': { $gt: 0 } }).toArray();
        list.sort((a, b) =>
            b.stats.wins - a.stats.wins || rate(b) - rate(a) || b.stats.games - a.stats.games ||
            userName(a).localeCompare(userName(b)));
        let rank = 0;
        return list.map((u, i) => {
            const prev = list[i - 1];
            if (!prev || prev.stats.wins !== u.stats.wins || prev.stats.games !== u.stats.games) rank = i + 1;
            return { user: u, rank };
        });
    }

    function rankFrom(rows, tgId) {
        const row = rows.find(r => r.user.tgId === Number(tgId));
        return row ? { rank: row.rank, total: rows.length } : { rank: null, total: rows.length };
    }

    async function counts() {
        const dayAgo = new Date(Date.now() - 24 * 3600 * 1000);
        const [total, messageable, activeDay, players, banned] = await Promise.all([
            users.countDocuments({}),
            users.countDocuments({ canMessage: true }),
            users.countDocuments({ lastSeenAt: { $gte: dayAgo } }),
            users.countDocuments({ 'stats.games': { $gt: 0 } }),
            users.countDocuments({ 'ban.until': { $gt: new Date() } })
        ]);
        return { total, messageable, activeDay, players, banned };
    }

    /** Mini App va boshqa foydalanuvchilarga ko'rsatiladigan qism (maxfiy maydonlarsiz). */
    function toPublic(u, rankInfo) {
        return {
            id: u.tgId,
            name: userName(u),
            username: u.username || null,
            photo: u.photoUrl || null,
            stats: {
                games: u.stats?.games || 0,
                wins: u.stats?.wins || 0,
                losses: u.stats?.losses || 0,
                rate: percent(u.stats?.wins || 0, u.stats?.games || 0)
            },
            banned: !!banInfo(u),
            ...(rankInfo ? { rank: rankInfo.rank } : {})
        };
    }

    /** Admin uchun to'liq ma'lumot. */
    function toAdmin(u) {
        return {
            ...toPublic(u),
            canMessage: !!u.canMessage,
            startedAt: u.startedAt || null,
            createdAt: u.createdAt || null,
            lastSeenAt: u.lastSeenAt || null,
            lastGameAt: u.lastGameAt || null,
            ban: banInfo(u),
            suggestDelete: suggestDelete(u)
        };
    }

    return {
        upsertFromTelegram, touch, forget, get, getMany, search, list,
        setCanMessage, setPending, setAdminUntil, ban, unban, remove, banInfo, suggestDelete,
        ranking, rankFrom, counts, toPublic, toAdmin
    };
}
