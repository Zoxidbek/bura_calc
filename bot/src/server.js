import { Bot } from 'grammy';
import { createAdminGuard } from './auth.js';
import { createServices } from './services/index.js';
import { attachBot, setupTelegram } from './bot/index.js';
import { createApp } from './app.js';

/**
 * Bot + API + Mini App'ni bitta HTTP serverda ishga tushiradi.
 * Render'da: webhook rejimi (PUBLIC_URL/RENDER_EXTERNAL_URL bor).
 * Mahalliy: PUBLIC_URL bo'lmasa — long polling.
 */
export async function startServer({ config, db, setupBot = true }) {
    const bot = new Bot(config.botToken, { client: { apiRoot: config.telegramApiRoot } });
    const telegram = {
        getFile: fileId => bot.api.getFile(fileId),
        fileUrl: filePath => `${config.telegramApiRoot}/file/bot${config.botToken}/${filePath}`,
        sendMessage: (chatId, text, other) => bot.api.sendMessage(chatId, text, other)
    };
    const services = createServices({ db, config, telegram });
    const adminGuard = createAdminGuard(config);
    attachBot(bot, { services, config, adminGuard });

    const app = createApp({ config, services, adminGuard, bot });
    const server = await new Promise(resolve => {
        const s = app.listen(config.port, () => resolve(s));
    });

    let mode = 'off';
    if (setupBot) {
        await bot.init();
        mode = await setupTelegram(bot, config);
    }
    console.log(`[bura] ${server.address().port}-portda ishlayapti · bot: @${bot.isInited() ? bot.botInfo.username : '?'} · rejim: ${mode}`);

    async function stop() {
        if (mode === 'polling') await bot.stop();
        await new Promise(resolve => server.close(resolve));
    }
    return { app, server, bot, services, adminGuard, stop };
}
