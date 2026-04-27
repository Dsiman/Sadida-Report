// Shared submission helper used by every form page.
//
// Each per-form script imports `submitForm` and `renderErrors`, and calls
// `attachFormHandler(form, buildPayload, validate)` once on load. This keeps
// each form's file focused on its own field layout and validation rules.

import { API_BASE } from './config.js';

/** Minimum client-side guards, mirrored by the Ajv server-side schemas. */
export const rules = {
    required: (v) => v !== undefined && v !== null && String(v).trim().length > 0,
    maxLen: (v, n) => v == null || String(v).length <= n,
    minLen: (v, n) => v != null && String(v).length >= n,
    int: (v, min, max) => {
        if (v === '' || v == null) return false;
        const n = Number(v);
        return Number.isInteger(n) && n >= min && n <= max;
    },
    versionish: (v) => /^v?\d+\.\d+\.\d+$/.test(String(v || '')),
};

/**
 * Wires a form's submit event. Calls `buildPayload()` to serialize the
 * form-specific fields into a JSON-ready object (minus `type`/`subtype`/`modVersion`
 * which we fill here); calls `validate(payload)` returning an array of errors.
 */
export function attachFormHandler({
    form,
    type,
    subtype = null,
    buildPayload,
    validate,
}) {
    const errorHost = form.querySelector('[data-error-host]');
    const submitButton = form.querySelector('button[type="submit"]');
    const modVersionInput = form.querySelector('[name="modVersion"]');

    form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        clearNotice(errorHost);

        // Browser-native required/pattern check first — focuses the first
        // missing field and shows the standard tooltip ("Please fill out this
        // field"). Forms still use novalidate so this only fires on submit,
        // not on every blur.
        if (!form.reportValidity()) return;

        const payload = buildPayload();
        const errors = validate(payload);
        if (errors.length > 0) {
            showErrors(errorHost, errors);
            return;
        }

        submitButton.disabled = true;
        const prevLabel = submitButton.textContent;
        submitButton.textContent = 'Submitting…';

        try {
            const body = {
                type,
                ...(subtype ? { subtype } : {}),
                modVersion: modVersionInput ? modVersionInput.value.trim() : undefined,
                ...payload,
            };
            const res = await fetch(`${API_BASE}/api/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (res.ok) {
                const data = await safeJson(res);
                const ticket = data && data.ticket;
                if (ticket) {
                    saveToLocalHistory({
                        ticket,
                        type,
                        subtype,
                        title: firstTitleField(payload),
                        submittedAt: new Date().toISOString(),
                    });
                }
                // Redirect to a generic thank-you page; include the ticket in
                // the URL so thanks.html can show it with a copy button.
                const base = resolveFromCurrent('thanks.html');
                window.location.href = ticket ? `${base}?t=${encodeURIComponent(ticket)}` : base;
                return;
            }
            const data = await safeJson(res);
            if (res.status === 400 && data?.errors) {
                showErrors(errorHost, data.errors.map(e => ({
                    field: e.field || '(payload)',
                    message: e.message || 'invalid',
                })));
            } else if (res.status === 429) {
                showNotice(errorHost, 'You\'re sending too many submissions — wait an hour and try again.');
            } else if (res.status === 413) {
                showNotice(errorHost, 'Submission is too large. Trim the log or description and try again.');
            } else {
                showNotice(errorHost, `Server error (${res.status}). Try again in a few minutes.`);
            }
        } catch (err) {
            console.error('submit failed:', err);
            showNotice(errorHost, 'Couldn\'t reach the server. Check your connection and try again.');
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = prevLabel;
        }
    });
}

/** Renders a bulleted list of {field,message} errors in the form's notice region. */
export function showErrors(host, errors) {
    if (!host) return;
    host.className = 'notice';
    host.innerHTML = '';
    const p = document.createElement('p');
    p.textContent = 'Please fix the highlighted fields:';
    host.appendChild(p);
    const ul = document.createElement('ul');
    for (const e of errors) {
        const li = document.createElement('li');
        li.textContent = `${e.field}: ${e.message}`;
        ul.appendChild(li);
    }
    host.appendChild(ul);
    host.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

export function showNotice(host, text, kind = 'error') {
    if (!host) return;
    host.className = kind === 'success' ? 'notice success' : 'notice';
    host.textContent = text;
    host.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

export function clearNotice(host) {
    if (!host) return;
    host.className = '';
    host.textContent = '';
}

function resolveFromCurrent(rel) {
    // Handle both `/bug.html` and `/suggest/card.html` correctly.
    const parts = window.location.pathname.split('/');
    parts.pop();
    return parts.join('/') + '/' + rel.replace(/^\.\//, '');
}

async function safeJson(res) {
    try { return await res.json(); } catch { return null; }
}

// ────────────────────────────────────────────────────────────────
// Local ticket history — stored in localStorage, keeps the last 20.
// ────────────────────────────────────────────────────────────────

const HISTORY_KEY = 'sadida-report.my-tickets';
const HISTORY_MAX = 20;

export function readLocalHistory() {
    try {
        const raw = localStorage.getItem(HISTORY_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function saveToLocalHistory(entry) {
    try {
        const list = readLocalHistory().filter(e => e.ticket !== entry.ticket);
        list.unshift(entry);
        if (list.length > HISTORY_MAX) list.length = HISTORY_MAX;
        localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
    } catch {
        // localStorage can fail (quota, privacy mode). We don't block on it.
    }
}

function firstTitleField(payload) {
    return payload.summary
        || payload.cardName
        || payload.relicName
        || payload.potionName
        || payload.powerName
        || '(no title)';
}
