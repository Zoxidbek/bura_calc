// Bot xabarlari matnlari (Telegram HTML rejimi)
import { escapeHtml as h, formatWhen, percent, teamLabel, formatDuration, minutesBetween } from './util.js';

const MEDALS = ['🥇', '🥈', '🥉'];

function nameOf(u) {
    const full = `${u.firstName || ''} ${u.lastName || ''}`.trim();
    return full || (u.username ? '@' + u.username : String(u.tgId));
}

export function rankLine(r) {
    return r && r.rank ? `${r.rank}-o'rin (${r.total} o'yinchidan)` : "hali reytingda yo'q";
}

export function statsBlock(user, rank) {
    const s = user.stats || { games: 0, wins: 0, losses: 0 };
    return [
        `🎮 O'yinlar: <b>${s.games}</b>`,
        `🏆 G'alabalar: <b>${s.wins}</b> (${percent(s.wins, s.games)}%)`,
        `😔 Mag'lubiyatlar: <b>${s.losses}</b>`,
        `📈 Reytingda: <b>${rankLine(rank)}</b>`
    ].join('\n');
}

export function gameLine(game) {
    return game.teams.map((t, i) => {
        const label = h(teamLabel(t));
        return i === game.winner ? `<b>${label}</b> 🏆` : `${label} (${t.score})`;
    }).join(' · ');
}

export function welcome(user, { isAdmin }) {
    return [
        `Assalomu alaykum, <b>${h(user.firstName || "do'st")}</b>! 👋`,
        '',
        "<b>Bura hisoblagichi</b> — o'yinni shu yerda ochasiz, ochkolar hisoblab boriladi, hamma o'yinlar esa barchaga ko'rinadi.",
        '',
        "🎮 O'yin ochish — <b>«O'yinni ochish»</b> tugmasi",
        "📊 Har o'yin tugagach natijangiz va statistikangiz shu chatga keladi",
        '🏆 Reyting — /top, statistikangiz — /stats',
        ...(isAdmin ? ['', '🛡 Siz adminsiz: /admin (kod bilan)'] : [])
    ].join('\n');
}

export function help({ isAdmin }) {
    return [
        '<b>Yordam</b>',
        '',
        "🎮 <b>O'yin</b> — «O'yinni ochish» tugmasi yoki chap pastdagi menyu tugmasi Mini App'ni ochadi. U yerda yangi o'yin ochib, Telegram foydalanuvchilarini komandalarga tanlaysiz.",
        '➕/➖ Har bosishda ±2 ochko. 12 ga yetgan komanda chiqadi, oxirgi qolgan — chempion.',
        '📊 /stats — statistikangiz',
        '🏆 /top — reyting',
        ...(isAdmin ? ['', "🛡 /admin — admin panel (kod bilan). Musiqa qo'shish: kodni kiritgach, shu chatga audio fayl yuboring."] : [])
    ].join('\n');
}

export function myStats(user, rank, recent) {
    const lines = ['📊 <b>Sizning statistikangiz</b>', '', statsBlock(user, rank)];
    if (recent.length) {
        lines.push('', "<b>So'nggi o'yinlar:</b>");
        for (const g of recent.slice(0, 5)) {
            const won = g.teams[g.winner]?.members.some(m => m.tgId === user.tgId);
            lines.push(`${won ? '🏆' : '▫️'} ${h(formatWhen(g.finishedAt))} — ${gameLine(g)}`);
        }
    } else {
        lines.push('', "Hali tugagan o'yinlaringiz yo'q — Mini App'da o'yin oching!");
    }
    return lines.join('\n');
}

export function ranking(rows, limit = 10) {
    if (!rows.length) return "🏆 <b>Reyting</b>\n\nHali tugagan o'yinlar yo'q.";
    const lines = ["🏆 <b>Reyting</b> — chempionliklar bo'yicha", ''];
    for (const { user: u, rank } of rows.slice(0, limit)) {
        const s = u.stats;
        lines.push(`${MEDALS[rank - 1] || `${rank}.`} ${h(nameOf(u))} — <b>${s.wins}</b> g'alaba · ${s.games} o'yin · ${percent(s.wins, s.games)}%`);
    }
    return lines.join('\n');
}

export function result({ game, user, won, rank }) {
    const champion = teamLabel(game.teams[game.winner]);
    const head = won
        ? "🏆 <b>G'alaba! Siz chempionsiz!</b>"
        : `😔 <b>Bu safar omad kulib boqmadi.</b>\nChempion: <b>${h(champion)}</b>`;
    return [
        head,
        '',
        `🃏 ${gameLine(game)}`,
        `⏱ ${minutesBetween(game.createdAt, game.finishedAt)} daqiqa · ${h(formatWhen(game.finishedAt))}`,
        '',
        '📊 <b>Statistikangiz:</b>',
        statsBlock(user, rank)
    ].join('\n');
}

export function adminMenu({ users, games, track, until }) {
    return [
        '🛡 <b>Admin panel</b>',
        `🔓 Ochiq: ${h(formatWhen(until))} gacha`,
        '',
        `👥 Foydalanuvchilar: <b>${users.total}</b> (botni ishga tushirgan: ${users.messageable})`,
        `🎮 O'yinlar: <b>${games.total}</b> (jonli: ${games.live}, tugagan: ${games.finished})`,
        `🎵 G'olib musiqasi: <b>${h(track.title)}</b>`
    ].join('\n');
}

