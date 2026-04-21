import { attachFormHandler, rules } from '../submit.js';

const form = document.getElementById('power-form');
const APPLIES_TO = ['Player', 'Enemy', 'Doll', 'AnyCreature'];
const POWER_TYPES = ['Buff', 'Debuff'];
const STACK_TYPES = ['None', 'Counter', 'Single'];
const HOOKS = ['AfterCardPlayed', 'AfterDamageReceived', 'SOT', 'EOT', 'Passive'];
const NAME_RE = /^[A-Za-z][A-Za-z' -]{0,31}$/;

function buildPayload() {
    const get = (name) => (form.elements[name]?.value ?? '').trim();
    return {
        powerName: get('powerName'),
        appliesTo: get('appliesTo'),
        powerType: get('powerType'),
        stackType: get('stackType') || undefined,
        triggerHook: get('triggerHook') || undefined,
        effect: get('effect'),
        steamName: get('steamName') || undefined,
    };
}

function validate(p) {
    const errs = [];
    const modVersion = form.elements.modVersion?.value || '';
    if (!rules.versionish(modVersion)) errs.push({ field: 'Sadida version', message: 'expected vMAJOR.MINOR.PATCH' });

    if (!rules.required(p.powerName)) errs.push({ field: 'Power name', message: 'required' });
    else if (!NAME_RE.test(p.powerName)) errs.push({ field: 'Power name', message: 'letters/spaces/apostrophe/hyphen only, max 32 chars' });

    if (!APPLIES_TO.includes(p.appliesTo)) errs.push({ field: 'Applies to', message: 'required' });
    if (!POWER_TYPES.includes(p.powerType)) errs.push({ field: 'Power type', message: 'required' });

    if (p.stackType && !STACK_TYPES.includes(p.stackType)) errs.push({ field: 'Stack type', message: 'unknown value' });
    if (p.triggerHook && !HOOKS.includes(p.triggerHook)) errs.push({ field: 'Trigger hook', message: 'unknown value' });

    if (!rules.required(p.effect)) errs.push({ field: 'Effect', message: 'required' });
    else if (!rules.maxLen(p.effect, 1000)) errs.push({ field: 'Effect', message: 'max 1000 chars' });
    if (p.steamName && !rules.maxLen(p.steamName, 40)) errs.push({ field: 'Steam username', message: 'max 40 chars' });

    return errs;
}

attachFormHandler({ form, type: 'suggestion', subtype: 'power', buildPayload, validate });
