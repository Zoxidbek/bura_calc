let teams = [];
let currentTeamCount = 0;
let currentEditingTeamId = null;

// O'yinni boshlash (names — ixtiyoriy: tarixdagi o'yin nomlari bilan boshlash uchun)
function startGame(teamCount, names) {
    currentTeamCount = teamCount;
    teams = [];

    for (let i = 0; i < teamCount; i++) {
        teams.push({
            id: i,
            name: (names && names[i]) || `${i + 1}-komanda`,
            score: 0,
            eliminated: false
        });
    }

    beginSession();
    showScreen('scoreScreen');
    renderTeams();
}

// Komandalarni ekranga chiqarish
function renderTeams() {
    const container = document.getElementById('teamsContainer');
    container.innerHTML = '';
    
    teams.forEach((team, index) => {
        const teamCard = document.createElement('div');
        teamCard.className = `team-card ${team.eliminated ? 'eliminated' : ''}`;

        // Faqat vizual animatsiyalar (hisob qoidalariga ta'sir qilmaydi)
        const prev = prevRender[team.id];
        let scoreClass = '';
        if (!prev) {
            teamCard.classList.add('card-enter');
            teamCard.style.animationDelay = (index * 0.07) + 's';
        } else {
            if (prev.score !== team.score) scoreClass = team.score > prev.score ? 'pop-up' : 'pop-down';
            if (team.eliminated && !prev.eliminated) teamCard.classList.add('just-eliminated');
        }
        prevRender[team.id] = { score: team.score, eliminated: team.eliminated };

        teamCard.innerHTML = `
            <button class="score-btn minus-btn" onclick="updateScore(${team.id}, -2)"
                    ${team.eliminated ? 'disabled' : ''}>-</button>

            <div class="team-info">
                <div class="team-name" onclick="showEditModal(${team.id})">${escapeHtml(team.name)}</div>
                <div class="team-score ${scoreClass}">${team.score}</div>
            </div>
            
            <button class="score-btn plus-btn" onclick="updateScore(${team.id}, 2)" 
                    ${team.eliminated ? 'disabled' : ''}>+</button>
        `;
        
        container.appendChild(teamCard);
    });

    saveCurrentGame();
}

function updateScore(teamId, points) {
    const team = teams.find(t => t.id === teamId);
    
    if (team.eliminated) return;
    
    const newScore = team.score + points;
    if (newScore < 0) return;
    
    team.score = newScore;
    
    // 12 ga yetganda yo'q qilish
    if (team.score >= 12 && !team.eliminated) {
        team.eliminated = true;
        eliminateTeam(teamId);
    }
    
    renderTeams();
    checkWinner();
}

// Komandani yo'q qilish animatsiyasi
function eliminateTeam(teamId) {
    const teamCards = document.querySelectorAll('.team-card');
    const teamCard = teamCards[teamId];
    
    if (teamCard) {
        teamCard.classList.add('shake');
        setTimeout(() => {
            teamCard.classList.add('eliminated');
            teamCard.classList.remove('shake');
        }, 500);
    }
}

function checkWinner() {
    const activeTeams = teams.filter(team => !team.eliminated);
    
    // Faqat bitta komanda qolganda g'olib
    if (activeTeams.length === 1) {
        const winner = activeTeams[0];
        showWinner(winner);
        createConfetti();
    }
}

// Konfetti animatsiyasi
function createConfetti() {
    const colors = ['#ffd700', '#ff6b6b', '#51cf66', '#667eea', '#ffa502'];
    
    for (let i = 0; i < 100; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.left = Math.random() * 100 + 'vw';
        confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.width = Math.random() * 10 + 5 + 'px';
        confetti.style.height = Math.random() * 10 + 5 + 'px';
        confetti.style.animationDelay = Math.random() * 2 + 's';
        
        document.body.appendChild(confetti);
        
        // Konfettini tozalash
        setTimeout(() => {
            if (confetti.parentNode) {
                confetti.parentNode.removeChild(confetti);
            }
        }, 5000);
    }
}

function showWinner(winner) {
    document.getElementById('winnerText').textContent = winner.name;
    recordFinishedGame(winner);
    showScreen('winnerScreen');
    startCelebration();
}

function newGame() {
    // Konfettilarni tozalash
    document.querySelectorAll('.confetti').forEach(confetti => confetti.remove());
    resetExtras();
    showScreen('teamSelection');
}

