// Bura — Telegram Mini App
import { tg, setupTelegram, haptic, setBack, setClosingConfirmation, openTelegramLink, requestWriteAccess } from './tg.js';
import { api } from './api.js';
import { h, avatar, teamName, when, ago, duration, emptyState, loading, toast, confirmDialog, promptDialog, openSheet, closeSheet } from './ui.js';
import { onMusic, onMusicError, unlockAudio, prepareTrack, playWinnerMusic, replayWinnerMusic, stopWinnerMusic, toggleMute } from './music.js';
import { openKozir, closeKozir, updateKozir, isKozirOpen } from './kozir.js';
import { openTurn, closeTurn, isTurnOpen, isTurnBusy, teamColor } from './turn.js';
import { startCelebration, stopCelebration } from './celebrate.js';
import { applyScore, SUITS, MIN_TEAMS, MAX_TEAMS } from '/shared/rules.js';

const root = document.getElementById('app');

const SUIT = {
    clubs: { sym: '♣', name: 'Chillak', color: 'black' },
    hearts: { sym: '♥', name: 'Chervi', color: 'red' },
    spades: { sym: '♠', name: 'Pika', color: 'black' },
    diamonds: { sym: '♦', name: "G'isht", color: 'red' }
};
const MEDALS = ['🥇', '🥈', '🥉'];
const BAN_PRESETS = [[60, '1 soat'], [360, '6 soat'], [1440, '1 kun'], [4320, '3 kun'], [10080, '7 kun'], [43200, '30 kun']];
const BUILTIN = { type: 'builtin', title: "G'olib qahramon kelmoqda", performer: 'Handel · See, the Conquering Hero Comes!' };

const S = {
    me: null, rankTotal: 0, isAdmin: false, adminUnlocked: false, adminUntil: null, canMessage: true, bot: null, startParam: null,
    track: null,
    view: null, tab: 'games', adminTab: 'overview',
    feed: null, loadToken: 0,
    admin: { usersQ: '', usersKind: 'all', usersSkip: 0, users: [], usersTotal: 0, gamesStatus: '', banMinutes: 1440 },
    banned: null, pollCount: 0,
    builder: null, pickTeam: 0, pickUsers: new Map(),
    game: null, serverVersion: 0, queue: [], sending: false, prevRender: {}, celebrated: null,
    ownTurnSeq: null                     // shu telefonda aniqlangan oxirgi «kim yuradi» (uni qayta ko'rsatmaslik uchun)
};

// ---------------------------------------------------------------- umumiy
let pollTimer = null;
function startPolling(fn, ms) {
    stopPolling();
    pollTimer = setInterval(() => {
        if (document.visibilityState === 'visible') fn();
    }, ms);
}
function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
}

function screen(inner, cls = '') {
    return `<div class="screen active ${cls}">${inner}</div>`;
}

function setView(view) {
    S.view = view;
    closeSheet();
    window.scrollTo(0, 0);
}

function errorBlock(err, retry = 'retry-tab') {
    return `<div class="error-block"><div class="empty-icon">⚠️</div><p>${h(err.message)}</p>
        <button class="more-btn" data-action="${retry}">Qayta urinish</button></div>`;
}

function chip(team, cls = '') {
    const crown = cls.includes('win') ? '<span class="chip-crown" aria-hidden="true">🏆</span>' : '';
    return `<span class="chip ${cls}">${crown}<span class="chip-name">${h(teamName(team))}</span><b>${team.score}</b></span>`;
}

function isMine(g) {
    return g.teams.some(t => t.members.some(m => m.id === S.me.id));
}

// ---------------------------------------------------------------- ishga tushirish
async function boot() {
    setupTelegram();
    root.innerHTML = screen(`<div class="container center">${loading()}</div>`);
    if (!tg || !tg.initData) return renderOutside();
    try {
        applyMe(await api('/me'));
    } catch (err) {
        return renderFatal(err);
    }
    const fromUrl = new URLSearchParams(location.search).get('game');
    const fromStart = /^game_([0-9a-f]{24})$/.exec(S.startParam || '')?.[1];
    const gameId = /^[0-9a-f]{24}$/.test(fromUrl || '') ? fromUrl : fromStart;
    if (gameId) openGame(gameId);
    else goHome();
}

function applyMe(me) {
    S.me = me.user;
    S.rankTotal = me.rankTotal;
    S.isAdmin = me.isAdmin;
    S.adminUnlocked = me.adminUnlocked;
    S.adminUntil = me.adminUntil;
    S.track = me.music;
    S.bot = me.bot;
    S.canMessage = me.canMessage;
    S.startParam = me.startParam;
}

async function renderOutside() {
    let bot = null;
    try { bot = (await fetch('/api/config').then(r => r.json())).bot; } catch { /* yo'q */ }
    root.innerHTML = screen(`<div class="container center">
        <div class="empty-icon">🃏</div>
        <h1>Bura hisoblagichi</h1>
        <p class="lead">Bu ilova Telegram ichida ishlaydi.</p>
        ${bot ? `<a class="team-btn link" href="https://t.me/${h(bot)}">Botni ochish — @${h(bot)}</a>` : ''}
    </div>`);
}

