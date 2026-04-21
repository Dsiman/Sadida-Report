import { attachFormHandler, rules } from '../submit.js';

const form = document.getElementById('card-form');

const CARD_TYPES = ['Attack', 'Skill', 'Power'];
const RARITIES = ['Basic', 'Common', 'Uncommon', 'Rare'];
const KEYWORDS = ['Exhaust', 'Retain', 'Innate', 'Ethereal', 'Unplayable', 'Doll'];
const NAME_RE = /^[A-Za-z][A-Za-z' -]{0,31}$/;

function toIntOrUndef(v) {
    if (v === '' || v == null) return undefined;
    const n = Number(v);
    return Number.isInteger(n) ? n : NaN;
}

function buildPayload() {
    const get = (name) => (form.elements[name]?.value ?? '').trim();
    const keywords = Array.from(form.querySelectorAll('input[name="keywords"]:checked')).map(e => e.value);
    return {
        cardName: get('cardName'),
        cardType: get('cardType'),
        rarity: get('rarity'),
        energyCost: toIntOrUndef(get('energyCost')),
        seedCost: toIntOrUndef(get('seedCost')),
        damage: toIntOrUndef(get('damage')),
        block: toIntOrUndef(get('block')),
        keywords: keywords.length ? keywords : undefined,
        baseEffect: get('baseEffect'),
        upgradeEffect: get('upgradeEffect') || undefined,
        artConcept: get('artConcept') || undefined,
        inspiration: get('inspiration') || undefined,
        steamName: get('steamName') || undefined,
    };
}

function validate(p) {
    const errs = [];

    const modVersion = form.elements.modVersion?.value || '';
    if (!rules.versionish(modVersion)) errs.push({ field: 'Sadida version', message: 'expected vMAJOR.MINOR.PATCH' });

    if (!rules.required(p.cardName)) errs.push({ field: 'Card name', message: 'required' });
    else if (!NAME_RE.test(p.cardName)) errs.push({ field: 'Card name', message: 'letters/spaces/apostrophe/hyphen only, start with a letter, max 32 chars' });

    if (!CARD_TYPES.includes(p.cardType)) errs.push({ field: 'Card type', message: 'required' });
    if (!RARITIES.includes(p.rarity)) errs.push({ field: 'Rarity', message: 'required' });

    if (!rules.int(p.energyCost, 0, 9)) errs.push({ field: 'Energy cost', message: 'integer 0–9 required' });

    // Optional numerics: if present, must be in range.
    if (p.seedCost !== undefined && !rules.int(p.seedCost, 0, 9)) errs.push({ field: 'Seed cost', message: 'integer 0–9' });
    if (p.damage !== undefined && !rules.int(p.damage, 0, 99)) errs.push({ field: 'Damage', message: 'integer 0–99' });
    if (p.block !== undefined && !rules.int(p.block, 0, 99)) errs.push({ field: 'Block', message: 'integer 0–99' });

    // Contextual: damage is meaningful for Attack, not required for Skill/Power.
    // Block is meaningful for Skill. We don't block on these — they're soft hints —
    // but a Skill with no block AND no effect text would be filtered server-side as useless.

    if (p.keywords) {
        const bad = p.keywords.filter(k => !KEYWORDS.includes(k));
        if (bad.length) errs.push({ field: 'Keywords', message: `unknown keyword: ${bad.join(', ')}` });
        if (new Set(p.keywords).size !== p.keywords.length) {
            errs.push({ field: 'Keywords', message: 'duplicate keyword selected' });
        }
    }

    if (!rules.required(p.baseEffect)) errs.push({ field: 'Base effect', message: 'required' });
    else if (!rules.maxLen(p.baseEffect, 1000)) errs.push({ field: 'Base effect', message: 'max 1000 chars' });

    if (p.upgradeEffect && !rules.maxLen(p.upgradeEffect, 1000)) errs.push({ field: 'Upgrade effect', message: 'max 1000 chars' });
    if (p.artConcept && !rules.maxLen(p.artConcept, 500)) errs.push({ field: 'Art concept', message: 'max 500 chars' });
    if (p.inspiration && !rules.maxLen(p.inspiration, 200)) errs.push({ field: 'Inspiration', message: 'max 200 chars' });
    if (p.steamName && !rules.maxLen(p.steamName, 40)) errs.push({ field: 'Steam username', message: 'max 40 chars' });

    return errs;
}

attachFormHandler({
    form,
    type: 'suggestion',
    subtype: 'card',
    buildPayload,
    validate,
});
