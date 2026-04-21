import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

// 24 hours; forces re-login rather than relying on long-lived admin sessions.
const TOKEN_TTL_SECONDS = 24 * 60 * 60;

// scrypt parameters: N=2^14 is the widely-recommended default. 64-byte key.
const SCRYPT_KEYLEN = 64;
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function base64url(buf) {
    return Buffer.from(buf).toString('base64')
        .replace(/=+$/, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

function base64urlDecode(s) {
    let t = s.replace(/-/g, '+').replace(/_/g, '/');
    while (t.length % 4) t += '=';
    return Buffer.from(t, 'base64');
}

export function signToken(payload) {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET not set');
    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const full = { ...payload, iat: now, exp: now + TOKEN_TTL_SECONDS };
    const h = base64url(JSON.stringify(header));
    const p = base64url(JSON.stringify(full));
    const sig = base64url(createHmac('sha256', secret).update(`${h}.${p}`).digest());
    return `${h}.${p}.${sig}`;
}

export function verifyToken(token) {
    try {
        const secret = process.env.JWT_SECRET;
        if (!secret) return null;
        if (!token || typeof token !== 'string') return null;
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const [h, p, sig] = parts;
        const expected = createHmac('sha256', secret).update(`${h}.${p}`).digest();
        const received = base64urlDecode(sig);
        if (expected.length !== received.length) return null;
        if (!timingSafeEqual(expected, received)) return null;
        const payload = JSON.parse(base64urlDecode(p).toString('utf8'));
        if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
        return payload;
    } catch {
        return null;
    }
}

export async function hashPassword(password) {
    const salt = randomBytes(16);
    const key = await scryptAsync(password, salt, SCRYPT_KEYLEN, SCRYPT_OPTS);
    return { salt: salt.toString('hex'), passwordHash: key.toString('hex') };
}

export async function verifyPassword(password, saltHex, hashHex) {
    try {
        const salt = Buffer.from(saltHex, 'hex');
        const expected = Buffer.from(hashHex, 'hex');
        const derived = await scryptAsync(password, salt, SCRYPT_KEYLEN, SCRYPT_OPTS);
        if (derived.length !== expected.length) return false;
        return timingSafeEqual(derived, expected);
    } catch {
        return false;
    }
}

// Extracts and validates a bearer token. Returns { ok, user } or { ok: false, reason }.
export function readBearer(req) {
    const header = req.headers['authorization'] || req.headers['Authorization'];
    if (!header || !header.startsWith('Bearer ')) return { ok: false, reason: 'missing token' };
    const payload = verifyToken(header.slice('Bearer '.length));
    if (!payload) return { ok: false, reason: 'invalid or expired token' };
    return { ok: true, user: payload };
}

export function requireAdmin(req) {
    const r = readBearer(req);
    if (!r.ok) return r;
    if (r.user.role !== 'admin') return { ok: false, reason: 'admin role required' };
    return r;
}
