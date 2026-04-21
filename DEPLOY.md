# Deployment

One-time setup, end-to-end. Expect ~30 minutes start to finish if you've done Vercel/Atlas once before, closer to an hour if it's a first time.

## 1. MongoDB Atlas

1. Sign up at [cloud.mongodb.com](https://cloud.mongodb.com).
2. Create an organization (if new) → create a project `Sadida-Report`.
3. **Deploy a free M0 cluster.**
   - Provider: AWS (or whichever has the closest region to your users).
   - Tier: **M0 Free**.
   - Cluster name: `sadida`.
4. **Create a database user.**
   - Database Access → Add New Database User.
   - Username: `report-writer`.
   - Password: generated, copy it into a password manager.
   - Role: **Read and write to any database** (M0 doesn't support custom roles; tighten post-launch if you upgrade).
5. **Allow-list the Vercel egress.**
   - Network Access → Add IP Address → `0.0.0.0/0` (open to the world). This is necessary for Vercel's rotating IPs; mitigated by the fact that only `report-writer` can log in, with a long password.
6. **Create the database + collection.**
   - Click Browse Collections → Create Database.
   - DB name: `reports`, Collection name: `submissions`.
7. **Create indexes** on `submissions`:
   ```json
   { "type": 1, "submittedAt": -1 }        // triage sort
   { "sourceIp": 1, "submittedAt": -1 }    // rate limit lookups
   { "subtype": 1, "submittedAt": -1 }     // suggestion browsing
   ```
8. **Grab the connection string.**
   - Cluster → Connect → Drivers → Node.js → copy the SRV URI.
   - Replace `<password>` with the real password. Keep this value secret.

## 2. Vercel Function

1. Sign up at [vercel.com](https://vercel.com) with your GitHub account.
2. **Create a new project** pointing at this repo, but override the root directory to `api/`. This makes Vercel deploy only the function, not the HTML site.
3. **Environment variables** (Project Settings → Environment Variables):
   - `MONGODB_URI` — the SRV string from Atlas step 8.
   - `MONGODB_DB` — `reports`
   - `MONGODB_AUTH_DB` — `auth` (separate database in the same cluster that stores admin logins)
   - `ALLOWED_ORIGIN` — e.g. `https://damianisaacs.github.io`. Include the origin only, no path.
   - `IP_SALT` — any long random string (e.g. `openssl rand -hex 16`). Used to hash submitter IPs so you can rate-limit without storing raw addresses.
   - `JWT_SECRET` — long random string used to sign admin session tokens. Generate with `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"` or the PowerShell equivalent. Rotating it invalidates every existing admin session.
4. **Deploy.** Vercel builds automatically on push; confirm `https://<project>.vercel.app/api/submit` returns `405 Method Not Allowed` to a GET (means the function loaded and rejected the wrong verb).
5. **Smoke test POST** from your machine:
   ```sh
   curl -X POST https://sadida-report.vercel.app/api/submit \
     -H 'Content-Type: application/json' \
     -H 'Origin: https://damianisaacs.github.io' \
     -d '{"type":"bug","modVersion":"v0.3.22","summary":"smoketest","description":"hello","reproSteps":"n/a","multiplayer":"solo"}'
   ```
   Expect `200 {"id":"..."}`. Verify the document appeared in Atlas → Browse Collections → `reports.submissions`.

## 3. GitHub Pages

1. Push this repo to GitHub under `<user>/Sadida-Report`.
2. Settings → Pages → Build and deployment:
   - Source: **Deploy from a branch**
   - Branch: `main`, folder: `/docs`
3. Wait ~1 minute; Pages publishes at `https://<user>.github.io/Sadida-Report/`. (GitHub Pages only accepts `/` or `/docs` as the source folder, which is why the site lives in `docs/`.)
4. **Edit `docs/js/config.js`** to point at your Vercel URL:
   ```js
   export const API_BASE = 'https://sadida-report.vercel.app';
   ```
5. Smoke test by loading the landing page, picking Bug Report, filling the form, submitting — should redirect to `/thanks.html` and produce a document in Mongo.

## 4. Admin panel

Admin login and management UI live on the same Pages site:

- `https://<user>.github.io/Sadida-Report/login.html` — login + first-admin registration
- `https://<user>.github.io/Sadida-Report/admin.html` — submissions list, status/tags/notes editing, delete

### First-time admin setup

1. Confirm `JWT_SECRET` and `MONGODB_AUTH_DB` are set on Vercel (see step 3 above).
2. Open `login.html`, switch to the **"Create first admin"** tab, enter an email and a ≥12-character password, submit.
3. That account is stored in `auth.users` with `role: "admin"`; the register endpoint refuses all further requests until that user is deleted from Atlas.
4. You'll be redirected to `admin.html` with a signed JWT in `localStorage` (24-hour expiry).

### Adding more admins later

There's no self-service path. Either:
- Insert another user document into `auth.users` directly via Atlas (password must be scrypt-hashed the same way — easier to just delete the first admin and re-register), or
- Ping me for an admin-protected create-user endpoint.

### Revoking access

Rotate `JWT_SECRET` on Vercel and redeploy. All existing tokens become invalid immediately.

## 5. Optional polish

- **Custom domain.** Add `report.sadida-mod.com` (or whatever) to Pages + Vercel, update `ALLOWED_ORIGIN` and `API_BASE` accordingly.
- **Cloudflare Turnstile.** If spam hits, sign up for Turnstile (free), embed the widget on each form, validate the token in `api/submit.js` before accepting.

## 6. Rotation / maintenance

- **Rotate the Mongo user password** every 6-12 months: Atlas → Database Access → Edit → New password → update Vercel env var → redeploy.
- **Rotate `IP_SALT`** quarterly to limit how long any single hash is correlate-able.
- **Rotate `JWT_SECRET`** quarterly (or immediately if you suspect a leak). Invalidates every admin session.
- **Back up the `submissions` collection** monthly via Atlas → Backups or `mongodump`. M0 doesn't include scheduled backups.
