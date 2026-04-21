// Admin panel logic: list submissions, filter, paginate, edit status/tags/notes, delete.

import { API_BASE } from './config.js';
import { adminFetch, clearToken, getToken, authHeader } from './auth.js';

const PAGE_SIZE = 50;

const state = {
    items: [],
    total: 0,
    skip: 0,
    filters: { type: '', status: '', search: '' },
    currentDoc: null,
};

init();

async function init() {
    if (!getToken()) {
        window.location.href = 'login.html';
        return;
    }

    // Validate the token up front; redirects on 401 via adminFetch.
    try {
        const res = await fetch(API_BASE + '/api/auth/me', { headers: authHeader() });
        if (!res.ok) {
            clearToken();
            window.location.href = 'login.html';
            return;
        }
        const { user } = await res.json();
        document.getElementById('admin-user').textContent =
            `Signed in as ${user.email} (${user.role}). Session expires ${new Date(user.exp * 1000).toLocaleString()}.`;
    } catch {
        clearToken();
        window.location.href = 'login.html';
        return;
    }

    wireUi();
    await load();
}

function wireUi() {
    document.getElementById('logout-btn').addEventListener('click', () => {
        clearToken();
        window.location.href = 'login.html';
    });
    document.getElementById('refresh-btn').addEventListener('click', () => {
        state.filters.type = document.getElementById('filter-type').value;
        state.filters.status = document.getElementById('filter-status').value;
        state.filters.search = document.getElementById('filter-search').value;
        state.skip = 0;
        load();
    });
    document.getElementById('filter-search').addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
            state.filters.search = ev.currentTarget.value;
            state.skip = 0;
            load();
        }
    });
    document.getElementById('prev-btn').addEventListener('click', () => {
        state.skip = Math.max(0, state.skip - PAGE_SIZE);
        load();
    });
    document.getElementById('next-btn').addEventListener('click', () => {
        state.skip += PAGE_SIZE;
        load();
    });

    const dialog = document.getElementById('detail-dialog');
    document.getElementById('detail-close').addEventListener('click', () => dialog.close());
    document.getElementById('detail-save').addEventListener('click', saveCurrent);
    document.getElementById('detail-delete').addEventListener('click', deleteCurrent);
}

async function load() {
    const host = document.getElementById('submissions-table-host');
    host.innerHTML = '<p class="helptext">Loading…</p>';
    try {
        const res = await adminFetch('/api/admin/submissions', {
            query: {
                type: state.filters.type,
                status: state.filters.status,
                search: state.filters.search,
                limit: PAGE_SIZE,
                skip: state.skip,
            },
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            showNotice(err.error || `Failed to load (${res.status})`);
            host.innerHTML = '';
            return;
        }
        const data = await res.json();
        state.items = data.items;
        state.total = data.total;
        renderTable();
        renderPager();
    } catch (err) {
        // adminFetch redirects on 401; other errors land here.
        showNotice(err.message || 'Request failed');
    }
}

function renderTable() {
    const host = document.getElementById('submissions-table-host');
    const count = document.getElementById('result-count');
    count.textContent = state.total === 0
        ? 'No submissions match.'
        : `${state.total} total · showing ${state.items.length} starting at ${state.skip + 1}`;

    if (state.items.length === 0) {
        host.innerHTML = '';
        return;
    }

    const rows = state.items.map(doc => {
        const title = escapeHtml(submissionTitle(doc));
        const when = new Date(doc.submittedAt).toLocaleString();
        const kind = doc.subtype ? `${doc.type}:${doc.subtype}` : doc.type;
        const status = doc.status || 'new';
        return `<tr data-id="${doc._id}">
            <td><code>${kind}</code></td>
            <td>${title}</td>
            <td><span class="badge badge-${status}">${status}</span></td>
            <td>${when}</td>
            <td><button type="button" class="row-open">View / Edit</button></td>
        </tr>`;
    }).join('');

    host.innerHTML = `
        <div class="table-scroll">
            <table class="submissions-table">
                <thead>
                    <tr><th>Type</th><th>Title</th><th>Status</th><th>Submitted</th><th></th></tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;

    host.querySelectorAll('.row-open').forEach(btn => {
        btn.addEventListener('click', (ev) => {
            const tr = ev.currentTarget.closest('tr');
            const id = tr?.dataset.id;
            const doc = state.items.find(d => d._id === id);
            if (doc) openDetail(doc);
        });
    });
}

function submissionTitle(doc) {
    const p = doc.payload || {};
    return p.summary
        || p.cardName
        || p.relicName
        || p.potionName
        || p.powerName
        || '(no title)';
}

function renderPager() {
    const prev = document.getElementById('prev-btn');
    const next = document.getElementById('next-btn');
    const label = document.getElementById('page-label');
    const page = Math.floor(state.skip / PAGE_SIZE) + 1;
    const totalPages = Math.max(1, Math.ceil(state.total / PAGE_SIZE));
    label.textContent = `Page ${page} of ${totalPages}`;
    prev.disabled = state.skip === 0;
    next.disabled = state.skip + PAGE_SIZE >= state.total;
}

function openDetail(doc) {
    state.currentDoc = doc;
    document.getElementById('detail-title').textContent =
        submissionTitle(doc) + `  ·  ${doc.subtype ? `${doc.type}:${doc.subtype}` : doc.type}`;
    const meta = document.getElementById('detail-meta');
    const submitted = new Date(doc.submittedAt).toLocaleString();
    const updated = doc.updatedAt ? new Date(doc.updatedAt).toLocaleString() : '—';
    meta.innerHTML = `
        <dt>ID</dt><dd><code>${doc._id}</code></dd>
        <dt>Mod version</dt><dd>${escapeHtml(doc.modVersion || '—')}</dd>
        <dt>Submitted</dt><dd>${submitted}</dd>
        <dt>Last update</dt><dd>${updated}${doc.updatedBy ? ` by ${escapeHtml(doc.updatedBy)}` : ''}</dd>
        <dt>Source IP (hashed)</dt><dd><code>${escapeHtml(doc.sourceIp || '—')}</code></dd>
    `;
    document.getElementById('detail-notes').value = doc.notes || '';
    document.getElementById('detail-tags').value = (doc.tags || []).join(', ');
    document.getElementById('detail-status').value = doc.status || 'new';
    document.getElementById('detail-payload').textContent = JSON.stringify(doc.payload || {}, null, 2);

    const dialog = document.getElementById('detail-dialog');
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
}

async function saveCurrent() {
    const doc = state.currentDoc;
    if (!doc) return;
    const body = {
        status: document.getElementById('detail-status').value,
        notes: document.getElementById('detail-notes').value,
        tags: document.getElementById('detail-tags').value
            .split(',').map(s => s.trim()).filter(Boolean),
    };
    const res = await adminFetch('/api/admin/submissions', {
        method: 'PATCH',
        query: { id: doc._id },
        body,
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showNotice(err.error || `Save failed (${res.status})`);
        return;
    }
    document.getElementById('detail-dialog').close();
    await load();
}

async function deleteCurrent() {
    const doc = state.currentDoc;
    if (!doc) return;
    const title = submissionTitle(doc);
    if (!confirm(`Delete "${title}"? This can't be undone.`)) return;
    const res = await adminFetch('/api/admin/submissions', {
        method: 'DELETE',
        query: { id: doc._id },
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showNotice(err.error || `Delete failed (${res.status})`);
        return;
    }
    document.getElementById('detail-dialog').close();
    await load();
}

function showNotice(msg) {
    const host = document.getElementById('admin-notice');
    host.className = 'notice';
    host.textContent = msg;
    host.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}