function showEditModal(teamId) {
    currentEditingTeamId = teamId;
    const team = teams.find(t => t.id === teamId);
    
    const existingModal = document.getElementById('editModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    let modal = document.createElement('div');
    modal.id = 'editModal';
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <h3>Komanda nomini o'zgartirish</h3>
            <input type="text" id="teamNameInput" placeholder="Komanda nomi" maxlength="24"
                   autocomplete="off" value="${escapeHtml(team.name)}">
            <div id="suggestBox" class="suggest-box"></div>
            <div class="modal-buttons">
                <button class="modal-btn cancel-btn" onclick="hideEditModal()">Bekor qilish</button>
                <button class="modal-btn save-btn" onclick="saveTeamName(${teamId})">Saqlash</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    document.getElementById('teamNameInput').value = team.name;
    modal.classList.add('active');
    document.getElementById('teamNameInput').focus();
    setupNameSuggestions(teamId);
}

function hideEditModal() {
    const modal = document.getElementById('editModal');
    if (modal) {
        modal.classList.remove('active');
        setTimeout(() => {
            if (modal.parentNode) {
                modal.parentNode.removeChild(modal);
            }
        }, 300);
    }
    currentEditingTeamId = null;
}

function saveTeamName(teamId) {
    const input = document.getElementById('teamNameInput');
    const newName = input.value.trim();
    
    if (newName) {
        const team = teams.find(t => t.id === teamId);
        team.name = newName;
        renderTeams();
    }
    
    hideEditModal();
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    
    document.getElementById(screenId).classList.add('active');
    if (screenId === 'teamSelection') renderHome();
    window.scrollTo(0, 0);
}

document.addEventListener('keypress', function(event) {
    if (event.key === 'Enter') {
        const modal = document.getElementById('editModal');
        if (modal && modal.classList.contains('active') && currentEditingTeamId !== null) {
            saveTeamName(currentEditingTeamId);
        }
    }
});

function exitToMain() {
    // Konfettilarni tozalash
    document.querySelectorAll('.confetti').forEach(confetti => confetti.remove());
    resetExtras();
    markCurrentLeft();
    showScreen('teamSelection');
}

/* =========================================================
   QO'SHIMCHALAR (faqat vizual/ovoz — o'yin qoidalariga tegmaydi)
   ========================================================= */

let prevRender = {};          // animatsiya uchun oldingi holat
let selectedSuit = null;      // tanlangan kozir (faqat belgi)

const SUIT_NAMES = {
    clubs: 'Chillak ♣',
    hearts: 'Chervi ♥',
    spades: 'Pika ♠',
    diamonds: "G'isht ♦"
};

function resetExtras() {
    prevRender = {};
    stopCelebration();
    setSuit(null);
}

// ---------- Kozir kartalari ----------
function setSuit(suit) {
    selectedSuit = suit;
    document.querySelectorAll('.suit-card').forEach(card => {
        card.classList.toggle('selected', card.dataset.suit === suit);
        card.classList.toggle('dimmed', suit !== null && card.dataset.suit !== suit);
    });
    const label = document.getElementById('suitLabel');
    if (label) {
        label.textContent = suit ? 'Kozir: ' + SUIT_NAMES[suit] + " · o'zgartirish uchun bosing" : 'Kozirni tanlang';
        label.classList.toggle('active', !!suit);
        label.classList.toggle('red', suit === 'hearts' || suit === 'diamonds');
    }
}

document.querySelectorAll('.suit-card').forEach(card => {
    card.addEventListener('click', () => {
        card.classList.remove('flip');
        void card.offsetWidth; // animatsiyani qayta ishga tushirish
        card.classList.add('flip');
        setSuit(selectedSuit === card.dataset.suit ? null : card.dataset.suit);
        if (session) {
            session.k = selectedSuit;
            saveCurrentGame();
        }
    });
    card.addEventListener('animationend', e => {
        if (e.animationName === 'cardFlip') card.classList.remove('flip');
    });
});

// ---------- G'olib musiqasi (Web Audio, internetsiz ishlaydi) ----------
let audioCtx = null;
let musicMaster = null;
let musicOscillators = [];
let soundMuted = false;

const NOTE = {
    C3: 130.81, G3: 196.00, F3: 174.61,
    C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, B4: 493.88,
    C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.00,
    C6: 1046.50, E6: 1318.51, G6: 1567.98
};

function getAudioCtx() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
}

function playTone(ctx, dest, freq, start, dur, type, vol) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(vol, start + 0.03);
    gain.gain.setValueAtTime(vol, start + Math.max(0.04, dur * 0.6));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(start);
    osc.stop(start + dur + 0.05);
    musicOscillators.push(osc);
}