function renderBanned(info) {
    S.banned = info;
    stopPolling();
    stopCelebration();
    stopWinnerMusic();
    closeKozir(true);
    closeSheet();
    setBack(null);
    setClosingConfirmation(false);
    S.view = 'banned';
    root.innerHTML = screen(`<div class="container center banned">
        <div class="empty-icon">⛔</div>
        <h1>Siz vaqtincha bloklangansiz</h1>
        <p class="lead">${info.until ? `<b>${h(when(info.until))}</b> gacha botdan va o'yinlardan foydalana olmaysiz.` : h(info.error || '')}</p>
        ${info.reason ? `<div class="ban-box">Sabab: ${h(info.reason)}</div>` : ''}
        <button class="more-btn" data-action="reload">Qayta tekshirish</button>
    </div>`);
}

window.addEventListener('bura:banned', e => renderBanned(e.detail || {}));

function renderFatal(err) {
    if (err?.data?.code === 'banned') return renderBanned(err.data);
    root.innerHTML = screen(`<div class="container center">
        <div class="empty-icon">⚠️</div>
        <h1>${err.status === 401 ? 'Sessiya eskirgan' : 'Ulanib bo\'lmadi'}</h1>
        <p class="lead">${h(err.message)}</p>
        <button class="team-btn" data-action="reload">Qayta urinish</button>
    </div>`);
}

// ---------------------------------------------------------------- bosh sahifa
function goHome(tab) {
    leaveGame();
    if (tab) S.tab = tab;
    setView('home');
    setBack(null);
    renderHome();
    loadTab();
}

function headHtml() {
    const me = S.me;
    const s = me.stats;
    return `${avatar(me, 'lg')}
        <div class="head-text">
            <div class="head-name">${h(me.name)}</div>
            <div class="head-sub">🏆 ${s.wins} g'alaba · ${s.games} o'yin${me.rank ? ` · ${me.rank}-o'rin` : ''}</div>
        </div>
        ${S.isAdmin ? `<button class="admin-chip ${S.adminUnlocked ? 'on' : ''}" data-action="tab" data-tab="admin">${S.adminUnlocked ? '🔓' : '🛡'} Admin</button>` : ''}`;
}

function renderHead() {
    const el = document.getElementById('appHead');
    if (el) el.innerHTML = headHtml();
}

function renderHome() {
    const tabs = [['games', "🎮 O'yinlar"], ['rating', '🏆 Reyting'], ['me', '👤 Men']];
    if (S.isAdmin) tabs.push(['admin', '🛡 Admin']);
    root.innerHTML = screen(`<div class="container home">
        <header id="appHead" class="app-head">${headHtml()}</header>
        <button class="team-btn cta" data-action="new-game">＋ Yangi o'yin</button>
        <nav class="tabs tabs-${tabs.length}" role="tablist">
            ${tabs.map(([id, label]) => `<button class="tab-btn ${S.tab === id ? 'active' : ''}" role="tab" aria-selected="${S.tab === id}" data-action="tab" data-tab="${id}">${label}</button>`).join('')}
        </nav>
        <section id="tabBody" class="tab-body">${loading()}</section>
    </div>`, 'top');
}

function tabBody() {
    return document.getElementById('tabBody');
}

async function loadTab() {
    stopPolling();
    const token = ++S.loadToken;
    const fresh = () => token === S.loadToken && S.view === 'home';
    try {
        if (S.tab === 'games') {
            const feed = await api('/games');
            if (!fresh()) return;
            S.feed = feed;
            renderGamesTab();
            startPolling(refreshFeed, 8000);
        } else if (S.tab === 'rating') {
            const data = await api('/rating');
            if (fresh()) renderRating(data);
        } else if (S.tab === 'me') {
            const data = await api('/stats/me');
            if (!fresh()) return;
            S.me = data.user;
            renderHead();
            renderMe(data);
        } else if (S.tab === 'admin') {
            await loadAdmin(fresh);
        }
    } catch (err) {
        if (fresh() && tabBody()) tabBody().innerHTML = errorBlock(err);
    }
}

async function refreshFeed() {
    if (S.view !== 'home' || S.tab !== 'games') return;
    try {
        const feed = await api('/games');
        if (S.view !== 'home' || S.tab !== 'games') return;
        const extra = S.feed?.finished.length > feed.finished.length ? S.feed.finished.slice(feed.finished.length) : [];
        S.feed = { ...feed, finished: [...feed.finished, ...extra], hasMore: extra.length ? S.feed.hasMore : feed.hasMore, nextBefore: extra.length ? S.feed.nextBefore : feed.nextBefore };
        renderGamesTab();
    } catch { /* jim */ }
}

function liveCard(g) {
    return `<div class="game-card live" data-action="open-game" data-id="${g.id}" role="button" tabindex="0">
        <div class="gc-top"><span class="live-badge"><span class="live-dot"></span>Jonli</span><span class="gc-time">${h(ago(g.updatedAt))}</span></div>
        <div class="chip-row">${g.teams.map(t => chip(t, t.eliminated ? 'out' : '')).join('')}</div>
        <div class="gc-foot"><span>Ochgan: ${h(g.createdBy.name)}</span>${g.canEdit ? '<span class="edit-hint">✎ Hisoblay olasiz</span>' : '<span class="watch-hint">👁 Kuzatish</span>'}</div>
    </div>`;
}

function finishedCard(g, { showResult = false } = {}) {
    let result = '';
    if (showResult && isMine(g)) {
        const won = g.teams[g.winner]?.members.some(m => m.id === S.me.id);
        result = `<span class="result-badge ${won ? 'won' : 'lost'}">${won ? "🏆 G'alaba" : "Mag'lubiyat"}</span>`;
    }
    return `<div class="history-item">
        <div class="history-top"><span class="history-date">${h(when(g.finishedAt || g.updatedAt))}</span>${result}</div>
        <div class="chip-row">${g.teams.map((t, i) => chip(t, i === g.winner ? 'win' : 'out')).join('')}</div>
        <div class="history-actions">
            <button class="link-mini" data-action="open-game" data-id="${g.id}">Ko'rish</button>
            <button class="start-btn" data-action="rematch" data-id="${g.id}">▶ Shu o'yinchilar bilan</button>
        </div>
    </div>`;
}

function renderGamesTab() {
    const body = tabBody();
    if (!body || !S.feed) return;
    const { live, finished, hasMore } = S.feed;
    body.innerHTML = `
        <div class="section-title"><span class="live-dot"></span>Jonli o'yinlar <span class="count">${live.length}</span></div>
        ${live.length ? `<div class="game-list">${live.map(liveCard).join('')}</div>` : `<div class="empty-mini">Hozir jonli o'yin yo'q — yangisini oching!</div>`}
        <div class="section-title">Tugagan o'yinlar</div>
        ${finished.length ? `<div class="history-list">${finished.map(g => finishedCard(g)).join('')}</div>` : emptyState('📜', "Hali tugagan o'yinlar yo'q", "O'yin chempion bilan tugaganda shu yerda hammaga ko'rinadi.")}
        ${hasMore ? `<button class="more-btn" data-action="more-games">Ko'proq ko'rsatish</button>` : ''}`;
}

function renderRating(data) {
    const body = tabBody();
    if (!data.rows.length) {
        body.innerHTML = emptyState('🏆', "Hali reyting yo'q", "O'yinlar tugagach, Telegram o'yinchilari shu yerda chempionliklar bo'yicha saralanadi.");
        return;
    }
    body.innerHTML = `
        <div class="rank-head" aria-hidden="true"><span>#</span><span>O'yinchi</span><span>Chempion</span><span>O'yin</span><span>G'alaba</span></div>
        <div class="rank-list">${data.rows.map((p, i) => `
            <div class="rank-row ${p.rank === 1 ? 'top' : ''} ${p.id === S.me.id ? 'me' : ''}" style="animation-delay:${Math.min(i, 10) * 0.03}s">
                <span class="rank-pos">${MEDALS[p.rank - 1] || p.rank}</span>
                <span class="rank-name">${avatar(p, 'sm')}<span>${h(p.name)}</span></span>
                <span class="rank-num rank-wins">${p.stats.wins}</span>
                <span class="rank-num">${p.stats.games}</span>
                <span class="rank-num rank-pct">${p.stats.rate}%</span>
            </div>`).join('')}
        </div>
        <p class="rank-note">Chempionliklar → g'alaba foizi → o'yinlar soni bo'yicha. Mehmon (Telegram'siz) o'yinchilar hisobga olinmaydi.</p>`;
}

