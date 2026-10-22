# Launchtic

> Fair-code funnel builder with native AI capabilities. Build landing pages, sales funnels, and email campaigns visually — self-host or cloud. The open alternative to ClickFunnels, GoHighLevel, and System.io.

[![License: SUL](https://img.shields.io/badge/license-SUL-blue.svg)](LICENSE.md)
[![Status: Alpha](https://img.shields.io/badge/status-alpha-orange.svg)]()

Launchtic combines a drag-and-drop page builder with payment processing, email automation, and AI-assisted copywriting in a single self-hosted platform. Run it on your own server, your own domain, your own data — no monthly SaaS fees, no per-contact pricing, no vendor lock-in.

## Features

- **Drag-and-drop page builder** — Craft.js based editor with desktop + mobile breakpoints
- **Funnel flow** — Opt-in → Sales → Checkout → Thank You with custom domains per funnel
- **Payments** — Stripe + PayPal, one-time + subscription, order bumps
- **Email** — broadcasts, automated sequences, behavior-triggered automations
- **AI assistant** — generate funnel copy from a brief; auto-fill template slots
- **Templates library** — multi-tier tagged templates per page type
- **Self-host friendly** — single Docker Compose, auto SSL via Caddy

## Quick start

One-line install on a fresh Ubuntu/Debian VPS (Docker auto-installed). Replace
`LT-XXXX-XXXX-XXXX-XXXX` with your license key:

```bash
curl -fsSL https://launchtic.com/install | bash -s -- --license LT-XXXX-XXXX-XXXX-XXXX
```

> Copy the command with your key already embedded from your [account](https://launchtic.com/account).

The installer validates your license, installs Docker, and starts everything. Then open `http://<your-server-ip>` — a browser wizard creates your admin account and points two subdomains (dashboard + pages) at your server, with SSL issued automatically by Caddy.

## Tech stack

- **Frontend**: Next.js 15, React 19, styled-components, Craft.js, TipTap
- **Backend**: Next.js API routes, Prisma ORM, PostgreSQL, Redis
- **Workers**: BullMQ (email + automations + sequences)
- **Infrastructure**: Docker Compose, Caddy reverse proxy
- **AI**: OpenAI / Anthropic / Gemini (per-workspace configurable)

## Local development

```bash
git clone https://github.com/launchtic/launchtic.git
cd launchtic

# Install
pnpm install

# Start Postgres + Redis in Docker
pnpm infra:up

# Setup database
cp .env.example .env
pnpm db:migrate
pnpm db:seed

# Run all apps
pnpm dev:all
```

Dashboard: http://localhost:3000 · Renderer: http://localhost:3001

## License

Source-available under the **[Sustainable Use License](LICENSE.md)**.

You **may**:
- Self-host Launchtic for your own company's internal use — for any size company.
- Modify the source for your own use.
- Use it personally or for non-commercial projects.
- Set it up on a client's own server, for that client's own use.

Running funnels for **multiple clients from your own installation** (and
white-labeling them) requires an active [Agency plan](https://launchtic.com/pricing).

You **may not** (without a separate written agreement):
- Run Launchtic itself as a hosted SaaS for third parties.
- Resell it, or build a competing funnel / page builder from it.

Template packs bought on [launchtic.com/add-ons](https://launchtic.com/add-ons) are covered by the
separate [Add-on License](https://launchtic.com/add-on-license).

For commercial licensing, OEM, or partnership inquiries: **hello@launchtic.com**.

## Contributing

We don't accept pull requests — Launchtic is developed by its core team so the
licensing stays simple. Bug reports, ideas, and feature requests are very
welcome in [Issues](../../issues). See [CONTRIBUTING.md](CONTRIBUTING.md).

## Roadmap

- [x] Page editor + funnel flow
- [x] Stripe + PayPal checkout
- [x] Email broadcasts + automations
- [x] AI copy assistant
- [x] Multi-language UI
- [ ] One-click installer (alpha)
- [ ] Cloud-hosted version
- [ ] Marketplace for templates / blocks

## Trademark

"Launchtic" and the Launchtic logo are trademarks of **Launchtic**. The Sustainable Use License does not grant trademark rights — see [LICENSE.md](LICENSE.md) for details.

---

Made with care by [Launchtic](https://launchtic.com).
