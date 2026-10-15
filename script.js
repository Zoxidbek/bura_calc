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

// ---------- G'olib musiqasi ----------
// G. F. Handel — "See, the Conquering Hero Comes!" ("Judas Maccabaeus", 1747).
// 270 yildan beri g'oliblar sharafiga chalinadi; mualliflik huquqidan xoli.
// Kuy manbasi: J. Aird, "Selection of Scotch, English, Irish and Foreign Airs", 3-jild (1788), No. 521.
// Ovoz brauzerning o'zida (Web Audio) yaratiladi — na fayl, na internet kerak.

let audioCtx = null;
let soundMuted = false;
let music = null;            // joriy ijro: { bus, t0, duration, timer, raf, idx }
let noiseBuffer = null;
let reverbBuffer = null;

const MUSIC_BPM = 116;
const MUSIC_TRANSPOSE = 3;   // G-dur → B♭-dur: karnaylar yorqinroq yangraydi
const MUSIC_VOLUME = 0.8;

// Kuy: [nota, davomiylik (chorak = 1)], null — pauza
const HERO_A = [
    ['D5', 2], ['B4', 1.5], ['C5', 0.5],
    ['D5', 2], ['G4', 2],
    ['A4', 0.5], ['B4', 0.5], ['C5', 0.5], ['D5', 0.5], ['C5', 1], ['B4', 1],
    ['B4', 2], ['A4', 2],
    ['B4', 0.5], ['C5', 0.5], ['D5', 0.5], ['E5', 0.5], ['D5', 1], ['D5', 1],
    ['G5', 2], ['D5', 2],
    ['C5', 0.5], ['B4', 0.5], ['A4', 0.5], ['G4', 0.5], ['A4', 2],
    ['G4', 3], [null, 1]
];
const HERO_B = [
    ['B4', 0.5], ['A4', 0.5], ['B4', 0.5], ['C5', 0.5], ['B4', 1], ['B4', 1],
    ['A4', 2], ['G4', 1], ['A4', 0.5], ['B4', 0.5],
    ['C5', 1], ['B4', 1], ['A4', 1], ['G4', 1],
    ['G4', 2], ['F#4', 2],
    ['B4', 0.5], ['A4', 0.5], ['B4', 0.5], ['C5', 0.5], ['B4', 1], ['B4', 1],
    ['E5', 2], ['C#5', 2],
    ['D5', 1], ['E5', 0.5], ['D5', 0.5], ['C#5', 1.5], ['B4', 0.25], ['C#5', 0.25],
    ['D5', 2], [null, 2]
];
// Garmoniya: [akkord, davomiylik]
const HERO_A_CHORDS = [
    ['G', 4], ['G', 2], ['Em', 2], ['D7', 2], ['C', 1], ['G', 1], ['G', 2], ['D', 2],
    ['G', 2], ['D', 2], ['C', 2], ['G', 2], ['D7', 2], ['D', 2], ['G', 4]
];
const HERO_B_CHORDS = [
    ['G', 2], ['Em', 2], ['D', 2], ['G', 2], ['C', 1], ['G', 1], ['A7', 2], ['Dsus4', 2], ['D', 2],
    ['G', 2], ['E7', 2], ['A', 4], ['G', 1], ['A7', 3], ['D', 2], ['D7', 2]
];
const CHORDS = {
    G:     { bass: 'G2', notes: ['G3', 'B3', 'D4'] },
    Em:    { bass: 'E2', notes: ['G3', 'B3', 'E4'] },
    C:     { bass: 'C3', notes: ['G3', 'C4', 'E4'] },
    D:     { bass: 'D3', notes: ['F#3', 'A3', 'D4'] },
    D7:    { bass: 'D3', notes: ['F#3', 'A3', 'C4'] },
    Dsus4: { bass: 'D3', notes: ['G3', 'A3', 'D4'] },
    A:     { bass: 'A2', notes: ['A3', 'C#4', 'E4'] },
    A7:    { bass: 'A2', notes: ['G3', 'C#4', 'E4'] },
    E7:    { bass: 'E2', notes: ['G#3', 'B3', 'D4'] }
};

function midiOf(name) {
    const m = /^([A-G])(#|b)?(\d)$/.exec(name);
    const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]];
    return (Number(m[3]) + 1) * 12 + base + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

function freqOf(midi) {
    return 440 * Math.pow(2, (midi + MUSIC_TRANSPOSE - 69) / 12);
}

