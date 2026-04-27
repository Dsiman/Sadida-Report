# Sadida-Report

Public feedback portal for the [Sadida mod](https://github.com/DamianIsaacs/Sadida). Three flows — Bug Report, Issue, Suggestion — with submissions filed as GitHub issues in the private maintainer repo [`Dsiman/Sadida-AIO`](https://github.com/Dsiman/Sadida-AIO).

- **Frontend:** static HTML/CSS/JS, served from GitHub Pages.
- **Backend:** two Vercel Functions (`/api/submit`, `/api/ticket`) — validate, create issues, read issues + comments.
- **Storage:** GitHub Issues on Sadida-AIO. No database.

See **[PLAN.md](./PLAN.md)** for full architecture and field schemas. See **[DEPLOY.md](./DEPLOY.md)** for first-time setup.

## Repo layout

```
docs/   ← GitHub Pages source (landing + 8 forms + status page + shared JS)
api/    ← Vercel project (two endpoints: /api/submit, /api/ticket)
```

Both subtrees live in one repo but ship to different hosts. The site lives in `docs/` because GitHub Pages only accepts `/` or `/docs` as a source folder.

## How a submission flows

1. User fills a form on Pages, JS POSTs JSON to `/api/submit` on Vercel.
2. Function validates with Ajv, generates a `STS-XXXXXX` ticket code, and creates a GitHub issue in `Dsiman/Sadida-AIO` with:
   - Title: `[STS-XXXXXX] type[:subtype] — <summary>`
   - Body: a Markdown render of every payload field
   - Labels: `report:<type>` (+ `report:suggestion:<subtype>` if applicable), `ticket:STS-XXXXXX`, `report:new`
3. Function returns `{ ticket, issueNumber, url }`. Frontend redirects to `/thanks.html?t=…`.
4. User can later visit `/status.html?t=…` to see ticket state and any comments the maintainer left on the issue. The function looks up the issue by its `ticket:STS-XXXXXX` label and proxies the comments.

Triage happens in GitHub's native issue UI on Sadida-AIO. Add a `status:<slug>` label (e.g. `status:in-progress`, `status:completed`) and the public status page reflects it.

## Quick local dev

- `docs/` is plain HTML — open `docs/index.html` in a browser, or run any static server:
  ```sh
  cd docs && python -m http.server 8080
  ```
- `api/` runs under Vercel's local dev:
  ```sh
  cd api && npx vercel dev
  ```
  Point `docs/js/config.js` at `http://localhost:3000` while developing.

## Production env vars (set in Vercel dashboard)

- `GITHUB_TOKEN` — fine-grained PAT scoped to Sadida-AIO with `Issues: read and write`.
- `GITHUB_REPO` — `Dsiman/Sadida-AIO`.
- `ALLOWED_ORIGIN` — the Pages origin (e.g. `https://dsiman.github.io`). Comma-separated for multiple.

The Vercel function URL lives at `https://sadida-report.vercel.app/`. Pages is served from `https://dsiman.github.io/Sadida-Report/`.
