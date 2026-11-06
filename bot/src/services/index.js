import { createUserService } from './users.js';
import { createGameService } from './games.js';
import { createMusicService } from './music.js';
import { createNotifier } from './notify.js';

/**
 * Barcha servislarni yig'adi.
 * telegram: { getFile, fileUrl, sendMessage } — bot API ustidagi yupqa qatlam.
 */
export function createServices({ db, config, telegram }) {
    const users = createUserService({ db });
    const games = createGameService({ db, users });
    const music = createMusicService({ db, telegram });
    const notifier = createNotifier({ users, config, telegram });
    games.hooks.onGameFinished = game => notifier.sendResults(game);
    return { db, users, games, music, notifier };
}
