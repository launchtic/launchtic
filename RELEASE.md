# Releasing Launchtic

How a new version reaches self-hosted instances. Two repos are involved:

- **`launchtic`** (this repo) — the app. CI builds 3 Docker images (web /
  renderer / worker) and publishes them **publicly** to GHCR — no auth needed
  to pull them.
- **`launchtic-com`** — the marketing site (+ Agency billing/license API). It
  serves `install.sh` / `update.sh` / `docker-compose.yml` / `Caddyfile` at
  `/dist`, and holds the `LAUNCHTIC_CURRENT_VERSION` env that `/api/version`
  (public, unauthenticated) advertises.

Updates are free for every self-hosted instance, Free or Agency — there is no
license/entitlement gate on versions. The two repos only meet at **release
time**, via one value: `LAUNCHTIC_CURRENT_VERSION` must equal a published
`:YYYY.MM.DD` tag.

---

## TL;DR — release checklist

> **Thứ tự bắt buộc: publish tag TRƯỚC, set env SAU.**

- [ ] Merge `main` → CI tự build `:latest` → test trên demo.launchtic.com.
- [ ] GitHub → **Actions → "Build & Push" → Run workflow**, nhập **version** = `YYYY.MM.DD`.
- [ ] Đợi 3 job (web/renderer/worker) xanh → check tag tại `github.com/orgs/launchtic/packages`.
- [ ] Trên `launchtic-com`: `.env` set `LAUNCHTIC_CURRENT_VERSION=<đúng ngày đó>` → `docker compose up -d`.
- [ ] **Có sửa `docker-compose.yml` / `Caddyfile` / `install.sh` / `update.sh`?** → copy sang `launchtic-com/public/` (install.sh) hoặc `public/dist/` (compose, Caddyfile, update.sh) → **redeploy site** → verify `curl -fsSL https://launchtic.com/dist/docker-compose.yml | head`.

Khách update: `cd launchtic && curl -fsSL https://launchtic.com/update | bash`
Rollback nhanh: trên VPS đổi `.env` `LAUNCHTIC_VERSION=<tag cũ>` → `docker compose up -d`.

Chi tiết từng phần ở dưới.

---

## Two image channels (gated by CI trigger)

| Trigger | Tags published | Who pulls it |
|---|---|---|
| **Push to `main`** | `:latest`, `:sha-<short>` | You — dev / dogfood (e.g. demo.launchtic.com). Not advertised to instances. |
| **Run workflow** (`workflow_dispatch`) | `:stable`, `:<version>`, `:sha-<short>` | Everyone, via `install.sh`/`update.sh` reading `/api/version`. |

Instances pull a concrete dated tag (not `:latest`) resolved by `install.sh` /
`update.sh`, which write `LAUNCHTIC_VERSION=<version>` into the VPS `.env`.
The version comes from `GET /api/version` on `launchtic-com` — public, no
license key required, always returns `LAUNCHTIC_CURRENT_VERSION`.

---

## Cutting a release — checklist

> **Order matters.** Publish the image tag FIRST, bump the site env SECOND.
> Bumping the env before the tag exists makes `/api/version` advertise a tag
> that isn't in the registry yet → pulls fail.

1. **Land + test the code.** Merge to `main`. Push auto-builds `:latest`; verify
   it on a staging/demo box (demo.launchtic.com) before cutting the release.

2. **Publish the release images.** GitHub → this repo → **Actions** →
   *Build & Push* → **Run workflow**. In the **version** box type the tag, e.g.
   `2026.07.01` (leave blank to use today's UTC date). Wait for all 3 services
   to finish — this publishes `:stable` + `:2026.07.01` + `:sha-…`.

3. **Bump the site to that version.** On `launchtic-com`'s server, set in `.env`:
   ```
   LAUNCHTIC_CURRENT_VERSION=2026.07.01
   ```
   then `docker compose up -d` (env-only change — no rebuild needed).
   Use the **same string** you typed in step 2.

4. **Done.** Everyone gets `:2026.07.01` on their next
   `curl -fsSL https://launchtic.com/update | bash`.

---

## Versioning

- Format: **`YYYY.MM.DD`** (date-based, monotonic). Leave the workflow's version
  box blank — it auto-uses today's UTC date, and a 2nd release the same day is
  auto-suffixed `-2`, `-3`, … (the `resolve-version` job checks GHCR for the
  existing tag). Only type a version to override.
- Keep old dated tags forever (don't delete them) — `:sha-…` tags and dated
  tags both back rollbacks.

---

## Rollback

A bad release went out:

1. **Stop new pulls of it:** set `LAUNCHTIC_CURRENT_VERSION` back to the
   previous good date tag on `launchtic-com`, `docker compose up -d`. New
   installs/updates now serve the old version again.
2. **Instances already on the bad version:** tell operators to set
   `LAUNCHTIC_VERSION=<previous tag>` in their `.env` and run
   `docker compose up -d` (it's local — no token needed, images are public).
   Or push a fixed release (step "Cutting a release") with a new date tag and
   have them update normally.

---

## Where customer-facing scripts live

`install.sh`, `update.sh`, `docker-compose.yml`, `Caddyfile` are served from
`launchtic-com/public` + `/public/dist`. Editing them and **deploying the site**
takes effect immediately (each install/update fetches them live) — that is a
*site deploy*, separate from an *app release* above.
