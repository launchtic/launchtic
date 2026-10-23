# Releasing Launchtic

Two repos are involved:

- **`launchtic`** (this repo) — the app. CI builds 3 public Docker images (web / renderer / worker) on GHCR.
- **`launchtic-com`** (private) — the website. Serves `install.sh` / `update.sh` / `docker-compose.yml` / `Caddyfile` under `/dist`, and `GET /api/version`, which returns the version installs should run. That value comes from its `RELEASE_VERSION` file.

Updates are free for every instance; there is no license gate on versions.

## Workflows

| Workflow | Trigger | Does |
|---|---|---|
| **CI** (`ci.yml`) | every push to `main` and every PR | typecheck · `prisma migrate deploy` on an empty Postgres 16 · build web + renderer |
| **Build & Push** (`build.yml`) | push to `main` | images `:latest` + `:sha-<short>` — for the demo box only |
| **Build & Push** (`build.yml`) | *Run workflow* (manual) | images `:stable` + `:YYYY.MM.DD` + `:sha-<short>`, then git tag + GitHub Release with notes — the release |

## Cut a release

> Publish the image tag **first**, bump `RELEASE_VERSION` **second**. The other way round, `/api/version` advertises a tag that doesn't exist yet and updates fail.

1. **CI is green** on the latest `main` commit, and `:latest` has run fine on demo.launchtic.com.
2. **Publish images:** Actions → *Build & Push* → *Run workflow*. Leave *version* blank (= today, UTC; a second release the same day becomes `-2`, `-3`, …). Wait for all jobs — the last one tags the commit and publishes the GitHub Release.
3. **Point installs at it:** in `launchtic-com`, set `RELEASE_VERSION` to the same tag, commit, push `main`. Its CI rebuilds and deploys the site and syncs `.env`. That container also runs its own migrations on boot.
4. **Verify:** `curl https://launchtic.com/api/version` shows the new tag; update a test VPS with `update.sh`.

Instances pick it up on their next `curl -fsSL https://launchtic.com/update | bash`.

## Versioning

- Date-based `YYYY.MM.DD` (`-2`, `-3` for same-day releases).
- Never delete old tags — dated and `:sha-…` tags are what rollbacks use.

## Rollback

1. **Stop the rollout:** set `RELEASE_VERSION` back to the last good tag in `launchtic-com`, push `main` (takes one CI run).
2. **Instances already updated:** set `LAUNCHTIC_VERSION=<last good tag>` in their `.env`, run `docker compose up -d`. If the bad release ran a migration that can't be undone, restore a database backup — or ship a fixed release instead.

## Customer-facing scripts

`install.sh`, `update.sh`, `docker-compose.yml` and `Caddyfile` live in `launchtic-com/public` (`/dist`). Editing and pushing them deploys the site — that's separate from an app release.
