// Kozir — butun ekranni egallaydigan karta (telefonni stol o'rtasiga qo'yish uchun).
// Hajmi: slayder, −/+ tugmalari yoki ikki barmoq bilan; ikki marta bosish — 100% ↔ oldingi hajm.
import { tg, haptic, setBack } from './tg.js';

const SUIT = {
    clubs: { sym: '♣', name: 'Chillak', color: 'black' },
    hearts: { sym: '♥', name: 'Chervi', color: 'red' },
    spades: { sym: '♠', name: 'Pika', color: 'black' },
    diamonds: { sym: '♦', name: "G'isht", color: 'red' }
};
const ORDER = ['clubs', 'hearts', 'spades', 'diamonds'];
const KEY = 'bura_kozir_size';
const MIN = 0.35;
const MAX = 1;
const HIDE_MS = 3500;

let st = null;

function loadSize() {
    try {
        const v = parseFloat(localStorage.getItem(KEY));
        return v >= MIN && v <= MAX ? v : MAX;
    } catch {
        return MAX;
    }
}

function saveSize(v) {
    try { localStorage.setItem(KEY, String(v)); } catch { /* xotira yo'q — muhim emas */ }
}

export function isKozirOpen() {
    return !!st;
}

function render() {
    const card = st.el.querySelector('#kfCard');
    const name = st.el.querySelector('#kfName');
    const s = SUIT[st.suit];
    if (!s) {
        card.className = 'kf-card empty';
        card.innerHTML = `<span class="kf-empty">${st.editable ? 'Pastdan kozirni tanlang' : 'Kozir tanlanmagan'}</span>`;
        name.textContent = 'Kozir tanlanmagan';
    } else {
        card.className = `kf-card ${s.color}`;
        card.innerHTML = `<span class="kf-corner tl">A<br>${s.sym}</span><span class="kf-center">${s.sym}</span><span class="kf-corner br">A<br>${s.sym}</span>`;
        name.textContent = `Kozir: ${s.name} ${s.sym}`;
    }
    const suits = st.el.querySelector('#kfSuits');
    suits.hidden = !st.editable;
    suits.querySelectorAll('.kf-suit').forEach(b => b.classList.toggle('on', b.dataset.suit === st.suit));
}

function setSize(v, persist = true) {
    const s = Math.max(MIN, Math.min(MAX, v));
    st.size = s;
    st.el.style.setProperty('--s', s.toFixed(3));
    st.el.classList.toggle('full', s >= 0.999);
    st.el.querySelector('#kfSize').value = String(Math.round(s * 100));
    st.el.querySelector('#kfPct').textContent = `${Math.round(s * 100)}%`;
    if (persist) saveSize(s);
}

function showControls(on = true) {
    st.el.classList.toggle('controls-on', on);
    clearTimeout(st.hideTimer);
    if (on) st.hideTimer = setTimeout(() => st && st.el.classList.remove('controls-on'), HIDE_MS);
}

function toggleFull() {
    if (st.size < 0.999) {
        st.prevSize = st.size;
        setSize(MAX);
    } else {
        setSize(st.prevSize && st.prevSize < 0.999 ? st.prevSize : 0.7);
    }
    haptic('light');
}

function pointerDistance() {
    const [a, b] = [...st.pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y) || 1;
}

function bind() {
    const el = st.el;
    const stage = el.querySelector('#kfStage');

    stage.addEventListener('pointerdown', e => {
        st.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (st.pointers.size === 2) {
            st.pinch = { d0: pointerDistance(), s0: st.size };
        }
    });
    stage.addEventListener('pointermove', e => {
        if (!st || !st.pointers.has(e.pointerId)) return;
        st.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (st.pinch && st.pointers.size >= 2) {
            setSize(st.pinch.s0 * (pointerDistance() / st.pinch.d0), false);
        }
    });
    const end = e => {
        if (!st) return;
        st.pointers.delete(e.pointerId);
        if (st.pinch && st.pointers.size < 2) {
            st.pinch = null;
            st.pinchEndAt = Date.now();         // shundan keyin darhol keladigan "click" — barmoqlar harakatining davomi
            saveSize(st.size);
        }
    };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);

    // Bir marta bosish — tugmalarni ko'rsatish/yashirish; ikki marta — 100% ↔ oldingi
    stage.addEventListener('click', () => {
        if (st.pinch || Date.now() - st.pinchEndAt < 350) return;
        const now = Date.now();
        if (now - st.lastTap < 320) {
            clearTimeout(st.tapTimer);
            st.lastTap = 0;
            toggleFull();
            return;
        }
        st.lastTap = now;
        st.tapTimer = setTimeout(() => st && showControls(!st.el.classList.contains('controls-on')), 320);
    });

    el.addEventListener('click', e => {
        const b = e.target.closest('[data-kf]');
        if (!b) return;
        e.stopPropagation();
        showControls(true);
        const act = b.dataset.kf;
        if (act === 'close') closeKozir();
        else if (act === 'smaller') setSize(st.size - 0.05);
        else if (act === 'bigger') setSize(st.size + 0.05);
        else if (act === 'pick' && st.editable) {
            st.suit = b.dataset.suit;
            render();
            haptic('select');
            st.onPick?.(st.suit);
        }
    });

    const range = el.querySelector('#kfSize');
    range.addEventListener('input', () => {
        setSize(Number(range.value) / 100, false);
        showControls(true);
    });
    range.addEventListener('change', () => saveSize(st.size));
}

