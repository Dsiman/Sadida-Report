// First-time setup for the Kanban board: seeds the six default columns and
// remaps legacy status values ("triaged", "resolved", "wontfix") that the old
// table-based admin panel used. All operations are idempotent — seed uses
// upsert-by-slug, and the status remap is a no-op once nothing matches — so
// this is safe to run on every cold start.

import { reportsDb } from './mongo.js';
import { issueUniqueTicket } from './ticket.js';

const DEFAULT_COLUMNS = [
    { slug: 'new',              name: 'New',              order: 0, deleteOnRelease: false },
    { slug: 'under-review',     name: 'Under Review',     order: 1, deleteOnRelease: false },
    { slug: 'in-progress',      name: 'In Progress',      order: 2, deleteOnRelease: false },
    { slug: 'completed',        name: 'Completed',        order: 3, deleteOnRelease: false },
    { slug: 'archived',         name: 'Archived',         order: 4, deleteOnRelease: false },
    { slug: 'pending-deletion', name: 'Pending Deletion', order: 5, deleteOnRelease: true  },
];

const LEGACY_STATUS_REMAP = {
    triaged: 'under-review',
    resolved: 'completed',
    wontfix: 'archived',
};

let seededInThisProcess = false;

export async function ensureBoardReady(client) {
    if (seededInThisProcess) return;
    const db = reportsDb(client);
    const columns = db.collection('columns');
    const submissions = db.collection('submissions');

    await columns.createIndex({ slug: 1 }, { unique: true });

    const ops = DEFAULT_COLUMNS.map(c => ({
        updateOne: {
            filter: { slug: c.slug },
            update: { $setOnInsert: { ...c, createdAt: new Date() } },
            upsert: true,
        },
    }));
    await columns.bulkWrite(ops, { ordered: false });

    for (const [oldStatus, newSlug] of Object.entries(LEGACY_STATUS_REMAP)) {
        await submissions.updateMany(
            { status: oldStatus },
            { $set: { status: newSlug } },
        );
    }

    // Backfill tickets for any submissions from before the ticket system.
    // Keep the lookup indexed so collision checks in issueUniqueTicket stay cheap.
    await submissions.createIndex({ ticket: 1 }, { unique: true, sparse: true });
    const needTicket = await submissions
        .find({ ticket: { $exists: false } }, { projection: { _id: 1 } })
        .toArray();
    for (const d of needTicket) {
        const ticket = await issueUniqueTicket(submissions);
        await submissions.updateOne({ _id: d._id }, { $set: { ticket } });
    }

    seededInThisProcess = true;
}
