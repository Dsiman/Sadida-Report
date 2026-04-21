// Shared auth helpers + wiring for login.html.
// Stores the JWT in localStorage under a namespaced key; cleared on logout
// or on any 401 from the admin endpoints.

import { API_BASE } from './config.js';

const TOKEN_KEY = 'sadida-report.admin-token';

export function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
}
export function authHeader() {
    const t = getToken();
    return t ? { Authorization: 'Bearer ' + t } : {};
}

export async function adminFetch(path, { method = 'GET', body = null, query = null } = {}) {
    const url = new URL(API_BASE + path);
    if (query) for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    }
    const init = {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...authHeader(),
        },
    };
    if (body !== null) init.body = JSON.stringify(body);
    const res = await fetch(url, init);
    if (res.status === 401) {
        clearToken();
        window.location.href = 'login.html';
        throw new Error('session expired');
    }
    return res;
}

// Only wire up the forms when we're actually on the login page.
if (document.getElementById('login-form')) initLoginPage();

function initLoginPage() {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const tabLogin = document.getElementById('tab-login');
    const tabRegister = document.getElementById('tab-register');

    // If already signed in, don't make the user re-log.
    if (getToken()) {
        window.location.href = 'admin.html';
        return;
    }

    tabLogin.addEventListener('click', () => showTab('login'));
    tabRegister.addEventListener('click', () => showTab('register'));

    function showTab(which) {
        const on = which === 'login';
        tabLogin.classList.toggle('active', on);
        tabLogin.setAttribute('aria-selected', on);
        tabRegister.classList.toggle('active', !on);
        tabRegister.setAttribute('aria-selected', !on);
        loginForm.hidden = !on;
        registerForm.hidden = on;
    }

    loginForm.addEventListener('submit', (ev) => handleSubmit(ev, loginForm, '/api/auth/login'));
    registerForm.addEventListener('submit', (ev) => {
        const data = new FormData(registerForm);
        if (data.get('password') !== data.get('confirmPassword')) {
            showError(registerForm, 'passwords do not match');
            ev.preventDefault();
            return;
        }
        handleSubmit(ev, registerForm, '/api/auth/register');
    });
}

async function handleSubmit(ev, form, path) {
    ev.preventDefault();
    const host = form.querySelector('[data-error-host]');
    host.textContent = '';
    host.className = '';

    const data = new FormData(form);
    const payload = {
        email: String(data.get('email') || '').trim(),
        password: String(data.get('password') || ''),
    };
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    const prev = btn.textContent;
    btn.textContent = 'Working…';

    try {
        const res = await fetch(API_BASE + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const parsed = await safeJson(res);
        if (res.ok && parsed && parsed.token) {
            setToken(parsed.token);
            window.location.href = 'admin.html';
            return;
        }
        const msg = (parsed && parsed.error) || `Request failed (${res.status})`;
        showError(form, msg);
    } catch (err) {
        showError(form, 'Could not reach the server. Check your connection and try again.');
    } finally {
        btn.disabled = false;
        btn.textContent = prev;
    }
}

function showError(form, msg) {
    const host = form.querySelector('[data-error-host]');
    host.className = 'notice';
    host.textContent = msg;
    host.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function safeJson(res) {
    try { return await res.json(); } catch { return null; }
}
