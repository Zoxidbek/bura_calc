// G'alaba effektlari: konfetti, yog'ilayotgan karta belgilari, salyut (eski kalkulyatordan).

let timers = [];
let fireworksRaf = null;
let fireworksCanvas = null;

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
        setTimeout(() => confetti.remove(), 5000);
    }
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
    fireworksCanvas.width = window.innerWidth * dpr;
    fireworksCanvas.height = window.innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const colors = ['#f2c94c', '#ff5d5d', '#ffffff', '#6fe3a5', '#ffb347'];
    let particles = [];
    const startTime = performance.now();
    let lastBurst = 0;

    function burst() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        const x = w * (0.1 + Math.random() * 0.8);
        const y = h * (0.12 + Math.random() * 0.35);
        const color = colors[Math.floor(Math.random() * colors.length)];
        for (let i = 0; i < 46; i++) {
            const angle = (Math.PI * 2 * i) / 46;
            const speed = 2 + Math.random() * 3.2;
            particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1, decay: 0.012 + Math.random() * 0.01, color });
        }
    }

    function frame(now) {
        if (!fireworksCanvas) return;
        const elapsed = now - startTime;
        if (elapsed < duration && now - lastBurst > 420) {
            burst();
            lastBurst = now;
        }
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        particles = particles.filter(p => p.life > 0);
        for (const p of particles) {
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
        }
        ctx.globalAlpha = 1;
        if (elapsed < duration || particles.length) fireworksRaf = requestAnimationFrame(frame);
        else stopFireworks();
    }
    fireworksRaf = requestAnimationFrame(frame);
}

function stopFireworks() {
    if (fireworksRaf) cancelAnimationFrame(fireworksRaf);
    fireworksRaf = null;
    if (fireworksCanvas) fireworksCanvas.remove();
    fireworksCanvas = null;
}

export function startCelebration() {
    stopCelebration();
    createConfetti();
    timers.push(setTimeout(createConfetti, 1500));
    timers.push(setTimeout(createConfetti, 3200));
    for (let i = 0; i < 28; i++) timers.push(setTimeout(dropSuit, i * 180));
    startFireworks(7000);
}

export function stopCelebration() {
    timers.forEach(t => clearTimeout(t));
    timers = [];
    stopFireworks();
    document.querySelectorAll('.falling-suit, .confetti').forEach(el => el.remove());
}
