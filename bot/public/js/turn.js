// «Kim yuradi?» — tasodifiy tanlov oynasi: ⚡ bir bosishda yoki 🎡 baraban.
// Natijani server tanlaydi (hamma telefonda bir xil chiqishi uchun) — bu modul uni ko'rsatadi:
// baraban aynan server tanlagan komandaga to'xtaydi. Boshqa telefonda qilingan tanlov ham shu oynada
// «tomoshabin» rejimida ko'rsatiladi (aylanadi, natija chiqadi, o'zi yopiladi).
import { haptic, setBack } from './tg.js';
import { h, teamName } from './ui.js';
import { playSfx, isMuted, toggleMute, unlockAudio } from './music.js';

export const TEAM_COLORS = ['#c0392b', '#2f6fb5', '#1f8f6a', '#7656c2', '#c0761e', '#b8487a'];
export const teamColor = i => TEAM_COLORS[i % TEAM_COLORS.length];

const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const V_BUTTON = 900;           // °/s — tugma bilan aylantirilganda eng katta tezlik
const ACCEL = 2600;             // °/s² — tezlanish
const V_FLICK_MIN = 260;        // barmoq bilan: bundan sekin qo'yib yuborilsa — aylantirilmagan hisoblanadi
const V_FLICK_MAX = 1600;
const MIN_RUN_MS = 900;         // server javobi tez kelsa ham baraban kamida shuncha aylanadi
const SETTLE_S = REDUCED ? 1.3 : 3.4;   // to'xtash bosqichining eng qisqa davomiyligi
const AUTO_CLOSE_S = 5;         // tomoshabin oynasi shuncha soniyadan keyin o'zi yopiladi

// baraban geometriyasi (SVG viewBox birliklarida)
const VB = 240;
const C = 120;
const R = 106;
const HUB_R = 30;

let st = null;

const mod = (a, m) => ((a % m) + m) % m;
const xy = (a, r) => {
    const rad = (a * Math.PI) / 180;
    return [+(C + r * Math.sin(rad)).toFixed(2), +(C - r * Math.cos(rad)).toFixed(2)];
};
const pegCount = n => n * Math.ceil(12 / n);   // chiqillash uchun qoziqchalar (kamida 12 ta)

export function isTurnOpen() {
    return !!st;
}

export function isTurnBusy() {
    return !!st?.busy;
}

function shortName(s, max = 16) {
    return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;
}

function wheelSvg(teams, cands) {
    const n = cands.length;
    const span = 360 / n;
    const base = n <= 2 ? 15 : n <= 4 ? 13.5 : 12;
    const room = R - 12 - (HUB_R + 6);              // yozuv uchun joy: markaz tugmasidan chetgacha
    let segs = '';
    let seps = '';
    let labels = '';
    cands.forEach((ti, k) => {
        const a0 = k * span;
        const [x0, y0] = xy(a0, R);
        const [x1, y1] = xy(a0 + span, R);
        segs += `<path class="tw-seg" data-k="${k}" d="M${C},${C} L${x0},${y0} A${R},${R} 0 ${span > 180 ? 1 : 0} 1 ${x1},${y1} Z" fill="${teamColor(ti)}"/>`;
        const [sx, sy] = xy(a0, HUB_R);
        seps += `<line x1="${sx}" y1="${sy}" x2="${x0}" y2="${y0}"/>`;
        const name = shortName(teamName(teams[ti]));
        const fs = Math.max(8.5, Math.min(base, room / (name.length * 0.6)));
        const fit = name.length * fs * 0.6 > room ? ` textLength="${room}" lengthAdjust="spacingAndGlyphs"` : '';
        labels += `<text class="tw-label" data-k="${k}" x="${C + R - 12}" y="${C}" font-size="${fs.toFixed(1)}" text-anchor="end" dominant-baseline="central" transform="rotate(${(a0 + span / 2 - 90).toFixed(2)} ${C} ${C})"${fit}>${h(name)}</text>`;
    });
    let pegs = '';
    const P = pegCount(n);
    for (let p = 0; p < P; p++) {
        const [px, py] = xy((p * 360) / P, R + 4);
        pegs += `<circle cx="${px}" cy="${py}" r="2.6"/>`;
    }
    return `<svg viewBox="0 0 ${VB} ${VB}" aria-hidden="true">
        <defs>
            <linearGradient id="twGold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbe7a1"/><stop offset=".5" stop-color="#cf9f33"/><stop offset="1" stop-color="#f3d27a"/></linearGradient>
            <radialGradient id="twShade" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff" stop-opacity=".2"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></radialGradient>
        </defs>
        <circle cx="${C}" cy="${C}" r="${R + 9}" fill="#082a1e"/>
        <g>${segs}</g>
        <circle cx="${C}" cy="${C}" r="${R}" fill="url(#twShade)"/>
        <g class="tw-seps">${seps}</g>
        <g>${labels}</g>
        <circle class="tw-rim" cx="${C}" cy="${C}" r="${R + 4}" fill="none" stroke="url(#twGold)" stroke-width="9"/>
        <g class="tw-pegs">${pegs}</g>
    </svg>`;
}

