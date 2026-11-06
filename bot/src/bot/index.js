import { InlineKeyboard, Keyboard } from 'grammy';
import * as texts from '../texts.js';
import { parseTimeInput, formatWhen } from '../util.js';

const BTN = { stats: '📊 Statistikam', top: '🏆 Reyting', help: 'ℹ️ Yordam', admin: '🛡 Admin panel' };
const PER_PAGE = 8;
const MAX_AUDIO = 20 * 1024 * 1024;

const COMMANDS = [
    { command: 'start', description: "Boshlash va o'yinni ochish" },
    { command: 'stats', description: 'Mening statistikam' },
    { command: 'top', description: 'Reyting' },
    { command: 'help', description: 'Yordam' }
];

/** Buyruqlar, menyu tugmasi (Mini App) va webhook/polling sozlamalari. */
export async function setupTelegram(bot, config) {
    await bot.api.setMyCommands(COMMANDS);
    for (const id of config.adminIds) {
        try {
            await bot.api.setMyCommands([...COMMANDS, { command: 'admin', description: 'Admin panel (kod bilan)' }], { scope: { type: 'chat', chat_id: id } });
        } catch { /* admin hali botni ochmagan bo'lishi mumkin — /start dan keyin qayta o'rnatiladi */ }
    }
    if (/^https:\/\//.test(config.publicUrl)) {
        await bot.api.setChatMenuButton({ menu_button: { type: 'web_app', text: "O'yin", web_app: { url: `${config.publicUrl}/` } } });
    }
    const allowed = ['message', 'callback_query', 'my_chat_member'];
    if (config.publicUrl) {
        await bot.api.setWebhook(`${config.publicUrl}/tg/webhook`, { secret_token: config.webhookSecret, allowed_updates: allowed });
        return 'webhook';
    }
    bot.start({ allowed_updates: allowed }).catch(err => console.error('[bot] polling:', err.message));
    return 'polling';
}

