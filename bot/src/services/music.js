import { HttpError, cleanName, formatDuration } from '../util.js';
import { toObjectId } from './games.js';

/** Standart musiqa: Handel — "See, the Conquering Hero Comes!" (Mini App'da Web Audio bilan yaratiladi). */
export const BUILTIN_TRACK = {
    id: 'builtin',
    type: 'builtin',
    title: "G'olib qahramon kelmoqda",
    performer: 'G. F. Handel · orkestr (sintez)',
    duration: 72,
    startAt: 0
};

const MAX_FILE = 20 * 1024 * 1024;            // Bot API getFile chegarasi
const CACHE_MAX = 64 * 1024 * 1024;

export function createMusicService({ db, telegram }) {
    const { tracks, settings } = db;
    const cache = new Map();                  // trackId → { buf, mime }
    const loading = new Map();
    let cacheBytes = 0;

    async function list() {
        return tracks.find({}).sort({ createdAt: -1 }).toArray();
    }

    async function get(id) {
        const t = await tracks.findOne({ _id: toObjectId(id, 'Musiqa') });
        if (!t) throw new HttpError(404, 'Musiqa topilmadi');
        return t;
    }

    async function add({ fileId, fileUniqueId, kind = 'audio', title, performer, duration, mime, size, addedBy }) {
        if (size && size > MAX_FILE) throw new HttpError(400, 'Fayl 20 MB dan katta');
        if (fileUniqueId) {
            const existing = await tracks.findOne({ fileUniqueId });
            if (existing) return { track: existing, duplicate: true };
        }
        const doc = {
            fileId,
            fileUniqueId: fileUniqueId || null,
            kind,
            title: cleanName(title, 80) || 'Nomsiz musiqa',
            performer: cleanName(performer, 80),
            duration: Math.max(0, Math.round(Number(duration) || 0)),
            mime: String(mime || 'audio/mpeg').slice(0, 60),
            size: Number(size) || 0,
            startAt: 0,
            addedBy: Number(addedBy) || null,
            createdAt: new Date()
        };
        const { insertedId } = await tracks.insertOne(doc);
        return { track: { ...doc, _id: insertedId }, duplicate: false };
    }

    async function update(id, { title, startAt } = {}) {
        const t = await get(id);
        const set = {};
        if (title !== undefined) {
            const v = cleanName(title, 80);
            if (!v) throw new HttpError(400, "Nom bo'sh bo'lmasligi kerak");
            set.title = v;
        }
        if (startAt !== undefined) {
            const s = Math.floor(Number(startAt));
            if (!Number.isFinite(s) || s < 0) throw new HttpError(400, "Vaqt noto'g'ri");
            if (t.duration && s >= t.duration) {
                throw new HttpError(400, `Boshlanish vaqti musiqa uzunligidan (${formatDuration(t.duration)}) kichik bo'lishi kerak`);
            }
            set.startAt = s;
        }
        if (Object.keys(set).length) await tracks.updateOne({ _id: t._id }, { $set: set });
        return { ...t, ...set };
    }

    async function activeId() {
        const s = await settings.findOne({ _id: 'app' });
        return s?.activeTrack || 'builtin';
    }

    async function setActive(id) {
        const value = id === 'builtin' ? 'builtin' : String((await get(id))._id);
        await settings.updateOne({ _id: 'app' }, { $set: { activeTrack: value, updatedAt: new Date() } }, { upsert: true });
        return value;
    }

    /** Faol musiqa hujjati; standart bo'lsa yoki o'chirib yuborilgan bo'lsa — null. */
    async function getActive() {
        const id = await activeId();
        if (id === 'builtin') return null;
        return tracks.findOne({ _id: toObjectId(id, 'Musiqa') });
    }

    async function remove(id) {
        const t = await get(id);
        await tracks.deleteOne({ _id: t._id });
        drop(String(t._id));
        if ((await activeId()) === String(t._id)) await setActive('builtin');
        return t;
    }

    function toPublic(track, activeTrackId) {
        if (!track) return { ...BUILTIN_TRACK, active: activeTrackId === 'builtin' };
        const id = String(track._id);
        return {
            id,
            type: 'file',
            kind: track.kind,
            title: track.title,
            performer: track.performer,
            duration: track.duration,
            startAt: track.startAt || 0,
            size: track.size,
            url: `/api/music/${id}/file?v=${encodeURIComponent(track.fileUniqueId || id)}`,
            active: activeTrackId === id,
            createdAt: track.createdAt
        };
    }

    async function publicList() {
        const [items, active] = await Promise.all([list(), activeId()]);
        return { activeId: active, items: [toPublic(null, active), ...items.map(t => toPublic(t, active))] };
    }

    async function publicActive() {
        const track = await getActive();
        return toPublic(track, track ? String(track._id) : 'builtin');
    }

    function drop(id) {
        const hit = cache.get(id);
        if (hit) {
            cacheBytes -= hit.buf.length;
            cache.delete(id);
        }
    }

    /** Faylni Telegram'dan bir marta yuklab, xotirada saqlaydi (bot tokeni foydalanuvchiga ko'rinmaydi). */
    async function loadBuffer(track) {
        const id = String(track._id);
        const hit = cache.get(id);
        if (hit) {
            cache.delete(id);
            cache.set(id, hit);               // LRU: eng so'nggi ishlatilgan oxirida
            return hit;
        }
        if (loading.has(id)) return loading.get(id);
        const job = (async () => {
            const file = await telegram.getFile(track.fileId);
            if (!file?.file_path) throw new HttpError(502, 'Telegram faylni bermadi');
            const res = await fetch(telegram.fileUrl(file.file_path));
            if (!res.ok) throw new HttpError(502, `Telegram fayl xatosi (${res.status})`);
            const buf = Buffer.from(await res.arrayBuffer());
            const entry = { buf, mime: track.mime || res.headers.get('content-type') || 'audio/mpeg' };
            cache.set(id, entry);
            cacheBytes += buf.length;
            for (const [key, val] of cache) {
                if (cacheBytes <= CACHE_MAX || key === id) break;
                cacheBytes -= val.buf.length;
                cache.delete(key);
            }
            return entry;
        })();
        loading.set(id, job);
        try {
            return await job;
        } finally {
            loading.delete(id);
        }
    }

    /** Audio fayl: Range so'rovlarini qo'llaydi (iPhone/Safari usiz audio chalmaydi). */
    async function serveFile(req, res, id) {
        const track = await get(id);
        const { buf, mime } = await loadBuffer(track);
        const total = buf.length;
        res.set({
            'Accept-Ranges': 'bytes',
            'Content-Type': mime,
            'Cache-Control': 'public, max-age=31536000, immutable',
            ETag: `"${track.fileUniqueId || track._id}"`
        });
        const range = req.headers.range;
        if (!range) {
            res.set('Content-Length', String(total));
            return res.end(buf);
        }
        const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
        let start;
        let end;
        if (m && m[1] !== '') {
            start = parseInt(m[1], 10);
            end = m[2] !== '' ? Math.min(parseInt(m[2], 10), total - 1) : total - 1;
        } else if (m && m[2] !== '') {
            start = Math.max(0, total - parseInt(m[2], 10));
            end = total - 1;
        }
        if (start === undefined || start > end || start >= total) {
            return res.status(416).set('Content-Range', `bytes */${total}`).end();
        }
        res.status(206).set({ 'Content-Range': `bytes ${start}-${end}/${total}`, 'Content-Length': String(end - start + 1) });
        return res.end(buf.subarray(start, end + 1));
    }

    return { list, get, add, update, remove, activeId, setActive, getActive, toPublic, publicList, publicActive, serveFile };
}