function onKey(e) {
    if (!st) return;
    if (e.key === 'Escape') closeKozir();
    else if (e.key === '+' || e.key === '=') setSize(st.size + 0.05);
    else if (e.key === '-') setSize(st.size - 0.05);
}

async function requestWake() {
    try {
        if (st && navigator.wakeLock && document.visibilityState === 'visible') st.wake = await navigator.wakeLock.request('screen');
    } catch { /* qo'llab-quvvatlanmaydi */ }
}

function onVisibility() {
    if (st && document.visibilityState === 'visible') requestWake();
}

/** Kozirni butun ekranda ochadi. onPick(suit) — ishtirokchi kozirni shu yerdan o'zgartirsa. */
export function openKozir({ suit = null, editable = false, onPick, onClose } = {}) {
    closeKozir(true);
    const el = document.createElement('div');
    el.id = 'kozirFull';
    el.className = 'kozir-full controls-on';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Kozir');
    el.innerHTML = `
        <div class="kf-stage" id="kfStage"><div class="kf-card" id="kfCard"></div></div>
        <div class="kf-top">
            <span class="kf-name" id="kfName"></span>
            <button class="kf-btn kf-close" data-kf="close" aria-label="Yopish">✕</button>
        </div>
        <div class="kf-bottom">
            <div class="kf-suits" id="kfSuits">${ORDER.map(s => `<button class="kf-suit ${SUIT[s].color}" data-kf="pick" data-suit="${s}" aria-label="${SUIT[s].name}">${SUIT[s].sym}</button>`).join('')}</div>
            <div class="kf-size">
                <button class="kf-btn" data-kf="smaller" aria-label="Kichraytirish">−</button>
                <input id="kfSize" type="range" min="${MIN * 100}" max="100" step="1" aria-label="Kozir hajmi">
                <button class="kf-btn" data-kf="bigger" aria-label="Kattalashtirish">+</button>
                <span class="kf-pct" id="kfPct"></span>
            </div>
            <div class="kf-hint">Ikki barmoq bilan ham o'zgartirish mumkin · ikki marta bosing — 100% · bir marta — tugmalar</div>
        </div>`;
    document.body.appendChild(el);
    document.documentElement.classList.add('kozir-open');
    st = {
        el, suit, editable, onPick, onClose,
        size: loadSize(), prevSize: null, pointers: new Map(), pinch: null, pinchEndAt: 0,
        lastTap: 0, tapTimer: null, hideTimer: null, wake: null,
        tgFull: false
    };
    render();
    setSize(st.size, false);
    bind();
    showControls(true);
    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVisibility);

    // Telegram'ning to'liq ekran rejimi (Bot API 8.0+) yoki brauzer Fullscreen API
    try {
        if (tg?.requestFullscreen && tg.isVersionAtLeast?.('8.0') && !tg.isFullscreen) {
            tg.requestFullscreen();
            st.tgFull = true;
        } else if (!tg && document.documentElement.requestFullscreen && !document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
        }
    } catch { /* yo'q */ }
    requestWake();
    setBack(() => closeKozir());
    haptic('light');
}

/** O'yin holati o'zgarsa (boshqa telefon kozirni almashtirsa) — ko'rinishni yangilaydi. */
export function updateKozir({ suit, editable }) {
    if (!st) return;
    st.suit = suit;
    st.editable = editable;
    render();
}

export function closeKozir(silent = false) {
    if (!st) return;
    const s = st;
    st = null;
    clearTimeout(s.hideTimer);
    clearTimeout(s.tapTimer);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onVisibility);
    try { s.wake?.release(); } catch { /* allaqachon */ }
    try {
        if (s.tgFull && tg?.exitFullscreen) tg.exitFullscreen();
        else if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    } catch { /* yo'q */ }
    s.el.remove();
    document.documentElement.classList.remove('kozir-open');
    if (!silent) s.onClose?.();
}
