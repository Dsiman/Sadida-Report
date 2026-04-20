import { attachFormHandler, rules } from '../submit.js';

const form = document.getElementById('relic-form');
const RARITIES = ['Common', 'Uncommon', 'Rare', 'Shop', 'Boss'];
const TRIGGERS = ['OnPickup', 'SOT', 'EOT', 'OnCardPlay', 'OnDamage', 'Passive', 'Other'];
const STACK_TYPES = ['None', 'Counter', 'Charge'];
const NAME_RE = /^[A-Za-z][A-Za-z' -]{0,31}$/;

function buildPayload() {
    const get = (name) => (form.elements[name]?.value ?? '').trim();
    return {
        relicName: get('relicName'),
        rarity: get('rarity'),
        trigger: get('trigger'),
        stackType: get('stackType') || undefined,
        effect: get('effect'),
        artConcept: get('artConcept') || undefined,
    };
}

function validate(p) {
    const errs = [];
    const modVersion = form.elements.modVersion?.value || '';
    if (!rules.versionish(modVersion)) errs.push({ field: 'Sadida version', message: 'expected vMAJOR.MINOR.PATCH' });

    if (!rules.required(p.relicName)) errs.push({ field: 'Relic name', message: 'required' });
    else if (!NAME_RE.test(p.relicName)) errs.push({ field: 'Relic name', message: 'letters/spaces/apostrophe/hyphen only, max 32 chars' });

    if (!RARITIES.includes(p.rarity)) errs.push({ field: 'Rarity', message: 'required' });
    if (!TRIGGERS.includes(p.trigger)) errs.push({ field: 'Trigger', message: 'required' });

    if (p.stackType && !STACK_TYPES.includes(p.stackType)) {
        errs.push({ field: 'Stack type', message: 'unknown value' });
    }

    if (!rules.required(p.effect)) errs.push({ field: 'Effect', message: 'required' });
    else if (!rules.maxLen(p.effect, 1000)) errs.push({ field: 'Effect', message: 'max 1000 chars' });

    if (p.artConcept && !rules.maxLen(p.artConcept, 500)) errs.push({ field: 'Art concept', message: 'max 500 chars' });

    return errs;
}

attachFormHandler({ form, type: 'suggestion', subtype: 'relic', buildPayload, validate });