function renderMe(data) {
    const s = data.user.stats;
    const body = tabBody();
    body.innerHTML = `
        ${!S.canMessage ? `<div class="notice">
            <div><b>🔔 Natijalar Telegram'ga kelsin</b><br><span>Har o'yindan keyin g'alaba yoki mag'lubiyat va statistikangiz bot orqali keladi.</span></div>
            <button class="start-btn" data-action="allow-messages">Yoqish</button></div>` : ''}
        <div class="stat-grid">
            <div class="stat-tile"><div class="stat-val">${s.games}</div><div class="stat-lbl">O'yinlar</div></div>
            <div class="stat-tile gold"><div class="stat-val">${s.wins}</div><div class="stat-lbl">G'alabalar</div></div>
            <div class="stat-tile"><div class="stat-val">${s.losses}</div><div class="stat-lbl">Mag'lubiyatlar</div></div>
            <div class="stat-tile"><div class="stat-val">${s.rate}%</div><div class="stat-lbl">G'alaba foizi</div></div>
            <div class="stat-tile wide"><div class="stat-val">${data.user.rank ? `${data.user.rank}-o'rin` : '—'}</div><div class="stat-lbl">Reytingda${data.rankTotal ? ` (${data.rankTotal} o'yinchidan)` : ''}</div></div>
        </div>
        ${data.open.length ? `<div class="section-title">Tugallanmagan o'yinlaringiz</div><div class="game-list">${data.open.map(liveCard).join('')}</div>` : ''}
        <div class="section-title">So'nggi o'yinlarim</div>
        ${data.recent.length ? `<div class="history-list">${data.recent.map(g => finishedCard(g, { showResult: true })).join('')}</div>`
            : emptyState('🃏', "Hali o'yinlaringiz yo'q", "Yangi o'yin oching yoki do'stlaringiz sizni komandaga qo'shsin.")}`;
}

// ---------------------------------------------------------------- admin
async function loadAdmin(fresh = () => true) {
    const body = tabBody();
    if (!S.adminUnlocked) return renderAdminLock();
    body.innerHTML = `
        <div class="admin-bar">
            <div class="seg">${[['overview', 'Umumiy'], ['users', 'Userlar'], ['games', "O'yinlar"], ['music', 'Musiqa']].map(([id, label]) =>
                `<button class="seg-btn ${S.adminTab === id ? 'active' : ''}" data-action="admin-tab" data-tab="${id}">${label}</button>`).join('')}</div>
            <button class="lock-btn" data-action="admin-lock" aria-label="Admin panelni yopish" title="Yopish">🔒</button>
        </div>
        <div id="adminBody">${loading()}</div>`;
    try {
        await loadAdminSub(fresh);
    } catch (err) {
        if (err.status === 423) {
            S.adminUnlocked = false;
            renderHead();
            return renderAdminLock("Admin sessiyasi tugadi — kodni qayta kiriting.");
        }
        const el = document.getElementById('adminBody');
        if (el) el.innerHTML = errorBlock(err, 'admin-retry');
    }
}

function renderAdminLock(message = '') {
    tabBody().innerHTML = `<div class="admin-lock">
        <div class="lock-icon" aria-hidden="true">🔐</div>
        <div class="empty-title">Admin panel yopiq</div>
        <p>To'liq kirish uchun admin kodini kiriting (u serverdagi <code>.env</code> faylida).</p>
        <form id="unlockForm" class="unlock-form">
            <input id="adminCode" type="password" autocomplete="off" placeholder="Admin kodi" maxlength="200" required>
            <button class="team-btn" type="submit">Ochish</button>
        </form>
        <div id="unlockMsg" class="form-msg">${h(message)}</div>
    </div>`;
    const form = document.getElementById('unlockForm');
    form.addEventListener('submit', async e => {
        e.preventDefault();
        const input = document.getElementById('adminCode');
        const msg = document.getElementById('unlockMsg');
        const btn = form.querySelector('button');
        btn.disabled = true;
        try {
            const r = await api('/admin/unlock', { method: 'POST', body: { code: input.value } });
            S.adminUnlocked = true;
            S.adminUntil = r.until;
            haptic('success');
            renderHead();
            loadAdmin();
        } catch (err) {
            haptic('error');
            msg.textContent = err.message;
            input.value = '';
            input.focus();
            btn.disabled = false;
        }
    });
}

async function loadAdminSub(fresh = () => true) {
    const el = () => document.getElementById('adminBody');
    if (S.adminTab === 'overview') {
        const d = await api('/admin/overview');
        if (!fresh() || !el()) return;
        el().innerHTML = `
            <p class="admin-note">🔓 Ochiq: ${h(when(d.adminUntil))} gacha</p>
            <div class="stat-grid">
                <div class="stat-tile"><div class="stat-val">${d.users.total}</div><div class="stat-lbl">Foydalanuvchilar</div></div>
                <div class="stat-tile"><div class="stat-val">${d.users.messageable}</div><div class="stat-lbl">Botni ochgan 🔔</div></div>
                <div class="stat-tile"><div class="stat-val">${d.users.activeDay}</div><div class="stat-lbl">24 soatda faol</div></div>
                <div class="stat-tile"><div class="stat-val">${d.games.total}</div><div class="stat-lbl">Jami o'yinlar</div></div>
                <div class="stat-tile"><div class="stat-val">${d.games.live}</div><div class="stat-lbl">Jonli</div></div>
                <div class="stat-tile gold"><div class="stat-val">${d.games.finished}</div><div class="stat-lbl">Tugagan</div></div>
                <div class="stat-tile"><div class="stat-val">${d.games.today}</div><div class="stat-lbl">24 soatda ochilgan</div></div>
                <div class="stat-tile"><div class="stat-val">${d.games.cancelled}</div><div class="stat-lbl">Bekor qilingan</div></div>
            </div>
            <div class="section-title">🎵 G'olib musiqasi</div>
            <div class="track-row active"><span class="track-ico">${d.music.type === 'builtin' ? '🎺' : '🎵'}</span>
                <span class="track-main"><b>${h(d.music.title)}</b><small>${h(d.music.performer || '')}</small></span>
                <button class="link-mini" data-action="admin-tab" data-tab="music">O'zgartirish</button></div>
            ${d.top.length ? `<div class="section-title">Top-5</div><div class="rank-list">${d.top.map(p => `
                <div class="rank-row ${p.rank === 1 ? 'top' : ''}"><span class="rank-pos">${MEDALS[p.rank - 1] || p.rank}</span>
                <span class="rank-name">${avatar(p, 'sm')}<span>${h(p.name)}</span></span>
                <span class="rank-num rank-wins">${p.stats.wins}</span><span class="rank-num">${p.stats.games}</span><span class="rank-num rank-pct">${p.stats.rate}%</span></div>`).join('')}</div>` : ''}`;
    } else if (S.adminTab === 'users') {
        S.admin.usersSkip = 0;
        const d = await api(`/admin/users?limit=30&kind=${S.admin.usersKind}&q=${encodeURIComponent(S.admin.usersQ)}`);
        if (!fresh() || !el()) return;
        S.admin.byId = new Map();
        S.admin.users = d.items;
        S.admin.usersTotal = d.total;
        const kinds = [['all', 'Hammasi'], ['banned', '⛔ Bloklangan'], ['suggest', "💡 O'chirish tavsiyasi"]];
        el().innerHTML = `
            <input id="userSearch" class="search-input" placeholder="Qidirish: ism, @username yoki ID" value="${h(S.admin.usersQ)}" autocomplete="off">
            <div class="filter-row">${kinds.map(([id, label]) => `<button class="filter-chip ${S.admin.usersKind === id ? 'active' : ''}" data-action="users-kind" data-kind="${id}">${label}</button>`).join('')}</div>
            <div class="admin-note">${S.admin.usersKind === 'suggest' ? "30 kundan beri kirmagan va bitta ham o'yin o'ynamaganlar. " : ''}Jami: <b>${d.total}</b> ta · boshqarish uchun userni bosing</div>
            <div id="userList" class="user-list">${usersRows(d.items)}</div>
            ${d.items.length < d.total ? `<button class="more-btn" data-action="more-users">Ko'proq ko'rsatish</button>` : ''}`;
        let t;
        document.getElementById('userSearch').addEventListener('input', e => {
            clearTimeout(t);
            t = setTimeout(() => { S.admin.usersQ = e.target.value.trim(); loadAdmin(); }, 350);
        });
    } else if (S.adminTab === 'games') {
        const d = await api(`/admin/games?limit=40${S.admin.gamesStatus ? '&status=' + S.admin.gamesStatus : ''}`);
        if (!fresh() || !el()) return;
        const filters = [['', 'Hammasi'], ['live', 'Jonli'], ['finished', 'Tugagan'], ['cancelled', 'Bekor']];
        el().innerHTML = `
            <div class="filter-row">${filters.map(([id, label]) => `<button class="filter-chip ${S.admin.gamesStatus === id ? 'active' : ''}" data-action="games-filter" data-status="${id}">${label}</button>`).join('')}</div>
            <div class="admin-note">Jami: <b>${d.total}</b></div>
            ${d.items.length ? `<div class="history-list">${d.items.map(adminGameRow).join('')}</div>` : emptyState('🎮', "O'yinlar yo'q", '')}`;
    } else if (S.adminTab === 'music') {
        const d = await api('/admin/tracks');
        if (!fresh() || !el()) return;
        renderTracks(d);
    }
}

function userTags(u) {
    return [
        u.isAdmin ? '<span class="tag admin">👑 Admin</span>' : '',
        u.ban ? `<span class="tag ban">⛔ ${h(when(u.ban.until))} gacha</span>` : '',
        u.suggestDelete && !u.isAdmin ? "<span class=\"tag sug\">💡 o'chirish tavsiya</span>" : ''
    ].join('');
}

function usersRows(items) {
    items.forEach(u => S.admin.byId?.set(u.id, u));
    return items.map(u => `<div class="user-row ${u.ban ? 'banned' : ''}" data-action="admin-user" data-id="${u.id}" role="button" tabindex="0">
        ${avatar(u, 'md')}
        <div class="ur-main">
            <div class="ur-name">${h(u.name)} ${u.canMessage ? '<span title="Botni ochgan — natijalar boradi">🔔</span>' : '<span title="Botni ochmagan">🔕</span>'}</div>
            <div class="ur-sub">${u.username ? '@' + h(u.username) + ' · ' : ''}ID ${u.id} · ${h(ago(u.lastSeenAt))}</div>
            ${userTags(u) ? `<div class="ur-tags">${userTags(u)}</div>` : ''}
        </div>
        <div class="ur-stats"><b>${u.stats.wins}</b>/${u.stats.games}<small>${u.rank ? `${u.rank}-o'rin` : '—'}</small></div>
    </div>`).join('') || `<div class="empty-mini">Topilmadi</div>`;
}

const STATUS_LABEL = { live: '🔴 Jonli', finished: '🏁 Tugagan', cancelled: '❌ Bekor' };

function adminGameRow(g) {
    return `<div class="history-item">
        <div class="history-top"><span class="history-date">${STATUS_LABEL[g.status]} · ${h(when(g.createdAt))}</span><span class="muted-small">Ochgan: ${h(g.createdBy.name)}</span></div>
        <div class="chip-row">${g.teams.map((t, i) => chip(t, i === g.winner ? 'win' : t.eliminated ? 'out' : '')).join('')}</div>
        <div class="history-actions">
            <button class="link-mini" data-action="open-game" data-id="${g.id}">Ochish</button>
            ${g.status === 'live'
                ? `<button class="danger-mini" data-action="admin-cancel-game" data-id="${g.id}">❌ Bekor qilish</button>`
                : `<button class="danger-mini" data-action="admin-delete-game" data-id="${g.id}">🗑 O'chirish</button>`}
        </div>
    </div>`;
}

function renderTracks(d) {
    const el = document.getElementById('adminBody');
    el.innerHTML = `
        <div class="notice">
            <div><b>➕ Yangi musiqa qo'shish</b><br><span>Botga (Mini App'siz) audio fayl yuboring — MP3 tavsiya, 20 MB gacha. Avval botda /admin orqali kod kiritilgan bo'lishi kerak.</span></div>
            ${S.bot ? `<button class="start-btn" data-action="open-bot">Botni ochish</button>` : ''}
        </div>
        <div class="track-list">${d.items.map(t => `
            <div class="track-row ${t.active ? 'active' : ''} ${t.type === 'file' ? 'file' : ''}">
                <button class="radio ${t.active ? 'on' : ''}" data-action="track-active" data-id="${t.id}" aria-label="Faol qilish" title="Faol qilish"></button>
                <span class="track-main">
                    <b>${h(t.title)}</b>
                    <small>${t.type === 'builtin' ? 'Standart · brauzerda yaratiladi' : [t.performer, duration(t.duration), t.startAt ? `▶ ${duration(t.startAt)} dan` : ''].filter(Boolean).map(h).join(' · ')}</small>
                </span>
                <span class="track-actions">
                    <button class="icon-mini" data-action="track-preview" data-id="${t.id}" aria-label="Tinglash" title="Tinglash">▶</button>
                    ${t.type === 'file' ? `
                    <button class="icon-mini" data-action="track-start" data-id="${t.id}" aria-label="Boshlanish vaqti" title="Boshlanish vaqti">⏱</button>
                    <button class="icon-mini" data-action="track-title" data-id="${t.id}" aria-label="Nomini o'zgartirish" title="Nomi">✏️</button>
                    <button class="icon-mini danger" data-action="track-delete" data-id="${t.id}" aria-label="O'chirish" title="O'chirish">🗑</button>` : ''}
                </span>
            </div>`).join('')}
        </div>
        <p class="rank-note">Faol musiqa g'olib ekranida chalinadi. ⏱ — qo'shiqni masalan naqoratidan boshlash uchun.</p>`;
    S.admin.tracks = d.items;
}

function openUserSheet(id) {
    const u = S.admin.byId.get(id);
    if (!u) return;
    const st = u.stats;
    openSheet(`
        <div class="sheet-head"><b>Foydalanuvchi</b><button class="sheet-x" data-action="close-sheet" aria-label="Yopish">✕</button></div>
        <div class="us-head">${avatar(u, 'lg')}
            <div class="us-main"><div class="us-name">${h(u.name)}</div>
            <div class="us-sub">${u.username ? '@' + h(u.username) + ' · ' : ''}ID ${u.id}</div></div>
        </div>
        ${userTags(u) ? `<div class="ur-tags">${userTags(u)}</div>` : ''}
        <div class="stat-grid compact">
            <div class="stat-tile"><div class="stat-val">${st.games}</div><div class="stat-lbl">O'yin</div></div>
            <div class="stat-tile gold"><div class="stat-val">${st.wins}</div><div class="stat-lbl">G'alaba</div></div>
            <div class="stat-tile"><div class="stat-val">${st.losses}</div><div class="stat-lbl">Mag'lubiyat</div></div>
            <div class="stat-tile"><div class="stat-val">${u.rank ? u.rank : '—'}</div><div class="stat-lbl">O'rin</div></div>
        </div>
        <p class="us-meta">${u.canMessage ? '🔔 Botni ochgan — natijalar boradi' : '🔕 Botni ochmagan'} · oxirgi faollik: ${h(ago(u.lastSeenAt))}</p>
        ${u.ban ? `<div class="ban-box">⛔ <b>Bloklangan: ${h(when(u.ban.until))} gacha</b>${u.ban.reason ? `<br>Sabab: ${h(u.ban.reason)}` : ''}</div>` : ''}
        ${u.suggestDelete && !u.isAdmin ? `<div class="notice sug"><span>💡 30 kundan beri kirmagan va bitta ham o'yin o'ynamagan — o'chirish tavsiya etiladi.</span></div>` : ''}
        ${u.isAdmin ? `<p class="admin-note">👑 Admin — bloklab yoki o'chirib bo'lmaydi.</p>` : `
        <div class="us-actions">
            ${u.ban
                ? `<button class="start-btn" data-action="user-unban" data-id="${u.id}">✅ Blokdan chiqarish</button>
                   <button class="more-btn inline" data-action="user-ban-form" data-id="${u.id}">⏱ Muddatni o'zgartirish</button>`
                : `<button class="ban-btn" data-action="user-ban-form" data-id="${u.id}">⛔ Vaqtincha bloklash</button>`}
            <button class="danger-mini" data-action="user-delete" data-id="${u.id}">🗑 O'chirish</button>
        </div>`}`);
}