function playWinnerMusic() {
    stopWinnerMusic();
    const ctx = getAudioCtx();
    if (!ctx) return;

    musicMaster = ctx.createGain();
    musicMaster.gain.value = soundMuted ? 0 : 0.55;
    musicMaster.connect(ctx.destination);

    // "Mis" ovozi uchun yumshatuvchi filtr
    const brass = ctx.createBiquadFilter();
    brass.type = 'lowpass';
    brass.frequency.value = 2400;
    brass.connect(musicMaster);

    const t0 = ctx.currentTime + 0.08;
    const beat = 0.15;

    // Fanfara: [nota, boshlanish (beat), davomiyligi (beat)]
    const melody = [
        ['G4', 0, 1], ['G4', 1, 1], ['G4', 2, 1], ['C5', 3, 4],
        ['G4', 7, 1], ['C5', 8, 1], ['E5', 9, 4],
        ['C5', 13, 1], ['E5', 14, 1], ['G5', 15, 5],
        ['E5', 20, 1.5], ['F5', 21.5, 1.5], ['G5', 23, 1.5], ['A5', 24.5, 1.5],
        ['G5', 26, 2], ['C6', 28, 10]
    ];
    melody.forEach(([n, b, l]) => {
        playTone(ctx, brass, NOTE[n], t0 + b * beat, l * beat * 1.05, 'sawtooth', 0.16);
        playTone(ctx, musicMaster, NOTE[n], t0 + b * beat, l * beat * 1.1, 'triangle', 0.18);
    });

    // Akkordlar va bas
    const chords = [
        [3, 4, ['C4', 'E4', 'G4'], 'C3'],
        [9, 4, ['C4', 'E4', 'G4'], 'C3'],
        [15, 5, ['C4', 'E4', 'G4'], 'C3'],
        [20, 6, ['F4', 'A4', 'C5'], 'F3'],
        [26, 2, ['D4', 'G4', 'B4'], 'G3'],
        [28, 10, ['C4', 'E4', 'G4', 'C5'], 'C3']
    ];
    chords.forEach(([b, l, notes, bass]) => {
        notes.forEach(n => playTone(ctx, musicMaster, NOTE[n], t0 + b * beat, l * beat, 'triangle', 0.07));
        playTone(ctx, musicMaster, NOTE[bass], t0 + b * beat, l * beat, 'sine', 0.22);
    });

    // Yakunda yaltiroq arpedjio
    ['C6', 'E6', 'G6', 'C6', 'E6', 'G6'].forEach((n, i) => {
        playTone(ctx, musicMaster, NOTE[n], t0 + (30 + i * 0.75) * beat, beat * 1.2, 'sine', 0.08);
    });
}

function stopWinnerMusic() {
    musicOscillators.forEach(o => { try { o.stop(); } catch (e) { /* allaqachon to'xtagan */ } });
    musicOscillators = [];
    if (musicMaster) {
        try { musicMaster.disconnect(); } catch (e) {}
        musicMaster = null;
    }
}

function toggleWinnerSound() {
    soundMuted = !soundMuted;
    const btn = document.getElementById('soundBtn');
    if (btn) btn.textContent = soundMuted ? '🔇' : '🔊';
    if (musicMaster && audioCtx) {
        musicMaster.gain.setTargetAtTime(soundMuted ? 0 : 0.55, audioCtx.currentTime, 0.05);
    } else if (!soundMuted) {
        playWinnerMusic();
    }
}

// ---------- Bayram effektlari ----------
let celebrationTimers = [];
let fireworksRaf = null;
let fireworksCanvas = null;

function startCelebration() {
    stopCelebration();
    playWinnerMusic();

    // Qo'shimcha konfetti to'lqinlari
    celebrationTimers.push(setTimeout(createConfetti, 1500));
    celebrationTimers.push(setTimeout(createConfetti, 3200));

    // Yog'ilayotgan karta belgilari
    for (let i = 0; i < 28; i++) {
        celebrationTimers.push(setTimeout(dropSuit, i * 180));
    }

    startFireworks(7000);
}

function stopCelebration() {
    celebrationTimers.forEach(t => clearTimeout(t));
    celebrationTimers = [];
    stopWinnerMusic();
    stopFireworks();
    document.querySelectorAll('.falling-suit').forEach(el => el.remove());
}

function dropSuit() {
    const suits = ['♣', '♥', '♠', '♦'];
    const s = suits[Math.floor(Math.random() * suits.length)];
    const el = document.createElement('div');
    el.className = 'falling-suit ' + ((s === '♥' || s === '♦') ? 'red' : (Math.random() < 0.3 ? 'gold' : 'black'));
    el.textContent = s;
    el.style.left = Math.random() * 100 + 'vw';
    el.style.fontSize = (Math.random() * 22 + 22) + 'px';
    el.style.animationDuration = (Math.random() * 2 + 3) + 's';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 5500);
}

