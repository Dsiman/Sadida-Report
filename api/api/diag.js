// Diagnostic endpoint: tries each of submit.js's imports one at a time,
// reports which one fails (if any) and with what error message.
// No secrets leak because we never touch env vars or network I/O.

export default async function handler(req, res) {
    const results = [];
    const tryStep = async (name, fn) => {
        try {
            const value = await fn();
            results.push({ step: name, ok: true, kind: typeof value });
        } catch (err) {
            results.push({ step: name, ok: false, error: String(err && err.stack ? err.stack : err) });
        }
    };

    await tryStep('import mongodb', async () => {
        const m = await import('mongodb');
        return m.MongoClient;
    });
    await tryStep('import ajv', async () => {
        const m = await import('ajv');
        return m.default;
    });
    await tryStep('import ajv-formats', async () => {
        const m = await import('ajv-formats');
        return m.default;
    });
    await tryStep('new Ajv()', async () => {
        const Ajv = (await import('ajv')).default;
        return new Ajv({ allErrors: true });
    });
    await tryStep('addFormats(ajv)', async () => {
        const Ajv = (await import('ajv')).default;
        const addFormats = (await import('ajv-formats')).default;
        const ajv = new Ajv({ allErrors: true });
        const result = addFormats(ajv);
        return result;
    });
    await tryStep('createRequire schema', async () => {
        const { createRequire } = await import('module');
        const require = createRequire(import.meta.url);
        return require('./schemas/bug.json');
    });

    res.status(200).json({ results });
}