function shell() {
    const sp = st.spectator;
    const top = sp
        ? `<div class="tf-who">${sp.mode === 'wheel' ? '🎡' : '⚡'} <b>${h(sp.byName)}</b> ${sp.mode === 'wheel' ? 'barabanni aylantirdi' : 'aniqladi'}</div>`
        : `<div class="tf-modes" role="tablist" aria-label="Tanlash usuli">
              <button class="tf-mode" role="tab" data-tf="mode" data-mode="quick">⚡ Bir bosishda</button>
              <button class="tf-mode" role="tab" data-tf="mode" data-mode="wheel">🎡 Baraban</button>
           </div>`;
    return `
        <div class="tf-top">${top}
            <div class="tf-tools">
                <button class="tf-x" id="tfSound" data-tf="sound"></button>
                <button class="tf-x" data-tf="close" aria-label="Yopish">✕</button>
            </div>
        </div>
        <h2 class="tf-title">🎲 Kim yuradi?</h2>
        <div class="tf-stage" id="tfStage"></div>
        <div class="tf-result" id="tfResult" aria-live="polite"></div>
        <div class="tf-actions" id="tfActions"></div>
        <div class="tf-hint" id="tfHint"></div>`;
}

function renderStage() {
    const stage = st.el.querySelector('#tfStage');
    if (st.mode === 'wheel') {
        stage.innerHTML = `<div class="tw" id="tw">
            <svg class="tw-pointer" id="twPointer" viewBox="0 0 40 52" aria-hidden="true">
                <defs><linearGradient id="twPtr" x1="0" x2="1"><stop offset="0" stop-color="#fbe7a1"/><stop offset="1" stop-color="#b8860b"/></linearGradient></defs>
                <path d="M20 50 L5 17 Q20 -4 35 17 Z" fill="url(#twPtr)" stroke="#6b4a00" stroke-width="2" stroke-linejoin="round"/>
                <circle cx="20" cy="15" r="5" fill="#0b3426" stroke="#fbe7a1" stroke-width="1.5"/>
            </svg>
            <div class="tw-rotor" id="twRotor">${wheelSvg(st.teams, st.cands)}</div>
            <button class="tw-hub" data-tf="go" aria-label="Barabanni aylantirish"${st.spectator ? ' tabindex="-1"' : ''}><span>♠</span></button>
            <div class="tf-confetti" id="tfConfetti"></div>
        </div>`;
        applyRot();
        st.lastPeg = pegIndex();
        bindWheel();
    } else {
        stage.innerHTML = `<div class="tq">
            <div class="tq-card" id="tqCard"><span class="tq-corner tl">?</span><div class="tq-name" id="tqName">?</div><span class="tq-corner br">?</span></div>
            <div class="tf-confetti" id="tfConfetti"></div>
        </div>`;
    }
    st.el.querySelectorAll('.tf-mode').forEach(b => {
        const on = b.dataset.mode === st.mode;
        b.classList.toggle('on', on);
        b.setAttribute('aria-selected', String(on));
    });
}

/** state: idle | busy | done | error */
function renderActions(state) {
    const box = st.el.querySelector('#tfActions');
    const hint = st.el.querySelector('#tfHint');
    const wheel = st.mode === 'wheel';
    st.el.querySelectorAll('.tf-mode').forEach(b => { b.disabled = state === 'busy'; });
    if (st.spectator) {
        box.innerHTML = state === 'done' ? `<button class="tf-done wide" id="tfAuto" data-tf="close">Yopish</button>` : '';
        hint.textContent = '';
        return;
    }
    const again = state === 'done' || state === 'error';
    const label = state === 'busy'
        ? (wheel ? 'Aylanmoqda…' : 'Aniqlanmoqda…')
        : wheel ? (again ? '🎡 Yana aylantirish' : '🎡 Aylantirish') : (again ? '⚡ Yana aniqlash' : '⚡ Aniqlash');
    box.innerHTML = `<button class="tf-go" data-tf="go"${state === 'busy' ? ' disabled' : ''}>${label}</button>${state === 'done' ? '<button class="tf-done" data-tf="close">✓ Tayyor</button>' : ''}`;
    hint.textContent = wheel && state !== 'busy' ? 'Barabanni barmoq bilan ham aylantirish mumkin' : '';
}

