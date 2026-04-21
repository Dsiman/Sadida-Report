import { MongoClient } from 'mongodb';

let cachedClient = null;

export async function getMongo() {
    if (cachedClient) return cachedClient;
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI not set');
    const client = new MongoClient(uri, {
        maxPoolSize: 3,
        serverSelectionTimeoutMS: 5000,
    });
    await client.connect();
    cachedClient = client;
    return client;
}

export function reportsDb(client) {
    return client.db(process.env.MONGODB_DB || 'reports');
}

export function authDb(client) {
    return client.db(process.env.MONGODB_AUTH_DB || 'auth');
}
