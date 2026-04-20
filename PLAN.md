# Sadida-Report — Architecture & Implementation Plan

Public-facing feedback portal for the Sadida mod. Three flows (Bug Report, Issue, Suggestion) served from GitHub Pages, with submissions written to a MongoDB Atlas cluster via a serverless function proxy.

---

## 1. Goals

- **Public, low-friction.** User visits a URL, picks a flow, fills a form, submits. No login.
- **Structured data out.** Submissions land in MongoDB as queryable documents — not free text.
- **Per-type validation** for suggestions (card / relic / potion / power) so payloads are usable as-is.
- **Zero-ops** baseline. Free tiers: GitHub Pages + Vercel/Cloudflare function + MongoDB Atlas M0.
- **Spam-resistant** enough to survive being linked from Nexus without becoming a honeypot.

---

## 2. Why this stack (and why not the alternatives)

**Frontend — GitHub Pages.** Static HTML/CSS/JS. Free, versioned, public. No framework; keeps the page fast and the repo small.

**Backend — Vercel Serverless Function (Node.js).** A static site can't hold a MongoDB connection string — any JS-side secret is leaked. The industry-standard fix is a thin serverless proxy: Pages POSTs JSON to the function, the function validates and writes to Mongo using a private connection string held in environment variables. Vercel's free tier gives 100 GB-hours / 100k invocations per month, more than enough.

- *Why not Cloudflare Workers?* Workers speak HTTP, not TCP. MongoDB's wire protocol is TCP; the official Node driver won't run inside a Worker. Atlas's HTTPS Data API used to bridge this, but MongoDB deprecated it in Sept 2024 and shut it down in Sept 2025. Vercel Functions run on standard Node, so the official driver works unchanged.
- *Why not Netlify Functions?* Same capability as Vercel; picked Vercel because MongoDB's "integrations" panel has a first-class Vercel preset with environment-variable sync.
- *Why not a self-hosted VPS?* More ops than the problem justifies. Can migrate later if free-tier limits bite.

**Database — MongoDB Atlas M0 (free tier).** 512 MB storage, shared instance, one region. Fine for 1000s of submissions. User already specified MongoDB.

- *Why not Google Sheets?* Fine fallback, but loses structured querying and forces a Google account to own the data.
- *Why not a Firestore/Supabase?* Introducing a second database per the user's request is unnecessary — Mongo handles this workload easily.

---

## 3. Data flow

```
┌──────────────────────┐      POST /api/submit         ┌────────────────────────┐
│   GitHub Pages       │  ─────────────────────────►   │  Vercel Function       │
│   static HTML/CSS/JS │      { type, payload, … }     │  api/submit.js         │
│   validates locally  │  ◄─────────────────────────   │  validates server-side │
│   shows /thanks      │        200 { id: "…" }        │  holds Mongo URI       │
└──────────────────────┘                               └───────────┬────────────┘
                                                                   │
                                                                   ▼
                                                         ┌──────────────────┐
                                                         │  MongoDB Atlas   │
                                                         │  cluster: sadida │
                                                         │  db: reports     │
                                                         │  col: submissions│
                                                         └──────────────────┘
```

### Schema

Single collection `submissions`. Discriminated by `type` / `subtype`:

```js
{
  _id: ObjectId,
  type: "bug" | "issue" | "suggestion",
  subtype: null | "card" | "relic" | "potion" | "power",  // only for suggestions
  modVersion: "v0.3.22",
  submittedAt: ISODate,
  sourceIp: "hashed",          // SHA-256 of X-Forwarded-For for abuse triage
  payload: {
    // type-specific, validated per schema (see §5)
  },
  status: "new",               // new | triaged | accepted | rejected | dupe
  tags: [],                    // filled in during triage
}
```

One collection keeps queries simple (`find({ type: "bug", status: "new" })`). Add indexes: `{ type: 1, submittedAt: -1 }` for the triage dashboard; `{ sourceIp: 1, submittedAt: -1 }` for rate-limit lookups.

---

## 4. Pages map

```
/                             landing page, three tiles
/bug.html                     bug report form
/issue.html                   issue report form
/suggest/                     "what are you suggesting?" picker
/suggest/card.html            card suggestion form
/suggest/relic.html           relic suggestion form
/suggest/potion.html          potion suggestion form
/suggest/power.html           power suggestion form
/thanks.html                  post-submit confirmation
```

Each form page shares `css/style.css` + `js/submit.js` (shared submission helper) + its own `js/forms/<type>.js` (validators + payload builder).

---

## 5. Field schemas per form

### 5a. Bug Report (`type: "bug"`)

