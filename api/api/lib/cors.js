// ALLOWED_ORIGIN may be a single origin ("https://user.github.io") or a
// comma-separated list ("https://user.github.io,https://report.example.com").
// We echo back the request's Origin only if it appears in the allowlist;
// that keeps the response cacheable per origin and avoids the common
// mistake of replying with a literal "*" to a credentialed request.
export function cors(req, res) {
    const raw = process.env.ALLOWED_ORIGIN || '';
    const allowed = raw.split(',').map(s => s.trim()).filter(Boolean);
    const origin = (req && req.headers && req.headers.origin) || '';

    if (origin && allowed.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
    } else if (allowed.length === 1) {
        // Preserves the previous single-origin behavior for non-browser
        // callers (curl, PowerShell) that don't send an Origin header.
        res.setHeader('Access-Control-Allow-Origin', allowed[0]);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '600');
}
