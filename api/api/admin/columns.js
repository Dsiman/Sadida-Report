import { ObjectId } from 'mongodb';
import { getMongo, reportsDb } from '../lib/mongo.js';
import { requireAdmin } from '../lib/auth.js';
import { cors } from '../lib/cors.js';
import { ensureBoardReady } from '../lib/board.js';
import { slugify } from '../lib/slug.js';

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
    const columns = reportsDb(client).collection('columns');
    const submissions = reportsDb(client).collection('submissions');

    if (req.method === 'GET') {
        const docs = await columns.find({}).sort({ order: 1 }).toArray();
        return res.status(200).json({ columns: docs });
    }

    if (req.method === 'POST') {
        const body = req.body || {};
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (name.length < 1 || name.length > 40) {
            return res.status(400).json({ error: 'name must be 1-40 characters' });
        }
        const slug = slugify(name);
        if (!slug) {
            return res.status(400).json({ error: 'name must contain letters or digits' });
        }
        const exists = await columns.findOne({ slug });
        if (exists) {
            return res.status(409).json({ error: 'a column with this name already exists' });
        }
        const last = await columns.find({}).sort({ order: -1 }).limit(1).toArray();
        const order = last.length ? last[0].order + 1 : 0;
        const doc = {
            slug,
            name,
            order,
            deleteOnRelease: body.deleteOnRelease === true,
            createdAt: new Date(),
        };
        const result = await columns.insertOne(doc);
        return res.status(200).json({ column: { _id: result.insertedId, ...doc } });
    }

    if (req.method === 'PATCH') {
        const id = typeof req.query.id === 'string' ? req.query.id : null;
        if (!id || !ObjectId.isValid(id)) return res.status(400).json({ error: 'invalid id' });

        const body = req.body || {};
        const updates = {};
        if (typeof body.name === 'string') {
            const name = body.name.trim();
            if (name.length < 1 || name.length > 40) {
                return res.status(400).json({ error: 'name must be 1-40 characters' });
            }
            updates.name = name;
            // Intentionally don't touch slug — submissions still refer to it.
        }
        if (typeof body.deleteOnRelease === 'boolean') {
            updates.deleteOnRelease = body.deleteOnRelease;
        }
        if (Number.isInteger(body.order)) {
            updates.order = body.order;
        }
        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ error: 'nothing to update' });
        }
        updates.updatedAt = new Date();

        const result = await columns.updateOne(
            { _id: new ObjectId(id) },
            { $set: updates },
        );
        if (result.matchedCount === 0) return res.status(404).json({ error: 'not found' });
        return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE') {
        const id = typeof req.query.id === 'string' ? req.query.id : null;
        if (!id || !ObjectId.isValid(id)) return res.status(400).json({ error: 'invalid id' });
        const reassignTo = typeof req.query.reassignTo === 'string' ? req.query.reassignTo : null;

        const col = await columns.findOne({ _id: new ObjectId(id) });
        if (!col) return res.status(404).json({ error: 'not found' });

        const remaining = await columns.countDocuments({});
        if (remaining <= 1) {
            return res.status(400).json({ error: 'cannot delete the last column' });
        }

        const inThis = await submissions.countDocuments({ status: col.slug });
        if (inThis > 0) {
            if (!reassignTo) {
                return res.status(400).json({
                    error: `column has ${inThis} submissions; pass ?reassignTo=<slug> to move them`,
                    count: inThis,
                });
            }
            const target = await columns.findOne({ slug: reassignTo });
            if (!target) return res.status(400).json({ error: 'reassignTo column does not exist' });
            await submissions.updateMany({ status: col.slug }, { $set: { status: reassignTo } });
        }

        await columns.deleteOne({ _id: new ObjectId(id) });
        return res.status(200).json({ ok: true, reassigned: inThis });
    }

    return res.status(405).json({ error: 'method not allowed' });
}
