import { attachFormHandler, rules } from '../submit.js';

const form = document.getElementById('bug-form');
const logTextarea = form.elements.consoleLog;
const logFile = document.getElementById('log-file');
const logStatus = document.getElementById('log-file-status');

const MAX_LOG_BYTES = 50 * 1024; // matches the schema's consoleLog maxLength

if (logFile) {
    logFile.addEventListener('change', async (ev) => {
        const file = ev.target.files && ev.target.files[0];
        if (!file) {
            logStatus.textContent = '';
            return;
        }
        if (file.size > MAX_LOG_BYTES) {
            logStatus.textContent = `File is ${Math.round(file.size / 1024)} KB — max is ${MAX_LOG_BYTES / 1024} KB. Trim to the tail around the crash.`;
            logFile.value = '';
            return;
        }
        try {
            const text = await file.text();
            logTextarea.value = text;
            logStatus.textContent = `Loaded ${file.name} (${Math.round(file.size / 1024)} KB).`;
        } catch (err) {
            logStatus.textContent = `Couldn't read the file: ${err.message}`;
        }
    });
}

function buildPayload() {
    const get = (name) => (form.elements[name]?.value ?? '').trim();
    return {
        summary: get('summary'),
        description: get('description'),
        reproSteps: get('reproSteps'),
        context: get('context') || undefined,
        consoleLog: get('consoleLog') || undefined,
        otherMods: get('otherMods') || undefined,
        multiplayer: get('multiplayer'),
        runSeed: get('runSeed') || undefined,
        steamName: get('steamName') || undefined,
    };
}

function validate(p) {
    const errs = [];
    const modVersion = form.elements.modVersion?.value || '';
    if (!rules.versionish(modVersion)) {
        errs.push({ field: 'Sadida version', message: 'expected vMAJOR.MINOR.PATCH' });
    }
    if (!rules.required(p.summary)) errs.push({ field: 'Summary', message: 'required' });
    else if (!rules.maxLen(p.summary, 140)) errs.push({ field: 'Summary', message: 'max 140 chars' });

    if (!rules.required(p.description)) errs.push({ field: 'Description', message: 'required' });
    else if (!rules.maxLen(p.description, 5000)) errs.push({ field: 'Description', message: 'max 5000 chars' });

    if (!rules.required(p.reproSteps)) errs.push({ field: 'Repro steps', message: 'required' });
    else if (!rules.maxLen(p.reproSteps, 5000)) errs.push({ field: 'Repro steps', message: 'max 5000 chars' });

    if (!['solo', 'host', 'client'].includes(p.multiplayer)) {
        errs.push({ field: 'Multiplayer?', message: 'required' });
    }
    if (p.consoleLog && !rules.maxLen(p.consoleLog, 50000)) {
        errs.push({ field: 'Console log', message: 'max 50 KB — trim to the tail around the crash' });
    }
    if (p.steamName && !rules.maxLen(p.steamName, 40)) {
        errs.push({ field: 'Steam username', message: 'max 40 chars' });
    }
    return errs;
}

attachFormHandler({
    form,
    type: 'bug',
    buildPayload,
    validate,
});
