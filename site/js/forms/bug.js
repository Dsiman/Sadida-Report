import { attachFormHandler, rules } from '../submit.js';

const form = document.getElementById('bug-form');

function buildPayload() {
    const get = (name) => (form.elements[name]?.value ?? '').trim();
    // modVersion is pulled out by the shared handler; everything else is payload.
    return {
        summary: get('summary'),
        description: get('description'),
        reproSteps: get('reproSteps'),
        context: get('context') || undefined,
        consoleLog: get('consoleLog') || undefined,
        otherMods: get('otherMods') || undefined,
        multiplayer: get('multiplayer'),
        runSeed: get('runSeed') || undefined,
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
    return errs;
}

attachFormHandler({
    form,
    type: 'bug',
    buildPayload,
    validate,
});
