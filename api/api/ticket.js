// Public endpoint: GET /api/ticket?ticket=STS-XXXXXX
// Returns only fields safe to show the submitter. Admin-only data (hashed IP,
// internal notes, admin tags, full payload) is never exposed.

import { getMongo, reportsDb } from '../lib/mongo.js';
import { cors } from '../lib/cors.js';
import { TICKET_REGEX } from '../lib/ticket.js';

export default async function handler(req, res) {
    cors(req, res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'method not allowed' });
    }

    const raw = typeof req.query.ticket === 'string' ? req.query.ticket.trim().toUpperCase() : '';
    if (!TICKET_REGEX.test(raw)) {
        return res.status(400).json({ error: 'invalid ticket format; expected STS-XXXXXX' });
    }

    let submissions;
    try {
        const client = await getMongo();
        submissions = reportsDb(client).collection('submissions');
    } catch (err) {
        console.error('mongo connect failed:', err);
        return res.status(503).json({ error: 'database unavailable' });
    }

    const doc = await submissions.findOne(
        { ticket: raw },
        {
            projection: {
                ticket: 1, type: 1, subtype: 1, modVersion: 1,
                status: 1, submittedAt: 1, updatedAt: 1,
                'payload.summary': 1,
                'payload.cardName': 1,
                'payload.relicName': 1,
                'payload.potionName': 1,
                'payload.powerName': 1,
            },
        },
    );
    if (!doc) return res.status(404).json({ error: 'ticket not found' });

    const p = doc.payload || {};
    const title = p.summary || p.cardName || p.relicName || p.potionName || p.powerName || null;

    return res.status(200).json({
        ticket: doc.ticket,
        type: doc.type,
        subtype: doc.subtype || null,
        title,
        status: doc.status || 'new',
        modVersion: doc.modVersion || null,
        submittedAt: doc.submittedAt,
        updatedAt: doc.updatedAt || null,
    });
}
