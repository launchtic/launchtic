# Public Demo — Runbook

How `demo.launchtic.com` is set up and reset. The demo is a **shared sandbox**:
visitors are auto-signed-in as one demo account, risky actions are blocked, and
the box resets to a fixed baseline on a schedule.

## How DEMO_MODE behaves

Set `DEMO_MODE=true` in the install `.env`. Then the app:

- **Auto-login** — visitors hitting the app are signed in as the demo user
  (`DEMO_EMAIL` / `DEMO_PASSWORD`); the login form is skipped.
- **No outbound email** — `sendEmail()` is a no-op (covers broadcasts,
  automations, invites, test sends) — nothing real is ever delivered.
- **Blocked actions** (return 403 "disabled in the live demo"): change password,
  activate a different license, payment config + provider tests, storage (S3)
  config + test, AI key save/delete, add custom domain (SSL), team role/remove,
  delete/clone workspace. Everything else (build funnels, edit pages, add
  contacts, draft emails) works so the product feels real.

Building funnels/contacts/pages is allowed — that's the point — so it gets messy
between resets. The 6-hour reset cleans it up.

## One-time setup

1. **Comp license** — on launchtic.com create an **AGENCY** license with no
   expiry (perpetual updates so the demo never shows "updates lapsed"):
   ```bash
   curl -X POST https://launchtic.com/api/admin/licenses \
     -H "Authorization: Bearer $LICENSE_API_SECRET" \
     -H "Content-Type: application/json" \
     -d '{"email":"demo@launchtic.com","plan":"AGENCY","expiresAt":null}'
   ```
   Note the returned `key`.

2. **Install on the demo VPS** with that key:
   ```bash
   curl -fsSL https://launchtic.com/install | bash -s -- --license <DEMO_KEY>
   ```

3. **Enable demo mode** — add to the install `.env`, then recreate:
   ```
   DEMO_MODE=true
   DEMO_EMAIL=demo@launchtic.com
   DEMO_PASSWORD=launchtic-demo
   ```
   ```bash
   cd launchtic && docker compose up -d --force-recreate
   ```

4. **Run the wizard** at `http://<demo-ip>` (or `https://demo.launchtic.com`):
   - Create the admin using **the same** `DEMO_EMAIL` + `DEMO_PASSWORD` — this is
     the account auto-login signs into. (The wizard runs before auto-login kicks
     in, because the login page sends a userless install to `/setup` first.)
   - Set the domain to `demo.launchtic.com`; the AGENCY license auto-activates.

5. **Build the demo content** — import templates, build a sample funnel or two,
   add sample contacts, draft a broadcast, etc. This is the "marketing account"
   visitors land in.

6. **Capture the baseline** — copy the reset script into the install dir and run:
   ```bash
   cp /path/to/demo/demo-reset.sh ~/launchtic/ && chmod +x ~/launchtic/demo-reset.sh
   cd ~/launchtic && ./demo-reset.sh snapshot
   ```

## Scheduled reset

Restore the baseline every 6 hours via cron:
```cron
0 */6 * * * cd /root/launchtic && ./demo-reset.sh restore >> /var/log/demo-reset.log 2>&1
```
`restore` stops web/worker/renderer, `pg_restore --clean` the baseline, restores
uploads, and starts the services again (clearing in-process caches). `.env`,
SSL certs, and Docker volumes other than the DB are untouched.

To refresh the baseline after improving the demo content, rebuild it then re-run
`./demo-reset.sh snapshot`.

## Notes / limits

- **Renderer checkout** isn't separately gated, but it's safe: payment config is
  blocked and never seeded, so a demo funnel has no live provider to charge.
- Shared sandbox = visitors see each other's edits between resets. Per-visitor
  isolation is a future upgrade.
- To take the demo offline, unset `DEMO_MODE` (or stop the stack); the box
  reverts to a normal licensed install.
