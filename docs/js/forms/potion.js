import { attachFormHandler, rules } from '../submit.js';

const form = document.getElementById('potion-form');
const RARITIES = ['Common', 'Uncommon', 'Rare'];
const TARGETS = ['Self', 'SingleEnemy', 'AllEnemies', 'None'];
const NAME_RE = /^[A-Za-z][A-Za-z' -]{0,31}$/;

function buildPayload() {
    const get = (name) => (form.elements[name]?.value ?? '').trim();
    return {
        potionName: get('potionName'),
        rarity: get('rarity'),
        targetType: get('targetType'),
        effect: get('effect'),
        steamName: get('steamName') || undefined,
    };
}

function validate(p) {
    const errs = [];
    const modVersion = form.elements.modVersion?.value || '';
    if (!rules.versionish(modVersion)) errs.push({ field: 'Sadida version', message: 'expected vMAJOR.MINOR.PATCH' });

    if (!rules.required(p.potionName)) errs.push({ field: 'Potion name', message: 'required' });
    else if (!NAME_RE.test(p.potionName)) errs.push({ field: 'Potion name', message: 'letters/spaces/apostrophe/hyphen only, max 32 chars' });

    if (!RARITIES.includes(p.rarity)) errs.push({ field: 'Rarity', message: 'required' });
    if (!TARGETS.includes(p.targetType)) errs.push({ field: 'Target type', message: 'required' });

    if (!rules.required(p.effect)) errs.push({ field: 'Effect', message: 'required' });
    else if (!rules.maxLen(p.effect, 1000)) errs.push({ field: 'Effect', message: 'max 1000 chars' });
    if (p.steamName && !rules.maxLen(p.steamName, 40)) errs.push({ field: 'Steam username', message: 'max 40 chars' });

    return errs;
}

attachFormHandler({ form, type: 'suggestion', subtype: 'potion', buildPayload, validate });
