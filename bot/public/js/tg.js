// Telegram Mini App (WebApp) API ustidagi yupqa qatlam: eski mijozlarda ham xato bermaydi.

export const tg = window.Telegram?.WebApp || null;
export const initData = tg?.initData || '';
const version = parseFloat(tg?.version || '0');

const supports = v => version >= v;

export function setupTelegram() {
    if (!tg) return;
    try {
        tg.ready();
        tg.expand();
        if (supports(6.1)) {
            tg.setHeaderColor('#0b3426');
            tg.setBackgroundColor('#0b3426');
        }
        if (supports(7.1) && tg.setBottomBarColor) tg.setBottomBarColor('#0b3426');
        if (supports(7.7) && tg.disableVerticalSwipes) tg.disableVerticalSwipes();
    } catch { /* eski Telegram */ }
}

export function startParam() {
    return tg?.initDataUnsafe?.start_param || null;
}

export function haptic(kind = 'light') {
    const hf = tg?.HapticFeedback;
    if (!hf || !supports(6.1)) return;
    try {
        if (kind === 'success' || kind === 'warning' || kind === 'error') hf.notificationOccurred(kind);
        else if (kind === 'select') hf.selectionChanged();
        else hf.impactOccurred(kind);
    } catch { /* yo'q bo'lsa — muhim emas */ }
}

let backHandler = null;
export function setBack(handler) {
    if (!tg?.BackButton || !supports(6.1)) return;
    if (backHandler) tg.BackButton.offClick(backHandler);
    backHandler = handler || null;
    if (handler) {
        tg.BackButton.onClick(handler);
        tg.BackButton.show();
    } else {
        tg.BackButton.hide();
    }
}

export function setClosingConfirmation(on) {
    if (!tg || !supports(6.2)) return;
    try {
        if (on) tg.enableClosingConfirmation();
        else tg.disableClosingConfirmation();
    } catch { /* yo'q */ }
}

export function openTelegramLink(url) {
    if (tg?.openTelegramLink) tg.openTelegramLink(url);
    else window.open(url, '_blank');
}

/** Botga xabar yozishga ruxsat so'raydi (natijalar shu chatga kelishi uchun). */
export function requestWriteAccess() {
    return new Promise(resolve => {
        if (!tg?.requestWriteAccess || !supports(6.9)) return resolve(false);
        try {
            tg.requestWriteAccess(ok => resolve(!!ok));
        } catch {
            resolve(false);
        }
    });
}
