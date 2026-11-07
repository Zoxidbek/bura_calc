// G'olib musiqasi: standart Handel aranjirovkasi (Web Audio) yoki admin yuklagan fayl.
// Dvigatel eski kalkulyatordan (script.js) o'zgarishsiz ko'chirildi.

// ---------- G'olib musiqasi ----------
// G. F. Handel — "See, the Conquering Hero Comes!" ("Judas Maccabaeus", 1747).
// 270 yildan beri g'oliblar sharafiga chalinadi; mualliflik huquqidan xoli.
// Kuy manbasi: J. Aird, "Selection of Scotch, English, Irish and Foreign Airs", 3-jild (1788), No. 521.
// Ovoz brauzerning o'zida (Web Audio) yaratiladi — na fayl, na internet kerak.

let audioCtx = null;
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

// =========================================================
// Boshqaruv: standart musiqa yoki fayl, ovoz, qayta qo'yish, ijro chizig'i
// =========================================================

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

const player = {
    track: null,          // { type: 'builtin' } yoki { type: 'file', url, startAt, duration, title }
    muted: false,
    synth: null,          // { bus, t0, duration, timer, idx }
    audio: null,          // HTMLAudioElement
    raf: null,
    status: 'idle',       // idle | playing | ended | blocked
    listeners: new Set()
};

function emit() {
    let p = 0;
    if (player.synth && audioCtx) {
        p = (audioCtx.currentTime - player.synth.t0) / player.synth.duration;
    } else if (player.audio && player.track?.type === 'file') {
        const start = player.track.startAt || 0;
        const total = (Number.isFinite(player.audio.duration) && player.audio.duration > 0 ? player.audio.duration : player.track.duration) || 0;
        p = total > start ? (player.audio.currentTime - start) / (total - start) : 0;
    }
    const snapshot = { progress: Math.max(0, Math.min(1, p || 0)), status: player.status, muted: player.muted, track: player.track };
    player.listeners.forEach(fn => fn(snapshot));
}

function tick() {
    player.raf = null;
    if (player.status !== 'playing') return emit();
    if (player.synth && audioCtx && audioCtx.currentTime - player.synth.t0 >= player.synth.duration) {
        player.status = 'ended';
    }
    emit();
    if (player.status === 'playing') player.raf = requestAnimationFrame(tick);
}

function startTicking() {
    if (!player.raf) player.raf = requestAnimationFrame(tick);
}

const errorListeners = new Set();

/** Yuklangan qo'shiq ochilmasa chaqiriladi (o'rniga standart musiqa chalinadi). */
export function onMusicError(fn) {
    errorListeners.add(fn);
    return () => errorListeners.delete(fn);
}

export function onMusic(fn) {
    player.listeners.add(fn);
    return () => player.listeners.delete(fn);
}

/**
 * Foydalanuvchi bosgan paytda chaqiriladi (iPhone'da audio faqat shunda "ochiladi").
 * Keyin g'alaba server javobidan so'ng kelsa ham musiqa chalina oladi.
 */
export function unlockAudio() {
    getAudioCtx();
    const a = player.audio;
    if (a && !a.dataset.unlocked) {
        a.dataset.unlocked = '1';
        const wasMuted = a.muted;
        a.muted = true;
        const p = a.play();
        if (p && p.then) {
            p.then(() => { if (player.status !== 'playing') a.pause(); a.muted = wasMuted; })
             .catch(() => { a.muted = wasMuted; delete a.dataset.unlocked; });
        }
    }
}

/** Faol musiqani oldindan yuklab qo'yadi (g'alaba paytida darhol chalinishi uchun). */
export function prepareTrack(track) {
    player.track = track || { type: 'builtin' };
    if (player.track.type === 'file') {
        if (!player.audio || player.audio.dataset.src !== player.track.url) {
            if (player.audio) player.audio.pause();
            const a = new Audio();
            a.preload = 'auto';
            a.src = player.track.url;
            a.dataset.src = player.track.url;
            a.addEventListener('ended', () => { player.status = 'ended'; emit(); });
            a.addEventListener('error', () => {
                console.warn('[music] fayl ochilmadi:', a.error?.code, a.src);
                errorListeners.forEach(fn => { try { fn(a.error); } catch { /* jim */ } });
                if (player.track?.type === 'file' && player.status === 'playing') {
                    // fayl ochilmasa — standart musiqaga o'tamiz
                    player.status = 'idle';
                    playSynth();
                }
            });
            player.audio = a;
        }
    }
}