function renderSound() {
    const b = st.el.querySelector('#tfSound');
    const muted = isMuted();
    b.textContent = muted ? '🔇' : '🔊';
    b.setAttribute('aria-label', muted ? 'Ovozni yoqish' : "Ovozni o'chirish");
}

function setResultHtml(html) {
    st.el.querySelector('#tfResult').innerHTML = html;
}

function showWait(text) {
    setResultHtml(text ? `<div class="tr-wait">${h(text)}</div>` : '');
}

function showError(err) {
    setResultHtml(`<div class="tr-err">⚠️ ${h(err?.message || 'Xatolik yuz berdi')}</div>`);
    renderActions('error');
    haptic('error');
}

function reveal(turn) {
    const s = st;
    const name = h(teamName(s.teams[turn.team]));
    // bir bosishda — ism kartaning o'zida katta yozilgan, pastda faqat «yuradi!»
    setResultHtml(s.mode === 'quick'
        ? `<div class="tr-sub big" aria-hidden="true">yuradi! 🎉</div><span class="sr-only">${name} yuradi</span>`
        : `<div class="tr-big" style="--c:${teamColor(turn.team)}"><span class="tr-chip">${name}</span></div><div class="tr-sub">yuradi! 🎉</div>`);
    playSfx('win');
    haptic('success');
    confetti(teamColor(turn.team));
    renderActions('done');
    if (s.spectator) {
        let left = AUTO_CLOSE_S;
        const upd = () => { const b = s.el.querySelector('#tfAuto'); if (b) b.textContent = `Yopish (${left})`; };
        upd();
        s.countdown = setInterval(() => {
            left -= 1;
            if (left > 0) return upd();
            clearInterval(s.countdown);
            if (st === s) closeTurn();
        }, 1000);
    } else {
        s.el.querySelector('.tf-done')?.focus({ preventScroll: true });
    }
}