// Ikkinchi karnay uchun G-dur gammasida terssiya pastdagi nota
function thirdBelow(midi) {
    const scale = [7, 9, 11, 0, 2, 4, 6];            // G A B C D E F#
    const i = scale.indexOf(midi % 12);
    if (i < 0) return null;
    const target = scale[(i + 5) % 7];
    let m = midi - 1;
    while (m % 12 !== target) m--;
    return m;
}

function getAudioCtx() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
}

function getNoise(ctx) {
    if (!noiseBuffer || noiseBuffer.sampleRate !== ctx.sampleRate) {
        const len = ctx.sampleRate * 3;
        noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = noiseBuffer.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuffer;
}

// Zal aks-sadosi (sun'iy impuls)
function getReverb(ctx) {
    if (!reverbBuffer || reverbBuffer.sampleRate !== ctx.sampleRate) {
        const len = Math.floor(ctx.sampleRate * 2.4);
        reverbBuffer = ctx.createBuffer(2, len, ctx.sampleRate);
        for (let ch = 0; ch < 2; ch++) {
            const d = reverbBuffer.getChannelData(ch);
            for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
        }
    }
    return reverbBuffer;
}

// Nota konverti: tez hujum → biroz pasayish → nota oxirida yumshoq so'nish
function envelope(param, t, end, peak, sustain, attack, release) {
    param.setValueAtTime(0.0001, t);
    const aEnd = t + Math.min(attack, (end - t) * 0.5);
    param.exponentialRampToValueAtTime(peak, aEnd);
    const dEnd = Math.min(aEnd + 0.15, end);
    if (dEnd > aEnd + 0.01) param.exponentialRampToValueAtTime(sustain, dEnd);
    param.setTargetAtTime(0.0001, end, release);
}

// ---------- Cholg'ular ----------
function brassNote(ctx, out, t, f, dur, vel, tone, attack) {
    const end = t + Math.max(0.06, dur * 0.9);
    const stopAt = end + 0.4;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.Q.value = 1.1;
    filt.frequency.setValueAtTime(f * 1.2, t);
    filt.frequency.exponentialRampToValueAtTime(Math.min(16000, f * 8 * tone), t + 0.04);
    filt.frequency.exponentialRampToValueAtTime(Math.min(12000, f * 4.5 * tone), t + 0.22);
    const g = ctx.createGain();
    envelope(g.gain, t, end, vel, vel * 0.78, attack, 0.045);
    filt.connect(g);
    g.connect(out);

    let vib = null;
    if (dur > 0.4) {                                  // uzun notalarda vibrato
        vib = ctx.createGain();
        vib.gain.setValueAtTime(0, t);
        vib.gain.linearRampToValueAtTime(10, t + 0.3);
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 5.3;
        lfo.connect(vib);
        lfo.start(t);
        lfo.stop(stopAt);
    }
    // Asosiy ton + kuchsizroq "jonli" ikkinchi ton (asosiy tonni so'ndirib qo'ymasligi uchun)
    [[0, 1], [6, 0.35]].forEach(([cents, amp]) => {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = cents;
        if (vib) vib.connect(o.detune);
        const og = ctx.createGain();
        og.gain.value = amp;
        o.connect(og);
        og.connect(filt);
        o.start(t);
        o.stop(stopAt);
    });
}

function bellNote(ctx, out, t, f, vel) {
    [[1, 1, 0.9], [2.76, 0.25, 0.25]].forEach(([mul, amp, decay]) => {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f * mul;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vel * amp, t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
        o.connect(g);
        g.connect(out);
        o.start(t);
        o.stop(t + decay + 0.05);
    });
}

function padChord(ctx, out, t, dur, freqs, vel) {
    const end = t + dur;
    freqs.forEach(f => {
        const filt = ctx.createBiquadFilter();
        filt.type = 'lowpass';
        filt.frequency.value = 1500;
        filt.Q.value = 0.4;
        const g = ctx.createGain();
        envelope(g.gain, t, end, vel, vel * 0.85, 0.07, 0.12);
        filt.connect(g);
        g.connect(out);
        [['sawtooth', -5], ['triangle', 5]].forEach(([type, cents]) => {
            const o = ctx.createOscillator();
            o.type = type;
            o.frequency.value = f;
            o.detune.value = cents;
            o.connect(filt);
            o.start(t);
            o.stop(end + 0.6);
        });
    });
}

function bassNote(ctx, out, t, f, dur, vel) {
    const end = t + Math.max(0.08, dur);
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 550;
    filt.Q.value = 0.7;
    const g = ctx.createGain();
    envelope(g.gain, t, end, vel, vel * 0.7, 0.02, 0.06);
    filt.connect(g);
    g.connect(out);
    [['sawtooth', 1], ['sine', 1]].forEach(([type]) => {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = f;
        o.connect(filt);
        o.start(t);
        o.stop(end + 0.4);
    });
}

function noiseHit(ctx, out, t, dur, type, freq, vel, q) {
    const buf = getNoise(ctx);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.value = freq;
    filt.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(out);
    src.start(t, Math.random() * Math.max(0, buf.duration - dur - 0.1), dur + 0.05);
}

function timpaniHit(ctx, out, t, f, vel) {
    [[1, 1, 1.4], [1.5, 0.35, 0.6], [1.98, 0.18, 0.4]].forEach(([mul, amp, decay]) => {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(f * mul * 1.03, t);
        o.frequency.exponentialRampToValueAtTime(f * mul, t + 0.06);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vel * amp, t + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
        o.connect(g);
        g.connect(out);
        o.start(t);
        o.stop(t + decay + 0.05);
    });
    noiseHit(ctx, out, t, 0.06, 'lowpass', 1200, vel * 0.4, 0.7);
}

function snareHit(ctx, out, t, vel) {
    noiseHit(ctx, out, t, 0.16, 'bandpass', 2400, vel, 0.6);
    noiseHit(ctx, out, t, 0.09, 'highpass', 6000, vel * 0.5, 0.7);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(230, t);
    o.frequency.exponentialRampToValueAtTime(170, t + 0.06);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel * 0.6, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + 0.12);
}

