// Kanban admin panel. Fetches columns + submissions in parallel, buckets
// cards by status slug (any unknown slug falls back to "new" for display),
// renders each column, and wires HTML5 drag-and-drop to move cards between
// columns. Mobile users who can't drag still have the status dropdown in
// the card detail modal.

import { API_BASE } from './config.js';
import { adminFetch, clearToken, getToken, authHeader } from './auth.js';

const state = {
    columns: [],          // sorted by order asc
    items: [],            // all submissions
    byStatus: new Map(),  // slug → array of items (oldest first)
    currentCard: null,
    currentColumn: null,
    dialogMode: null,     // 'add' | 'rename'
};

init();

async function init() {
    if (!getToken()) {
        window.location.href = 'login.html';
        return;
    }

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

    wireHeader();
    wireDetailDialog();
    wireColumnDialog();
    wireDeleteColumnDialog();
    wireReleaseDialog();
    await reload();
}

// ────────────────────────────────────────────────────────────────────
// Data fetching
// ────────────────────────────────────────────────────────────────────

async function reload() {
    try {
        const [colsRes, subsRes] = await Promise.all([
            adminFetch('/api/admin/columns'),
            adminFetch('/api/admin/submissions', { query: { limit: 500 } }),
        ]);
        if (!colsRes.ok || !subsRes.ok) {
            const err = await (colsRes.ok ? subsRes : colsRes).json().catch(() => ({}));
            showNotice(err.error || 'Failed to load board');
            return;
        }
        const colsData = await colsRes.json();
        const subsData = await subsRes.json();
        state.columns = colsData.columns;
        state.items = subsData.items;
        rebuildBuckets();
        renderBoard();
    } catch (err) {
        showNotice(err.message || 'Load failed');
    }
}

function rebuildBuckets() {
    const known = new Set(state.columns.map(c => c.slug));
    state.byStatus = new Map();
    for (const col of state.columns) state.byStatus.set(col.slug, []);
    for (const item of state.items) {
        // Fall back to "new" for unknown statuses so cards don't disappear.
        const slug = known.has(item.status) ? item.status : 'new';
        if (!state.byStatus.has(slug)) state.byStatus.set(slug, []);
        state.byStatus.get(slug).push(item);
    }
    // Oldest first within each bucket.
    for (const list of state.byStatus.values()) {
        list.sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt));
    }
}

// ────────────────────────────────────────────────────────────────────
// Rendering
// ────────────────────────────────────────────────────────────────────

function renderBoard() {
    const host = document.getElementById('kanban');
    if (state.columns.length === 0) {
        host.innerHTML = '<p class="helptext" style="padding:2rem 1.25rem">No columns yet. Click "+ Add column" above to get started.</p>';
        return;
    }

    host.innerHTML = '';
    for (const col of state.columns) {
        host.appendChild(renderColumn(col));
    }
}

function renderColumn(col) {
    const items = state.byStatus.get(col.slug) || [];
    const tpl = document.createElement('section');
    tpl.className = 'kanban-column';
    if (col.deleteOnRelease) tpl.classList.add('kanban-column-danger');
    tpl.dataset.slug = col.slug;
    tpl.dataset.id = col._id;

    tpl.innerHTML = `
        <header class="kanban-column-header">
            <div class="kanban-column-title">
                <span class="kanban-column-name"></span>
                <span class="kanban-column-count">${items.length}</span>
                ${col.deleteOnRelease ? '<span class="kanban-column-flag" title="Deleted on next release">⚠</span>' : ''}
            </div>
            <div class="kanban-column-menu">
                <button type="button" class="ghost menu-btn" aria-label="Column menu">⋯</button>
                <div class="menu-popover" hidden>
                    <button type="button" data-action="rename">Rename</button>
                    <button type="button" data-action="toggle-release">${col.deleteOnRelease ? 'Unmark' : 'Mark'} delete-on-release</button>
                    <button type="button" data-action="move-left">Move left</button>
                    <button type="button" data-action="move-right">Move right</button>
                    <button type="button" data-action="delete" class="menu-danger">Delete column…</button>
                </div>
            </div>
        </header>
        <div class="kanban-cards" data-drop-zone></div>
    `;
    tpl.querySelector('.kanban-column-name').textContent = col.name;

    const cardHost = tpl.querySelector('.kanban-cards');
    for (const item of items) cardHost.appendChild(renderCard(item));

    // Menu
    const menuBtn = tpl.querySelector('.menu-btn');
    const popover = tpl.querySelector('.menu-popover');
    menuBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        closeAllMenus(popover);
        popover.hidden = !popover.hidden;
    });
    popover.addEventListener('click', (ev) => {
        const action = ev.target?.dataset?.action;
        if (!action) return;
        popover.hidden = true;
        handleColumnAction(col, action);
    });

    // Drag-and-drop drop zone
    wireDropZone(cardHost, col.slug);

    return tpl;
}

