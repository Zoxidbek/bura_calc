import crypto from 'node:crypto';

/**
 * Telegram Mini App initData imzosini tekshiradi
 * (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app).
 * To'g'ri bo'lsa { user, authDate, startParam } qaytaradi, aks holda null.
 */
export function validateInitData(initData, botToken, maxAgeSec = 86400, nowMs = Date.now()) {
    if (typeof initData !== 'string' || !initData || initData.length > 8192) return null;
    const params = new URLSearchParams(initData);
    const hash = params.get('hash') || '';
    if (!/^[0-9a-f]{64}$/i.test(hash)) return null;

    const pairs = [];
    for (const [key, value] of params) {
        if (key !== 'hash') pairs.push([key, value]);
    }
    pairs.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const dataCheckString = pairs.map(([k, v]) => `${k}=${v}`).join('\n');

    const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const expected = crypto.createHmac('sha256', secret).update(dataCheckString).digest();
    const given = Buffer.from(hash, 'hex');
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;

    const authDate = parseInt(params.get('auth_date') || '0', 10);
    if (!authDate || nowMs / 1000 - authDate > maxAgeSec) return null;

    let user = null;
    try { user = JSON.parse(params.get('user') || 'null'); } catch { return null; }
    if (!user || !Number.isSafeInteger(user.id) || user.is_bot) return null;

    return { user, authDate, startParam: params.get('start_param') || null };
}

/** Test va mahalliy sinov uchun: initData satrini to'g'ri imzo bilan yasaydi. */
export function signInitData(fields, botToken) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(fields)) params.set(k, typeof v === 'string' ? v : JSON.stringify(v));
    const pairs = [...params].sort(([a], [b]) => (a < b ? -1 : 1));
    const dcs = pairs.map(([k, v]) => `${k}=${v}`).join('\n');
    const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    params.set('hash', crypto.createHmac('sha256', secret).update(dcs).digest('hex'));
    return params.toString();
}

function sha256(text) {
    return crypto.createHash('sha256').update(String(text)).digest();
}

/**
 * Admin himoyasi: ADMIN_IDS dagi foydalanuvchi ham admin panelga faqat
 * .env dagi ADMIN_CODE ni kiritgandan keyin kira oladi.
 * Noto'g'ri urinishlar cheklanadi: 15 daqiqada 5 marta.
 */
export function createAdminGuard({ adminIds, adminCode, adminSessionHours }, { maxFails = 5, windowMs = 15 * 60 * 1000 } = {}) {
    const attempts = new Map();
    const codeHash = sha256(adminCode);

    return {
        isAdminId(id) {
            return adminIds.includes(Number(id));
        },

        sessionUntil() {
            return new Date(Date.now() + adminSessionHours * 3600 * 1000);
        },

        isUnlocked(user) {
            return !!(user && this.isAdminId(user.tgId) && user.adminUntil && new Date(user.adminUntil) > new Date());
        },

        checkCode(tgId, input) {
            const now = Date.now();
            let a = attempts.get(tgId);
            if (a && a.resetAt <= now) {
                attempts.delete(tgId);
                a = null;
            }
            if (a && a.fails >= maxFails) {
                return { ok: false, locked: true, remaining: 0, retryAfterSec: Math.ceil((a.resetAt - now) / 1000) };
            }
            const ok = crypto.timingSafeEqual(sha256(String(input ?? '').trim()), codeHash);
            if (ok) {
                attempts.delete(tgId);
                return { ok: true };
            }
            a = a || { fails: 0, resetAt: now + windowMs };
            a.fails += 1;
            attempts.set(tgId, a);
            const locked = a.fails >= maxFails;
            return {
                ok: false,
                locked,
                remaining: Math.max(0, maxFails - a.fails),
                retryAfterSec: locked ? Math.ceil((a.resetAt - now) / 1000) : 0
            };
        }
    };
}
