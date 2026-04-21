import { readBearer } from '../lib/auth.js';
import { cors } from '../lib/cors.js';

// Lets the admin UI verify a stored token on page load without
// needing to hit a more sensitive endpoint first.
export default function handler(req, res) {
    cors(req, res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'method not allowed' });
    }
    const auth = readBearer(req);
    if (!auth.ok) return res.status(401).json({ error: auth.reason });
    return res.status(200).json({
        user: {
            email: auth.user.email,
            role: auth.user.role,
            sub: auth.user.sub,
            exp: auth.user.exp,
        },
    });
}