function openBanForm(id) {
    const u = S.admin.byId.get(id);
    if (!u) return;
    openSheet(`
        <div class="sheet-head"><b>⛔ ${h(u.name)} — vaqtincha bloklash</b><button class="sheet-x" data-action="close-sheet" aria-label="Yopish">✕</button></div>
        <p class="admin-note">Bloklangan user botdan ham, Mini App'dan ham foydalana olmaydi va yangi o'yinlarga qo'shilmaydi. Muddat tugagach blok o'zi ochiladi.</p>
        <div class="filter-row">${BAN_PRESETS.map(([min, label]) => `<button class="filter-chip ${S.admin.banMinutes === min ? 'active' : ''}" data-action="ban-preset" data-min="${min}">${label}</button>`).join('')}</div>
        <div class="ban-custom">
            <span>yoki</span>
            <input id="banNum" type="number" min="1" max="999" inputmode="numeric" placeholder="son">
            <select id="banUnit"><option value="60">soat</option><option value="1440">kun</option><option value="10080">hafta</option><option value="1">daqiqa</option></select>
        </div>
        <input id="banReason" class="search-input" maxlength="200" placeholder="Sabab (ixtiyoriy) — userga ko'rsatiladi" autocomplete="off">
        <button class="ban-btn wide" data-action="ban-submit" data-id="${u.id}">⛔ Bloklash</button>`);
}

// ---------------------------------------------------------------- yangi o'yin
function goCount() {
    leaveGame();
    setView('count');
    setBack(() => goHome());
    root.innerHTML = screen(`<div class="container">
        <div class="exit-container"><button class="exit-btn" data-action="home">⟸ Orqaga</button></div>
        <h1>Komanda sonini tanlang</h1>
        <div class="button-group">${[2, 3, 4, 5, 6].map(n => `<button class="team-btn" data-action="count" data-n="${n}">${n} Komanda</button>`).join('')}</div>
    </div>`);
}

function goBuilder() {
    S.builderFresh = true;
    setView('builder');
    setBack(() => goCount());
    renderBuilder();
}

function renderBuilder() {
    const b = S.builder;
    root.innerHTML = screen(`<div class="container">
        <div class="exit-container"><button class="exit-btn" data-action="new-game">⟸ Orqaga</button></div>
        <h1>O'yinchilarni tanlang</h1>
        <p class="lead small">Har komandaga Telegram'dagi o'yinchini yoki mehmonni qo'shing. Bo'sh komanda «N-komanda» nomi bilan o'ynaydi.</p>
        <div class="builder ${S.builderFresh ? 'animate' : ''}">${b.teams.map((t, i) => `
            <div class="builder-row" style="animation-delay:${i * 0.05}s">
                <div class="br-label">${i + 1}-komanda</div>
                <div class="br-members">
                    ${t.members.map((m, j) => `<span class="member-chip">${avatar(m, 'xs')}<span>${h(m.name)}</span>
                        <button class="mc-x" data-action="rm-member" data-team="${i}" data-idx="${j}" aria-label="Olib tashlash">✕</button></span>`).join('')}
                    ${t.members.length < 3 ? `<button class="add-member ${t.members.length ? 'small' : ''}" data-action="pick" data-team="${i}">${t.members.length ? '＋ Sherik' : "＋ O'yinchi tanlash"}</button>` : ''}
                </div>
            </div>`).join('')}
        </div>
        <button id="startBtn" class="team-btn start" data-action="start-game">Boshlash</button>
    </div>`);
    S.builderFresh = false;
}

function takenMap() {
    const map = new Map();
    S.builder.teams.forEach((t, i) => t.members.forEach(m => { if (m.id) map.set(m.id, i); }));
    return map;
}

function openPicker(teamIdx) {
    S.pickTeam = teamIdx;
    const sheet = openSheet(`
        <div class="sheet-head"><b>${teamIdx + 1}-komandaga o'yinchi</b><button class="sheet-x" data-action="close-sheet" aria-label="Yopish">✕</button></div>
        <input id="pickSearch" class="search-input" placeholder="Ism yoki @username bo'yicha qidirish" autocomplete="off">
        <div id="pickList" class="pick-list">${loading()}</div>
        <form id="guestForm" class="guest-add">
            <input id="guestName" maxlength="24" placeholder="Telegram'siz mehmon ismi" autocomplete="off">
            <button type="submit">Qo'shish</button>
        </form>`);
    let t;
    sheet.querySelector('#pickSearch').addEventListener('input', e => {
        clearTimeout(t);
        t = setTimeout(() => loadPickList(e.target.value.trim()), 250);
    });
    sheet.querySelector('#guestForm').addEventListener('submit', e => {
        e.preventDefault();
        const input = sheet.querySelector('#guestName');
        const name = input.value.replace(/\s+/g, ' ').trim();
        if (!name) return input.focus();
        S.builder.teams[S.pickTeam].members.push({ id: null, name: name.slice(0, 24) });
        closeSheet();
        renderBuilder();
    });
    loadPickList('');
}