function startFireworks(duration) {
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;

    fireworksCanvas = document.createElement('canvas');
    fireworksCanvas.className = 'fireworks-canvas';
    document.body.appendChild(fireworksCanvas);
    const ctx = fireworksCanvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    function resize() {
        fireworksCanvas.width = window.innerWidth * dpr;
        fireworksCanvas.height = window.innerHeight * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();

    const colors = ['#f2c94c', '#ff5d5d', '#ffffff', '#6fe3a5', '#ffb347'];
    let particles = [];
    const startTime = performance.now();
    let lastBurst = 0;

    function burst() {
        const w = window.innerWidth, h = window.innerHeight;
        const x = w * (0.1 + Math.random() * 0.8);
        const y = h * (0.12 + Math.random() * 0.35);
        const color = colors[Math.floor(Math.random() * colors.length)];
        const count = 46;
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 * i) / count;
            const speed = 2 + Math.random() * 3.2;
            particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1,
                decay: 0.012 + Math.random() * 0.01,
                color
            });
        }
    }

    function frame(now) {
        const elapsed = now - startTime;
        if (elapsed < duration && now - lastBurst > 420) {
            burst();
            lastBurst = now;
        }
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        particles = particles.filter(p => p.life > 0);
        particles.forEach(p => {
            p.vx *= 0.985;
            p.vy = p.vy * 0.985 + 0.045;
            p.x += p.vx;
            p.y += p.vy;
            p.life -= p.decay;
            ctx.globalAlpha = Math.max(p.life, 0);
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 2.4, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.globalAlpha = 1;

        if (elapsed < duration || particles.length) {
            fireworksRaf = requestAnimationFrame(frame);
        } else {
            stopFireworks();
        }
    }
    fireworksRaf = requestAnimationFrame(frame);
}

function stopFireworks() {
    if (fireworksRaf) cancelAnimationFrame(fireworksRaf);
    fireworksRaf = null;
    if (fireworksCanvas) fireworksCanvas.remove();
    fireworksCanvas = null;
}

/* =========================================================
   SAQLASH, TARIX VA REYTING
   Hamma narsa cookie'da saqlanadi. Cookie ~4KB bilan cheklangani
   uchun undagi tarix sig'ganicha (so'nggi o'yinlar) yoziladi;
   to'liq nusxa localStorage'da zaxira sifatida ham turadi.
   O'yin qoidalariga (ochko, 12 da chiqish, g'olib) tegmaydi.
   ========================================================= */

const STORE_KEY = 'bura_calc';             // cookie va localStorage nomi
const COOKIE_DAYS = 400;                   // brauzerlar ruxsat beradigan eng uzoq muddat
const COOKIE_VALUE_MAX = 3800;             // 4KB chegarasidan xavfsiz pastda
const HISTORY_MAX = 500;
const RESUME_WINDOW_SEC = 3 * 3600;        // shu vaqt ichida qayta ochilsa, o'yin o'zi davom etadi
const COOKIE_PATH = location.pathname.replace(/[^/]*$/, '') || '/';

// store.u — oxirgi yozilgan vaqt (ms); o'yin vaqtlari — sekundda
let store = { u: 0, cur: null, hist: [] };
let session = null;                        // joriy o'yin: { s: boshlangan vaqt, k: kozir, done }
let statsTab = 'history';

// ---------- Yordamchilar ----------
function nowSec() {
    return Math.floor(Date.now() / 1000);
}

function toInt(v) {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : 0;
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, ch => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    ));
}

function cleanName(n) {
    return String(n == null ? '' : n).replace(/\s+/g, ' ').trim().slice(0, 24);
}

function nameKey(n) {
    return cleanName(n).toLocaleLowerCase();
}

// "1-komanda", "2-komanda"... — standart nomlar reytingga kirmaydi
function isDefaultName(n) {
    return /^\d+-komanda$/i.test(cleanName(n));
}

function formatWhen(sec) {
    const d = new Date(sec * 1000);
    const now = new Date();
    const pad = x => String(x).padStart(2, '0');
    const hm = pad(d.getHours()) + ':' + pad(d.getMinutes());
    const dayStart = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diffDays = Math.round((dayStart(now) - dayStart(d)) / 86400000);
    if (diffDays === 0) return 'Bugun, ' + hm;
    if (diffDays === 1) return 'Kecha, ' + hm;
    const date = pad(d.getDate()) + '.' + pad(d.getMonth() + 1);
    return (d.getFullYear() === now.getFullYear() ? date : date + '.' + d.getFullYear()) + ', ' + hm;
}

// ---------- Cookie ----------
function utf8ToB64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
}

function b64ToUtf8(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
}

