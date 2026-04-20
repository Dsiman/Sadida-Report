# Sadida-Report

Public feedback portal for the [Sadida mod](https://github.com/DamianIsaacs/Sadida). Three flows — Bug Report, Issue, Suggestion — with submissions written to MongoDB Atlas via a Vercel Serverless Function.

- **Frontend:** static HTML/CSS/JS, served from GitHub Pages.
- **Backend:** single Vercel Function (`/api/submit`) — validates, rate-limits, writes to Mongo.
- **Storage:** MongoDB Atlas M0 (free tier).

See **[PLAN.md](./PLAN.md)** for full architecture, field schemas, and design rationale. See **[DEPLOY.md](./DEPLOY.md)** for first-time setup.

## Repo layout

```
docs/   ← GitHub Pages source (index + 8 forms + shared JS)
api/    ← Vercel function (single endpoint /api/submit)
```

Both subtrees live in one repo but ship to different hosts. The site lives in `docs/` because GitHub Pages only accepts `/` or `/docs` as a source folder.

## Quick local dev

- `docs/` is plain HTML — open `docs/index.html` in a browser, or run any static server:
  ```sh
  cd docs && python -m http.server 8080
  ```
- `api/` runs under Vercel's local dev:
  ```sh
  cd api && npx vercel dev
  ```
  Point `docs/js/config.js` at `http://localhost:3000/api/submit` while developing.

## Production

Pages is served at `https://<user>.github.io/Sadida-Report/`. The Vercel function lives at `https://sadida-report.vercel.app/api/submit`. Submissions land in the Atlas cluster `sadida` → DB `reports` → collection `submissions`.

Env vars the function needs (set in Vercel dashboard, never committed):

- `MONGODB_URI` — full SRV connection string
- `MONGODB_DB` — database name (default: `reports`)
- `ALLOWED_ORIGIN` — the Pages origin for CORS (e.g. `https://damianisaacs.github.io`)
- `IP_SALT` — random string used to hash submitter IPs (rotate quarterly)