| Field | Type | Required | Notes |
|---|---|---|---|
| modVersion | string | ✅ | "vN.N.N" regex |
| summary | string | ✅ | ≤140 char title |
| description | string | ✅ | ≤5000 char |
| reproSteps | string | ✅ | ≤5000 char |
| context | string | ⬜ | "Shared Strike vs Louse Progenitor" |
| consoleLog | string | ⬜ | ≤50000 char; large logs discouraged |
| otherMods | string | ⬜ | ≤2000 char |
| multiplayer | enum | ✅ | "solo" / "host" / "client" |
| runSeed | string | ⬜ | ≤32 char |

### 5b. Issue (`type: "issue"`)

| Field | Type | Required | Notes |
|---|---|---|---|
| modVersion | string | ✅ | |
| summary | string | ✅ | |
| area | enum | ✅ | "balance" / "ui" / "text" / "translation" / "flow" / "other" |
| description | string | ✅ | |
| expectedBehavior | string | ⬜ | |

### 5c. Suggestion — Card (`type: "suggestion"`, `subtype: "card"`)

| Field | Type | Required | Validation |
|---|---|---|---|
| cardName | string | ✅ | 1–32 chars, letters/spaces/apostrophe/dash |
| cardType | enum | ✅ | "Attack" / "Skill" / "Power" |
| rarity | enum | ✅ | "Basic" / "Common" / "Uncommon" / "Rare" |
| energyCost | integer | ✅ | 0–3 typical, cap at 0–9 |
| seedCost | integer | ⬜ | 0–9 |
| damage | integer | ⬜ | 0–99; only meaningful if cardType=="Attack" |
| block | integer | ⬜ | 0–99 |
| keywords | string[] | ⬜ | subset of {Exhaust, Retain, Innate, Ethereal, Unplayable, Doll} |
| baseEffect | string | ✅ | ≤1000 char |
| upgradeEffect | string | ⬜ | ≤1000 char |
| artConcept | string | ⬜ | ≤500 char |
| inspiration | string | ⬜ | ≤200 char |

### 5d. Suggestion — Relic (`type: "suggestion"`, `subtype: "relic"`)

| Field | Type | Required | Validation |
|---|---|---|---|
| relicName | string | ✅ | |
| rarity | enum | ✅ | "Common" / "Uncommon" / "Rare" / "Shop" / "Boss" |
| trigger | enum | ✅ | "OnPickup" / "SOT" / "EOT" / "OnCardPlay" / "OnDamage" / "Passive" / "Other" |
| effect | string | ✅ | ≤1000 char |
| stackType | enum | ⬜ | "None" / "Counter" / "Charge" |
| artConcept | string | ⬜ | |

### 5e. Suggestion — Potion (`type: "suggestion"`, `subtype: "potion"`)

| Field | Type | Required | Validation |
|---|---|---|---|
| potionName | string | ✅ | |
| rarity | enum | ✅ | "Common" / "Uncommon" / "Rare" |
| targetType | enum | ✅ | "Self" / "SingleEnemy" / "AllEnemies" / "None" |
| effect | string | ✅ | ≤1000 char |

### 5f. Suggestion — Power (`type: "suggestion"`, `subtype: "power"`)

| Field | Type | Required | Validation |
|---|---|---|---|
| powerName | string | ✅ | |
| appliesTo | enum | ✅ | "Player" / "Enemy" / "Doll" / "AnyCreature" |
| powerType | enum | ✅ | "Buff" / "Debuff" |
| stackType | enum | ⬜ | "None" / "Counter" / "Single" |
| triggerHook | enum | ⬜ | "AfterCardPlayed" / "AfterDamageReceived" / "SOT" / "EOT" / "Passive" |
| effect | string | ✅ | ≤1000 char |

---

## 6. Validation strategy

**Two layers, both mandatory:**

1. **Client-side JS** — gives instant feedback, prevents garbage from hitting the network. Each form's `js/forms/<type>.js` owns a `validate(formData)` function returning `{ok: true}` or `{ok: false, errors: [{field, message}]}`.

2. **Server-side JSON Schema on Vercel Function** — authoritative. `Ajv` validates the incoming body against a per-type schema (`api/schemas/bug.json`, etc.) before anything hits Mongo. Fails with 400 + the validator error list.

Client-side is a UX shortcut; server-side is the contract. Never trust the client — someone will `curl` the endpoint.

---

## 7. Security & spam

**CORS.** Function responds with `Access-Control-Allow-Origin: https://<user>.github.io` so other sites can't POST from a browser (not a real stop for a motivated attacker using `curl`, but filters drive-by abuse).

