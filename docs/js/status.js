// Status-lookup page: looks up a ticket by its public code and shows
// a read-only view, including the maintainer comment thread that was
// posted on the underlying GitHub issue. Also renders the submitter's
// local history (from localStorage).

import { API_BASE } from './config.js';
import { readLocalHistory } from './submit.js';

const TICKET_RE = /^STS-[A-Z2-9]{6}$/;

init();

function init() {
    const form = document.getElementById('lookup-form');
    const input = document.getElementById('ticket-input');

    form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        doLookup(input.value);
    });

    // Normalize input as the user types: uppercase, auto-prefix STS- if missing,
    // auto-insert hyphen after STS so STS<code> is a valid shape.
    input.addEventListener('input', () => {
        let v = input.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
        if (v.length >= 3 && v.startsWith('STS') && v[3] !== '-') {
            v = 'STS-' + v.slice(3);
        }
        input.value = v.slice(0, 10);
    });

    const params = new URLSearchParams(location.search);
    const t = (params.get('t') || '').toUpperCase();
    if (TICKET_RE.test(t)) {
        input.value = t;
        doLookup(t);
    }

    renderHistory();
}

async function doLookup(raw) {
    const result = document.getElementById('lookup-result');
    result.hidden = false;
    const ticket = String(raw || '').trim().toUpperCase();
    if (!TICKET_RE.test(ticket)) {
        result.innerHTML = notice('error', 'That doesn\'t look like a ticket code. Expected format: STS-XXXXXX (six letters or digits).');
        return;
    }
    result.innerHTML = '<p class="helptext">Looking up…</p>';

    try {
        const res = await fetch(`${API_BASE}/api/ticket?ticket=${encodeURIComponent(ticket)}`);
        if (res.status === 404) {
            result.innerHTML = notice('error', `No ticket matches <code>${escapeHtml(ticket)}</code>. Check for typos — letters like O/0 and I/1/L aren't used, so you can rule those out.`);
            return;
        }
        if (!res.ok) {
            const body = await safeJson(res);
            result.innerHTML = notice('error', body?.error || `Lookup failed (${res.status}).`);
            return;
        }
        const data = await res.json();
        result.innerHTML = renderTicket(data);
    } catch {
        result.innerHTML = notice('error', 'Couldn\'t reach the server. Check your connection and try again.');
    }
}

function renderTicket(t) {
    const kind = t.subtype ? `${t.type}:${t.subtype}` : (t.type || 'report');
    const submitted = t.submittedAt ? new Date(t.submittedAt).toLocaleString() : '—';
    const updated = t.updatedAt ? new Date(t.updatedAt).toLocaleString() : null;
    const title = t.title || '(no title)';
    const status = t.status || 'new';

    return `
        <article class="ticket-detail">
            <div class="ticket-detail-header">
                <code class="ticket-code">${escapeHtml(t.ticket)}</code>
                <span class="badge badge-${escapeHtml(status)}">${escapeHtml(prettyStatus(status))}</span>
            </div>
            <h3>${escapeHtml(title)}</h3>
            <dl class="ticket-detail-meta">
                <dt>Type</dt><dd><code>${escapeHtml(kind)}</code></dd>
                <dt>Mod version</dt><dd>${escapeHtml(t.modVersion || '—')}</dd>
                <dt>Submitted</dt><dd>${escapeHtml(submitted)}</dd>
                ${updated ? `<dt>Last update</dt><dd>${escapeHtml(updated)}</dd>` : ''}
            </dl>
            ${renderComments(t.comments)}
            <p class="helptext">If the state hasn't changed in a while and this is blocking you, drop a line in the Sadida Discord with your ticket code.</p>
        </article>`;
}

function renderComments(comments) {
    if (!Array.isArray(comments) || comments.length === 0) {
        return `
            <section class="ticket-comments">
                <h4>Replies from the maintainer</h4>
                <p class="helptext">No replies yet. Check back later — comments left on this ticket will appear here.</p>
            </section>`;
    }
    const items = comments.map(c => `
        <article class="ticket-comment">
            <header class="ticket-comment-head">
                <strong>${escapeHtml(c.author || 'maintainer')}</strong>
                <span class="ticket-comment-date">${escapeHtml(formatDate(c.createdAt))}</span>
            </header>
            <div class="ticket-comment-body">${renderMarkdownLite(c.body || '')}</div>
        </article>
    `).join('');
    return `
        <section class="ticket-comments">
            <h4>Replies from the maintainer</h4>
            ${items}
        </section>`;
}

// Tiny, safe Markdown rendering: escape HTML first, then apply a few inline
// transforms (code, bold, italics, links, paragraph breaks). Anything not
// covered shows as plain text — better than letting raw HTML through.
function renderMarkdownLite(src) {
    const escaped = escapeHtml(src);
    const withCode = escaped.replace(/`([^`\n]+)`/g, (_, c) => `<code>${c}</code>`);
    const withBold = withCode.replace(/\*\*([^*\n]+)\*\*/g, (_, c) => `<strong>${c}</strong>`);
    const withItalics = withBold.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, (m, pre, c) => `${pre}<em>${c}</em>`);
    const withLinks = withItalics.replace(
        /\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g,
        (_, text, url) => `<a href="${url}" rel="noopener noreferrer" target="_blank">${text}</a>`,
    );
    const paragraphs = withLinks.split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`);
    return paragraphs.join('');
}

function renderHistory() {
    const section = document.getElementById('history-section');
    const list = document.getElementById('history-list');
    const entries = readLocalHistory();
    if (entries.length === 0) {
        section.hidden = true;
        return;
    }
    section.hidden = false;
    list.innerHTML = entries.map(e => {
        const kind = e.subtype ? `${e.type}:${e.subtype}` : e.type;
        const when = e.submittedAt ? new Date(e.submittedAt).toLocaleDateString() : '';
        return `<li>
            <button type="button" class="history-row" data-ticket="${escapeHtml(e.ticket)}">
                <code>${escapeHtml(e.ticket)}</code>
                <span class="history-title">${escapeHtml(e.title || '(no title)')}</span>
                <span class="history-meta">${escapeHtml(kind)} · ${escapeHtml(when)}</span>
            </button>
        </li>`;
    }).join('');
    list.querySelectorAll('.history-row').forEach(btn => {
        btn.addEventListener('click', () => {
            const t = btn.dataset.ticket;
            document.getElementById('ticket-input').value = t;
            doLookup(t);
        });
    });
}

function prettyStatus(slug) {
    return String(slug).split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
}

function formatDate(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function notice(kind, html) {
    return `<div class="notice${kind === 'success' ? ' success' : ''}">${html}</div>`;
}

async function safeJson(res) { try { return await res.json(); } catch { return null; } }

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}
