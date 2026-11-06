// Bura o'yini qoidalari — asl kalkulyatordagi bilan aynan bir xil.
// Bu faylni server ham, Mini App ham ishlatadi (yagona manba).

export const STEP = 2;          // "+" / "−" har bosishda ±2 ochko
export const LIMIT = 12;        // 12 ga yetgan komanda o'yindan chiqadi
export const MIN_TEAMS = 2;
export const MAX_TEAMS = 6;
export const SUITS = ['clubs', 'hearts', 'spades', 'diamonds'];

/**
 * Bitta komandaning ochkosini o'zgartiradi (asl updateScore bilan bir xil):
 *  - chiqib ketgan komandaga hech narsa qilinmaydi;
 *  - ochko manfiy bo'lib qolsa, o'zgarish qilinmaydi;
 *  - 12 ga yetgan komanda chiqadi;
 *  - faqat bitta komanda qolsa — u g'olib.
 * Kiruvchi massivni o'zgartirmaydi, yangi holat qaytaradi.
 */
export function applyScore(teams, index, points) {
    const team = teams[index];
    if (!team || team.eliminated) {
        return { changed: false, teams, eliminated: false, winner: findWinner(teams) };
    }
    const newScore = team.score + points;
    if (newScore < 0) {
        return { changed: false, teams, eliminated: false, winner: findWinner(teams) };
    }
    const next = teams.map(t => ({ ...t }));
    next[index].score = newScore;
    let eliminated = false;
    if (next[index].score >= LIMIT && !next[index].eliminated) {
        next[index].eliminated = true;
        eliminated = true;
    }
    return { changed: true, teams: next, eliminated, winner: findWinner(next) };
}

/** Faqat bitta komanda qolgan bo'lsa, uning indeksini qaytaradi, aks holda null. */
export function findWinner(teams) {
    let found = null;
    for (let i = 0; i < teams.length; i++) {
        if (!teams[i].eliminated) {
            if (found !== null) return null;
            found = i;
        }
    }
    return found;
}
