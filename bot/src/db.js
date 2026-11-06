import { MongoClient } from 'mongodb';

/** MongoDB'ga ulanadi va kerakli kolleksiyalar hamda indekslarni tayyorlaydi. */
export async function connectDb(uri, dbName) {
    const client = new MongoClient(uri, { maxPoolSize: 10, serverSelectionTimeoutMS: 15000 });
    await client.connect();
    const db = client.db(dbName);
    const store = {
        users: db.collection('users'),
        games: db.collection('games'),
        tracks: db.collection('tracks'),
        settings: db.collection('settings'),
        ping: () => db.command({ ping: 1 }),
        close: () => client.close()
    };
    await ensureIndexes(store);
    return store;
}

export async function ensureIndexes({ users, games, tracks }) {
    await Promise.all([
        users.createIndex({ tgId: 1 }, { unique: true }),
        users.createIndex({ 'stats.games': -1 }),
        users.createIndex({ lastSeenAt: -1 }),
        games.createIndex({ status: 1, updatedAt: -1 }),
        games.createIndex({ status: 1, finishedAt: -1 }),
        games.createIndex({ players: 1, finishedAt: -1 }),
        games.createIndex({ createdAt: -1 }),
        tracks.createIndex({ createdAt: -1 }),
        tracks.createIndex({ fileUniqueId: 1 })
    ]);
}
