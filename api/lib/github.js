// Thin wrapper around the GitHub REST API (v2022-11-28).
// All calls use a server-side fine-grained PAT held in GITHUB_TOKEN with
// "Issues: read and write" on the target repo (GITHUB_REPO, "owner/name").
//
// We never expose the token to the browser; submit.js and ticket.js call
// these helpers, validate the response, and forward only the safe parts.

const API = 'https://api.github.com';

function repoSlug() {
    const slug = process.env.GITHUB_REPO || '';
    if (!/^[^/]+\/[^/]+$/.test(slug)) {
        throw new Error('GITHUB_REPO must be set to "owner/name"');
    }
    return slug;
}

function token() {
    const t = process.env.GITHUB_TOKEN;
    if (!t) throw new Error('GITHUB_TOKEN not set');
    return t;
}

async function gh(path, init = {}) {
    const res = await fetch(`${API}${path}`, {
        ...init,
        headers: {
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            Authorization: `Bearer ${token()}`,
            'User-Agent': 'sadida-report',
            ...(init.body ? { 'Content-Type': 'application/json' } : {}),
            ...(init.headers || {}),
        },
    });
    return res;
}

// Ensure a label exists in the repo. GitHub's create-issue endpoint silently
// drops labels that don't exist, which would lose the per-ticket label we use
// as the lookup key. Call this for any label we need to depend on later.
export async function ensureLabel(name, color = 'cccccc') {
    const res = await gh(`/repos/${repoSlug()}/labels`, {
        method: 'POST',
        body: JSON.stringify({ name, color }),
    });
    if (res.ok) return;
    if (res.status === 422) return; // already exists
    const text = await res.text().catch(() => '');
    throw new Error(`GitHub ensureLabel ${res.status}: ${text.slice(0, 300)}`);
}

export async function createIssue({ title, body, labels }) {
    // Make sure every label exists before issue creation so none are silently dropped.
    // Fan out in parallel; ensureLabel is a no-op if the label already exists.
    if (Array.isArray(labels) && labels.length > 0) {
        await Promise.all(labels.map(l => ensureLabel(l, colorFor(l))));
    }
    const res = await gh(`/repos/${repoSlug()}/issues`, {
        method: 'POST',
        body: JSON.stringify({ title, body, labels }),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`GitHub createIssue ${res.status}: ${text.slice(0, 300)}`);
    }
    return res.json();
}

function colorFor(label) {
    // Stable hex colors keyed off label prefix. GitHub picks a random one if
    // we omit, but consistent palette makes the issue list readable.
    if (label.startsWith('ticket:')) return '5319e7';
    if (label === 'report:new') return '0e8a16';
    if (label.startsWith('report:bug')) return 'd73a4a';
    if (label.startsWith('report:issue')) return 'fbca04';
    if (label.startsWith('report:suggestion')) return '1d76db';
    if (label.startsWith('status:')) return 'c5def5';
    return 'cccccc';
}

// Find a single issue by its "ticket:STS-XXXXXX" label. Returns null if absent.
// Includes both open and closed issues since closed ones are still meaningful
// (e.g. a fix shipped, the submitter wants to see "completed").
export async function findIssueByTicket(ticket) {
    const label = encodeURIComponent(`ticket:${ticket}`);
    const res = await gh(
        `/repos/${repoSlug()}/issues?state=all&labels=${label}&per_page=1`,
    );
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`GitHub listIssues ${res.status}: ${text.slice(0, 300)}`);
    }
    const arr = await res.json();
    return Array.isArray(arr) && arr.length > 0 ? arr[0] : null;
}

export async function listComments(issueNumber) {
    const res = await gh(
        `/repos/${repoSlug()}/issues/${issueNumber}/comments?per_page=100`,
    );
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`GitHub listComments ${res.status}: ${text.slice(0, 300)}`);
    }
    return res.json();
}