function stopSynth() {
    const s = player.synth;
    if (!s) return;
    player.synth = null;
    if (s.timer) clearInterval(s.timer);
    if (audioCtx) {
        const now = audioCtx.currentTime;
        s.bus.gain.cancelScheduledValues(now);
        s.bus.gain.setValueAtTime(s.bus.gain.value, now);
        s.bus.gain.linearRampToValueAtTime(0, now + 0.08);
    }
    setTimeout(() => { try { s.bus.disconnect(); } catch { /* allaqachon uzilgan */ } }, 150);
}

function playSynth() {
    stopSynth();
    const ctx = getAudioCtx();
    if (!ctx) return false;
    const chain = createMusicChain(ctx);
    chain.bus.gain.value = player.muted ? 0 : MUSIC_VOLUME;
    chain.bus.connect(ctx.destination);
    const score = buildHeroScore();
    const s = { bus: chain.bus, t0: ctx.currentTime + 0.12, duration: score.duration, timer: null, idx: 0 };
    // Notalar ~1 soniyalik bo'laklarda rejalashtiriladi (telefonda qotmasligi uchun)
    const pump = () => {
        const horizon = ctx.currentTime + 1;
        while (s.idx < score.events.length && s.t0 + score.events[s.idx].t < horizon) {
            const e = score.events[s.idx++];
            e.play(ctx, chain.input, s.t0 + e.t);
        }
        if (s.idx >= score.events.length && s.timer) {
            clearInterval(s.timer);
            s.timer = null;
        }
    };
    player.synth = s;
    pump();
    s.timer = setInterval(pump, 200);
    player.status = ctx.state === 'running' ? 'playing' : 'blocked';
    if (ctx.state !== 'running') {
        ctx.resume().then(() => { if (player.synth === s) { player.status = 'playing'; startTicking(); } }).catch(() => {});
    }
    startTicking();
    return true;
}

function playFile() {
    const a = player.audio;
    const start = player.track.startAt || 0;
    a.muted = player.muted;
    const seek = () => { try { a.currentTime = start; } catch { /* metadata hali yo'q */ } };
    if (a.readyState >= 1) seek();
    else a.addEventListener('loadedmetadata', seek, { once: true });
    player.status = 'playing';
    const p = a.play();
    if (p && p.catch) {
        p.catch(() => {
            player.status = 'blocked';      // brauzer avtomatik chalishga ruxsat bermadi — ↻ tugmasi bilan
            emit();
        });
    }
    startTicking();
}

/** G'olib musiqasini boshidan chaladi. */
export function playWinnerMusic(track = player.track) {
    stopWinnerMusic();
    prepareTrack(track);
    if (player.track.type === 'file') playFile();
    else playSynth();
    emit();
}

export function replayWinnerMusic() {
    player.muted = false;
    playWinnerMusic(player.track);
}

export function stopWinnerMusic() {
    stopSynth();
    if (player.audio) player.audio.pause();
    if (player.raf) cancelAnimationFrame(player.raf);
    player.raf = null;
    player.status = 'idle';
    emit();
}

export function toggleMute() {
    player.muted = !player.muted;
    if (player.synth && audioCtx) {
        player.synth.bus.gain.setTargetAtTime(player.muted ? 0 : MUSIC_VOLUME, audioCtx.currentTime, 0.05);
    }
    if (player.audio) player.audio.muted = player.muted;
    emit();
    return player.muted;
}

/** Admin panelda oldindan tinglash uchun (qisqa). */
export function previewTrack(track) {
    playWinnerMusic(track);
}
