export default function handler(req, res) {
    res.status(200).json({ ok: true, commit: 'diag-v1', when: new Date().toISOString() });
}
