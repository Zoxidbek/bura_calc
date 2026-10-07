let teams = [];
let currentTeamCount = 0;
let currentEditingTeamId = null;

// O'yinni boshlash
function startGame(teamCount) {
    currentTeamCount = teamCount;
    teams = [];
    
    for (let i = 0; i < teamCount; i++) {
        teams.push({
            id: i,
            name: `${i + 1}-komanda`,
            score: 0,
            eliminated: false
        });
    }
    
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
                <div class="team-name" onclick="showEditModal(${team.id})">${team.name}</div>
                <div class="team-score ${scoreClass}">${team.score}</div>
            </div>
            
            <button class="score-btn plus-btn" onclick="updateScore(${team.id}, 2)" 
                    ${team.eliminated ? 'disabled' : ''}>+</button>
        `;
        
        container.appendChild(teamCard);
    });
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
            <input type="text" id="teamNameInput" placeholder="Komanda nomi" value="${team.name}">
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