function readCookie(name) {
    const prefix = name + '=';
    const part = document.cookie.split(/;\s*/).find(p => p.indexOf(prefix) === 0);
    return part ? part.slice(prefix.length) : null;
}

function writeCookie(name, value) {
    let c = `${name}=${value}; path=${COOKIE_PATH}; max-age=${COOKIE_DAYS * 86400}; SameSite=Lax`;
    if (location.protocol === 'https:') c += '; Secure';
    document.cookie = c;
}

// Cookie ichidagi ixcham format: [1, u, joriy, tarix]
//   joriy: 0 yoki [boshlangan, yangilangan, chiqilgan, kozir, [[nom, ochko, chiqqan], ...]]
//   tarix: [[tugagan, [nomlar], [ochkolar], g'olib_indeksi], ...]  — yangilari birinchi
function packCurrent(c) {
    if (!c) return 0;
    return [c.s, c.u, c.left ? 1 : 0, c.k || '', c.t.map(t => [t.n, t.p, t.x ? 1 : 0])];
}

function unpackCurrent(a) {
    if (!Array.isArray(a)) return null;
    return {
        s: a[0], u: a[1], left: !!a[2], k: a[3] || null,
        t: (Array.isArray(a[4]) ? a[4] : []).map(t => ({ n: t[0], p: t[1], x: !!t[2] }))
    };
}

function packGame(g) {
    return [g.e, g.t.map(t => t.n), g.t.map(t => t.p), g.w];
}

function unpackGame(a) {
    if (!Array.isArray(a) || !Array.isArray(a[1])) return null;
    const scores = Array.isArray(a[2]) ? a[2] : [];
    return { e: a[0], t: a[1].map((n, i) => ({ n, p: scores[i] })), w: a[3] };
}

function encodeCookie(s) {
    const enc = new TextEncoder();
    const head = JSON.stringify([1, s.u, packCurrent(s.cur)]);
    // Base64 har 3 baytni 4 belgiga aylantiradi — chegaraga sig'adigan JSON hajmi:
    const budget = Math.floor(COOKIE_VALUE_MAX / 4) * 3;
    let size = enc.encode(head).length + 3;
    const parts = [];
    for (const g of s.hist) {
        const piece = JSON.stringify(packGame(g));
        const len = enc.encode(piece).length + (parts.length ? 1 : 0);
        if (size + len > budget) break;     // qolgan eski o'yinlar faqat zaxirada
        parts.push(piece);
        size += len;
    }
    return utf8ToB64(head.slice(0, -1) + ',[' + parts.join(',') + ']]');
}

function decodeCookie(value) {
    const a = JSON.parse(b64ToUtf8(value));
    if (!Array.isArray(a) || a[0] !== 1) return null;
    return { u: a[1], cur: unpackCurrent(a[2]), hist: (Array.isArray(a[3]) ? a[3] : []).map(unpackGame) };
}

// ---------- Ma'lumotni tekshirish (buzilgan cookie ilovani sindirmasin) ----------
function sanitizeGame(g) {
    if (!g || !Array.isArray(g.t) || g.t.length < 2 || g.t.length > 6) return null;
    const t = g.t.map((x, i) => ({
        n: cleanName(x && x.n) || `${i + 1}-komanda`,
        p: Math.max(0, toInt(x && x.p))
    }));
    const w = toInt(g.w);
    const e = toInt(g.e);
    if (w < 0 || w >= t.length || e <= 0) return null;
    return { e, t, w };
}

function sanitizeCurrent(c) {
    if (!c || !Array.isArray(c.t) || c.t.length < 2 || c.t.length > 6) return null;
    const t = c.t.map((x, i) => ({
        n: cleanName(x && x.n) || `${i + 1}-komanda`,
        p: Math.max(0, toInt(x && x.p)),
        x: !!(x && x.x)
    }));
    if (t.filter(x => !x.x).length < 2) return null;    // o'yin aslida tugagan
    const k = Object.prototype.hasOwnProperty.call(SUIT_NAMES, c.k) ? c.k : null;
    return { s: toInt(c.s), u: toInt(c.u), left: !!c.left, k, t };
}

function sanitizeStore(o) {
    const out = { u: 0, cur: null, hist: [] };
    if (!o || typeof o !== 'object') return out;
    out.u = toInt(o.u);
    out.cur = sanitizeCurrent(o.cur);
    if (Array.isArray(o.hist)) {
        const seen = new Set();
        o.hist.forEach(g => {
            const clean = sanitizeGame(g);
            if (clean && !seen.has(clean.e)) {
                seen.add(clean.e);
                out.hist.push(clean);
            }
        });
        out.hist.sort((a, b) => b.e - a.e);
        if (out.hist.length > HISTORY_MAX) out.hist.length = HISTORY_MAX;
    }
    return out;
}

