# Releasing Launchtic

How a new version reaches self-hosted instances. Two repos are involved:

- **`launchtic`** (this repo) — the app. CI builds 3 Docker images (web /
  renderer / worker) and publishes them **publicly** to GHCR — no auth needed
  to pull them.
- **`launchtic-com`** — the marketing site (+ Agency billing/license API), a
  separate private repo. It serves `install.sh` / `update.sh` /
  `docker-compose.yml` / `Caddyfile` at `/dist`, and exposes `/api/version`
  (public, unauthenticated) which reads `LAUNCHTIC_CURRENT_VERSION` from its
  own `.env`. That repo's `RELEASE_VERSION` file (tracked in git, repo root)
  is the single source of truth for that env var — its CI syncs the two on
  every push to `main` (see "Bump the site to that version" below).

Updates are free for every self-hosted instance, Free or Agency — there is no
license/entitlement gate on versions. The two repos only meet at **release
time**, via one value: `launchtic-com`'s `RELEASE_VERSION` must equal a
published `:YYYY.MM.DD` tag from this repo.

---

## TL;DR — release checklist

> **Thứ tự bắt buộc: publish tag TRƯỚC, set env SAU.**

- [ ] Merge `main` → CI tự build `:latest` → test trên demo.launchtic.com.
- [ ] GitHub → **Actions → "Build & Push" → Run workflow**, nhập **version** = `YYYY.MM.DD`.
- [ ] Đợi 3 job (web/renderer/worker) xanh → check tag tại `github.com/orgs/launchtic/packages`.
- [ ] Repo `launchtic-com`: sửa file `RELEASE_VERSION` (repo root) = đúng ngày đó → commit + push `main`.
- [ ] `launchtic-com`'s CI tự build image + SSH deploy + sync `.env` (`LAUNCHTIC_CURRENT_VERSION`) — không cần thao tác tay trên VPS, chỉ cần đợi Actions xanh.
- [ ] **Có sửa `docker-compose.yml` / `Caddyfile` / `install.sh` / `update.sh` trong `launchtic-com`?** → sửa trong cùng repo, cùng push ở trên — CI tự deploy luôn, verify sau khi xanh: `curl -fsSL https://launchtic.com/dist/docker-compose.yml | head`.

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

3. **Bump the site to that version.** In the `launchtic-com` repo, edit
   `RELEASE_VERSION` (tracked in git, repo root) to the same string:
   ```
   2026.07.01
   ```
   Commit + push to `main`. Its own `Build & Push` workflow builds the site
   image, then the `deploy` job SSHes into the VPS automatically — `git pull`,
   sync `RELEASE_VERSION` into `.env` as `LAUNCHTIC_CURRENT_VERSION`,
   `docker compose pull && up -d`. No manual server step — just watch the
   Actions run go green. Use the **same string** you typed in step 2.

   Note: that container also runs `prisma migrate deploy` on boot, so this
   push auto-applies any pending migration to `launchtic-com`'s production DB
   — review data-affecting migrations before merging to its `main`.

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

1. **Stop new pulls of it:** in `launchtic-com`, revert `RELEASE_VERSION` to
   the previous good date tag, commit + push `main` — CI rebuilds/redeploys
   the site and syncs `.env` automatically (a few minutes, not instant — it's
   a full pipeline run, not a bare env flip). New installs/updates now serve
   the old version again.
2. **Instances already on the bad version:** tell operators to set
   `LAUNCHTIC_VERSION=<previous tag>` in their `.env` and run
   `docker compose up -d` (it's local — no token needed, images are public).
   Or push a fixed release (step "Cutting a release") with a new date tag and
   have them update normally.

---

## Where customer-facing scripts live

`install.sh`, `update.sh`, `docker-compose.yml`, `Caddyfile` are served from
`launchtic-com/public` + `/public/dist`. Editing them, committing, and pushing
to `launchtic-com`'s `main` is enough — the same CI (`build.yml`) builds the
site image and auto-deploys it (SSH, no manual step), so each install/update
fetches the new files live moments later. That's a *site deploy*, separate
from an *app release* above — bumping `RELEASE_VERSION` is just one kind of
push to that repo; editing these files is another.