function renderCard(item) {
    const card = document.createElement('article');
    card.className = 'kanban-card';
    card.draggable = true;
    card.dataset.id = item._id;

    const kind = item.subtype ? `${item.type}:${item.subtype}` : item.type;
    const title = submissionTitle(item);
    const when = new Date(item.submittedAt).toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
    });

    card.innerHTML = `
        <div class="kanban-card-kind">
            <code class="kanban-card-type"></code>
            ${item.ticket ? `<code class="kanban-card-ticket"></code>` : ''}
        </div>
        <div class="kanban-card-title"></div>
        <div class="kanban-card-foot">
            <span class="kanban-card-date"></span>
            ${(item.tags && item.tags.length) ? `<span class="kanban-card-tags"></span>` : ''}
        </div>
    `;
    card.querySelector('.kanban-card-type').textContent = kind;
    const ticketEl = card.querySelector('.kanban-card-ticket');
    if (ticketEl) ticketEl.textContent = item.ticket;
    card.querySelector('.kanban-card-title').textContent = title;
    card.querySelector('.kanban-card-date').textContent = when;
    const tagEl = card.querySelector('.kanban-card-tags');
    if (tagEl) tagEl.textContent = item.tags.join(' · ');

    card.addEventListener('dragstart', (ev) => {
        ev.dataTransfer.setData('text/plain', item._id);
        ev.dataTransfer.effectAllowed = 'move';
        card.classList.add('dragging');
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
    card.addEventListener('click', () => openDetail(item));

    return card;
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

function wireDropZone(el, slug) {
    let depth = 0; // dragenter/dragleave fire for children too; track nesting

    el.addEventListener('dragover', (ev) => {
        ev.preventDefault();
        ev.dataTransfer.dropEffect = 'move';
    });
    el.addEventListener('dragenter', (ev) => {
        ev.preventDefault();
        depth++;
        el.classList.add('drop-target');
    });
    el.addEventListener('dragleave', () => {
        depth = Math.max(0, depth - 1);
        if (depth === 0) el.classList.remove('drop-target');
    });
    el.addEventListener('drop', async (ev) => {
        ev.preventDefault();
        depth = 0;
        el.classList.remove('drop-target');
        const id = ev.dataTransfer.getData('text/plain');
        if (!id) return;
        const item = state.items.find(d => d._id === id);
        if (!item || item.status === slug) return;
        await moveCard(item, slug);
    });
}

async function moveCard(item, newSlug) {
    const prev = item.status;
    item.status = newSlug;
    rebuildBuckets();
    renderBoard();

    const res = await adminFetch('/api/admin/submissions', {
        method: 'PATCH',
        query: { id: item._id },
        body: { status: newSlug },
    });
    if (!res.ok) {
        item.status = prev;
        rebuildBuckets();
        renderBoard();
        const err = await res.json().catch(() => ({}));
        showNotice(err.error || `Could not move card (${res.status})`);
    }
}

function closeAllMenus(except = null) {
    document.querySelectorAll('.menu-popover').forEach(p => {
        if (p !== except) p.hidden = true;
    });
}
document.addEventListener('click', () => closeAllMenus());

// ────────────────────────────────────────────────────────────────────
// Column actions
// ────────────────────────────────────────────────────────────────────

async function handleColumnAction(col, action) {
    switch (action) {
        case 'rename':
            openColumnDialog('rename', col);
            break;
        case 'toggle-release':
            await patchColumn(col, { deleteOnRelease: !col.deleteOnRelease });
            break;
        case 'move-left':
            await swapColumns(col, -1);
            break;
        case 'move-right':
            await swapColumns(col, +1);
            break;
        case 'delete':
            openDeleteColumnDialog(col);
            break;
    }
}

async function patchColumn(col, body) {
    const res = await adminFetch('/api/admin/columns', {
        method: 'PATCH',
        query: { id: col._id },
        body,
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showNotice(err.error || `Update failed (${res.status})`);
        return;
    }
    await reload();
}

async function swapColumns(col, delta) {
    const idx = state.columns.findIndex(c => c._id === col._id);
    const neighbor = state.columns[idx + delta];
    if (!neighbor) return;
    await Promise.all([
        adminFetch('/api/admin/columns', {
            method: 'PATCH',
            query: { id: col._id },
            body: { order: neighbor.order },
        }),
        adminFetch('/api/admin/columns', {
            method: 'PATCH',
            query: { id: neighbor._id },
            body: { order: col.order },
        }),
    ]);
    await reload();
}

// ────────────────────────────────────────────────────────────────────
// Header buttons
// ────────────────────────────────────────────────────────────────────

function wireHeader() {
    document.getElementById('logout-btn').addEventListener('click', () => {
        clearToken();
        window.location.href = 'login.html';
    });
    document.getElementById('add-column-btn').addEventListener('click', () => {
        openColumnDialog('add', null);
    });
    document.getElementById('release-btn').addEventListener('click', openReleaseDialog);
}

// ────────────────────────────────────────────────────────────────────
// Detail dialog (card edit)
// ────────────────────────────────────────────────────────────────────

function wireDetailDialog() {
    document.getElementById('detail-close').addEventListener('click', () =>
        document.getElementById('detail-dialog').close());
    document.getElementById('detail-save').addEventListener('click', saveCurrent);
    document.getElementById('detail-delete').addEventListener('click', deleteCurrent);
}

function openDetail(item) {
    state.currentCard = item;
    document.getElementById('detail-title').textContent =
        submissionTitle(item) + `  ·  ${item.subtype ? `${item.type}:${item.subtype}` : item.type}`;
    const meta = document.getElementById('detail-meta');
    const submitted = new Date(item.submittedAt).toLocaleString();
    const updated = item.updatedAt ? new Date(item.updatedAt).toLocaleString() : '—';
    meta.innerHTML = `
        <dt>Ticket</dt><dd><code>${escapeHtml(item.ticket || '—')}</code></dd>
        <dt>ID</dt><dd><code>${escapeHtml(item._id)}</code></dd>
        <dt>Mod version</dt><dd>${escapeHtml(item.modVersion || '—')}</dd>
        <dt>Steam username</dt><dd>${escapeHtml(item.steamName || '—')}</dd>
        <dt>Submitted</dt><dd>${escapeHtml(submitted)}</dd>
        <dt>Last update</dt><dd>${escapeHtml(updated)}${item.updatedBy ? ` by ${escapeHtml(item.updatedBy)}` : ''}</dd>
        <dt>Source IP (hashed)</dt><dd><code>${escapeHtml(item.sourceIp || '—')}</code></dd>
    `;
    document.getElementById('detail-notes').value = item.notes || '';
    document.getElementById('detail-tags').value = (item.tags || []).join(', ');

    const statusSel = document.getElementById('detail-status');
    statusSel.innerHTML = state.columns
        .map(c => `<option value="${escapeHtml(c.slug)}">${escapeHtml(c.name)}</option>`)
        .join('');
    const known = state.columns.some(c => c.slug === item.status);
    statusSel.value = known ? item.status : 'new';

    document.getElementById('detail-payload').textContent = JSON.stringify(item.payload || {}, null, 2);

    const dialog = document.getElementById('detail-dialog');
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
}

async function saveCurrent() {
    const item = state.currentCard;
    if (!item) return;
    const body = {
        status: document.getElementById('detail-status').value,
        notes: document.getElementById('detail-notes').value,
        tags: document.getElementById('detail-tags').value
            .split(',').map(s => s.trim()).filter(Boolean),
    };
    const res = await adminFetch('/api/admin/submissions', {
        method: 'PATCH',
        query: { id: item._id },
        body,
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showNotice(err.error || `Save failed (${res.status})`);
        return;
    }
    document.getElementById('detail-dialog').close();
    await reload();
}

async function deleteCurrent() {
    const item = state.currentCard;
    if (!item) return;
    if (!confirm(`Delete "${submissionTitle(item)}"? This can't be undone.`)) return;
    const res = await adminFetch('/api/admin/submissions', {
        method: 'DELETE',
        query: { id: item._id },
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showNotice(err.error || `Delete failed (${res.status})`);
        return;
    }
    document.getElementById('detail-dialog').close();
    await reload();
}

// ────────────────────────────────────────────────────────────────────
// Column add / rename dialog
// ────────────────────────────────────────────────────────────────────

function wireColumnDialog() {
    const dialog = document.getElementById('column-dialog');
    dialog.querySelectorAll('.column-dialog-close').forEach(btn =>
        btn.addEventListener('click', () => dialog.close()));
    document.getElementById('column-save').addEventListener('click', saveColumnDialog);
}

function openColumnDialog(mode, col) {
    state.dialogMode = mode;
    state.currentColumn = col;
    document.getElementById('column-dialog-title').textContent = mode === 'add' ? 'Add column' : 'Rename column';
    document.getElementById('column-name').value = col ? col.name : '';
    const flag = document.getElementById('column-delete-on-release');
    flag.checked = col ? !!col.deleteOnRelease : false;
    flag.parentElement.hidden = mode === 'rename';
    const dialog = document.getElementById('column-dialog');
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    setTimeout(() => document.getElementById('column-name').focus(), 50);
}

async function saveColumnDialog() {
    const name = document.getElementById('column-name').value.trim();
    if (!name) {
        showNotice('Name is required');
        return;
    }
    if (state.dialogMode === 'add') {
        const deleteOnRelease = document.getElementById('column-delete-on-release').checked;
        const res = await adminFetch('/api/admin/columns', {
            method: 'POST',
            body: { name, deleteOnRelease },
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            showNotice(err.error || `Create failed (${res.status})`);
            return;
        }
    } else {
        const res = await adminFetch('/api/admin/columns', {
            method: 'PATCH',
            query: { id: state.currentColumn._id },
            body: { name },
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            showNotice(err.error || `Rename failed (${res.status})`);
            return;
        }
    }
    document.getElementById('column-dialog').close();
    await reload();
}

// ────────────────────────────────────────────────────────────────────
// Delete column with reassignment
// ────────────────────────────────────────────────────────────────────

function wireDeleteColumnDialog() {
    const dialog = document.getElementById('delete-column-dialog');
    dialog.querySelectorAll('.delete-column-close').forEach(btn =>
        btn.addEventListener('click', () => dialog.close()));
    document.getElementById('delete-column-confirm').addEventListener('click', confirmDeleteColumn);
}

function openDeleteColumnDialog(col) {
    state.currentColumn = col;
    const count = (state.byStatus.get(col.slug) || []).length;
    const wrap = document.getElementById('reassign-wrapper');
    const msg = document.getElementById('delete-column-msg');

    if (count === 0) {
        msg.textContent = `Delete "${col.name}"? It has no cards.`;
        wrap.hidden = true;
    } else {
        msg.textContent = `"${col.name}" has ${count} card${count === 1 ? '' : 's'}. Pick a column to move them to, then delete.`;
        wrap.hidden = false;
        const select = document.getElementById('delete-reassign');
        select.innerHTML = state.columns
            .filter(c => c.slug !== col.slug)
            .map(c => `<option value="${escapeHtml(c.slug)}">${escapeHtml(c.name)}</option>`)
            .join('');
    }

    const dialog = document.getElementById('delete-column-dialog');
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
}

async function confirmDeleteColumn() {
    const col = state.currentColumn;
    if (!col) return;
    const count = (state.byStatus.get(col.slug) || []).length;
    const query = { id: col._id };
    if (count > 0) {
        query.reassignTo = document.getElementById('delete-reassign').value;
    }
    const res = await adminFetch('/api/admin/columns', {
        method: 'DELETE',
        query,
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showNotice(err.error || `Delete failed (${res.status})`);
        return;
    }
    document.getElementById('delete-column-dialog').close();
    await reload();
}

// ────────────────────────────────────────────────────────────────────
// Release (push-to-public)
// ────────────────────────────────────────────────────────────────────

function wireReleaseDialog() {
    const dialog = document.getElementById('release-dialog');
    dialog.querySelectorAll('.release-dialog-close').forEach(btn =>
        btn.addEventListener('click', () => dialog.close()));
    document.getElementById('release-confirm').addEventListener('click', confirmRelease);
}

async function openReleaseDialog() {
    const dialog = document.getElementById('release-dialog');
    const msg = document.getElementById('release-msg');
    const confirmBtn = document.getElementById('release-confirm');
    msg.textContent = 'Checking…';
    confirmBtn.disabled = true;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');

    const res = await adminFetch('/api/admin/release', {
        method: 'POST',
        query: { dryRun: 'true' },
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        msg.textContent = err.error || `Could not preview (${res.status})`;
        return;
    }
    const data = await res.json();
    if (!data.columns || data.columns.length === 0) {
        msg.textContent = 'No columns are marked "delete on release". Nothing to do.';
        return;
    }
    if (!data.count) {
        msg.textContent = `No cards currently in: ${data.columns.join(', ')}.`;
        return;
    }
    msg.innerHTML = `This will permanently delete <strong>${data.count}</strong> submission${data.count === 1 ? '' : 's'} from: <strong>${escapeHtml(data.columns.join(', '))}</strong>. This cannot be undone.`;
    confirmBtn.disabled = false;
}

async function confirmRelease() {
    const res = await adminFetch('/api/admin/release', { method: 'POST' });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showNotice(err.error || `Release failed (${res.status})`);
        return;
    }
    const data = await res.json();
    document.getElementById('release-dialog').close();
    showNotice(`Deleted ${data.deleted} submission${data.deleted === 1 ? '' : 's'}.`, 'success');
    await reload();
}

// ────────────────────────────────────────────────────────────────────
// Utilities
// ────────────────────────────────────────────────────────────────────

function showNotice(msg, kind = 'error') {
    const host = document.getElementById('admin-notice');
    host.className = kind === 'success' ? 'notice success' : 'notice';
    host.textContent = msg;
    host.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (kind === 'success') {
        setTimeout(() => { host.textContent = ''; host.className = ''; }, 4000);
    }
}

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}