function bassDrum(ctx, out, t, vel) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(95, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    o.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + 0.6);
    noiseHit(ctx, out, t, 0.05, 'lowpass', 600, vel * 0.3, 0.7);
}

function cymbalCrash(ctx, out, t, vel) {
    noiseHit(ctx, out, t, 2.4, 'highpass', 5000, vel, 0.5);
    noiseHit(ctx, out, t, 0.9, 'bandpass', 9000, vel * 0.6, 1.2);
}

// ---------- Partitura: baraban drobi → A (karnay) → A (to'liq orkestr) → B → A + final ----------
function buildHeroScore() {
    const spb = 60 / MUSIC_BPM;
    const events = [];
    const at = (beat, play) => events.push({ t: beat * spb, play });
    const TONIC = freqOf(midiOf('G2'));
    const DOMINANT = freqOf(midiOf('D2'));

    const leads = {
        solo: (c, o, w, midi, d) => brassNote(c, o, w, freqOf(midi), d, 0.2, 1, 0.028),
        soft: (c, o, w, midi, d) => brassNote(c, o, w, freqOf(midi), d, 0.17, 0.55, 0.05),
        tutti: (c, o, w, midi, d) => {
            brassNote(c, o, w, freqOf(midi), d, 0.2, 1.1, 0.025);
            const low = thirdBelow(midi);
            if (low) brassNote(c, o, w, freqOf(low), d, 0.11, 0.9, 0.025);
            bellNote(c, o, w, freqOf(midi) * 2, 0.05);
        }
    };

    function melody(notes, start, style) {
        let b = start;
        notes.forEach(([name, len]) => {
            if (name) {
                const midi = midiOf(name);
                const d = len * spb;
                at(b, (c, o, w) => leads[style](c, o, w, midi, d));
            }
            b += len;
        });
    }

    function harmony(chords, start, style) {
        const padVel = style === 'tutti' ? 0.045 : 0.032;
        const bassVel = style === 'soft' ? 0.18 : 0.24;
        let b = start;
        chords.forEach(([name, len]) => {
            const ch = CHORDS[name];
            const freqs = ch.notes.map(n => freqOf(midiOf(n)));
            const chordStart = b;
            at(chordStart, (c, o, w) => padChord(c, o, w, len * spb, freqs, padVel));
            // Bas: akkord boshida hamda taktning 1- va 3-hissalarida
            const hits = [chordStart];
            for (let x = Math.ceil(chordStart + 0.001); x < chordStart + len; x++) {
                if ((x - start) % 2 === 0) hits.push(x);
            }
            const bf = freqOf(midiOf(ch.bass));
            hits.forEach((h, i) => {
                const d = ((hits[i + 1] || chordStart + len) - h) * spb * 0.85;
                at(h, (c, o, w) => bassNote(c, o, w, bf, d, bassVel));
            });
            b += len;
        });
    }

    function drums(start, style) {
        for (let bar = 0; bar < 8; bar++) {
            const s = start + bar * 4;
            if (style === 'tutti') {
                at(s, (c, o, w) => bassDrum(c, o, w, 0.42));
                at(s + 2, (c, o, w) => bassDrum(c, o, w, 0.3));
                at(s + 1, (c, o, w) => snareHit(c, o, w, 0.1));
                at(s + 3, (c, o, w) => snareHit(c, o, w, 0.1));
            } else if (style === 'solo') {
                at(s, (c, o, w) => bassDrum(c, o, w, 0.3));
                at(s + 2, (c, o, w) => bassDrum(c, o, w, 0.18));
            }
        }
        const tv = style === 'soft' ? 0.2 : 0.3;
        if (style === 'soft') {
            at(start, (c, o, w) => timpaniHit(c, o, w, TONIC, tv));
            at(start + 12, (c, o, w) => timpaniHit(c, o, w, DOMINANT, tv));
            at(start + 28, (c, o, w) => timpaniHit(c, o, w, DOMINANT, tv));
        } else {
            at(start, (c, o, w) => timpaniHit(c, o, w, TONIC, tv));
            at(start + 14, (c, o, w) => timpaniHit(c, o, w, DOMINANT, tv * 0.8));
            at(start + 16, (c, o, w) => timpaniHit(c, o, w, TONIC, tv * 0.9));
            at(start + 26, (c, o, w) => timpaniHit(c, o, w, DOMINANT, tv * 0.8));
            at(start, (c, o, w) => cymbalCrash(c, o, w, style === 'tutti' ? 0.12 : 0.08));
        }
    }

    function snareFill(start, count, from, to) {
        for (let i = 0; i < count; i++) {
            const v = from + (to - from) * (i / Math.max(1, count - 1));
            at(start + i * 0.25, (c, o, w) => snareHit(c, o, w, v));
        }
    }

    // Kirish: "...va g'olib!" — baraban drobi
    for (let i = 0; i < 32; i++) {
        const v = 0.04 + 0.22 * Math.pow(i / 31, 1.5);
        at(i / 8, (c, o, w) => snareHit(c, o, w, v));
    }

    let beat = 4;
    // 1) A — karnay
    melody(HERO_A, beat, 'solo');
    harmony(HERO_A_CHORDS, beat, 'solo');
    drums(beat, 'solo');
    snareFill(beat + 31, 4, 0.08, 0.2);
    beat += 32;
    // 2) A — to'liq orkestr
    melody(HERO_A, beat, 'tutti');
    harmony(HERO_A_CHORDS, beat, 'tutti');
    drums(beat, 'tutti');
    beat += 32;
    // 3) B — yumshoq, valtornalar
    melody(HERO_B, beat, 'soft');
    harmony(HERO_B_CHORDS, beat, 'soft');
    drums(beat, 'soft');
    snareFill(beat + 30, 8, 0.05, 0.26);
    beat += 32;
    // 4) A — to'liq orkestr, oxirgi nota cho'ziladi
    melody(HERO_A.slice(0, -2), beat, 'tutti');
    harmony(HERO_A_CHORDS.slice(0, -1), beat, 'tutti');
    drums(beat, 'tutti');
    const fin = beat + 28;
    const spbFin = 4 * spb;
    const gMidi = midiOf('G4');
    at(fin, (c, o, w) => {
        brassNote(c, o, w, freqOf(gMidi), spbFin, 0.2, 1.1, 0.025);
        brassNote(c, o, w, freqOf(midiOf('D4')), spbFin, 0.11, 0.9, 0.025);
        bellNote(c, o, w, freqOf(gMidi) * 2, 0.06);
        padChord(c, o, w, spbFin, CHORDS.G.notes.map(n => freqOf(midiOf(n))), 0.045);
        bassNote(c, o, w, freqOf(midiOf('G2')), spbFin, 0.24);
        cymbalCrash(c, o, w, 0.12);
        bassDrum(c, o, w, 0.42);
    });
    for (let i = 0; i < 21; i++) {                     // litavra trellsi
        const v = 0.06 + 0.24 * (i / 20);
        at(fin + i / 6, (c, o, w) => timpaniHit(c, o, w, TONIC, v));
    }
    // Yakuniy zarba: "ta-daa!"
    at(fin + 4, (c, o, w) => {
        ['G4', 'B4', 'D5', 'G5'].forEach(n => brassNote(c, o, w, freqOf(midiOf(n)), 1.5 * spb, 0.12, 1.2, 0.02));
        padChord(c, o, w, 1.5 * spb, CHORDS.G.notes.map(n => freqOf(midiOf(n))), 0.05);
        bassNote(c, o, w, freqOf(midiOf('G2')), 1.5 * spb, 0.26);
        timpaniHit(c, o, w, TONIC, 0.4);
        bassDrum(c, o, w, 0.5);
        cymbalCrash(c, o, w, 0.14);
    });

    events.sort((a, b) => a.t - b.t);
    return { events, duration: (fin + 5.5) * spb + 2.5 };
}