async function loadPickList(q) {
    const list = document.getElementById('pickList');
    if (!list) return;
    try {
        const { users } = await api('/users' + (q ? '?q=' + encodeURIComponent(q) : ''));
        let rows = users;
        if (!q) rows = [S.me, ...users.filter(u => u.id !== S.me.id)];
        rows.forEach(u => S.pickUsers.set(u.id, u));
        const taken = takenMap();
        if (document.getElementById('pickList') !== list) return;
        list.innerHTML = rows.length ? rows.map(u => {
            const inTeam = taken.get(u.id);
            return `<button class="pick-row" data-action="pick-user" data-id="${u.id}" ${inTeam !== undefined ? 'disabled' : ''}>
                ${avatar(u, 'md')}
                <span class="pr-main"><span class="pr-name">${h(u.name)}${u.id === S.me.id ? ' <small>(siz)</small>' : ''}</span>
                <span class="pr-sub">${u.username ? '@' + h(u.username) + ' · ' : ''}🏆 ${u.stats.wins} · ${u.stats.games} o'yin</span></span>
                ${inTeam !== undefined ? `<span class="pr-taken">${inTeam + 1}-komandada</span>` : ''}
            </button>`;
        }).join('') : `<div class="empty-mini">Topilmadi. U avval botni ochishi kerak — yoki pastda mehmon sifatida qo'shing.</div>`;
    } catch (err) {
        list.innerHTML = `<div class="empty-mini">${h(err.message)}</div>`;
    }
}

// ---------------------------------------------------------------- o'yin
function leaveGame() {
    closeKozir(true);
    closeTurn(true);
    stopPolling();
    stopCelebration();
    stopWinnerMusic();
    setClosingConfirmation(false);
    S.game = null;
    const dropped = S.queue;
    S.queue = [];
    dropped.forEach(op => op.reject?.(new Error("O'yindan chiqildi")));
}

async function openGame(id, initial = null) {
    leaveGame();
    setView('game');
    setBack(() => goHome());
    S.prevRender = {};
    S.celebrated = null;
    if (initial) {
        S.game = initial;
    } else {
        root.innerHTML = screen(`<div class="container center">${loading("O'yin yuklanmoqda...")}</div>`);
        try {
            S.game = (await api(`/games/${id}`)).game;
        } catch (err) {
            root.innerHTML = screen(`<div class="container center"><div class="empty-icon">🃏</div><h1>O'yin ochilmadi</h1>
                <p class="lead">${h(err.message)}</p><button class="team-btn" data-action="home">Bosh sahifa</button></div>`);
            return;
        }
        if (S.view !== 'game') return;
    }
    S.serverVersion = S.game.version;
    prepareTrack(S.track || BUILTIN);
    api('/music/active').then(r => { S.track = r.music; prepareTrack(S.track); }).catch(() => {});
    if (S.game.status === 'finished') return showWinner({ celebrate: false });
    renderGame();
    startPolling(pollGame, 2500);
    setClosingConfirmation(S.game.canEdit && S.game.status === 'live');
}

function statusBadge(g) {
    if (g.status === 'live') return `<span class="game-status live"><span class="live-dot"></span>${g.canEdit ? 'Jonli' : 'Jonli · kuzatish'}</span>`;
    if (g.status === 'cancelled') return `<span class="game-status off">❌ Bekor qilingan</span>`;
    return `<span class="game-status done">🏁 Tugagan</span>`;
}

function suitBarHtml(g) {
    const editable = g.canEdit && g.status === 'live';
    return `<div class="suit-bar ${editable ? '' : 'readonly'}">
        <div class="suit-cards">${SUITS.map(s => `
            <button class="suit-card ${SUIT[s].color}" data-action="suit" data-suit="${s}" aria-label="${SUIT[s].name}" ${editable ? '' : 'disabled'}>
                <span class="sc-corner">A<br>${SUIT[s].sym}</span><span class="sc-center">${SUIT[s].sym}</span>
            </button>`).join('')}
        </div>
        <div id="suitLabel" class="suit-label"></div>
        <button id="suitExpand" class="suit-expand" data-action="kozir-full" aria-label="Kozirni butun ekranda ko'rsatish">⛶ Butun ekranda</button>
    </div>`;
}

function updateSuitBar() {
    const g = S.game;
    if (!g) return;
    const sel = g.suit;
    document.querySelectorAll('.suit-card').forEach(card => {
        card.classList.toggle('selected', card.dataset.suit === sel);
        card.classList.toggle('dimmed', !!sel && card.dataset.suit !== sel);
    });
    const label = document.getElementById('suitLabel');
    if (label) {
        const editable = g.canEdit && g.status === 'live';
        label.textContent = sel
            ? `Kozir: ${SUIT[sel].name} ${SUIT[sel].sym}${editable ? " · o'zgartirish uchun bosing" : ''}`
            : (editable ? 'Kozirni tanlang' : 'Kozir tanlanmagan');
        label.classList.toggle('active', !!sel);
        label.classList.toggle('red', sel === 'hearts' || sel === 'diamonds');
    }
    const expand = document.getElementById('suitExpand');
    if (expand) expand.hidden = !sel && !(g.canEdit && g.status === 'live');
    updateKozir({ suit: sel, editable: g.canEdit && g.status === 'live' });
}

// ---------------------------------------------------------------- kim yuradi
function turnCands(g) {
    return g.teams.flatMap((t, i) => (t.eliminated ? [] : [i]));
}

function scoreSum(g) {
    return g.teams.reduce((s, t) => s + t.score, 0);
}

/** Oxirgi tanlov hali dolzarbmi: shundan keyin ochko o'zgarmagan bo'lsa (yangi qo'l — yangi tanlov). */
function freshTurn(g) {
    const t = g?.turn;
    if (!t || g.status !== 'live' || t.sum !== scoreSum(g) || !g.teams[t.team] || g.teams[t.team].eliminated) return null;
    return t;
}

function updateTurnBar() {
    const box = document.getElementById('turnBar');
    const g = S.game;
    if (!box || !g) return;
    const editable = g.canEdit && g.status === 'live';
    const t = freshTurn(g);
    const result = t ? `<div class="turn-result" style="--c:${teamColor(t.team)}">
            <span class="tr-dot" aria-hidden="true"></span>
            <span class="tr-main">
                <span class="tr-text"><span class="tr-ico" aria-hidden="true">🎲 </span><b>${h(teamName(g.teams[t.team]))}</b> yuradi</span>
                <span class="tr-by">${h(t.byName)} · ${t.mode === 'wheel' ? '🎡 baraban' : '⚡ bir bosishda'}</span>
            </span>
        </div>` : '';
    if (t && editable) {
        // natija bor — bitta qatorda: natija + qayta aniqlash tugmachalari (ochko kartalari yuqoriroq turadi)
        box.innerHTML = `<div class="turn-row">${result}
            <button class="turn-icon" data-action="turn-quick" aria-label="Qayta aniqlash — bir bosishda" title="Qayta aniqlash — bir bosishda">⚡</button>
            <button class="turn-icon wheel" data-action="turn-wheel" aria-label="Barabanni aylantirish" title="Baraban">🎡</button>
        </div>`;
    } else if (editable) {
        box.innerHTML = `<div class="turn-btns">
            <button class="turn-btn" data-action="turn-quick"><span class="tb-ico" aria-hidden="true">⚡</span><span class="tb-txt"><b>Kim yuradi?</b><small>bir bosishda</small></span></button>
            <button class="turn-btn wheel" data-action="turn-wheel"><span class="tb-ico" aria-hidden="true">🎡</span><span class="tb-txt"><b>Baraban</b><small>aylantirib aniqlash</small></span></button>
        </div>`;
    } else {
        box.innerHTML = result;                 // kuzatuvchi: faqat natija
    }
    box.hidden = !box.innerHTML;
}

/** Tanlov so'rovi navbat orqali ketadi — ochko bosishlari bilan aralashib ketmasligi (409) uchun. */
function requestTurn(mode) {
    return new Promise((resolve, reject) => enqueue({ type: 'turn', mode, resolve, reject })).then(game => game.turn);
}

function restoreBack() {
    if (S.view !== 'game') return;
    if (isKozirOpen()) setBack(() => closeKozir());
    else setBack(() => goHome());
}

function startTurn(mode) {
    const g = S.game;
    if (!g || !g.canEdit || g.status !== 'live') return;
    closeSheet();
    openTurn({
        mode,
        teams: g.teams,
        cands: turnCands(g),
        request: requestTurn,
        autoStart: mode === 'quick',          // «bir bosishda» — tugmani bosishning o'zi yetadi
        onClose: restoreBack
    });
}