function confetti(color) {
    const box = st.el.querySelector('#tfConfetti');
    if (REDUCED || !box || !box.animate) return;
    const colors = [color, '#e2b74a', '#ffffff', '#fbe7a1', color];
    for (let i = 0; i < 44; i++) {
        const bit = document.createElement('i');
        bit.className = 'tf-bit';
        bit.style.background = colors[i % colors.length];
        const a = Math.random() * Math.PI * 2;
        const d = 80 + Math.random() * 160;
        const x = Math.cos(a) * d;
        const y = Math.sin(a) * d * 0.8 - 50;
        const r = Math.random() * 900 - 450;
        bit.animate([
            { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
            { transform: `translate(${x.toFixed(0)}px,${y.toFixed(0)}px) rotate(${(r / 2).toFixed(0)}deg)`, opacity: 1, offset: 0.35 },
            { transform: `translate(${(x * 1.15).toFixed(0)}px,${(y + 260).toFixed(0)}px) rotate(${r.toFixed(0)}deg)`, opacity: 0 }
        ], { duration: 1200 + Math.random() * 700, easing: 'ease-out', fill: 'forwards' });
        box.appendChild(bit);
    }
    clearTimeout(st.confettiTimer);
    st.confettiTimer = setTimeout(() => box.replaceChildren(), 2100);
}

// ---------------------------------------------------------------- baraban
function applyRot() {
    const r = st?.el.querySelector('#twRotor');
    if (r) r.style.transform = `rotate(${st.rot.toFixed(2)}deg)`;
}

/** Strelka tagidagi qoziqcha raqami (o'zgarsa — chiqillash). */
function pegIndex() {
    const P = pegCount(st.cands.length);
    return Math.floor(mod(-st.rot, 360) / (360 / P));
}

/** Strelka tagidagi bo'lak (komandaning barabandagi o'rni). */
function segmentUnderPointer() {
    return Math.floor(mod(-st.rot, 360) / (360 / st.cands.length));
}

function checkTick(now, dir) {
    const p = pegIndex();
    if (p === st.lastPeg) return;
    st.lastPeg = p;
    if (now - st.lastTickAt > 28) {
        playSfx('tick');
        st.lastTickAt = now;
    }
    if (now - st.lastHapticAt > 45) {
        haptic('select');
        st.lastHapticAt = now;
    }
    const ptr = st.el.querySelector('#twPointer');
    if (ptr?.animate) {
        ptr.animate([{ transform: `rotate(${dir >= 0 ? -20 : 20}deg)` }, { transform: 'rotate(0deg)' }],
            { duration: 150, easing: 'cubic-bezier(.3,1.5,.5,1)' });
    }
}

/**
 * To'xtash rejasi: hozirgi tezlikdan silliq sekinlashib (kubik), k-bo'lakning ichida to'xtaydi.
 * Davomiylik tezlikka moslanadi (T = 3D/v), shuning uchun sekinlashish "sakramaydi".
 */
function settlePlan(rot, vel, k) {
    const span = 360 / st.cands.length;
    const phi = k * span + span / 2 + (Math.random() * 2 - 1) * span * 0.36;  // bo'lak chetiga juda yaqin emas
    const want = mod(-phi, 360);
    const dir = Math.sign(vel) || 1;
    const v = Math.max(120, Math.abs(vel));
    let D = dir > 0 ? mod(want - rot, 360) : mod(rot - want, 360);
    const minD = (v * SETTLE_S) / 3;
    while (D < minD) D += 360;
    return { from: rot, D: dir * D, T: Math.min(7000, ((3 * D) / v) * 1000), k };
}

function spin({ velocity = null } = {}) {
    if (!st || st.busy || st.mode !== 'wheel') return;
    const s = st;
    s.busy = true;
    const box = s.el.querySelector('#tw');
    box.classList.remove('done');
    box.querySelectorAll('.win').forEach(e => e.classList.remove('win'));
    box.querySelector('.tw-glow')?.remove();
    renderActions('busy');
    showWait(s.spectator ? '' : 'Aylanmoqda…');
    haptic('medium');

    const flick = velocity !== null;
    const dir = flick ? Math.sign(velocity) : 1;
    const vMax = flick ? Math.abs(velocity) : V_BUTTON;
    let vel = flick ? velocity : 0;
    let result = null;
    let failed = null;
    (s.spectator ? Promise.resolve(s.spectator) : s.request('wheel')).then(t => { result = t; }, e => { failed = e; });

    const t0 = performance.now();
    let last = t0;
    let plan = null;
    const step = now => {
        if (st !== s) return;                         // oyna yopildi
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (!plan) {
            if (!flick) vel = dir * Math.min(vMax, Math.abs(vel) + ACCEL * dt);
            s.rot += vel * dt;
            if (failed) {
                plan = { from: s.rot, D: (vel * 0.6) / 3, T: 600, k: -1, start: now, failed };
            } else if (result && now - t0 >= (s.spectator ? 450 : MIN_RUN_MS) && Math.abs(vel) >= vMax * 0.98) {
                const k = s.cands.indexOf(result.team);
                plan = k >= 0
                    ? { ...settlePlan(s.rot, vel, k), start: now }
                    : { from: s.rot, D: (vel * 0.6) / 3, T: 600, k: -1, start: now };   // komanda barabanda yo'q (kamdan-kam)
            }
        } else {
            const u = Math.min(1, (now - plan.start) / plan.T);
            s.rot = plan.from + plan.D * (1 - Math.pow(1 - u, 3));
            if (u >= 1) {
                applyRot();
                s.raf = null;
                s.busy = false;
                if (plan.failed) return showError(plan.failed);
                return finishWheel(result, plan.k);
            }
        }
        applyRot();
        checkTick(now, dir);
        s.raf = requestAnimationFrame(step);
    };
    s.raf = requestAnimationFrame(step);
}

function finishWheel(turn, k) {
    const box = st.el.querySelector('#tw');
    if (k >= 0 && box) {
        box.classList.add('done');
        box.querySelectorAll(`[data-k="${k}"]`).forEach(e => e.classList.add('win'));
        const seg = box.querySelector(`.tw-seg[data-k="${k}"]`);
        const rim = box.querySelector('.tw-rim');
        if (seg && rim) {
            const glow = seg.cloneNode();
            glow.setAttribute('class', 'tw-glow');
            glow.removeAttribute('data-k');
            glow.setAttribute('fill', 'none');
            rim.parentNode.insertBefore(glow, rim);
        }
    }
    reveal(turn);
}

function bindWheel() {
    const box = st.el.querySelector('#tw');
    if (!box || st.spectator) return;
    const angleAt = e => {
        const r = box.getBoundingClientRect();
        return (Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))) * 180) / Math.PI;
    };
    box.addEventListener('pointerdown', e => {
        if (!st || st.busy) return;
        unlockAudio();
        st.drag = { id: e.pointerId, prev: angleAt(e), moved: 0, samples: [{ t: performance.now(), rot: st.rot }] };
        try { box.setPointerCapture(e.pointerId); } catch { /* eski brauzer */ }
    });
    box.addEventListener('pointermove', e => {
        const d = st?.drag;
        if (!d || d.id !== e.pointerId || st.busy) return;
        const a = angleAt(e);
        let delta = a - d.prev;
        if (delta > 180) delta -= 360;
        else if (delta < -180) delta += 360;
        d.prev = a;
        d.moved += Math.abs(delta);
        st.rot += delta;
        const now = performance.now();
        d.samples.push({ t: now, rot: st.rot });
        while (d.samples.length > 2 && now - d.samples[0].t > 100) d.samples.shift();
        applyRot();
        checkTick(now, Math.sign(delta));
    });
    const end = e => {
        const d = st?.drag;
        if (!d || d.id !== e.pointerId) return;
        st.drag = null;
        if (st.busy || e.type === 'pointercancel') return;
        unlockAudio();
        const now = performance.now();
        const first = d.samples.find(x => now - x.t <= 100) || d.samples[0];
        const dt = (now - first.t) / 1000;
        const v = dt > 0.008 ? (st.rot - first.rot) / dt : 0;
        if (d.moved < 4) return spin();                                 // oddiy bosish — tugma kabi
        if (Math.abs(v) >= V_FLICK_MIN) return spin({ velocity: Math.sign(v) * Math.min(V_FLICK_MAX, Math.abs(v)) });
        st.el.querySelector('#tfHint').textContent = "Kuchliroq aylantiring — yoki tugmani bosing";
    };
    box.addEventListener('pointerup', end);
    box.addEventListener('pointercancel', end);
}