// Effektlar zanjiri: cholg'ular → (quruq + aks-sado) → kompressor → bus (ovoz/to'xtatish)
function createMusicChain(ctx) {
    const input = ctx.createGain();
    const reverb = ctx.createConvolver();
    reverb.buffer = getReverb(ctx);
    const wet = ctx.createGain();
    wet.gain.value = 0.22;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 10;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    const bus = ctx.createGain();
    input.connect(comp);
    input.connect(reverb);
    reverb.connect(wet);
    wet.connect(comp);
    comp.connect(bus);
    return { input, bus };
}

function playWinnerMusic() {
    stopWinnerMusic();
    const ctx = getAudioCtx();
    if (!ctx) return;
    const chain = createMusicChain(ctx);
    chain.bus.gain.value = soundMuted ? 0 : MUSIC_VOLUME;
    chain.bus.connect(ctx.destination);

    const score = buildHeroScore();
    const state = { bus: chain.bus, t0: ctx.currentTime + 0.12, duration: score.duration, timer: null, raf: null, idx: 0 };
    // Notalar oldindan ~1 soniyalik bo'laklarda rejalashtiriladi (telefonda qotmasligi uchun)
    const pump = () => {
        const horizon = ctx.currentTime + 1;
        while (state.idx < score.events.length && state.t0 + score.events[state.idx].t < horizon) {
            const e = score.events[state.idx++];
            e.play(ctx, chain.input, state.t0 + e.t);
        }
        if (state.idx >= score.events.length && state.timer) {
            clearInterval(state.timer);
            state.timer = null;
        }
    };
    music = state;
    pump();
    state.timer = setInterval(pump, 200);
    startMusicProgress();
}