/** Boshqa telefonda aniqlangan natija: shu yerda ham baraban aylanadi / natija chiqadi. */
function revealRemoteTurn() {
    const g = S.game;
    const t = freshTurn(g);
    if (!t || t.seq === S.ownTurnSeq) return;
    if (!(Date.now() - Date.parse(t.at) < 45000)) return;     // eski tanlov (telefon uxlab qolgan) — faqat belgida
    if (isTurnBusy()) return;                                 // o'zimiz aylantiryapmiz
    openTurn({ spectator: t, teams: g.teams, cands: turnCands(g), onClose: restoreBack });
}

/** Kozirni o'rnatadi (to'liq ekran rejimidan tanlanganda — o'chirib qo'ymaydi). */
function setGameSuit(s) {
    const g = S.game;
    if (!g || !g.canEdit || g.status !== 'live' || g.suit === s) return;
    g.suit = s;
    updateSuitBar();
    enqueue({ type: 'suit', suit: s });
}

function teamCardHtml(g, t, i) {
    const prev = S.prevRender[i];
    let cls = '';
    let scoreCls = '';
    let style = '';
    if (!prev) {
        cls = ' card-enter';
        style = `animation-delay:${i * 0.07}s`;
    } else {
        if (prev.score !== t.score) scoreCls = t.score > prev.score ? 'pop-up' : 'pop-down';
        if (t.eliminated && !prev.eliminated) cls = ' just-eliminated';
    }
    S.prevRender[i] = { score: t.score, eliminated: t.eliminated };
    const dis = !g.canEdit || t.eliminated || g.status !== 'live' ? 'disabled' : '';
    const turnOn = freshTurn(g)?.team === i;
    if (turnOn) {
        cls += ' turn-on';
        style += `;--c:${teamColor(i)}`;
    }
    return `<div class="team-card${t.eliminated ? ' eliminated' : ''}${cls}" style="${style}">
        <button class="score-btn minus-btn" data-action="score" data-team="${i}" data-delta="-2" ${dis} aria-label="${i + 1}-komanda: minus 2">-</button>
        <div class="team-info">
            ${turnOn ? '<div class="team-turn">🎲 Yuradi</div>' : ''}
            <div class="team-avatars">${t.members.map(m => avatar(m, 'sm')).join('')}</div>
            <div class="team-name">${h(teamName(t))}</div>
            <div class="team-score ${scoreCls}">${t.score}</div>
        </div>
        <button class="score-btn plus-btn" data-action="score" data-team="${i}" data-delta="2" ${dis} aria-label="${i + 1}-komanda: plus 2">+</button>
    </div>`;
}

function renderTeams() {
    const box = document.getElementById('teamsContainer');
    if (box && S.game) box.innerHTML = S.game.teams.map((t, i) => teamCardHtml(S.game, t, i)).join('');
}

function renderGame() {
    const g = S.game;
    const viewer = !g.canEdit;
    root.innerHTML = screen(`<div class="container game ${viewer ? 'viewer' : ''}">
        <div class="game-top">
            <button class="exit-btn" data-action="home">⟸ Chiqish</button>
            <span id="gameStatus">${statusBadge(g)}</span>
            <button class="icon-btn menu-btn" data-action="game-menu" aria-label="O'yin menyusi">⋯</button>
        </div>
        ${suitBarHtml(g)}
        <div id="turnBar" class="turn-bar" hidden></div>
        <div id="teamsContainer" class="teams-container"></div>
        <div class="game-foot">
            ${viewer && g.status === 'live' ? "<div>👁 Kuzatuvchi rejimi — ochkolarni o'yin ishtirokchilari o'zgartiradi</div>" : ''}
            <div class="muted-small">Ochgan: ${h(g.createdBy.name)} · ${h(when(g.createdAt))}</div>
        </div>
    </div>`);
    renderTeams();
    updateSuitBar();
    updateTurnBar();
}

function sameState(a, b) {
    return a.status === b.status && a.suit === b.suit && a.canEdit === b.canEdit &&
        (a.turn?.seq || 0) === (b.turn?.seq || 0) &&
        a.teams.every((t, i) => t.score === b.teams[i].score && t.eliminated === b.teams[i].eliminated);
}

/** Server holatini qabul qiladi (o'zimizning yoki boshqa qurilmadagi o'zgarish). */
function reconcile(server, { force = false } = {}) {
    if (!S.game || S.game.id !== server.id) return;
    const local = S.game;
    const same = sameState(local, server);
    const canEditChanged = local.canEdit !== server.canEdit;
    const turnNew = (server.turn?.seq || 0) > (local.turn?.seq || 0);
    S.serverVersion = server.version;
    S.game = server;
    if (S.view === 'winner') {
        if (server.status !== 'finished') {
            // g'alaba tasdiqlanmadi (boshqa qurilma oldinroq o'zgartirgan) — o'yinga qaytamiz
            stopCelebration();
            stopWinnerMusic();
            S.celebrated = null;
            setView('game');
            setBack(() => goHome());
            renderGame();
            startPolling(pollGame, 2500);
        } else if (!same) {
            renderWinner();
        }
        return;
    }
    if (server.status === 'finished') return showWinner({ celebrate: true });
    if (server.status === 'cancelled') {
        stopPolling();
        setClosingConfirmation(false);
        renderGame();
        toast("O'yin bekor qilindi");
        return;
    }
    if (canEditChanged) {
        renderGame();
    } else if (!same || force) {
        renderTeams();
        updateSuitBar();
        updateTurnBar();
        const st = document.getElementById('gameStatus');
        if (st) st.innerHTML = statusBadge(server);
    }
    if (turnNew) revealRemoteTurn();
}

function enqueue(op) {
    S.queue.push(op);
    if (!S.sending) flush();
}

async function flush() {
    const id = S.game?.id;
    if (!id) return;
    S.sending = true;
    while (S.queue.length && S.game?.id === id) {
        const op = S.queue[0];
        try {
            const res = op.type === 'score'
                ? await api(`/games/${id}/score`, { method: 'POST', body: { team: op.team, delta: op.delta, v: S.serverVersion } })
                : op.type === 'turn'
                    ? await api(`/games/${id}/turn`, { method: 'POST', body: { mode: op.mode } })
                    : await api(`/games/${id}/suit`, { method: 'POST', body: { suit: op.suit } });
            S.queue.shift();
            S.serverVersion = res.game.version;
            if (op.type === 'turn') {
                S.ownTurnSeq = res.game.turn?.seq ?? null;
                op.resolve(res.game);
            }
            if (!S.queue.length) reconcile(res.game);
        } catch (err) {
            const dropped = S.queue;
            S.queue = [];
            dropped.forEach(o => o.reject?.(err));
            if (op.type === 'turn') {
                // xato «Kim yuradi?» oynasining o'zida ko'rsatiladi
                if (err.data?.game) reconcile(err.data.game, { force: true });
            } else if (err.data?.game) {
                toast(err.status === 409 ? "O'yin boshqa qurilmada yangilandi — tekshirib, qayta bosing" : err.message, 'warn');
                reconcile(err.data.game, { force: true });
            } else {
                toast(err.message, 'error');
                try { reconcile((await api(`/games/${id}`)).game, { force: true }); } catch { /* keyingi so'rovda */ }
            }
            break;
        }
    }
    S.sending = false;
}

async function refreshMusic() {
    try {
        const r = await api('/music/active');
        if (r?.music && (r.music.id !== S.track?.id || r.music.startAt !== S.track?.startAt || r.music.url !== S.track?.url)) {
            S.track = r.music;
            prepareTrack(S.track);
        }
    } catch { /* keyingi safar */ }
}

async function pollGame() {
    const g = S.game;
    if (++S.pollCount % 12 === 0) refreshMusic();
    if (!g || S.sending || S.queue.length) return;
    try {
        const res = await api(`/games/${g.id}?since=${S.serverVersion}`);
        if (res?.game && !S.sending && !S.queue.length) reconcile(res.game);
    } catch { /* tarmoq — keyingi safar */ }
}

// ---------------------------------------------------------------- g'olib
function showWinner({ celebrate }) {
    closeKozir(true);
    closeTurn(true);
    stopPolling();
    setClosingConfirmation(false);
    S.view = 'winner';
    closeSheet();
    setBack(() => goHome());
    renderWinner();
    bindMusicUi();
    if (celebrate && S.celebrated !== S.game.id) {
        S.celebrated = S.game.id;
        haptic('success');
        startCelebration();
        playWinnerMusic(S.track || BUILTIN);
    }
}