// ---------------------------------------------------------------- bir bosishda
function quick() {
    if (!st || st.busy || st.mode !== 'quick') return;
    const s = st;
    s.busy = true;
    const card = s.el.querySelector('#tqCard');
    const nameEl = s.el.querySelector('#tqName');
    card.classList.remove('done');
    card.style.removeProperty('--c');
    card.classList.toggle('rolling', !REDUCED);
    s.el.querySelectorAll('.tq-corner').forEach(c => { c.textContent = '?'; });
    renderActions('busy');
    showWait(s.spectator ? '' : 'Aniqlanmoqda…');
    haptic('medium');

    let result = null;
    let failed = null;
    (s.spectator ? Promise.resolve(s.spectator) : s.request('quick')).then(t => { result = t; }, e => { failed = e; });

    const t0 = performance.now();
    let shown = -1;
    let tail = null;
    const other = not => {
        const pool = s.cands.filter(c => c !== not);
        return pool[Math.floor(Math.random() * pool.length)];
    };
    const show = ti => {
        shown = ti;
        nameEl.textContent = teamName(s.teams[ti]);
        nameEl.classList.remove('flip');
        void nameEl.offsetWidth;
        nameEl.classList.add('flip');
        playSfx('blip');
        const now = performance.now();
        if (now - s.lastHapticAt > 45) {
            haptic('select');
            s.lastHapticAt = now;
        }
    };
    /** Oxirgi qadamlar: sekinlashib, aynan natijada to'xtaydi (har qadamda ism almashadi). */
    const tailFor = target => {
        const len = s.cands.length === 2 ? (target === shown ? 4 : 5) : 4;
        for (;;) {
            const seq = [target];
            while (seq.length < len) seq.unshift(other(seq[0]));
            if (seq[0] !== shown) return seq;
        }
    };
    const next = () => {
        if (st !== s) return;
        if (failed) {
            card.classList.remove('rolling');
            s.busy = false;
            nameEl.textContent = '?';
            return showError(failed);
        }
        if (!tail && result && performance.now() - t0 >= (s.spectator ? 350 : 650)) {
            const seq = tailFor(result.team);
            tail = { seq, i: 0, delays: [80, 110, 150, 205, 290].slice(-seq.length) };
        }
        if (tail) {
            if (tail.i < tail.seq.length) {
                show(tail.seq[tail.i]);
                s.timer = setTimeout(next, tail.delays[tail.i++]);
            } else {
                finishQuick(result);
            }
            return;
        }
        show(other(shown));
        s.timer = setTimeout(next, 65);
    };
    next();
}