// ---------- O'qish / yozish ----------
function loadStore() {
    let fromLs = null;
    let fromCookie = null;
    try {
        const raw = localStorage.getItem(STORE_KEY);
        if (raw) fromLs = sanitizeStore(JSON.parse(raw));
    } catch (e) { /* localStorage yo'q yoki buzilgan */ }
    try {
        const raw = readCookie(STORE_KEY);
        if (raw) fromCookie = sanitizeStore(decodeCookie(raw));
    } catch (e) { /* cookie buzilgan */ }

    if (fromLs && fromCookie && fromCookie.u > fromLs.u) {
        // Cookie yangiroq: unga sig'magan eski o'yinlarni zaxiradan qo'shib olamiz
        const h = fromCookie.hist;
        const oldest = h.length ? h[h.length - 1].e : Infinity;
        fromLs.hist.filter(g => g.e < oldest).forEach(g => h.push(g));
        if (h.length > HISTORY_MAX) h.length = HISTORY_MAX;
        store = fromCookie;
    } else {
        store = fromLs || fromCookie || { u: 0, cur: null, hist: [] };
    }
    persist(false);   // cookie muddatini yangilaydi va ikkala joyni tenglashtiradi
}

function persist(touch = true) {
    if (touch) store.u = Date.now();
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* zaxira yo'q */ }
    try { writeCookie(STORE_KEY, encodeCookie(store)); } catch (e) { /* cookie o'chirilgan */ }
}

// ---------- Joriy o'yin ----------
function beginSession() {
    prevRender = {};
    stopCelebration();
    document.querySelectorAll('.confetti').forEach(c => c.remove());
    setSuit(null);
    session = { s: nowSec(), k: null, done: false };
}

function saveCurrentGame() {
    if (!session || session.done) return;
    store.cur = {
        s: session.s,
        u: nowSec(),
        left: false,
        k: session.k,
        t: teams.map(t => ({ n: t.name, p: t.score, x: t.eliminated }))
    };
    persist();
}

function recordFinishedGame(winner) {
    if (!session || session.done) return;
    session.done = true;
    let e = nowSec();
    if (store.hist.length && store.hist[0].e >= e) e = store.hist[0].e + 1;
    store.hist.unshift({
        e,
        t: teams.map(t => ({ n: cleanName(t.name) || `${t.id + 1}-komanda`, p: t.score })),
        w: teams.findIndex(t => t.id === winner.id)
    });
    if (store.hist.length > HISTORY_MAX) store.hist.length = HISTORY_MAX;
    store.cur = null;
    persist();
}

function markCurrentLeft() {
    if (store.cur && !store.cur.left) {
        store.cur.left = true;
        persist();
    }
    session = null;
}

function resumeGame() {
    const c = store.cur;
    if (!c) return;
    teams = c.t.map((t, i) => ({ id: i, name: t.n, score: t.p, eliminated: t.x }));
    currentTeamCount = teams.length;
    prevRender = {};
    stopCelebration();
    session = { s: c.s, k: c.k, done: false };
    showScreen('scoreScreen');
    renderTeams();
    setSuit(c.k);
}

function discardCurrent() {
    confirmDialog({
        title: "Tugallanmagan o'yin o'chirilsinmi?",
        text: "Bu o'yindagi ochkolar saqlanmaydi.",
        ok: "O'chirish",
        onOk: () => {
            store.cur = null;
            persist();
            renderHome();
        }
    });
}

function rematch() {
    const names = teams.map(t => t.name);
    startGame(names.length, names);
}

// ---------- Bosh sahifa ----------
function teamChip(name, score, cls) {
    const crown = cls === 'win' ? '<span class="chip-crown" aria-hidden="true">🏆</span>' : '';
    return `<span class="chip ${cls || ''}">${crown}<span class="chip-name">${escapeHtml(name)}</span><b>${toInt(score)}</b></span>`;
}

function renderHome() {
    const box = document.getElementById('resumeCard');
    const c = store.cur;
    if (box) {
        box.innerHTML = !c ? '' : `
            <div class="resume-card">
                <div class="resume-head">
                    <span class="resume-title">Tugallanmagan o'yin</span>
                    <span class="resume-time">${escapeHtml(formatWhen(c.u))}</span>
                </div>
                <div class="chip-row">${c.t.map(t => teamChip(t.n, t.p, t.x ? 'out' : '')).join('')}</div>
                <div class="resume-actions">
                    <button class="resume-btn" onclick="resumeGame()">▶ Davom ettirish</button>
                    <button class="icon-btn" onclick="discardCurrent()" aria-label="O'chirish" title="O'chirish">✕</button>
                </div>
            </div>`;
    }
    const badge = document.getElementById('historyCount');
    if (badge) badge.textContent = store.hist.length ? String(store.hist.length) : '';
}

