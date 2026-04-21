import { getMongo, authDb } from '../lib/mongo.js';
import { hashPassword, signToken } from '../lib/auth.js';
import { cors } from '../lib/cors.js';

// First registration creates the admin; subsequent calls are refused.
// If you ever need a second user, add them through an admin-protected
// endpoint or directly in Atlas.
export default async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'method not allowed' });
    }

    const body = req.body;
    if (!body || typeof body !== 'object') {
        return res.status(400).json({ error: 'expected JSON body' });
    }
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!email || !email.includes('@') || email.length > 200) {
        return res.status(400).json({ error: 'invalid email' });
    }
    if (password.length < 12 || password.length > 200) {
        return res.status(400).json({ error: 'password must be 12-200 characters' });
    }

    let users;
    try {
        const client = await getMongo();
        users = authDb(client).collection('users');
    } catch (err) {
        console.error('mongo connect failed:', err);
        return res.status(503).json({ error: 'database unavailable' });
    }

    const existing = await users.countDocuments({});
    if (existing > 0) {
        return res.status(403).json({ error: 'registration closed; admin already exists' });
    }

    try {
        const { salt, passwordHash } = await hashPassword(password);
        const doc = {
            email,
            passwordHash,
            salt,
            role: 'admin',
            createdAt: new Date(),
        };
        const result = await users.insertOne(doc);
        const token = signToken({
            sub: result.insertedId.toString(),
            email: doc.email,
            role: doc.role,
        });
        return res.status(200).json({ token, user: { email: doc.email, role: doc.role } });
    } catch (err) {
        console.error('register failed:', err);
        return res.status(500).json({ error: 'registration failed' });
    }
}
