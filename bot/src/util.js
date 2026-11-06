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

/** "45", "45 soniya", "1:05", "1.05", "2 daqiqa", "1 daqiqa 5 soniya" → soniya; tushunarsiz bo'lsa null. */
export function parseTimeInput(text) {
    const t = String(text ?? '').toLowerCase().trim();
    let m = /^(\d{1,3})\s*[:.]\s*(\d{1,2})$/.exec(t) || /(\d{1,3})\s*:\s*(\d{1,2})/.exec(t);
    if (m) {
        const sec = parseInt(m[2], 10);
        return sec < 60 ? parseInt(m[1], 10) * 60 + sec : null;
    }
    const min = /(\d{1,3})\s*(?:daqiqa|daq|minut|min)/.exec(t);
    const sec = /(\d{1,4})\s*(?:soniya|sekund|sek|son|s\b)/.exec(t);
    if (min || sec) {
        if (min && !sec) {
            const rest = /(\d{1,2})/.exec(t.slice(min.index + min[0].length));
            return parseInt(min[1], 10) * 60 + (rest ? parseInt(rest[1], 10) : 0);
        }
        return (min ? parseInt(min[1], 10) * 60 : 0) + (sec ? parseInt(sec[1], 10) : 0);
    }
    m = /^(\d{1,4})$/.exec(t);
    return m ? parseInt(m[1], 10) : null;
}

// Tartib muhim: "month" "m" (daqiqa) dan oldin tekshiriladi
const DURATION_UNITS = [
    [/^(oy|month)/, 43200],
    [/^(hafta|week|w$)/, 10080],
    [/^(kun|day|d$|k$)/, 1440],
    [/^(soat|soa|hour|h$|s$)/, 60],
    [/^(daqiqa|daq|minut|min|m$)/, 1]
];

/**
 * Ban muddati: "2 soat", "3 kun", "1 hafta", "30 daqiqa", "1 oy" (+ ixtiyoriy sabab).
 * Birliksiz son — soat. Natija: { minutes, reason } yoki null. Eng ko'pi 365 kun.
 */
export function parseDuration(text) {
    const raw = String(text ?? '').trim();
    const m = /^(\d{1,4})\s*([a-zA-Zʻ'’]*)\s*[-—–:,.]?\s*([\s\S]*)$/.exec(raw);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    let unit = 60;
    let reason = m[3];
    const word = m[2].toLowerCase();
    if (word) {
        const found = DURATION_UNITS.find(([rx]) => rx.test(word));
        if (found) unit = found[1];
        else reason = `${m[2]} ${m[3]}`;
    }
    const minutes = n * unit;
    if (!minutes || minutes > 525600) return null;
    return { minutes, reason: cleanName(reason, 200) || null };
}

/** 90 → "1 soat 30 daqiqa", 4320 → "3 kun" */
export function formatMinutes(min) {
    const m = Math.max(0, Math.round(min));
    const d = Math.floor(m / 1440);
    const hh = Math.floor((m % 1440) / 60);
    const mm = m % 60;
    return [d && `${d} kun`, hh && `${hh} soat`, mm && `${mm} daqiqa`].filter(Boolean).join(' ') || '0 daqiqa';
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
