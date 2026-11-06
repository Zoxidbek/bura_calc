export class HttpError extends Error {
    constructor(status, message, extra = {}) {
        super(message);
        this.status = status;
        this.extra = extra;
    }
}

/** Telegram HTML rejimi uchun xavfsiz matn. */
export function escapeHtml(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function cleanName(s, max = 24) {
    return String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Foydalanuvchining ko'rinadigan ismi. */
export function userName(u) {
    if (!u) return 'Foydalanuvchi';
    const first = u.firstName ?? u.first_name ?? '';
    const last = u.lastName ?? u.last_name ?? '';
    const full = cleanName(`${first} ${last}`, 48);
    return full || (u.username ? '@' + u.username : 'Foydalanuvchi');
}

export function teamLabel(team) {
    return (team.members || []).map(m => m.name).join(' & ') || 'Komanda';
}

export function percent(part, total) {
    return total ? Math.round((part / total) * 100) : 0;
}

/** 75 → "1:15" */
export function formatDuration(sec) {
    const s = Math.max(0, Math.round(Number(sec) || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** "45", "1:05", "01:05" → soniya; noto'g'ri bo'lsa null. */
export function parseTimeInput(text) {
    const t = String(text ?? '').trim();
    let m = /^(\d{1,4})$/.exec(t);
    if (m) return parseInt(m[1], 10);
    m = /^(\d{1,3})[:.](\d{1,2})$/.exec(t);
    if (m && parseInt(m[2], 10) < 60) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    return null;
}

const TZ = process.env.TZ_DISPLAY || 'Asia/Tashkent';

function parts(date) {
    const p = {};
    for (const { type, value } of new Intl.DateTimeFormat('en-GB', {
        timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(date)) p[type] = value;
    return p;
}

/** Sana: "Bugun, 21:56" / "Kecha, 20:10" / "12.10, 19:30" (Toshkent vaqti bo'yicha). */
export function formatWhen(value, now = new Date()) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const a = parts(d);
    const b = parts(now);
    const dayA = Date.UTC(+a.year, +a.month - 1, +a.day);
    const dayB = Date.UTC(+b.year, +b.month - 1, +b.day);
    const diff = Math.round((dayB - dayA) / 86400000);
    const hm = `${a.hour}:${a.minute}`;
    if (diff === 0) return `Bugun, ${hm}`;
    if (diff === 1) return `Kecha, ${hm}`;
    return `${a.day}.${a.month}${a.year !== b.year ? '.' + a.year : ''}, ${hm}`;
}

export function minutesBetween(a, b) {
    return Math.max(1, Math.round((new Date(b) - new Date(a)) / 60000));
}

export function escapeRegex(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