// ---------- Tarix va reyting ekrani ----------
function openStats(tab) {
    statsTab = tab || statsTab;
    showScreen('statsScreen');
    renderStats();
}

function switchStatsTab(tab) {
    statsTab = tab;
    renderStats();
}

function renderStats() {
    document.querySelectorAll('.tab-btn').forEach(b => {
        const on = b.dataset.tab === statsTab;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.getElementById('historyPanel').hidden = statsTab !== 'history';
    document.getElementById('rankingPanel').hidden = statsTab !== 'ranking';
    if (statsTab === 'history') renderHistory();
    else renderRanking();
}

function emptyState(icon, title, text) {
    return `
        <div class="empty-state">
            <div class="empty-icon" aria-hidden="true">${icon}</div>
            <div class="empty-title">${escapeHtml(title)}</div>
            <p>${escapeHtml(text)}</p>
        </div>`;
}

function renderHistory() {
    const panel = document.getElementById('historyPanel');
    if (!store.hist.length) {
        panel.innerHTML = emptyState('📜', "Hali tugagan o'yinlar yo'q",
            "O'yin chempion bilan tugaganda shu yerda saqlanadi.");
        return;
    }
    panel.innerHTML = `
        <div class="history-list">
            ${store.hist.map((g, i) => `
                <div class="history-item" style="animation-delay:${Math.min(i, 10) * 0.03}s">
                    <div class="history-top">
                        <span class="history-date">${escapeHtml(formatWhen(g.e))}</span>
                        <button class="del-btn" data-action="delete" data-id="${g.e}"
                                aria-label="O'chirish" title="O'chirish">✕</button>
                    </div>
                    <div class="chip-row">
                        ${g.t.map((t, idx) => teamChip(t.n, t.p, idx === g.w ? 'win' : 'out')).join('')}
                    </div>
                    <div class="history-actions">
                        <span class="history-meta">${g.t.length} komanda</span>
                        <button class="start-btn" data-action="start" data-id="${g.e}">▶ Boshlash</button>
                    </div>
                </div>`).join('')}
        </div>
        <button class="clear-btn" data-action="clear">Tarixni tozalash</button>`;
}

function startFromHistory(id) {
    const g = store.hist.find(x => x.e === id);
    if (!g) return;
    startGame(g.t.length, g.t.map(t => t.n));
}

function deleteGame(id) {
    confirmDialog({
        title: "Bu o'yin tarixdan o'chirilsinmi?",
        text: 'Reyting ham qayta hisoblanadi.',
        ok: "O'chirish",
        onOk: () => {
            store.hist = store.hist.filter(g => g.e !== id);
            persist();
            renderStats();
        }
    });
}

function clearHistory() {
    confirmDialog({
        title: 'Butun tarix o\'chirilsinmi?',
        text: "Barcha o'yinlar va reyting nolga tushadi. Buni qaytarib bo'lmaydi.",
        ok: 'Tozalash',
        onOk: () => {
            store.hist = [];
            persist();
            renderStats();
        }
    });
}

// Reyting tarixdan hisoblanadi: o'yin o'chirilsa, reyting ham o'zi to'g'rilanadi
function computeRanking() {
    const map = new Map();
    for (let i = store.hist.length - 1; i >= 0; i--) {      // eskidan yangiga
        const g = store.hist[i];
        const seen = new Set();
        g.t.forEach((team, idx) => {
            if (isDefaultName(team.n)) return;
            const key = nameKey(team.n);
            if (!key) return;
            let p = map.get(key);
            if (!p) {
                p = { name: team.n, games: 0, wins: 0, last: 0 };
                map.set(key, p);
            }
            p.name = team.n;                                 // eng so'nggi yozilishi
            p.last = Math.max(p.last, g.e);
            if (!seen.has(key)) {
                seen.add(key);
                p.games++;
            }
            if (idx === g.w) p.wins++;
        });
    }
    const list = Array.from(map.values());
    list.forEach(p => { p.rate = p.games ? p.wins / p.games : 0; });
    list.sort((a, b) =>
        b.wins - a.wins || b.rate - a.rate || b.games - a.games || a.name.localeCompare(b.name));
    return list;
}

function renderRanking() {
    const panel = document.getElementById('rankingPanel');
    const list = computeRanking();
    if (!list.length) {
        panel.innerHTML = emptyState('🏆', "Hali reyting yo'q",
            "Komandalarga nom bering — o'yin tugagach, o'sha nomlar reytingga tushadi.");
        return;
    }
    let rank = 0;
    const rows = list.map((p, i) => {
        const prev = list[i - 1];
        if (!prev || prev.wins !== p.wins || prev.games !== p.games) rank = i + 1;
        const medal = ['🥇', '🥈', '🥉'][rank - 1];
        return `
            <div class="rank-row ${rank === 1 ? 'top' : ''}" style="animation-delay:${Math.min(i, 10) * 0.03}s">
                <span class="rank-pos">${medal || rank}</span>
                <span class="rank-name">${escapeHtml(p.name)}</span>
                <span class="rank-num rank-wins">${p.wins}</span>
                <span class="rank-num">${p.games}</span>
                <span class="rank-num rank-pct">${Math.round(p.rate * 100)}%</span>
            </div>`;
    }).join('');
    panel.innerHTML = `
        <div class="rank-head" aria-hidden="true">
            <span>#</span><span>O'yinchi</span><span>Chempion</span><span>O'yin</span><span>G'alaba</span>
        </div>
        <div class="rank-list">${rows}</div>
        <p class="rank-note">Chempionliklar soni bo'yicha. Standart nomlar (1-komanda, 2-komanda…) hisobga olinmaydi.</p>`;
}

// ---------- Nom o'zgartirishda o'yinchilarni taklif qilish ----------
function setupNameSuggestions(teamId) {
    const input = document.getElementById('teamNameInput');
    const box = document.getElementById('suggestBox');
    if (!input || !box) return;

    const team = teams.find(t => t.id === teamId);
    const original = team ? team.name : '';
    // Shu o'yindagi boshqa komandalar nomi va o'zining nomi taklif qilinmaydi
    const taken = new Set(teams.map(t => nameKey(t.name)));
    const players = computeRanking()
        .filter(p => !taken.has(nameKey(p.name)))
        .sort((a, b) => b.games - a.games || b.last - a.last);

    function render() {
        const q = nameKey(input.value);
        const filtering = q && q !== nameKey(original) && !isDefaultName(input.value);
        let list = players;
        if (filtering) {
            const starts = players.filter(p => nameKey(p.name).startsWith(q));
            const contains = players.filter(p => !nameKey(p.name).startsWith(q) && nameKey(p.name).includes(q));
            list = starts.concat(contains);
        }
        list = list.slice(0, 12);
        if (!list.length) {
            box.innerHTML = '';
            return;
        }
        box.innerHTML = `
            <div class="suggest-label">${filtering ? "Mos o'yinchilar" : "Oldingi o'yinchilar"}</div>
            <div class="suggestions">
                ${list.map(p => `
                    <button type="button" class="suggest-chip" data-name="${escapeHtml(p.name)}">
                        ${escapeHtml(p.name)}${p.wins ? `<small>🏆${p.wins}</small>` : ''}
                    </button>`).join('')}
            </div>`;
    }

    box.addEventListener('click', e => {
        const chip = e.target.closest('.suggest-chip');
        if (!chip) return;
        input.value = chip.dataset.name;
        saveTeamName(teamId);
    });
    input.addEventListener('input', render);
    input.select();
    render();
}

// ---------- Tasdiqlash oynasi ----------
function confirmDialog({ title, text, ok, onOk }) {
    const old = document.getElementById('confirmModal');
    if (old) old.remove();
    const modal = document.createElement('div');
    modal.id = 'confirmModal';
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content" role="alertdialog" aria-modal="true">
            <h3>${escapeHtml(title)}</h3>
            ${text ? `<p class="modal-text">${escapeHtml(text)}</p>` : ''}
            <div class="modal-buttons">
                <button class="modal-btn cancel-btn" data-act="no">Bekor qilish</button>
                <button class="modal-btn danger-btn" data-act="yes">${escapeHtml(ok || 'Ha')}</button>
            </div>
        </div>`;
    modal.addEventListener('click', e => {
        if (e.target === modal) {
            modal.remove();
            return;
        }
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        modal.remove();
        if (btn.dataset.act === 'yes') onOk();
    });
    document.body.appendChild(modal);
    modal.querySelector('[data-act="no"]').focus();
}

// ---------- Ishga tushirish ----------
document.getElementById('historyPanel').addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = toInt(btn.dataset.id);
    if (btn.dataset.action === 'start') startFromHistory(id);
    else if (btn.dataset.action === 'delete') deleteGame(id);
    else if (btn.dataset.action === 'clear') clearHistory();
});

loadStore();
if (store.cur && !store.cur.left && nowSec() - store.cur.u < RESUME_WINDOW_SEC) {
    resumeGame();      // sahifa yangilangan yoki yopilib qayta ochilgan — o'yin joyidan davom etadi
} else {
    renderHome();
}
