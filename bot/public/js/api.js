import { initData } from './tg.js';

export class ApiError extends Error {
    constructor(status, data) {
        super(data?.error || (status === 0 ? "Internet aloqasi yo'q" : 'Xatolik yuz berdi'));
        this.status = status;
        this.data = data || {};
    }
}

/** Server API: har so'rov Telegram initData bilan imzolanadi. 204 → null. */
export async function api(path, { method = 'GET', body, signal } = {}) {
    let res;
    try {
        res = await fetch('/api' + path, {
            method,
            signal,
            headers: {
                Authorization: 'tma ' + initData,
                ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
            },
            body: body !== undefined ? JSON.stringify(body) : undefined
        });
    } catch (err) {
        if (err.name === 'AbortError') throw err;
        throw new ApiError(0, null);
    }
    if (res.status === 204) return null;
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok) throw new ApiError(res.status, data);
    return data;
}
