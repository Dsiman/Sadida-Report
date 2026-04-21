// Vercel serverless function: POST /api/submit
//
// Accepts a JSON submission from the Sadida-Report GitHub Pages frontend,
// validates it against a per-type JSON schema, enforces a per-IP rate limit,
// and writes the document into MongoDB Atlas.
//
// Env vars required:
//   MONGODB_URI       full SRV connection string (held in Vercel env, never repo)
//   MONGODB_DB        database name (default "reports")
//   ALLOWED_ORIGIN    origin allowed to POST via CORS, e.g. https://damianisaacs.github.io
//   IP_SALT           random string; hashes submitter IPs so we can rate-limit without storing raw IPs
//
// Response codes:
//   200  submission recorded { id }
//   400  validation error    { errors: [...] }
//   405  wrong method
//   413  payload too large
//   429  rate limited
//   500  server error
//   503  Mongo unreachable

// The schemas declare $schema: draft/2020-12; default Ajv export is draft-07
// and rejects them with "no schema with key or ref ...". Import the 2020 build.
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { createHash } from 'crypto';

import { getMongo, reportsDb } from '../lib/mongo.js';
import { cors } from '../lib/cors.js';
import { issueUniqueTicket } from '../lib/ticket.js';
import {
    bugSchema,
    issueSchema,
    cardSchema,
    relicSchema,
    potionSchema,
    powerSchema,
} from '../schemas.js';

// ───── Ajv is expensive to construct; build once per cold start ─────
const ajv = addFormats(new Ajv({ allErrors: true, removeAdditional: 'all' }));
const validators = {
    bug: ajv.compile(bugSchema),
    issue: ajv.compile(issueSchema),
    'suggestion:card': ajv.compile(cardSchema),
    'suggestion:relic': ajv.compile(relicSchema),
    'suggestion:potion': ajv.compile(potionSchema),
    'suggestion:power': ajv.compile(powerSchema),
};

// ───── Helpers ─────
const MAX_BODY_BYTES = 60 * 1024;       // 60 KB cap; logs larger than this should be uploaded elsewhere
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;  // 1 hour
const RATE_LIMIT_MAX = 10;              // 10 submissions per IP per hour

function hashIp(raw) {
    const salt = process.env.IP_SALT || 'unsalted';
    return createHash('sha256').update(salt + '|' + raw).digest('hex').slice(0, 32);
}

function schemaKeyFor(body) {
    if (body.type === 'bug' || body.type === 'issue') return body.type;
    if (body.type === 'suggestion' && typeof body.subtype === 'string') {
        return `suggestion:${body.subtype}`;
    }
    return null;
}

async function enforceRateLimit(db, ipHash) {
    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
    const count = await db.collection('submissions').countDocuments({
        sourceIp: ipHash,
        submittedAt: { $gte: since },
    });
    return count < RATE_LIMIT_MAX;
}

// ───── Entry point ─────
export default async function handler(req, res) {
    cors(req, res);

    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'method not allowed' });
        return;
    }

    // Vercel already parses JSON; still size-check defensively.
    const rawLen = req.headers['content-length'] ? parseInt(req.headers['content-length'], 10) : 0;
    if (rawLen > MAX_BODY_BYTES) {
        res.status(413).json({ error: 'payload too large' });
        return;
    }

    const body = req.body;
    if (!body || typeof body !== 'object') {
        res.status(400).json({ error: 'expected JSON body' });
        return;
    }

    const key = schemaKeyFor(body);
    if (!key || !validators[key]) {
        res.status(400).json({ error: 'unknown type/subtype' });
        return;
    }

    const validate = validators[key];
    const valid = validate(body);
    if (!valid) {
        res.status(400).json({
            error: 'validation failed',
            errors: validate.errors.map(e => ({
                field: e.instancePath || e.schemaPath,
                message: e.message,
            })),
        });
        return;
    }

    // Client/X-Forwarded-For is the only reasonable IP source on Vercel.
    const rawIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
    const ipHash = hashIp(rawIp);

    let db;
    try {
        const client = await getMongo();
        db = reportsDb(client);
    } catch (err) {
        console.error('mongo connect failed:', err);
        res.status(503).json({ error: 'database unavailable' });
        return;
    }

    const allowed = await enforceRateLimit(db, ipHash);
    if (!allowed) {
        res.status(429).json({ error: 'rate limit exceeded; try again later' });
        return;
    }

    let ticket;
    try {
        ticket = await issueUniqueTicket(db.collection('submissions'));
    } catch (err) {
        console.error('ticket issue failed:', err);
        res.status(500).json({ error: 'could not allocate ticket' });
        return;
    }

    const doc = {
        type: body.type,
        subtype: body.type === 'suggestion' ? body.subtype : null,
        modVersion: body.modVersion || null,
        ticket,
        steamName: typeof body.steamName === 'string' && body.steamName.trim() ? body.steamName.trim().slice(0, 40) : null,
        submittedAt: new Date(),
        sourceIp: ipHash,
        payload: stripMeta(body),
        status: 'new',
        tags: [],
    };

    try {
        const result = await db.collection('submissions').insertOne(doc);
        res.status(200).json({ id: result.insertedId.toString(), ticket });
    } catch (err) {
        console.error('mongo insert failed:', err);
        res.status(500).json({ error: 'write failed' });
    }
}

// Strip the top-level routing fields so the `payload` holds only the form's own data.
function stripMeta(body) {
    const { type, subtype, modVersion, steamName, ...rest } = body;
    return rest;
}
