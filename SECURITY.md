# Security Policy

We take the security of Launchtic seriously. This document explains how to
report vulnerabilities and what to expect.

## Reporting a vulnerability

**Please do NOT open public GitHub issues for security vulnerabilities.**

Instead, email **security@launchtic.com** with:

- A description of the issue
- Steps to reproduce (proof-of-concept code if possible)
- Affected version (e.g. `v0.1.0`) or commit hash
- Your name (if you want public credit) or "anonymous"

You can also use [GitHub's private vulnerability reporting](https://github.com/launchtic/launchtic/security/advisories/new)
if you have a GitHub account.

## What to expect

| Step | Timeline |
|---|---|
| Initial acknowledgement | Within 72 hours |
| Triage + severity assessment | Within 7 days |
| Patch + coordinated disclosure | Depends on severity (see below) |
| Public advisory | After fix is released |

We follow [coordinated disclosure](https://en.wikipedia.org/wiki/Coordinated_vulnerability_disclosure):
we ask reporters to give us a reasonable window to fix the issue before public
disclosure.

### Severity timeline targets

| Severity | Patch target |
|---|---|
| **Critical** (RCE, auth bypass, data exfiltration) | 7 days |
| **High** (privilege escalation, persistent XSS) | 14 days |
| **Medium** (CSRF, info disclosure) | 30 days |
| **Low** (minor info disclosure, edge-case) | 90 days |

## Scope

### In scope

- Latest released version of Launchtic on the `main` branch
- Self-hosted deployments running default configuration
- Hosted Launchtic Cloud (when available)

### Out of scope

- Vulnerabilities in third-party dependencies (report upstream — we'll follow up)
- Issues requiring physical access to the server
- Social engineering of the maintainer
- Self-XSS that requires the victim to paste payload into their own console
- Reports from automated scanners without proof of exploitability
- Missing security headers without demonstrated impact
- Email-spoofing on workspaces with unconfigured SPF/DKIM
- Brute-force on workspaces with weak admin passwords (use a strong password)

## Recognition

We don't currently run a paid bug bounty, but we maintain a public
[Hall of Fame](#hall-of-fame) crediting reporters of valid issues.

For high-impact reports, we may offer Launchtic Cloud credits or sponsor
swag at our discretion.

## Recommended self-hosted hardening

If you self-host Launchtic, we strongly recommend:

- **Use strong secrets**: regenerate `NEXTAUTH_SECRET`, `ENCRYPTION_KEY`,
  `POSTGRES_PASSWORD` — never use defaults from `.env.example`.
- **Keep updated**: subscribe to GitHub Releases for security patches.
- **Restrict admin access**: don't expose port 5432 (Postgres) or 6379
  (Redis) publicly — only Caddy ports 80/443 should be reachable.
- **Enable backups**: regular Postgres dumps + offsite copy.
- **Use HTTPS**: never run production on HTTP. Caddy handles TLS automatically.
- **Review user-uploaded content**: image uploads go through `sharp`
  reprocessing, but always validate at the application layer.
- **Rotate API keys**: Stripe/PayPal/SMTP/AI keys are encrypted in DB but
  rotate periodically as a defense-in-depth measure.

## Hall of Fame

Reporters who have responsibly disclosed valid vulnerabilities:

_None yet — be the first!_

---

**Contact**: security@launchtic.com · PGP key available on request.