export function attachBot(bot, { services, config, adminGuard }) {
    const { users, games, music } = services;
    const webAppUrl = /^https:\/\//.test(config.publicUrl) ? `${config.publicUrl}/` : null;

    bot.catch(err => console.error('[bot]', err.error?.description || err.error?.message || err.message));

    const isAdminId = id => adminGuard.isAdminId(id);

    function mainKeyboard(isAdmin) {
        const kb = new Keyboard().text(BTN.stats).text(BTN.top).row().text(BTN.help);
        if (isAdmin) kb.text(BTN.admin);
        return kb.resized().persistent();
    }

    function appButton(label = "🎮 O'yinni ochish", query = '') {
        return webAppUrl ? new InlineKeyboard().webApp(label, webAppUrl + query) : undefined;
    }

    async function show(ctx, { text, keyboard }, edit = false) {
        const opts = { parse_mode: 'HTML', reply_markup: keyboard, link_preview_options: { is_disabled: true } };
        if (edit && ctx.callbackQuery?.message) {
            try {
                return await ctx.editMessageText(text, opts);
            } catch (err) {
                if (/message is not modified/i.test(err.description || '')) return null;
            }
        }
        return ctx.reply(text, opts);
    }

    // Shaxsiy chatdagi har bir foydalanuvchini bazada yangilab boramiz
    bot.use(async (ctx, next) => {
        if (ctx.from && !ctx.from.is_bot && ctx.chat?.type === 'private') {
            await users.touch(ctx.from);
        }
        await next();
    });

    // ---------- Oddiy foydalanuvchi ----------
    bot.command('start', async ctx => {
        if (ctx.chat.type !== 'private') {
            return ctx.reply(`🎮 O'ynash uchun botga shaxsiy chatda yozing: @${ctx.me.username}`);
        }
        const user = await users.upsertFromTelegram(ctx.from, { started: true });
        const isAdmin = isAdminId(ctx.from.id);
        await ctx.reply(texts.welcome(user, { isAdmin }), { parse_mode: 'HTML', reply_markup: appButton() });
        await ctx.reply('Tezkor tugmalar pastda 👇', { reply_markup: mainKeyboard(isAdmin) });
        if (isAdmin) {
            bot.api.setMyCommands([...COMMANDS, { command: 'admin', description: 'Admin panel (kod bilan)' }], { scope: { type: 'chat', chat_id: ctx.from.id } }).catch(() => {});
        }
        const payload = String(ctx.match || '');
        if (/^game_[0-9a-f]{24}$/.test(payload) && webAppUrl) {
            await ctx.reply("🎮 O'yinni ko'rish:", { reply_markup: appButton("🎮 O'yinni ochish", `?game=${payload.slice(5)}`) });
        }
    });

    async function sendStats(ctx) {
        const [rows, mine, user] = await Promise.all([users.ranking(), games.forPlayer(ctx.from.id, 5), users.get(ctx.from.id)]);
        if (!user) return ctx.reply('Avval /start bosing.');
        return ctx.reply(texts.myStats(user, users.rankFrom(rows, ctx.from.id), mine.recent), { parse_mode: 'HTML', reply_markup: appButton() });
    }

    async function sendTop(ctx) {
        return ctx.reply(texts.ranking(await users.ranking()), { parse_mode: 'HTML' });
    }

    async function sendHelp(ctx) {
        return ctx.reply(texts.help({ isAdmin: isAdminId(ctx.from.id) }), { parse_mode: 'HTML', reply_markup: appButton() });
    }

    bot.command('stats', sendStats);
    bot.command('top', sendTop);
    bot.command('help', sendHelp);
    bot.hears(BTN.stats, sendStats);
    bot.hears(BTN.top, sendTop);
    bot.hears(BTN.help, sendHelp);

    bot.command('cancel', async ctx => {
        await users.setPending(ctx.from.id, null);
        return ctx.reply('Bekor qilindi.', { reply_markup: mainKeyboard(isAdminId(ctx.from.id)) });
    });

    // Botni bloklash / qayta ochish — xabar yuborish mumkinligini kuzatamiz
    bot.on('my_chat_member', async ctx => {
        if (ctx.chat.type !== 'private') return;
        const status = ctx.myChatMember.new_chat_member.status;
        if (status === 'kicked') await users.setCanMessage(ctx.from.id, false);
        else if (status === 'member') await users.setCanMessage(ctx.from.id, true);
    });

    // ---------- Admin: kod ----------
    async function unlockedUser(tgId) {
        const u = await users.get(tgId);
        return adminGuard.isUnlocked(u) ? u : null;
    }

    async function askCode(ctx) {
        await users.setPending(ctx.from.id, { type: 'code' });
        return ctx.reply(
            "🔐 <b>Admin panel</b>\nKirish uchun admin kodini yuboring.\n<i>Kod yozilgan xabar darhol o'chiriladi. Bekor qilish: /cancel</i>",
            { parse_mode: 'HTML', reply_markup: { force_reply: true, input_field_placeholder: 'Admin kodi' } }
        );
    }

    async function openAdmin(ctx) {
        if (ctx.chat.type !== 'private') return ctx.reply('🛡 Admin panel faqat shaxsiy chatda ochiladi.');
        if (!isAdminId(ctx.from.id)) return ctx.reply("⛔ Bu bo'lim faqat admin uchun.");
        const u = await unlockedUser(ctx.from.id);
        if (!u) return askCode(ctx);
        return show(ctx, await menuView(u));
    }

    bot.command('admin', openAdmin);
    bot.hears(BTN.admin, openAdmin);

    async function handleCode(ctx) {
        const input = ctx.message.text;
        try { await ctx.deleteMessage(); } catch { /* eski xabar bo'lsa o'chmaydi — muhim emas */ }
        if (!isAdminId(ctx.from.id)) {
            await users.setPending(ctx.from.id, null);
            return null;
        }
        const r = adminGuard.checkCode(ctx.from.id, input);
        if (r.ok) {
            await users.setAdminUntil(ctx.from.id, adminGuard.sessionUntil());
            await users.setPending(ctx.from.id, null);
            await ctx.reply("✅ Kod to'g'ri — admin panel ochildi. Mini App'dagi admin bo'limi ham ochiq.", { reply_markup: mainKeyboard(true) });
            return show(ctx, await menuView(await users.get(ctx.from.id)));
        }
        if (r.locked) {
            await users.setPending(ctx.from.id, null);
            return ctx.reply(`⛔ Juda ko'p noto'g'ri urinish. ${Math.ceil(r.retryAfterSec / 60)} daqiqadan keyin qayta urinib ko'ring.`, { reply_markup: mainKeyboard(true) });
        }
        return ctx.reply(`❌ Kod noto'g'ri. Qolgan urinishlar: ${r.remaining}. Qayta yuboring yoki /cancel.`,
            { reply_markup: { force_reply: true, input_field_placeholder: 'Admin kodi' } });
    }

    // ---------- Admin: ko'rinishlar ----------
    async function menuView(u) {
        const [uc, gc, track] = await Promise.all([users.counts(), games.counts(), music.publicActive()]);
        return {
            text: texts.adminMenu({ users: uc, games: gc, track, until: u.adminUntil }),
            keyboard: new InlineKeyboard()
                .text('🎵 Musiqalar', 'a:music').text('📊 Statistika', 'a:stats').row()
                .text('👥 Foydalanuvchilar', 'a:users:0').text("🎮 O'yinlar", 'a:games').row()
                .text('🔒 Admin rejimini yopish', 'a:lock')
        };
    }

    async function statsView() {
        const [uc, gc, rows] = await Promise.all([users.counts(), games.counts(), users.ranking()]);
        return { text: texts.adminStats({ users: uc, games: gc, top: rows }), keyboard: new InlineKeyboard().text('⬅️ Menyu', 'a:menu') };
    }

    async function usersView(pageNo) {
        const { items, total } = await users.list({ skip: pageNo * PER_PAGE, limit: PER_PAGE });
        const pages = Math.max(1, Math.ceil(total / PER_PAGE));
        const kb = new InlineKeyboard();
        items.forEach((u, i) => {
            kb.text(String(pageNo * PER_PAGE + i + 1), `a:user:${u.tgId}:${pageNo}`);
            if ((i + 1) % 4 === 0) kb.row();
        });
        kb.row();
        if (pageNo > 0) kb.text('◀️ Oldingi', `a:users:${pageNo - 1}`);
        if (pageNo < pages - 1) kb.text('Keyingi ▶️', `a:users:${pageNo + 1}`);
        kb.row().text('⬅️ Menyu', 'a:menu');
        return { text: texts.usersPage(items, { page: pageNo, pages, total, perPage: PER_PAGE }), keyboard: kb };
    }

    async function userView(tgId, backPage) {
        const [u, rows] = await Promise.all([users.get(tgId), users.ranking()]);
        if (!u) return { text: 'Foydalanuvchi topilmadi.', keyboard: new InlineKeyboard().text("⬅️ Ro'yxat", `a:users:${backPage}`) };
        return { text: texts.userCard(u, users.rankFrom(rows, tgId)), keyboard: new InlineKeyboard().text("⬅️ Ro'yxat", `a:users:${backPage}`) };
    }

    async function gamesView() {
        const { items } = await games.list({ limit: PER_PAGE });
        const kb = new InlineKeyboard();
        items.forEach((g, i) => {
            kb.text(String(i + 1), `a:game:${g._id}`);
            if ((i + 1) % 4 === 0) kb.row();
        });
        kb.row().text('⬅️ Menyu', 'a:menu');
        return { text: texts.gamesPage(items), keyboard: kb };
    }

    async function gameView(id) {
        let g;
        try { g = await games.get(id); } catch { return { text: "O'yin topilmadi (o'chirilgan bo'lishi mumkin).", keyboard: new InlineKeyboard().text("⬅️ Ro'yxat", 'a:games') }; }
        const kb = new InlineKeyboard();
        if (g.status === 'live') kb.text('❌ Bekor qilish', `a:gcancel:${g._id}`);
        else kb.text("🗑 O'chirish", `a:gdel:${g._id}`);
        if (webAppUrl) kb.webApp('🎮 Ochish', `${webAppUrl}?game=${g._id}`);
        kb.row().text("⬅️ Ro'yxat", 'a:games');
        return { text: texts.gameCard(g), keyboard: kb };
    }

    function confirmView(text, yes, no) {
        return { text, keyboard: new InlineKeyboard().text('✅ Ha', yes).text("↩️ Yo'q", no) };
    }

    async function musicView() {
        const { items, activeId } = await music.publicList();
        const kb = new InlineKeyboard();
        items.forEach((t, i) => {
            kb.text(`${t.active ? '✅ ' : ''}${i + 1}`, `a:track:${t.id}`);
            if ((i + 1) % 5 === 0) kb.row();
        });
        kb.row().text('⬅️ Menyu', 'a:menu');
        return { text: texts.musicList(items, activeId), keyboard: kb };
    }

    async function trackView(id) {
        const { items } = await music.publicList();
        const t = items.find(x => x.id === id);
        if (!t) return { text: 'Musiqa topilmadi.', keyboard: new InlineKeyboard().text("⬅️ Ro'yxat", 'a:music') };
        const kb = new InlineKeyboard();
        if (!t.active) kb.text('✅ Faol qilish', `a:tact:${t.id}`);
        if (t.type === 'file') {
            kb.text('▶️ Tinglash', `a:tplay:${t.id}`).row()
                .text('⏱ Boshlanish vaqti', `a:tstart:${t.id}`).text('✏️ Nomi', `a:ttitle:${t.id}`).row()
                .text("🗑 O'chirish", `a:tdel:${t.id}`);
        }
        kb.row().text("⬅️ Ro'yxat", 'a:music');
        return { text: texts.trackCard(t), keyboard: kb };
    }

    async function playTrack(ctx, id) {
        const t = await music.get(id);
        const caption = `🎵 ${t.title}${t.startAt ? ` · Mini App'da ${Math.floor(t.startAt / 60)}:${String(t.startAt % 60).padStart(2, '0')} dan boshlanadi` : ''}`;
        if (t.kind === 'voice') return ctx.replyWithVoice(t.fileId, { caption });
        if (t.kind === 'document') return ctx.replyWithDocument(t.fileId, { caption });
        return ctx.replyWithAudio(t.fileId, { caption });
    }

    // ---------- Admin: tugmalar ----------
    bot.callbackQuery(/^a:/, async ctx => {
        let answered = false;
        const answer = async (opts) => {
            if (answered) return;
            answered = true;
            await ctx.answerCallbackQuery(opts).catch(() => {});
        };
        if (!isAdminId(ctx.from.id)) return answer({ text: '⛔ Faqat admin uchun', show_alert: true });
        const u = await unlockedUser(ctx.from.id);
        if (!u) {
            await answer({ text: '🔐 Admin rejimi yopiq — kodni qayta kiriting', show_alert: true });
            return askCode(ctx);
        }
        const [, action, a1, a2] = ctx.callbackQuery.data.split(':');
        try {
            switch (action) {
                case 'menu': await show(ctx, await menuView(u), true); break;
                case 'lock':
                    await users.setAdminUntil(ctx.from.id, null);
                    await show(ctx, { text: '🔒 Admin rejimi yopildi. Qayta kirish: /admin', keyboard: undefined }, true);
                    break;
                case 'stats': await show(ctx, await statsView(), true); break;
                case 'users': await show(ctx, await usersView(Math.max(0, parseInt(a1, 10) || 0)), true); break;
                case 'user': await show(ctx, await userView(Number(a1), Number(a2) || 0), true); break;
                case 'games': await show(ctx, await gamesView(), true); break;
                case 'game': await show(ctx, await gameView(a1), true); break;
                case 'gcancel':
                    await show(ctx, confirmView("❌ Bu o'yin bekor qilinsinmi? Statistikaga yozilmaydi.", `a:gcancelok:${a1}`, `a:game:${a1}`), true);
                    break;
                case 'gcancelok':
                    await games.cancel({ id: a1, actor: u, adminUnlocked: true });
                    await answer({ text: "O'yin bekor qilindi" });
                    await show(ctx, await gameView(a1), true);
                    break;
                case 'gdel':
                    await show(ctx, confirmView("🗑 O'yin butunlay o'chirilsinmi? Tugagan bo'lsa, natijasi statistikadan ham ayriladi.", `a:gdelok:${a1}`, `a:game:${a1}`), true);
                    break;
                case 'gdelok':
                    await games.remove(a1);
                    await answer({ text: "O'yin o'chirildi" });
                    await show(ctx, await gamesView(), true);
                    break;
                case 'music': await show(ctx, await musicView(), true); break;
                case 'track': await show(ctx, await trackView(a1), true); break;
                case 'tact':
                    await music.setActive(a1);
                    await answer({ text: '✅ Faol musiqa o\'zgardi' });
                    await show(ctx, await trackView(a1), true);
                    break;
                case 'tplay':
                    await answer({ text: '▶️ Yuborilmoqda...' });
                    await playTrack(ctx, a1);
                    break;
                case 'tstart':
                    await music.get(a1);
                    await users.setPending(ctx.from.id, { type: 'trackStart', id: a1 });
                    await answer();
                    await ctx.reply("⏱ G'olib ekranida musiqa nechanchi soniyadan boshlansin?\nMasalan: <code>45</code> yoki <code>1:05</code>. Boshidan: <code>0</code>. Bekor qilish: /cancel",
                        { parse_mode: 'HTML', reply_markup: { force_reply: true, input_field_placeholder: '0:45' } });
                    break;
                case 'ttitle':
                    await music.get(a1);
                    await users.setPending(ctx.from.id, { type: 'trackTitle', id: a1 });
                    await answer();
                    await ctx.reply("✏️ Musiqaning yangi nomini yuboring. Bekor qilish: /cancel",
                        { reply_markup: { force_reply: true, input_field_placeholder: 'Musiqa nomi' } });
                    break;
                case 'tdel':
                    await show(ctx, confirmView("🗑 Bu musiqa o'chirilsinmi?", `a:tdelok:${a1}`, `a:track:${a1}`), true);
                    break;
                case 'tdelok':
                    await music.remove(a1);
                    await answer({ text: "Musiqa o'chirildi" });
                    await show(ctx, await musicView(), true);
                    break;
                default:
                    break;
            }
        } catch (err) {
            await answer({ text: `⚠️ ${err.message || 'Xatolik'}`, show_alert: true });
            return;
        }
        await answer();
    });

    // ---------- Admin: musiqa qo'shish (Mini App'siz, to'g'ridan-to'g'ri botga) ----------
    bot.on(['message:audio', 'message:voice', 'message:document'], async ctx => {
        if (ctx.chat.type !== 'private') return;
        const m = ctx.message;
        const isAudioDoc = m.document && /^audio\//.test(m.document.mime_type || '');
        const file = m.audio || m.voice || (isAudioDoc ? m.document : null);
        if (!isAdminId(ctx.from.id)) {
            if (file) await ctx.reply("🎵 Musiqa qo'shish faqat admin uchun.");
            return;
        }
        if (!file) {
            await ctx.reply('🎵 Faqat audio fayllar qabul qilinadi (MP3, M4A, OGG).');
            return;
        }
        if (!(await unlockedUser(ctx.from.id))) {
            await ctx.reply("🔐 Musiqa qo'shish uchun avval admin kodini kiriting, keyin faylni qayta yuboring.");
            await askCode(ctx);
            return;
        }
        if (file.file_size && file.file_size > MAX_AUDIO) {
            await ctx.reply('⚠️ Fayl 20 MB dan katta. Telegram botlari faqat 20 MB gacha faylni yuklab bera oladi — kichikroq (masalan, 128 kbps MP3) fayl yuboring.');
            return;
        }
        const kind = m.audio ? 'audio' : m.voice ? 'voice' : 'document';
        const fileName = (m.audio?.file_name || m.document?.file_name || '').replace(/\.[^.]+$/, '');
        const title = m.audio?.title || fileName || `Ovozli xabar, ${formatWhen(new Date())}`;
        const { track, duplicate } = await music.add({
            fileId: file.file_id,
            fileUniqueId: file.file_unique_id,
            kind,
            title,
            performer: m.audio?.performer || '',
            duration: file.duration || 0,
            mime: file.mime_type || (kind === 'voice' ? 'audio/ogg' : 'audio/mpeg'),
            size: file.file_size || 0,
            addedBy: ctx.from.id
        });
        await ctx.reply(duplicate ? "ℹ️ Bu musiqa ro'yxatda allaqachon bor." : "✅ Musiqa qo'shildi! «Faol qilish» tugmasi bilan g'olib musiqasiga aylantiring.");
        await show(ctx, await trackView(String(track._id)));
    });

    // ---------- Matnli javoblar (kod, vaqt, nom) ----------
    bot.on('message:text', async ctx => {
        if (ctx.chat.type !== 'private') return;
        const u = await users.get(ctx.from.id);
        const p = u?.pending;
        if (p && new Date(p.until) > new Date()) {
            if (p.type === 'code') return handleCode(ctx);
            if (p.type === 'trackStart' || p.type === 'trackTitle') {
                if (!adminGuard.isUnlocked(u)) {
                    await users.setPending(ctx.from.id, null);
                    return askCode(ctx);
                }
                try {
                    if (p.type === 'trackStart') {
                        const sec = parseTimeInput(ctx.message.text);
                        if (sec === null) {
                            return ctx.reply("⏱ Vaqtni soniyada (masalan, 45) yoki daqiqa:soniya (1:05) ko'rinishida yuboring. Bekor qilish: /cancel");
                        }
                        await music.update(p.id, { startAt: sec });
                    } else {
                        await music.update(p.id, { title: ctx.message.text });
                    }
                } catch (err) {
                    return ctx.reply(`⚠️ ${err.message}`);
                }
                await users.setPending(ctx.from.id, null);
                await ctx.reply('✅ Saqlandi.', { reply_markup: mainKeyboard(true) });
                return show(ctx, await trackView(p.id));
            }
        }
        return ctx.reply("Tugmalardan foydalaning yoki /help ni bosing.", { reply_markup: appButton() });
    });
}