function stopWinnerMusic() {
    if (!music) return;
    const m = music;
    music = null;
    if (m.timer) clearInterval(m.timer);
    if (m.raf) cancelAnimationFrame(m.raf);
    if (audioCtx) {
        const now = audioCtx.currentTime;
        m.bus.gain.cancelScheduledValues(now);
        m.bus.gain.setValueAtTime(m.bus.gain.value, now);
        m.bus.gain.linearRampToValueAtTime(0, now + 0.08);
    }
    setTimeout(() => {
        try { m.bus.disconnect(); } catch (e) { /* allaqachon uzilgan */ }
    }, 150);
    setMusicProgress(0, '');
}

function replayWinnerMusic() {
    if (soundMuted) {
        soundMuted = false;
        updateSoundButton();
    }
    playWinnerMusic();
}

function toggleWinnerSound() {
    soundMuted = !soundMuted;
    updateSoundButton();
    if (music && audioCtx) {
        music.bus.gain.setTargetAtTime(soundMuted ? 0 : MUSIC_VOLUME, audioCtx.currentTime, 0.05);
    }
}

function updateSoundButton() {
    const btn = document.getElementById('soundBtn');
    if (!btn) return;
    btn.textContent = soundMuted ? '🔇' : '🔊';
    btn.setAttribute('aria-label', soundMuted ? 'Ovozni yoqish' : "Ovozni o'chirish");
}

// ---------- Ijro chizig'i ----------
function setMusicProgress(p, state) {
    const fill = document.getElementById('musicProgress');
    const player = document.getElementById('musicPlayer');
    if (fill) fill.style.transform = `scaleX(${p})`;
    if (player) {
        player.classList.toggle('playing', state === 'playing');
        player.classList.toggle('ended', state === 'ended');
    }
}

function startMusicProgress() {
    const m = music;
    const tick = () => {
        if (music !== m || !audioCtx) return;
        const p = Math.min(1, Math.max(0, (audioCtx.currentTime - m.t0) / m.duration));
        if (p >= 1) {
            setMusicProgress(1, 'ended');
            m.raf = null;
            return;
        }
        setMusicProgress(p, 'playing');
        m.raf = requestAnimationFrame(tick);
    };
    tick();
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
