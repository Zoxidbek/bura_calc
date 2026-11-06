// Umumiy UI yordamchilari: xavfsiz HTML, avatar, sana, toast, dialoglar, pastki panel.

export function h(s) {
    return String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

const AV_COLORS = ['#c0563f', '#1f8f6a', '#2f6fb5', '#7656c2', '#c08a1e', '#b8487a', '#1d8f8f', '#a33b3b'];

function hash(str) {
    let x = 0;
    for (let i = 0; i < str.length; i++) x = (x * 31 + str.charCodeAt(i)) | 0;
    return Math.abs(x);
}

export function initials(name) {
    const parts = String(name || '?').replace(/^@/, '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return ((parts[0][0] || '') + (parts[1]?.[0] || '')).toUpperCase();
}

/** Avatar: Telegram rasmi bo'lsa — rasm, bo'lmasa (yoki yuklanmasa) — bosh harflar. */
export function avatar(p, size = 'md') {
    const key = String(p?.id ?? p?.name ?? '?');
    const color = AV_COLORS[hash(key) % AV_COLORS.length];
    const img = p?.photo ? `<img src="${h(p.photo)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '';
    const guest = p && !p.id ? ' guest' : '';
    return `<span class="avatar ${size}${guest}" style="--av:${color}" aria-hidden="true">${h(initials(p?.name))}${img}</span>`;
}

// Yuklanmagan rasmlarni olib tashlaymiz — bosh harflar ko'rinadi
document.addEventListener('error', e => {
    const el = e.target;
    if (el && el.tagName === 'IMG' && el.closest('.avatar')) el.remove();
}, true);

export function teamName(team) {
    return team.members.map(m => m.name).join(' & ');
}

export function when(value) {
    if (!value) return '';
    const d = new Date(value);
    const now = new Date();
    const pad = x => String(x).padStart(2, '0');
    const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const day = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((day(now) - day(d)) / 86400000);
    if (diff === 0) return `Bugun, ${hm}`;
    if (diff === 1) return `Kecha, ${hm}`;
    const date = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;
    return `${d.getFullYear() === now.getFullYear() ? date : date + '.' + d.getFullYear()}, ${hm}`;
}

export function ago(value) {
    const s = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
    if (s < 60) return 'hozirgina';
    if (s < 3600) return `${Math.floor(s / 60)} daq oldin`;
    if (s < 86400) return `${Math.floor(s / 3600)} soat oldin`;
    return when(value);
}

export function duration(sec) {
    const s = Math.max(0, Math.round(Number(sec) || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function emptyState(icon, title, text) {
    return `<div class="empty-state"><div class="empty-icon" aria-hidden="true">${icon}</div>
        <div class="empty-title">${h(title)}</div>${text ? `<p>${h(text)}</p>` : ''}</div>`;
}

export function loading(text = 'Yuklanmoqda...') {
    return `<div class="loading"><span class="spinner" aria-hidden="true"></span>${h(text)}</div>`;
}

let toastTimer = null;
export function toast(text, type = '') {
    let el = document.getElementById('toast');
    if (!el) {
        el = document.createElement('div');
        el.id = 'toast';
        el.setAttribute('role', 'status');
        document.body.appendChild(el);
    }
    el.className = `toast show ${type}`;
    el.textContent = text;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = 'toast'; }, 2800);
}

function modal(inner, onClick) {
    document.getElementById('dialog')?.remove();
    const wrap = document.createElement('div');
    wrap.id = 'dialog';
    wrap.className = 'modal active';
    wrap.innerHTML = `<div class="modal-content" role="dialog" aria-modal="true">${inner}</div>`;
    wrap.addEventListener('click', onClick);
    document.body.appendChild(wrap);
    return wrap;
}

export function confirmDialog({ title, text = '', ok = 'Ha', danger = true }) {
    return new Promise(resolve => {
        const done = v => { wrap.remove(); resolve(v); };
        const wrap = modal(`
            <h3>${h(title)}</h3>${text ? `<p class="modal-text">${h(text)}</p>` : ''}
            <div class="modal-buttons">
                <button class="modal-btn cancel-btn" data-act="no">Bekor qilish</button>
                <button class="modal-btn ${danger ? 'danger-btn' : 'save-btn'}" data-act="yes">${h(ok)}</button>
            </div>`, e => {
            if (e.target === wrap) return done(false);
            const b = e.target.closest('[data-act]');
            if (b) done(b.dataset.act === 'yes');
        });
        wrap.querySelector('[data-act="no"]').focus();
    });
}

export function promptDialog({ title, text = '', value = '', placeholder = '', ok = 'Saqlash', inputmode = 'text', maxlength = 80 }) {
    return new Promise(resolve => {
        const done = v => { wrap.remove(); resolve(v); };
        const wrap = modal(`
            <h3>${h(title)}</h3>${text ? `<p class="modal-text">${h(text)}</p>` : ''}
            <form data-act="form"><input id="promptInput" value="${h(value)}" placeholder="${h(placeholder)}" inputmode="${h(inputmode)}" maxlength="${maxlength}" autocomplete="off">
            <div class="modal-buttons">
                <button type="button" class="modal-btn cancel-btn" data-act="no">Bekor qilish</button>
                <button type="submit" class="modal-btn save-btn">${h(ok)}</button>
            </div></form>`, e => {
            if (e.target === wrap) return done(null);
            const b = e.target.closest('[data-act="no"]');
            if (b) done(null);
        });
        const input = wrap.querySelector('#promptInput');
        wrap.querySelector('form').addEventListener('submit', e => {
            e.preventDefault();
            done(input.value);
        });
        input.focus();
        input.select();
    });
}

/** Pastdan chiqadigan panel. */
export function openSheet(html, { onClose } = {}) {
    closeSheet();
    const back = document.createElement('div');
    back.className = 'sheet-backdrop';
    back.id = 'sheetBackdrop';
    const sheet = document.createElement('div');
    sheet.className = 'sheet';
    sheet.id = 'sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.innerHTML = `<div class="sheet-handle" aria-hidden="true"></div>${html}`;
    back.addEventListener('click', () => closeSheet());
    document.body.append(back, sheet);
    sheet._onClose = onClose;
    requestAnimationFrame(() => {
        back.classList.add('open');
        sheet.classList.add('open');
    });
    return sheet;
}

export function closeSheet() {
    const sheet = document.getElementById('sheet');
    const back = document.getElementById('sheetBackdrop');
    if (sheet?._onClose) sheet._onClose();
    sheet?.remove();
    back?.remove();
}
