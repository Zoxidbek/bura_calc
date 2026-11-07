# Bura hisoblagichi — Telegram bot + Mini App

Bura o'yini hisoblagichi Telegram'ga ko'chirilgan: o'yin Mini App'da ochiladi, o'yinchilar
Telegram foydalanuvchilaridan tanlanadi, hamma o'yinlar barchaga jonli ko'rinadi, natijalar
esa har bir o'yinchiga bot orqali keladi. O'yin qoidalari asl kalkulyator bilan bir xil:
±2 ochko, manfiy bo'lmaydi, 12 ga yetgan komanda chiqadi, oxirgi qolgani — chempion.

## Imkoniyatlar

**Hamma uchun (Mini App):**
- Yangi o'yin: 2–6 komanda, har komandaga Telegram o'yinchi(lar)i yoki mehmon (Telegram'siz).
- Hisob ekrani, kozir kartalari, g'olib ekrani (bayram effektlari + musiqa, ↻ qayta qo'yish).
- **Jonli o'yinlar** hammaga ko'rinadi; boshqa telefonlarda 2–3 soniyada yangilanadi.
  Ochkoni o'yinni ochgan odam va ishtirokchilar o'zgartiradi, qolganlar kuzatadi.
- Tugagan o'yinlar tarixi, «Shu o'yinchilar bilan qayta» tugmasi, harakatlar tarixi.
- **Kozir butun ekranda:** o'yin paytida «⛶ Butun ekranda» — kozir kartasi butun ekranni egallaydi
  (telefonni stol o'rtasiga qo'yish uchun). Hajmi: slayder, −/+ yoki ikki barmoq bilan; ikki marta
  bosish — 100% ↔ oldingi hajm; bir marta bosish — tugmalar yashiriladi. Ishtirokchi kozirni shu
  yerning o'zidan almashtira oladi; tanlangan hajm eslab qolinadi; ekran o'chib qolmaydi.
- Reyting (chempionliklar → g'alaba foizi → o'yinlar soni) va shaxsiy statistika.

**Bot:**
- `/start` — salom va «O'yinni ochish» tugmasi (chap pastdagi menyu tugmasi ham Mini App'ni ochadi).
- Botni ishga tushirgan o'yinchiga har o'yindan keyin **g'alaba yoki mag'lubiyat va statistikasi** keladi.
- `/stats`, `/top`, `/help`.

