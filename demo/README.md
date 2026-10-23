# Public demo — runbook

`demo.launchtic.com` is a shared sandbox: visitors are logged in to one demo account, risky actions are blocked, and the box resets to a baseline once a day.

## What `DEMO_MODE=true` does

- **Auto-login** with `DEMO_EMAIL` / `DEMO_PASSWORD`.
- **No outbound email** — `sendEmail()` is a no-op.
- **Blocks risky actions** (403 "disabled in the live demo"): password, license, payment, storage, AI key, custom domains, team, deleting/cloning workspaces. Funnels, pages, contacts and email drafts still work.

## First-time setup

1. Install on the demo VPS: `curl -fsSL https://launchtic.com/install | bash`
2. Add to `.env`, then `docker compose up -d --force-recreate`:
   ```
   DEMO_MODE=true
   DEMO_EMAIL=demo@launchtic.com
   DEMO_PASSWORD=launchtic-demo
   ```
3. Run the wizard at `https://demo.launchtic.com` — create the admin with **exactly** `DEMO_EMAIL` / `DEMO_PASSWORD`.
4. Activate a non-expiring Agency key in **Settings → License & Updates** (needed for Agency features).
5. Build the demo content (funnels, contacts, sample emails).
6. Take the baseline:
   ```bash
   cp demo/demo-reset.sh ~/launchtic/ && chmod +x ~/launchtic/demo-reset.sh
   cd ~/launchtic && ./demo-reset.sh snapshot
   ```

## Reset

`demo-reset.sh` only touches Postgres and `uploads`:

- `snapshot` — `pg_dump` + `uploads` archive → `demo-baseline/`.
- `restore` — stops web/worker/renderer, `pg_restore --clean`, restores `uploads`, restarts. `.env`, certs and other volumes are untouched.

Daily at **10:00 UTC** (night in the US, midday in the EU — a ~30 s blip). Cron uses the server timezone, so set it to UTC first:

```bash
timedatectl set-timezone UTC
crontab -e
# 0 10 * * * cd /root/launchtic && ./demo-reset.sh restore >> /var/log/demo-reset.log 2>&1
```

Check with `crontab -l` and `tail -f /var/log/demo-reset.log`.

## Updating the demo

No migration in the release: `curl -fsSL https://launchtic.com/update | bash`.

With a migration (or if unsure), re-take the baseline — otherwise the next `restore` puts the old schema back under the new app:

```bash
crontab -l | grep -v demo-reset | crontab -   # pause cron
./demo-reset.sh restore                        # clean content, old schema
curl -fsSL https://launchtic.com/update | bash # migrate clean content
./demo-reset.sh snapshot                       # new baseline, then re-add the cron line
```

## Designing content

Don't design on the demo — it resets daily. Use a separate instance (normal install, `DEMO_MODE` off, no reset cron), then copy its content over:

```bash
# on the design box
docker compose exec -T postgres pg_dump -U postgres -Fc launchtic > content.dump
tar -czf content-uploads.tar.gz uploads
# copy to the demo box as demo-baseline/db.dump + uploads archive, then:
./demo-reset.sh restore && ./demo-reset.sh snapshot
```

## Notes

- Checkout can't charge anything: payment settings are blocked and no provider is configured.
- Visitors see each other's edits until the next reset.
- To turn the demo off, remove `DEMO_MODE` and recreate the containers.
