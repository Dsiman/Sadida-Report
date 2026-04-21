import { getMongo, authDb } from '../lib/mongo.js';
import { verifyPassword, signToken } from '../lib/auth.js';
import { cors } from '../lib/cors.js';

export default async function handler(req, res) {
    cors(req, res);
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
    if (!email || !password) {
        return res.status(400).json({ error: 'email and password required' });
    }

    let users;
    try {
        const client = await getMongo();
        users = authDb(client).collection('users');
    } catch (err) {
        console.error('mongo connect failed:', err);
        return res.status(503).json({ error: 'database unavailable' });
    }

    const user = await users.findOne({ email });
    // Always do a scrypt-equivalent wait if the user isn't found so the
    // response time doesn't leak which emails are registered.
    if (!user) {
        await verifyPassword(password, '00'.repeat(16), '00'.repeat(64));
        return res.status(401).json({ error: 'invalid credentials' });
    }

    const ok = await verifyPassword(password, user.salt, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'invalid credentials' });

    const token = signToken({
        sub: user._id.toString(),
        email: user.email,
        role: user.role,
    });
    return res.status(200).json({ token, user: { email: user.email, role: user.role } });
}
