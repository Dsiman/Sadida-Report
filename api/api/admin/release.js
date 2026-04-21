// POST /api/admin/release
//   ?dryRun=true  → returns { count, slugs, columns } without deleting
//   (default)     → deletes submissions in every column marked deleteOnRelease,
//                   returns { deleted, slugs, columns }.

import { getMongo, reportsDb } from '../lib/mongo.js';
import { requireAdmin } from '../lib/auth.js';
import { cors } from '../lib/cors.js';
import { ensureBoardReady } from '../lib/board.js';

export default async function handler(req, res) {
    cors(req, res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'method not allowed' });
    }

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

    const deletable = await columns.find({ deleteOnRelease: true }).toArray();
    const slugs = deletable.map(c => c.slug);
    const names = deletable.map(c => c.name);

    if (slugs.length === 0) {
        return res.status(200).json({ deleted: 0, slugs: [], columns: [] });
    }

    if (req.query.dryRun === 'true') {
        const count = await submissions.countDocuments({ status: { $in: slugs } });
        return res.status(200).json({ count, slugs, columns: names });
    }

    const result = await submissions.deleteMany({ status: { $in: slugs } });
    return res.status(200).json({
        deleted: result.deletedCount,
        slugs,
        columns: names,
    });
}
