import { attachFormHandler, rules } from '../submit.js';

const form = document.getElementById('issue-form');
const AREAS = ['balance', 'ui', 'text', 'translation', 'flow', 'other'];

function buildPayload() {
    const get = (name) => (form.elements[name]?.value ?? '').trim();
    return {
        summary: get('summary'),
        area: get('area'),
        description: get('description'),
        expectedBehavior: get('expectedBehavior') || undefined,
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

    if (!AREAS.includes(p.area)) errs.push({ field: 'Area', message: 'required' });

    if (!rules.required(p.description)) errs.push({ field: 'Description', message: 'required' });
    else if (!rules.maxLen(p.description, 5000)) errs.push({ field: 'Description', message: 'max 5000 chars' });

    if (p.expectedBehavior && !rules.maxLen(p.expectedBehavior, 2000)) {
        errs.push({ field: 'Expected behavior', message: 'max 2000 chars' });
    }
    if (p.steamName && !rules.maxLen(p.steamName, 40)) {
        errs.push({ field: 'Steam username', message: 'max 40 chars' });
    }
    return errs;
}

attachFormHandler({
    form,
    type: 'issue',
    buildPayload,
    validate,
});
