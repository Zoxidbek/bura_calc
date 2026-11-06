import * as texts from '../texts.js';

/** O'yin tugaganda botni ishga tushirgan ishtirokchilarga natija va statistika yuboradi. */
export function createNotifier({ users, config, telegram }) {
    function viewButton(game) {
        if (!/^https:\/\//.test(config.publicUrl)) return undefined;
        return { inline_keyboard: [[{ text: "🎮 O'yinni ko'rish", web_app: { url: `${config.publicUrl}/?game=${game._id}` } }]] };
    }

    async function sendResults(game) {
        if (game.status !== 'finished' || game.winner === null || game.winner === undefined) return { sent: 0 };
        const ids = [...new Set(game.players || [])];
        if (!ids.length) return { sent: 0 };
        const recipients = [...(await users.getMany(ids)).values()].filter(u => u.canMessage);
        if (!recipients.length) return { sent: 0 };
        const rows = await users.ranking();
        const winners = new Set(game.teams[game.winner].members.map(m => m.tgId).filter(Boolean));
        let sent = 0;
        for (const u of recipients) {
            const text = texts.result({ game, user: u, won: winners.has(u.tgId), rank: users.rankFrom(rows, u.tgId) });
            try {
                await telegram.sendMessage(u.tgId, text, {
                    parse_mode: 'HTML',
                    reply_markup: viewButton(game),
                    link_preview_options: { is_disabled: true }
                });
                sent++;
            } catch (err) {
                if (err?.error_code === 403) await users.setCanMessage(u.tgId, false);   // botni bloklagan
                else console.error('[notify]', u.tgId, err?.description || err?.message);
            }
        }
        return { sent };
    }

    return { sendResults };
}