function renderWinner() {
    const g = S.game;
    const champ = g.teams[g.winner];
    const track = S.track || BUILTIN;
    root.innerHTML = screen(`<div class="container winner-container">
        <div class="exit-container"><button class="exit-btn" data-action="home">⟸ Chiqish</button></div>
        <div class="winner-rays" aria-hidden="true"></div>
        <div class="winner-animation">
            <div class="trophy" aria-hidden="true">🏆</div>
            <div class="winner-suits" aria-hidden="true"><span>♣</span><span class="red">♥</span><span>♠</span><span class="red">♦</span></div>
            <div class="winner-avatars">${champ.members.map(m => avatar(m, 'lg')).join('')}</div>
            <h1 class="winner-text">${h(teamName(champ))}</h1>
            <p class="winner-subtitle">CHEMPION!</p>
        </div>
        <div class="final-scores chip-row">${g.teams.map((t, i) => chip(t, i === g.winner ? 'win' : 'out')).join('')}</div>
        <div class="winner-actions">
            <button class="new-game-btn" data-action="new-game">Yangi o'yin</button>
            <button class="rematch-btn" data-action="rematch" data-id="${g.id}">🔁 Shu o'yinchilar bilan qayta</button>
        </div>
        <div id="musicPlayer" class="music-player">
            <button id="soundBtn" class="mp-btn" data-action="mute" aria-label="Ovozni o'chirish" title="Ovoz">🔊</button>
            <div class="mp-info">
                <div class="mp-title"><span class="mp-note" aria-hidden="true">♪</span> ${h(track.title)}</div>
                <div class="mp-sub">${h(track.performer || '')}</div>
                <div class="mp-bar"><div id="musicProgress" class="mp-fill"></div></div>
            </div>
            <button class="mp-btn mp-replay" data-action="replay" aria-label="Musiqani qayta qo'yish" title="Qayta qo'yish">↻</button>
        </div>
        <div class="muted-small finish-meta">${h(when(g.finishedAt || Date.now()))} · ochgan: ${h(g.createdBy.name)}</div>
    </div>`);
}

let unsubMusic = null;
function bindMusicUi() {
    if (unsubMusic) unsubMusic();
    unsubMusic = onMusic(st => {
        const box = document.getElementById('musicPlayer');
        if (!box) return;
        document.getElementById('musicProgress').style.transform = `scaleX(${st.progress})`;
        box.classList.toggle('playing', st.status === 'playing');
        box.classList.toggle('ended', st.status !== 'playing');
        box.classList.toggle('blocked', st.status === 'blocked');
        const btn = document.getElementById('soundBtn');
        btn.textContent = st.muted ? '🔇' : '🔊';
        btn.setAttribute('aria-label', st.muted ? 'Ovozni yoqish' : "Ovozni o'chirish");
    });
}