function finishQuick(turn) {
    const s = st;
    s.busy = false;
    const card = s.el.querySelector('#tqCard');
    card.classList.remove('rolling');
    card.style.setProperty('--c', teamColor(turn.team));
    card.classList.add('done');
    s.el.querySelector('#tqName').textContent = teamName(s.teams[turn.team]);
    s.el.querySelectorAll('.tq-corner').forEach(c => { c.textContent = '★'; });
    reveal(turn);
}

// ---------------------------------------------------------------- oyna
function onClick(e) {
    if (!st) return;
    const b = e.target.closest('[data-tf]');
    if (!b) {
        if (st.spectator && !st.busy) closeTurn();     // tomoshabin: istalgan joyni bosish — yopish
        return;
    }
    const act = b.dataset.tf;
    if (act === 'close') {
        closeTurn();
    } else if (act === 'sound') {
        toggleMute();
        renderSound();
    } else if (act === 'mode') {
        if (st.busy || st.spectator || b.dataset.mode === st.mode) return;
        st.mode = b.dataset.mode;
        renderStage();
        setResultHtml('');
        renderActions('idle');
        haptic('select');
    } else if (act === 'go' && !st.spectator) {
        if (st.mode === 'wheel') spin();
        else quick();
    }
}

function onKey(e) {
    if (!st) return;
    if (e.key === 'Escape') closeTurn();
}

/**
 * Oynani ochadi.
 *  request(mode) → Promise<turn> — serverdan tanlov (o'zimiz aniqlaganda)
 *  spectator — boshqa telefonda qilingan tanlov (turn): aylanadi, natijani ko'rsatadi, o'zi yopiladi
 *  autoStart — «bir bosishda»: oyna ochilishi bilan darhol aniqlaydi
 */
export function openTurn({ mode = 'wheel', teams, cands, request = null, spectator = null, autoStart = false, onClose } = {}) {
    closeTurn(true);
    const el = document.createElement('div');
    el.className = `turn-full${spectator ? ' spectator' : ''}`;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Kim yuradi?');
    el.tabIndex = -1;
    st = {
        el, teams, cands, request, spectator, onClose,
        mode: spectator ? spectator.mode : mode,
        busy: false, rot: Math.random() * 360, raf: null, timer: null, countdown: null, confettiTimer: null,
        lastPeg: null, lastTickAt: 0, lastHapticAt: 0, drag: null,
        // fokus o'yin ekranida qolsa, brauzer orqadagi sahifani aylantirib yuborishi mumkin —
        // fokusni oynaga olamiz, yopilganda sahifa va fokus joyiga qaytadi
        prevFocus: document.activeElement, scrollY: window.scrollY
    };
    el.innerHTML = shell();
    document.body.appendChild(el);
    document.documentElement.classList.add('turn-open');
    el.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    renderStage();
    renderSound();
    renderActions('idle');
    setBack(() => closeTurn());
    if (spectator || autoStart) {
        el.focus({ preventScroll: true });
        if (st.mode === 'wheel') spin();
        else quick();
    } else {
        (el.querySelector('.tf-go') || el).focus({ preventScroll: true });
    }
}

export function closeTurn(silent = false) {
    if (!st) return;
    const s = st;
    st = null;
    if (s.raf) cancelAnimationFrame(s.raf);
    clearTimeout(s.timer);
    clearTimeout(s.confettiTimer);
    clearInterval(s.countdown);
    document.removeEventListener('keydown', onKey);
    s.el.remove();
    document.documentElement.classList.remove('turn-open');
    if (Math.abs(window.scrollY - s.scrollY) > 1) window.scrollTo(0, s.scrollY);
    if (s.prevFocus?.isConnected && s.prevFocus !== document.body) {
        try { s.prevFocus.focus({ preventScroll: true }); } catch { /* muhim emas */ }
    }
    if (!silent) s.onClose?.();
}

/** Test va diagnostika uchun: strelka tagidagi komanda (baraban to'xtagandan keyin). */
export function wheelPointerTeam() {
    if (!st || st.mode !== 'wheel') return null;
    return st.cands[segmentUnderPointer()];
}