**Admin** (`ADMIN_IDS` dagi foydalanuvchi; panelga kirish uchun `.env` dagi `ADMIN_CODE` so'raladi):
- Botda `/admin` → kod → menyu: 🎵 Musiqalar, 📊 Statistika, 👥 Foydalanuvchilar, 🎮 O'yinlar.
- **Musiqa qo'shish — Mini App'siz:** botga audio fayl yuborasiz → bot darhol **qaysi soniyadan
  boshlansin** deb so'raydi (`45`, `1:05`, `1 daqiqa 5 soniya` yoki «Boshidan») — g'olib ekranida
  musiqa aynan shu joyidan chalinadi. Keyin: «Faol qilish», «Tinglash», «Boshlanish vaqti», «Nomi», «O'chirish».
- **Userlarni boshqarish** (botda ham, Mini App'da ham): **vaqtincha bloklash** (1 soat … 30 kun yoki
  istalgan muddat + sabab), **muddatidan oldin blokdan chiqarish**, **o'chirish** (tasdiq bilan).
  30 kundan beri kirmagan va o'ynamagan userlar «💡 O'chirish tavsiyasi» ro'yxatida chiqadi.
  Bloklangan user botdan ham, Mini App'dan ham foydalana olmaydi, sababini ko'radi va yangi
  o'yinlarga qo'shilmaydi; bloklanganda va ochilganda unga xabar boradi.
- Mini App'dagi Admin bo'limi: umumiy statistika, barcha foydalanuvchilar, o'yinlarni bekor
  qilish/o'chirish, g'olib musiqasini tanlash. Kod bir marta kiritilsa, bot va Mini App'da
  `ADMIN_SESSION_HOURS` soat ochiq turadi.
- Admin oddiy o'yinchi sifatida ham o'ynaydi — buning uchun kod kerak emas.

## O'rnatish (Render + MongoDB Atlas)

### 1. Bot yarating
1. Telegram'da [@BotFather](https://t.me/BotFather) → `/newbot` → nom va username bering.
2. Bergan **token**ni saqlab qo'ying (`BOT_TOKEN`).
3. O'z Telegram ID raqamingizni [@userinfobot](https://t.me/userinfobot) dan bilib oling (`ADMIN_IDS`).

### 2. MongoDB Atlas
1. [mongodb.com/atlas](https://www.mongodb.com/atlas) → bepul (M0) klaster yarating, region —
   Frankfurt (Render bilan bir joyda bo'lsa tezroq ishlaydi).
2. **Database Access** → foydalanuvchi va parol yarating.
3. **Network Access** → `0.0.0.0/0` qo'shing (Render'ning bepul tarifida IP manzil o'zgaradi).
4. **Connect → Drivers** → ulanish satrini nusxalang, `<password>` o'rniga parolni yozing (`MONGODB_URI`).

### 3. Render
1. [render.com](https://render.com) → **New → Blueprint** → `zoxidbek/bura_calc` reposini tanlang.
   Render ildizdagi `render.yaml` ni o'qiydi.
2. So'ralgan qiymatlarni kiriting: `BOT_TOKEN`, `MONGODB_URI`, `ADMIN_IDS`, `ADMIN_CODE`.
   (`WEBHOOK_SECRET` avtomatik yaratiladi.)
3. **Apply** → deploy tugagach server o'zi webhook, buyruqlar va menyu tugmasini o'rnatadi.
4. Botga kiring → `/start` → «O'yinni ochish».

> Qo'lda sozlash ham mumkin: New → Web Service, **Root Directory** `bot`,
> Build `npm ci --omit=dev`, Start `npm start`, Health check `/health`,
> va o'zgaruvchilar (yoki `.env` faylini «Secret File» sifatida yuklang).

**Bepul tarif haqida:** Render'ning bepul xizmati 15 daqiqa so'rov bo'lmasa «uxlaydi» va
uyg'onishi ~1 daqiqa oladi — shunda birinchi xabarga javob yoki Mini App'ning birinchi ochilishi
kechikadi (Telegram webhook'ni o'zi qayta yuboradi, xabar yo'qolmaydi). Doim tez ishlashi uchun
Starter tarifiga o'tish kerak.

## Mahalliy ishga tushirish

```bash
cd bot
cp .env.example .env     # qiymatlarni to'ldiring
npm install
npm run dev              # PUBLIC_URL bo'sh bo'lsa — long polling rejimi
```

Mini App faqat **https** manzilda ochiladi: mahalliy sinov uchun tunnel (masalan, `cloudflared`
yoki `ngrok`) oching va `PUBLIC_URL` ga uning manzilini yozing.

## Testlar

```bash
cd bot && npm test
```

Testlar internet va haqiqiy bazasiz ishlaydi: xotiradagi MongoDB o'rinbosari va soxta Telegram
Bot API serveri bilan qoidalar, initData imzosi, admin kodi, butun API va bot oqimlari tekshiriladi.

## Tuzilishi

```
bot/
├── shared/rules.js        # o'yin qoidalari (server va Mini App bitta fayldan foydalanadi)
├── src/
│   ├── index.js           # kirish nuqtasi (.env → MongoDB → server)
│   ├── server.js          # bot + API + Mini App bitta HTTP serverda
│   ├── app.js             # Express: webhook, /api, statik fayllar, xavfsizlik sarlavhalari
│   ├── api.js             # Mini App REST API (Telegram initData bilan imzolangan)
│   ├── auth.js            # initData HMAC tekshiruvi, admin kodi va urinishlar chegarasi
│   ├── bot/index.js       # grammY: buyruqlar, admin menyusi, musiqa qo'shish
│   ├── services/          # users, games (qoidalar + statistika), music, notify
│   ├── texts.js           # bot xabarlari
│   └── config.js, db.js, util.js
├── public/                # Mini App: index.html, css/app.css, js/*.js
└── test/                  # node:test testlari
```

## Xavfsizlik

- Har bir Mini App so'rovi Telegram `initData` imzosi (HMAC-SHA256, bot tokeni bilan) orqali
  tekshiriladi — boshqa birov nomidan ochko qo'shib bo'lmaydi.
- Admin panel: `ADMIN_IDS` + `ADMIN_CODE`; 15 daqiqada 5 ta noto'g'ri urinishdan keyin bloklanadi,
  botda kod yozilgan xabar darhol o'chiriladi.
- Webhook maxfiy kalit (`X-Telegram-Bot-Api-Secret-Token`) bilan himoyalangan.
- Bir vaqtda ikki telefondan bosilganda ochko ikki marta sanalmaydi (versiya tekshiruvi).
- Musiqa fayllari server orqali uzatiladi — bot tokeni foydalanuvchiga ko'rinmaydi.