// ---------------------------------------------------------------- tugmalar
const ACTIONS = {
    reload: () => location.reload(),
    home: () => goHome(),
    tab: el => {
        stopWinnerMusic();
        S.tab = el.dataset.tab;
        if (S.view !== 'home') return goHome();
        document.querySelectorAll('.tabs .tab-btn').forEach(b => {
            const on = b.dataset.tab === S.tab;
            b.classList.toggle('active', on);
            b.setAttribute('aria-selected', String(on));
        });
        tabBody().innerHTML = loading();
        loadTab();
    },
    'retry-tab': () => { tabBody().innerHTML = loading(); loadTab(); },
    'more-games': async el => {
        el.disabled = true;
        try {
            const more = await api(`/games?before=${encodeURIComponent(S.feed.nextBefore)}`);
            S.feed.finished.push(...more.finished);
            S.feed.hasMore = more.hasMore;
            S.feed.nextBefore = more.nextBefore;
            renderGamesTab();
        } catch (err) {
            toast(err.message, 'error');
            el.disabled = false;
        }
    },
    'new-game': () => goCount(),
    count: el => {
        const n = Math.max(MIN_TEAMS, Math.min(MAX_TEAMS, Number(el.dataset.n)));
        S.builder = { teams: Array.from({ length: n }, () => ({ members: [] })) };
        goBuilder();
    },
    pick: el => openPicker(Number(el.dataset.team)),
    'close-sheet': () => closeSheet(),
    'pick-user': el => {
        const u = S.pickUsers.get(Number(el.dataset.id));
        if (!u) return;
        haptic('select');
        S.builder.teams[S.pickTeam].members.push({ id: u.id, name: u.name, username: u.username, photo: u.photo });
        closeSheet();
        renderBuilder();
    },
    'rm-member': el => {
        S.builder.teams[Number(el.dataset.team)].members.splice(Number(el.dataset.idx), 1);
        renderBuilder();
    },
    'start-game': async el => {
        el.disabled = true;
        try {
            const body = { teams: S.builder.teams.map(t => ({ members: t.members.map(m => (m.id ? { tgId: m.id } : { name: m.name })) })) };
            const { game } = await api('/games', { method: 'POST', body });
            haptic('success');
            openGame(game.id, game);
        } catch (err) {
            toast(err.message, 'error');
            el.disabled = false;
        }
    },
    'open-game': el => openGame(el.dataset.id),
    rematch: async el => {
        el.disabled = true;
        try {
            const { game } = await api(`/games/${el.dataset.id}/rematch`, { method: 'POST' });
            haptic('success');
            openGame(game.id, game);
        } catch (err) {
            toast(err.message, 'error');
            el.disabled = false;
        }
    },
    score: el => {
        const g = S.game;
        if (!g || !g.canEdit || g.status !== 'live') return;
        unlockAudio();                               // iPhone: musiqa uchun shu bosish kerak
        const team = Number(el.dataset.team);
        const delta = Number(el.dataset.delta);
        const r = applyScore(g.teams, team, delta);
        if (!r.changed) return;
        haptic(r.eliminated ? 'warning' : 'light');
        g.teams = g.teams.map((t, i) => ({ ...t, score: r.teams[i].score, eliminated: r.teams[i].eliminated }));
        enqueue({ type: 'score', team, delta });
        if (r.winner !== null) {
            g.status = 'finished';
            g.winner = r.winner;
            g.canEdit = false;
            showWinner({ celebrate: true });
        } else {
            renderTeams();
            updateTurnBar();               // ochko o'zgardi — oldingi «kim yuradi» eskirdi
        }
    },
    'turn-quick': () => startTurn('quick'),
    'turn-wheel': () => startTurn('wheel'),
    suit: el => {
        const g = S.game;
        if (!g || !g.canEdit || g.status !== 'live') return;
        const s = el.dataset.suit;
        el.classList.remove('flip');
        void el.offsetWidth;
        el.classList.add('flip');
        g.suit = g.suit === s ? null : s;
        haptic('select');
        updateSuitBar();
        enqueue({ type: 'suit', suit: g.suit });
    },
    'game-menu': () => {
        const g = S.game;
        if (!g) return;
        openSheet(`
            <div class="sheet-head"><b>O'yin</b><button class="sheet-x" data-action="close-sheet" aria-label="Yopish">✕</button></div>
            <div class="menu-list">
                <button class="menu-item" data-action="game-log">📜 Harakatlar tarixi</button>
                ${S.bot ? `<button class="menu-item" data-action="share-game">📤 Do'stlarga ulashish</button>` : ''}
                ${g.canCancel ? `<button class="menu-item danger" data-action="cancel-game">❌ O'yinni bekor qilish</button>` : ''}
            </div>`);
    },
    'game-log': () => {
        const g = S.game;
        const rows = (g.log || []).map(e => `<div class="log-row${e.kind === 'turn' ? ' turn' : ''}"><span class="log-time">${h(when(e.at).replace(/^Bugun, /, ''))}</span>
            <span class="log-main"><b>${h(e.byName)}</b>: ${e.kind === 'turn'
                ? `🎲 ${h(teamName(g.teams[e.team]))} yuradi <span class="log-mode">${e.mode === 'wheel' ? '🎡 baraban' : '⚡ bir bosishda'}</span>`
                : `${h(teamName(g.teams[e.team]))} <span class="${e.delta > 0 ? 'plus' : 'minus'}">${e.delta > 0 ? '+' : ''}${e.delta}</span> → ${e.score}`}</span></div>`).join('');
        openSheet(`<div class="sheet-head"><b>📜 Harakatlar tarixi</b><button class="sheet-x" data-action="close-sheet" aria-label="Yopish">✕</button></div>
            <div class="log-list">${rows || '<div class="empty-mini">Hali harakat yo\'q</div>'}</div>`);
    },
    'share-game': () => {
        const link = `https://t.me/${S.bot}?start=game_${S.game.id}`;
        closeSheet();
        openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent("🃏 Bura o'yinini kuzating!")}`);
    },
    'cancel-game': async () => {
        closeSheet();
        if (!(await confirmDialog({ title: "O'yin bekor qilinsinmi?", text: 'Natija statistikaga yozilmaydi.', ok: 'Bekor qilish' }))) return;
        try {
            const { game } = await api(`/games/${S.game.id}/cancel`, { method: 'POST' });
            reconcile(game, { force: true });
        } catch (err) {
            toast(err.message, 'error');
        }
    },
    mute: () => toggleMute(),
    replay: () => replayWinnerMusic(),
    'allow-messages': async () => {
        const ok = await requestWriteAccess();
        if (ok) {
            await api('/me/can-message', { method: 'POST' }).catch(() => {});
            S.canMessage = true;
            toast('✅ Natijalar endi Telegram\'ga keladi');
            loadTab();
        } else if (S.bot) {
            openTelegramLink(`https://t.me/${S.bot}?start=notify`);
        }
    },
    'open-bot': () => { if (S.bot) openTelegramLink(`https://t.me/${S.bot}`); },
    // admin
    'admin-tab': el => {
        stopWinnerMusic();
        S.adminTab = el.dataset.tab;
        if (S.view !== 'home' || S.tab !== 'admin') {
            S.tab = 'admin';
            return goHome();
        }
        loadAdmin();
    },
    'admin-retry': () => loadAdmin(),
    'admin-lock': async () => {
        await api('/admin/lock', { method: 'POST' }).catch(() => {});
        S.adminUnlocked = false;
        renderHead();
        renderAdminLock();
    },
    'more-users': async el => {
        el.disabled = true;
        try {
            const d = await api(`/admin/users?limit=30&kind=${S.admin.usersKind}&skip=${S.admin.users.length}&q=${encodeURIComponent(S.admin.usersQ)}`);
            S.admin.users.push(...d.items);
            document.getElementById('userList').innerHTML = usersRows(S.admin.users);
            if (S.admin.users.length >= d.total) el.remove();
            else el.disabled = false;
        } catch (err) {
            toast(err.message, 'error');
            el.disabled = false;
        }
    },
    'kozir-full': () => {
        const g = S.game;
        if (!g) return;
        openKozir({
            suit: g.suit,
            editable: g.canEdit && g.status === 'live',
            onPick: s => setGameSuit(s),
            onClose: () => setBack(() => goHome())
        });
    },
    'users-kind': el => {
        S.admin.usersKind = el.dataset.kind;
        loadAdmin();
    },
    'admin-user': el => openUserSheet(Number(el.dataset.id)),
    'user-ban-form': el => openBanForm(Number(el.dataset.id)),
    'ban-preset': el => {
        S.admin.banMinutes = Number(el.dataset.min);
        document.querySelectorAll('[data-action="ban-preset"]').forEach(b => b.classList.toggle('active', b === el));
        const num = document.getElementById('banNum');
        if (num) num.value = '';
    },
    'ban-submit': async el => {
        const id = Number(el.dataset.id);
        const num = parseInt(document.getElementById('banNum')?.value, 10);
        const unit = Number(document.getElementById('banUnit')?.value || 60);
        const minutes = num > 0 ? Math.min(525600, num * unit) : S.admin.banMinutes;
        const reason = document.getElementById('banReason')?.value.trim() || undefined;
        el.disabled = true;
        try {
            const { user } = await api(`/admin/users/${id}/ban`, { method: 'POST', body: { minutes, ...(reason ? { reason } : {}) } });
            haptic('success');
            toast(`⛔ ${user.name}: ${when(user.ban.until)} gacha bloklandi`);
            closeSheet();
            loadAdmin();
        } catch (err) {
            toast(err.message, 'error');
            el.disabled = false;
        }
    },
    'user-unban': async el => {
        el.disabled = true;
        try {
            const { user } = await api(`/admin/users/${Number(el.dataset.id)}/unban`, { method: 'POST' });
            haptic('success');
            toast(`✅ ${user.name} blokdan chiqarildi`);
            closeSheet();
            loadAdmin();
        } catch (err) {
            toast(err.message, 'error');
            el.disabled = false;
        }
    },
    'user-delete': async el => {
        const u = S.admin.byId.get(Number(el.dataset.id));
        if (!u) return;
        closeSheet();
        const ok = await confirmDialog({
            title: `${u.name} o'chirilsinmi?`,
            text: `Statistikasi (${u.stats.games} o'yin) o'chadi, o'yinlar tarixida ismi qoladi. Botga qayta kirsa — yangi user bo'lib yoziladi.`,
            ok: "O'chirish"
        });
        if (!ok) return;
        try {
            await api(`/admin/users/${u.id}`, { method: 'DELETE' });
            toast(`🗑 ${u.name} o'chirildi`);
            loadAdmin();
        } catch (err) { toast(err.message, 'error'); }
    },
    'games-filter': el => {
        S.admin.gamesStatus = el.dataset.status;
        loadAdmin();
    },
    'admin-cancel-game': async el => {
        if (!(await confirmDialog({ title: "O'yin bekor qilinsinmi?", text: 'Statistikaga yozilmaydi.', ok: 'Bekor qilish' }))) return;
        try {
            await api(`/admin/games/${el.dataset.id}/cancel`, { method: 'POST' });
            toast("O'yin bekor qilindi");
            loadAdmin();
        } catch (err) { toast(err.message, 'error'); }
    },
    'admin-delete-game': async el => {
        if (!(await confirmDialog({ title: "O'yin o'chirilsinmi?", text: "Tugagan bo'lsa, natijasi statistikadan ham ayriladi. Buni qaytarib bo'lmaydi.", ok: "O'chirish" }))) return;
        try {
            await api(`/admin/games/${el.dataset.id}`, { method: 'DELETE' });
            toast("O'yin o'chirildi");
            loadAdmin();
        } catch (err) { toast(err.message, 'error'); }
    },
    'track-active': async el => {
        try {
            const d = await api('/admin/tracks/active', { method: 'POST', body: { id: el.dataset.id } });
            const active = d.items.find(t => t.active);
            S.track = active;
            prepareTrack(active);
            haptic('success');
            toast(`✅ Faol: ${active.title}`);
            renderTracks(d);
        } catch (err) { toast(err.message, 'error'); }
    },
    'track-preview': el => {
        const t = S.admin.tracks?.find(x => x.id === el.dataset.id);
        if (!t) return;
        unlockAudio();
        prepareTrack(t);
        playWinnerMusic(t);
        toast('▶ 15 soniya tinglanadi');
        clearTimeout(S.previewTimer);
        S.previewTimer = setTimeout(() => { if (S.view === 'home') stopWinnerMusic(); }, 15000);
    },
    'track-start': async el => {
        const t = S.admin.tracks?.find(x => x.id === el.dataset.id);
        const v = await promptDialog({ title: '⏱ Boshlanish vaqti', text: "G'olib ekranida musiqa nechanchi soniyadan boshlansin? Masalan: 45 yoki 1:05", value: t?.startAt ? duration(t.startAt) : '0', inputmode: 'text', maxlength: 8 });
        if (v === null) return;
        const m = /^(?:(\d{1,3})[:.])?(\d{1,4})$/.exec(v.trim());
        if (!m || (m[1] && Number(m[2]) >= 60)) return toast("Vaqt noto'g'ri. Masalan: 45 yoki 1:05", 'error');
        const sec = m[1] ? Number(m[1]) * 60 + Number(m[2]) : Number(m[2]);
        try {
            renderTracks(await api(`/admin/tracks/${el.dataset.id}`, { method: 'PATCH', body: { startAt: sec } }));
            toast('✅ Saqlandi');
        } catch (err) { toast(err.message, 'error'); }
    },
    'track-title': async el => {
        const t = S.admin.tracks?.find(x => x.id === el.dataset.id);
        const v = await promptDialog({ title: '✏️ Musiqa nomi', value: t?.title || '', maxlength: 80 });
        if (v === null || !v.trim()) return;
        try {
            renderTracks(await api(`/admin/tracks/${el.dataset.id}`, { method: 'PATCH', body: { title: v.trim() } }));
            toast('✅ Saqlandi');
        } catch (err) { toast(err.message, 'error'); }
    },
    'track-delete': async el => {
        if (!(await confirmDialog({ title: "Musiqa o'chirilsinmi?", text: "Faol bo'lsa, standart musiqa qo'yiladi.", ok: "O'chirish" }))) return;
        try {
            const d = await api(`/admin/tracks/${el.dataset.id}`, { method: 'DELETE' });
            S.track = d.items.find(t => t.active);
            renderTracks(d);
            toast("Musiqa o'chirildi");
        } catch (err) { toast(err.message, 'error'); }
    }
};

document.addEventListener('click', e => {
    if (S.me) unlockAudio();
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const fn = ACTIONS[el.dataset.action];
    if (fn) {
        e.preventDefault();
        fn(el, e);
    }
});

document.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role="button"][data-action]')) {
        e.preventDefault();
        e.target.click();
    }
});

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !S.me || S.banned) return;
    refreshMusic();               // admin botda boshqa qo'shiqni tanlagan bo'lishi mumkin
    if (S.view === 'game') pollGame();
});

onMusicError(() => toast("Yuklangan qo'shiqni ochib bo'lmadi — standart musiqa chalindi", 'warn'));

boot();
