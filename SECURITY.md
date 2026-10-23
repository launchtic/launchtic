# Security Policy

## Reporting a vulnerability

**Don't open a public issue.** Email **security@launchtic.com** or use [GitHub private vulnerability reporting](https://github.com/launchtic/launchtic/security/advisories/new) with:

- what the issue is and how to reproduce it (a proof of concept helps)
- the affected version (e.g. `2026.10.23`, shown in Settings → License & Updates) or commit
- how you'd like to be credited, or "anonymous"

## What to expect

- Acknowledgement within **72 hours**, triage within **7 days**.
- Patch targets: Critical (RCE, auth bypass, data exfiltration) **7 days** · High **14 days** · Medium **30 days** · Low **90 days**.
- We ask for coordinated disclosure: please give us time to ship a fix before going public. Reporters are credited in the advisory unless they prefer not to be.

## Scope

**In scope:** the latest release, self-hosted with the default configuration.

**Out of scope:** issues in third-party dependencies (report upstream), physical server access, social engineering, self-XSS, scanner output without a working exploit, missing headers without impact, SPF/DKIM not configured, weak admin passwords.

## Hardening a self-hosted install

- Keep the secrets `install.sh` generates (`NEXTAUTH_SECRET`, `ENCRYPTION_KEY`, `POSTGRES_PASSWORD`); never reuse `.env.example` values.
- Expose only ports 80/443. Keep Postgres (5432) and Redis (6379) private.
- Update regularly: `curl -fsSL https://launchtic.com/update | bash`.
- Back up Postgres and the `uploads` folder off-server.
