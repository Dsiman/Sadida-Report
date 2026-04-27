// Public endpoint: GET /api/ticket?ticket=STS-XXXXXX
// Reads the matching issue from Sadida-AIO and returns the safe, public
// projection of the ticket — plus the comment thread the maintainer has
// posted on the issue, so the submitter can see follow-up questions.

import { cors } from '../lib/cors.js';
import { TICKET_REGEX } from '../lib/ticket.js';
import { findIssueByTicket, listComments } from '../lib/github.js';

const STATUS_LABEL_PREFIX = 'status:';

function statusFromLabels(issue) {
    // Maintainer can drive UI status by adding a "status:<slug>" label
    // (e.g. "status:in-progress"). Otherwise we fall back to the GitHub
    // open/closed state so the page never shows a blank status.
    if (Array.isArray(issue.labels)) {
        for (const l of issue.labels) {
            const name = typeof l === 'string' ? l : l?.name;
            if (typeof name === 'string' && name.startsWith(STATUS_LABEL_PREFIX)) {
                return name.slice(STATUS_LABEL_PREFIX.length);
            }
        }
    }
    return issue.state === 'closed' ? 'closed' : 'new';
}

function safeKindFromLabels(issue) {
    if (!Array.isArray(issue.labels)) return { type: null, subtype: null };
    let type = null;
    let subtype = null;
    for (const l of issue.labels) {
        const name = typeof l === 'string' ? l : l?.name;
        if (!name || !name.startsWith('report:')) continue;
        const rest = name.slice('report:'.length);
        if (rest === 'new') continue;
        const parts = rest.split(':');
        if (parts.length === 1 && !type) type = parts[0];
        else if (parts.length === 2) {
            type = parts[0];
            subtype = parts[1];
        }
    }
    return { type, subtype };
}

function modVersionFromBody(body) {
    if (typeof body !== 'string') return null;
    const m = body.match(/\*\*Mod version:\*\*\s*`([^`]+)`/);
    return m ? m[1] : null;
}

function projectComments(comments) {
    return comments
        .filter(c => c && typeof c.body === 'string')
        .map(c => ({
            id: c.id,
            author: c.user?.login || 'unknown',
            body: c.body,
            createdAt: c.created_at,
            updatedAt: c.updated_at,
        }));
}

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

    let issue;
    try {
        issue = await findIssueByTicket(raw);
    } catch (err) {
        console.error('GitHub findIssue failed:', err);
        return res.status(502).json({ error: 'upstream lookup failed' });
    }
    if (!issue) {
        return res.status(404).json({ error: 'ticket not found' });
    }

    let comments = [];
    if (issue.comments > 0) {
        try {
            comments = await listComments(issue.number);
        } catch (err) {
            // Don't fail the whole lookup if only comments fail; the user can
            // still see the ticket exists. Log so we know to investigate.
            console.warn('GitHub listComments failed:', err);
        }
    }

    const { type, subtype } = safeKindFromLabels(issue);
    const titleMatch = typeof issue.title === 'string'
        ? issue.title.replace(/^\[STS-[A-Z2-9]{6}\]\s*/, '').replace(/^[a-z:]+\s+—\s*/, '')
        : null;

    return res.status(200).json({
        ticket: raw,
        type,
        subtype,
        title: titleMatch || issue.title || null,
        status: statusFromLabels(issue),
        state: issue.state,
        modVersion: modVersionFromBody(issue.body),
        submittedAt: issue.created_at,
        updatedAt: issue.updated_at,
        url: issue.html_url,
        comments: projectComments(comments),
    });
}
