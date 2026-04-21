import { ObjectId } from 'mongodb';
import { getMongo, reportsDb } from '../lib/mongo.js';
import { requireAdmin } from '../lib/auth.js';
import { cors } from '../lib/cors.js';
import { ensureBoardReady } from '../lib/board.js';

export default async function handler(req, res) {
    cors(req, res);
    if (req.method === 'OPTIONS') return res.status(204).end();

    const auth = requireAdmin(req);
    if (!auth.ok) return res.status(401).json({ error: auth.reason });

    let client;
    try {
        client = await getMongo();
        await ensureBoardReady(client);
    } catch (err) {
        console.error('mongo connect failed:', err);
        return res.status(503).json({ error: 'database unavailable' });
    }
    const submissions = reportsDb(client).collection('submissions');
    const columns = reportsDb(client).collection('columns');

    if (req.method === 'GET') return handleList(req, res, submissions);
    if (req.method === 'PATCH') return handleUpdate(req, res, submissions, columns, auth.user);
    if (req.method === 'DELETE') return handleDelete(req, res, submissions);
    return res.status(405).json({ error: 'method not allowed' });
}

async function handleList(req, res, submissions) {
    const q = req.query || {};
    const filter = {};
    if (typeof q.type === 'string') filter.type = q.type;
    if (typeof q.subtype === 'string') filter.subtype = q.subtype;
    if (typeof q.status === 'string') filter.status = q.status;
    if (typeof q.search === 'string' && q.search.trim()) {
        const regex = new RegExp(q.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        filter.$or = [
            { 'payload.summary': regex },
            { 'payload.description': regex },
            { 'payload.cardName': regex },
            { 'payload.relicName': regex },
            { 'payload.potionName': regex },
            { 'payload.powerName': regex },
        ];
    }
    const limit = Math.min(parseInt(q.limit, 10) || 200, 500);
    const skip = Math.max(parseInt(q.skip, 10) || 0, 0);
    // Kanban board wants oldest first; pass ?sort=newest to flip.
    const direction = q.sort === 'newest' ? -1 : 1;

    const [items, total] = await Promise.all([
        submissions.find(filter).sort({ submittedAt: direction }).skip(skip).limit(limit).toArray(),
        submissions.countDocuments(filter),
    ]);
    return res.status(200).json({ items, total, limit, skip });
}

async function handleUpdate(req, res, submissions, columns, actor) {
    const id = typeof req.query.id === 'string' ? req.query.id : null;
    if (!id || !ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'invalid id' });
    }
    const body = req.body || {};
    const updates = {};

    if (typeof body.status === 'string') {
        const col = await columns.findOne({ slug: body.status });
        if (!col) {
            return res.status(400).json({ error: `unknown column slug: ${body.status}` });
        }
        updates.status = body.status;
    }
    if (Array.isArray(body.tags)) {
        updates.tags = body.tags
            .filter(t => typeof t === 'string')
            .map(t => t.trim())
            .filter(t => t.length > 0 && t.length <= 40)
            .slice(0, 20);
    }
    if (typeof body.notes === 'string') {
        updates.notes = body.notes.slice(0, 5000);
    }

    if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'nothing to update' });
    }

    updates.updatedAt = new Date();
    updates.updatedBy = actor.email;

    const result = await submissions.updateOne(
        { _id: new ObjectId(id) },
        { $set: updates },
    );
    if (result.matchedCount === 0) return res.status(404).json({ error: 'not found' });
    return res.status(200).json({ ok: true, updated: Object.keys(updates) });
}

async function handleDelete(req, res, submissions) {
    const id = typeof req.query.id === 'string' ? req.query.id : null;
    if (!id || !ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'invalid id' });
    }
    const result = await submissions.deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'not found' });
    return res.status(200).json({ ok: true });
}
