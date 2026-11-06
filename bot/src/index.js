import { loadEnvFiles, loadConfig } from './config.js';
import { connectDb } from './db.js';
import { startServer } from './server.js';

loadEnvFiles();

let config;
try {
    config = loadConfig();
} catch (err) {
    console.error('[bura] Sozlamalar xatosi:', err.message);
    process.exit(1);
}

const db = await connectDb(config.mongoUri, config.dbName);
const { stop } = await startServer({ config, db });

// Render qayta ishga tushirganda (SIGTERM) toza yopilish
let stopping = false;
for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, async () => {
        if (stopping) return;
        stopping = true;
        console.log(`[bura] ${signal} — to'xtatilmoqda...`);
        try {
            await stop();
            await db.close();
        } finally {
            process.exit(0);
        }
    });
}