**Rate limit.** First version: per-IP cap (hashed IP → last 10 min) enforced via a small `rate_limits` collection. 10 submissions / IP / hour is a sane start. Return 429 on overage.

**Payload size cap.** Vercel has a 4.5 MB body limit by default; we additionally enforce a 60 KB JSON limit in the function to cut off log-spam attacks.

**No HTML storage.** Payload strings are stored as-is but rendered with text-node DOM APIs (not `innerHTML`) anywhere they're displayed. Keeps XSS off the table in the eventual triage UI.

**CAPTCHA.** Skipped for v1. Add Cloudflare Turnstile (free) if abuse shows up. Turnstile plugs into the client form, the Worker validates the token server-side before accepting the submission.

**Secrets.** `MONGODB_URI` lives in Vercel's environment variables, never in the repo. Included in `.gitignore` + `.env.example` documents what to set.

---

## 8. Repo layout

```
Sadida-Report/
├── README.md                  — quickstart: what this is, how to run locally
├── PLAN.md                    — this doc
├── DEPLOY.md                  — step-by-step deployment guide
├── .gitignore
├── docs/                      — GitHub Pages source (enable Pages with source = /docs; Pages only allows / or /docs)
│   ├── index.html             — landing with 3 tiles
│   ├── bug.html               — bug report form
│   ├── issue.html             — issue report form
│   ├── suggest/
│   │   ├── index.html         — picker
│   │   ├── card.html
│   │   ├── relic.html
│   │   ├── potion.html
│   │   └── power.html
│   ├── thanks.html            — confirmation page
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── config.js          — API endpoint URL (override per environment)
│       ├── submit.js          — shared POST helper + error rendering
│       └── forms/
│           ├── bug.js
│           ├── issue.js
│           ├── card.js
│           ├── relic.js
│           ├── potion.js
│           └── power.js
└── api/                       — Vercel project (separate deploy)
    ├── package.json
    ├── vercel.json            — CORS headers + function config
    ├── .env.example
    └── api/
        ├── submit.js          — POST /api/submit
        └── schemas/
            ├── bug.json
            ├── issue.json
            ├── suggestion-card.json
            ├── suggestion-relic.json
            ├── suggestion-potion.json
            └── suggestion-power.json
```

The `docs/` and `api/` subfolders ship to different places (GitHub Pages and Vercel respectively) but live in one repo for atomic PRs.

---

## 9. Build order

1. **Ship the Vercel Function first.** Even with no frontend, you can `curl` the endpoint and confirm docs land in Mongo. Proves the hardest moving part works.
2. **Ship the Bug form.** It's the most important flow and exercises every piece of the shared submit/validate machinery.
3. **Ship the Issue form.** Fewer fields, re-uses everything. Cheap.
4. **Ship the Suggestion picker + Card form.** Card is the most complex of the four sub-types; getting it right means the others are copy-paste.
5. **Ship Relic / Potion / Power** — each is a 30-min variant on Card.
6. **Polish.** Theme, mobile CSS, empty-state copy, retry button on submit failures.
7. **Triage UI (optional, later).** A second static page protected by a shared password that queries Mongo and shows a sortable list. Or just use Atlas's web UI for now — you get filtering and sort for free.

---

## 10. Open decisions before deploy

1. **Domain.** `sadida-report.vercel.app` for the API, `<user>.github.io/Sadida-Report/` for Pages, or a custom domain?
2. **IP logging.** Hashed IP is useful for rate-limiting + abuse triage but some jurisdictions treat even hashed IPs as PII. Decide whether to log at all. (Current plan: store SHA-256 with a rotating salt — considered pseudonymous, not PII under most interpretations.)
3. **Retention.** Auto-TTL old `new`-status bug reports at 6 months? Keep forever? My default: no TTL, triage them; nothing says you have to keep everything forever but "no pruning" is simpler.
4. **Who has Mongo access?** Atlas role assignments — probably just you to start, can add triagers later.
5. **Integration with the mod repo.** Accepted suggestions could auto-open a GitHub issue in the main Sadida repo via GitHub API. Out of scope for v1 but worth planning the shape.

---

## 11. Failure modes to test before announcing the portal

- Network error mid-submit → form should show "Couldn't reach server, try again" and keep field state.
- Mongo unreachable → Function returns 503; client shows a friendly message.
- Validation fails server-side but passed client-side (client/server drift) → client shows the server's error list.
- Spam: submit 100 bug reports in a minute → rate limiter returns 429, Mongo isn't touched.
- Huge payload (50 MB) → caught by the 60 KB body cap before it hits the runtime.
- CORS preflight → OPTIONS handler returns the right headers; submit works in Safari/Firefox/Chrome.
