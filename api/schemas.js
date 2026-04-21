// Schemas exported as JS so the bundler always ships them with the function,
// regardless of Vercel's root-dir setting or includeFiles glob resolution.
// If you edit these, keep docs/js/forms/*.js client guards in sync.

export const bugSchema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "Sadida Bug Report",
    type: "object",
    additionalProperties: false,
    required: ["type", "modVersion", "summary", "description", "reproSteps", "multiplayer"],
    properties: {
        type: { const: "bug" },
        modVersion: { type: "string", pattern: "^v?\\d+\\.\\d+\\.\\d+$", maxLength: 16 },
        summary: { type: "string", minLength: 1, maxLength: 140 },
        description: { type: "string", minLength: 1, maxLength: 5000 },
        reproSteps: { type: "string", minLength: 1, maxLength: 5000 },
        context: { type: "string", maxLength: 500 },
        consoleLog: { type: "string", maxLength: 50000 },
        otherMods: { type: "string", maxLength: 2000 },
        multiplayer: { enum: ["solo", "host", "client"] },
        runSeed: { type: "string", maxLength: 32 },
        steamName: { type: "string", maxLength: 40 },
    },
};

export const issueSchema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "Sadida Issue Report",
    type: "object",
    additionalProperties: false,
    required: ["type", "modVersion", "summary", "area", "description"],
    properties: {
        type: { const: "issue" },
        modVersion: { type: "string", pattern: "^v?\\d+\\.\\d+\\.\\d+$", maxLength: 16 },
        summary: { type: "string", minLength: 1, maxLength: 140 },
        area: { enum: ["balance", "ui", "text", "translation", "flow", "other"] },
        description: { type: "string", minLength: 1, maxLength: 5000 },
        expectedBehavior: { type: "string", maxLength: 2000 },
        steamName: { type: "string", maxLength: 40 },
    },
};

export const cardSchema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "Sadida Card Suggestion",
    type: "object",
    additionalProperties: false,
    required: [
        "type", "subtype", "modVersion",
        "cardName", "cardType", "rarity", "energyCost", "baseEffect",
    ],
    properties: {
        type: { const: "suggestion" },
        subtype: { const: "card" },
        modVersion: { type: "string", pattern: "^v?\\d+\\.\\d+\\.\\d+$", maxLength: 16 },
        cardName: {
            type: "string",
            minLength: 1,
            maxLength: 32,
            pattern: "^[A-Za-z][A-Za-z' -]{0,31}$",
        },
        cardType: { enum: ["Attack", "Skill", "Power"] },
        rarity: { enum: ["Basic", "Common", "Uncommon", "Rare"] },
        energyCost: { type: "integer", minimum: 0, maximum: 9 },
        seedCost: { type: "integer", minimum: 0, maximum: 9 },
        damage: { type: "integer", minimum: 0, maximum: 99 },
        block: { type: "integer", minimum: 0, maximum: 99 },
        keywords: {
            type: "array",
            uniqueItems: true,
            items: { enum: ["Exhaust", "Retain", "Innate", "Ethereal", "Unplayable", "Doll"] },
            maxItems: 6,
        },
        baseEffect: { type: "string", minLength: 1, maxLength: 1000 },
        upgradeEffect: { type: "string", maxLength: 1000 },
        artConcept: { type: "string", maxLength: 500 },
        inspiration: { type: "string", maxLength: 200 },
        steamName: { type: "string", maxLength: 40 },
    },
};

export const relicSchema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "Sadida Relic Suggestion",
    type: "object",
    additionalProperties: false,
    required: ["type", "subtype", "modVersion", "relicName", "rarity", "trigger", "effect"],
    properties: {
        type: { const: "suggestion" },
        subtype: { const: "relic" },
        modVersion: { type: "string", pattern: "^v?\\d+\\.\\d+\\.\\d+$", maxLength: 16 },
        relicName: {
            type: "string",
            minLength: 1,
            maxLength: 32,
            pattern: "^[A-Za-z][A-Za-z' -]{0,31}$",
        },
        rarity: { enum: ["Common", "Uncommon", "Rare", "Shop", "Boss"] },
        trigger: { enum: ["OnPickup", "SOT", "EOT", "OnCardPlay", "OnDamage", "Passive", "Other"] },
        effect: { type: "string", minLength: 1, maxLength: 1000 },
        stackType: { enum: ["None", "Counter", "Charge"] },
        artConcept: { type: "string", maxLength: 500 },
        steamName: { type: "string", maxLength: 40 },
    },
};

export const potionSchema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "Sadida Potion Suggestion",
    type: "object",
    additionalProperties: false,
    required: ["type", "subtype", "modVersion", "potionName", "rarity", "targetType", "effect"],
    properties: {
        type: { const: "suggestion" },
        subtype: { const: "potion" },
        modVersion: { type: "string", pattern: "^v?\\d+\\.\\d+\\.\\d+$", maxLength: 16 },
        potionName: {
            type: "string",
            minLength: 1,
            maxLength: 32,
            pattern: "^[A-Za-z][A-Za-z' -]{0,31}$",
        },
        rarity: { enum: ["Common", "Uncommon", "Rare"] },
        targetType: { enum: ["Self", "SingleEnemy", "AllEnemies", "None"] },
        effect: { type: "string", minLength: 1, maxLength: 1000 },
        steamName: { type: "string", maxLength: 40 },
    },
};

export const powerSchema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "Sadida Power Suggestion",
    type: "object",
    additionalProperties: false,
    required: ["type", "subtype", "modVersion", "powerName", "appliesTo", "powerType", "effect"],
    properties: {
        type: { const: "suggestion" },
        subtype: { const: "power" },
        modVersion: { type: "string", pattern: "^v?\\d+\\.\\d+\\.\\d+$", maxLength: 16 },
        powerName: {
            type: "string",
            minLength: 1,
            maxLength: 32,
            pattern: "^[A-Za-z][A-Za-z' -]{0,31}$",
        },
        appliesTo: { enum: ["Player", "Enemy", "Doll", "AnyCreature"] },
        powerType: { enum: ["Buff", "Debuff"] },
        stackType: { enum: ["None", "Counter", "Single"] },
        triggerHook: { enum: ["AfterCardPlayed", "AfterDamageReceived", "SOT", "EOT", "Passive"] },
        effect: { type: "string", minLength: 1, maxLength: 1000 },
        steamName: { type: "string", maxLength: 40 },
    },
};