export function adminStats({ users, games, top }) {
    const lines = [
        '📊 <b>Umumiy statistika</b>',
        '',
        `👥 Foydalanuvchilar: <b>${users.total}</b>`,
        `🔔 Botni ishga tushirgan: <b>${users.messageable}</b>`,
        `🟢 So'nggi 24 soatda faol: <b>${users.activeDay}</b>`,
        `🃏 Kamida 1 marta o'ynagan: <b>${users.players}</b>`,
        '',
        `🎮 Jami o'yinlar: <b>${games.total}</b>`,
        `🔴 Jonli: <b>${games.live}</b> · 🏁 Tugagan: <b>${games.finished}</b> · ❌ Bekor: <b>${games.cancelled}</b>`,
        `📅 So'nggi 24 soatda ochilgan: <b>${games.today}</b>`
    ];
    if (top.length) {
        lines.push('', '<b>Top-5:</b>');
        for (const { user: u, rank } of top.slice(0, 5)) {
            lines.push(`${MEDALS[rank - 1] || `${rank}.`} ${h(nameOf(u))} — ${u.stats.wins} g'alaba / ${u.stats.games} o'yin`);
        }
    }
    return lines.join('\n');
}

export function userCard(u, rank) {
    return [
        `👤 <b>${h(nameOf(u))}</b>${u.username ? ` (@${h(u.username)})` : ''}`,
        `🆔 <code>${u.tgId}</code>`,
        u.canMessage ? '🔔 Botni ishga tushirgan — natijalar unga boradi' : '🔕 Botni ishga tushirmagan — xabar bormaydi',
        '',
        statsBlock(u, rank),
        '',
        `🕒 Oxirgi faollik: ${h(formatWhen(u.lastSeenAt))}`,
        `📅 Ro'yxatdan o'tgan: ${h(formatWhen(u.createdAt))}`
    ].join('\n');
}

export function usersPage(items, { page, pages, total, perPage }) {
    const lines = [`👥 <b>Foydalanuvchilar</b> — ${total} ta · ${page + 1}/${Math.max(1, pages)}-sahifa`, ''];
    items.forEach((u, i) => {
        const s = u.stats || {};
        lines.push(`${page * perPage + i + 1}. ${h(nameOf(u))}${u.username ? ` @${h(u.username)}` : ''} — 🎮${s.games || 0} 🏆${s.wins || 0} ${u.canMessage ? '🔔' : '🔕'}`);
    });
    if (!items.length) lines.push("Hali foydalanuvchilar yo'q.");
    return lines.join('\n');
}

export const STATUS = { live: '🔴 Jonli', finished: '🏁 Tugagan', cancelled: '❌ Bekor qilingan' };

export function gamesPage(items) {
    const lines = ["🎮 <b>So'nggi o'yinlar</b>", ''];
    items.forEach((g, i) => {
        lines.push(`${i + 1}. ${STATUS[g.status]} · ${h(formatWhen(g.createdAt))}\n    ${gameLine(g)}`);
    });
    if (!items.length) lines.push("Hali o'yinlar yo'q.");
    return lines.join('\n');
}

export function gameCard(g) {
    return [
        `🎮 <b>O'yin</b> · ${STATUS[g.status]}`,
        `👤 Ochgan: ${h(g.createdBy?.name || '')}`,
        `🕒 ${h(formatWhen(g.createdAt))}${g.finishedAt ? ` → ${h(formatWhen(g.finishedAt))}` : ''}`,
        '',
        ...g.teams.map((t, i) => `${i === g.winner ? '🏆' : t.eliminated ? '▫️' : '▪️'} ${h(teamLabel(t))} — <b>${t.score}</b>`)
    ].join('\n');
}

export function musicList(items, activeId) {
    const lines = ["🎵 <b>G'olib musiqalari</b>", "G'olib chiqqanda Mini App'da chalinadi. Boshqarish uchun raqamni bosing.", ''];
    items.forEach((t, i) => {
        const on = t.id === activeId;
        const meta = t.type === 'builtin'
            ? 'standart, internetsiz'
            : [t.performer, formatDuration(t.duration), t.startAt ? `${formatDuration(t.startAt)} dan` : ''].filter(Boolean).join(' · ');
        lines.push(`${on ? '✅' : '▫️'} ${i + 1}. <b>${h(t.title)}</b>${meta ? ` — ${h(meta)}` : ''}`);
    });
    lines.push('', "➕ <b>Yangi qo'shish:</b> shu chatga audio fayl yuboring (20 MB gacha, MP3 tavsiya) — bot qaysi soniyadan boshlanishini so'raydi.");
    return lines.join('\n');
}

export function trackCard(t) {
    if (t.type === 'builtin') {
        return [
            `🎺 <b>${h(t.title)}</b>`,
            `👤 ${h(t.performer)}`,
            "⏱ ~1:12 · brauzerning o'zida yaratiladi (fayl va internet kerak emas)",
            '',
            t.active ? '✅ <b>Hozir faol</b>' : '▫️ Faol emas'
        ].join('\n');
    }
    return [
        `🎵 <b>${h(t.title)}</b>`,
        t.performer ? `👤 ${h(t.performer)}` : null,
        `⏱ ${formatDuration(t.duration)} · ▶️ ${t.startAt ? `${formatDuration(t.startAt)} dan boshlanadi` : 'boshidan chalinadi'}`,
        t.kind === 'voice' ? "⚠️ Ovozli xabar (OGG): ba'zi iPhone'larda chalinmasligi mumkin — MP3 yaxshiroq." : null,
        '',
        t.active ? '✅ <b>Hozir faol</b>' : '▫️ Faol emas'
    ].filter(v => v !== null).join('\n');
}
