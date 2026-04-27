// Vercel serverless function: POST /api/submit
//
// Accepts a JSON submission from the Sadida-Report GitHub Pages frontend,
// validates it against a per-type JSON schema, and creates a corresponding
// issue in the Sadida-AIO repo via the GitHub REST API.
//
// Env vars required:
//   GITHUB_TOKEN     fine-grained PAT with Issues: read+write on GITHUB_REPO
//   GITHUB_REPO      "owner/name", e.g. "Dsiman/Sadida-AIO"
//   ALLOWED_ORIGIN   origin allowed to POST via CORS (e.g. https://dsiman.github.io)
//
// Response codes:
//   200  submission recorded { ticket, issueNumber, url }
//   400  validation error    { errors: [...] }
//   405  wrong method
//   413  payload too large
//   500  server error
//   502  GitHub upstream error

import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import { cors } from '../lib/cors.js';
import { generateTicket } from '../lib/ticket.js';
import { createIssue } from '../lib/github.js';
import {
    bugSchema,
    issueSchema,
    cardSchema,
    relicSchema,
    potionSchema,
    powerSchema,
} from '../schemas.js';

const ajv = addFormats(new Ajv({ allErrors: true, removeAdditional: 'all' }));
const validators = {
    bug: ajv.compile(bugSchema),
    issue: ajv.compile(issueSchema),
    'suggestion:card': ajv.compile(cardSchema),
    'suggestion:relic': ajv.compile(relicSchema),
    'suggestion:potion': ajv.compile(potionSchema),
    'suggestion:power': ajv.compile(powerSchema),
};

const MAX_BODY_BYTES = 60 * 1024;

function schemaKeyFor(body) {
    if (body.type === 'bug' || body.type === 'issue') return body.type;
    if (body.type === 'suggestion' && typeof body.subtype === 'string') {
        return `suggestion:${body.subtype}`;
    }
    return null;
}

function kindLabel(type, subtype) {
    if (type === 'suggestion' && subtype) return `report:suggestion:${subtype}`;
    return `report:${type}`;
}

function titleFor(body) {
    const p = body || {};
    return (
        p.summary ||
        p.cardName ||
        p.relicName ||
        p.potionName ||
        p.powerName ||
        '(untitled)'
    );
}

function renderBody(body, ticket) {
    const lines = [];
    lines.push(`**Ticket:** \`${ticket}\``);
    lines.push(`**Type:** \`${body.type}${body.subtype ? `:${body.subtype}` : ''}\``);
    if (body.modVersion) lines.push(`**Mod version:** \`${body.modVersion}\``);
    if (body.steamName) lines.push(`**Steam username:** ${body.steamName}`);
    lines.push('');
    lines.push('---');
    lines.push('');

    const skip = new Set(['type', 'subtype', 'modVersion', 'steamName']);
    for (const [key, value] of Object.entries(body)) {
        if (skip.has(key) || value == null || value === '') continue;
        const label = humanize(key);
        if (typeof value === 'string' && (value.includes('\n') || value.length > 80)) {
            // Long / multi-line fields render as fenced blocks. Use `text` so
            // GitHub doesn't try to syntax-highlight log dumps.
            lines.push(`### ${label}`);
            lines.push('```text');
            lines.push(value);
            lines.push('```');
            lines.push('');
        } else if (Array.isArray(value)) {
            lines.push(`**${label}:** ${value.join(', ')}`);
        } else {
            lines.push(`**${label}:** ${value}`);
        }
    }
    return lines.join('\n');
}

function humanize(key) {
    return key
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, c => c.toUpperCase())
        .trim();
}

export default async function handler(req, res) {
    cors(req, res);

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'method not allowed' });
    }

    const rawLen = req.headers['content-length'] ? parseInt(req.headers['content-length'], 10) : 0;
    if (rawLen > MAX_BODY_BYTES) {
        return res.status(413).json({ error: 'payload too large' });
    }

    const body = req.body;
    if (!body || typeof body !== 'object') {
        return res.status(400).json({ error: 'expected JSON body' });
    }

    const key = schemaKeyFor(body);
    if (!key || !validators[key]) {
        return res.status(400).json({ error: 'unknown type/subtype' });
    }

    const validate = validators[key];
    if (!validate(body)) {
        return res.status(400).json({
            error: 'validation failed',
            errors: validate.errors.map(e => ({
                field: e.instancePath || e.schemaPath,
                message: e.message,
            })),
        });
    }

    const ticket = generateTicket();
    const issueTitle = `[${ticket}] ${body.type}${body.subtype ? `:${body.subtype}` : ''} — ${titleFor(body)}`.slice(0, 240);
    const labels = [
        `report:${body.type}`,
        ...(body.subtype ? [kindLabel(body.type, body.subtype)] : []),
        `ticket:${ticket}`,
        'report:new',
    ];

    let issue;
    try {
        issue = await createIssue({
            title: issueTitle,
            body: renderBody(body, ticket),
            labels,
        });
    } catch (err) {
        console.error('GitHub createIssue failed:', err);
        return res.status(502).json({ error: 'could not create issue upstream' });
    }

    return res.status(200).json({
        ticket,
        issueNumber: issue.number,
        url: issue.html_url,
    });
}
