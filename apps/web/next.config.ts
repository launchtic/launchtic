// MUST be the first import — derives APP_URL / NEXTAUTH_URL / RENDERER_URL /
// NEXT_PUBLIC_RENDERER_URL from APP_DOMAIN + PAGES_DOMAIN before Next reads
// process.env to bundle NEXT_PUBLIC_* into the client.
import "./lib/env-bootstrap";

import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import path from "path";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  // Promoted to stable in Next.js 15 — moved out of `experimental`.
  outputFileTracingRoot: path.join(__dirname, "../../"),
  transpilePackages: ["@launchtic/ui", "@launchtic/types", "@launchtic/elements", "@launchtic/email", "styled-components"],
  compiler: {
    styledComponents: true,
  },
  // Re-export NEXT_PUBLIC_RENDERER_URL so Next bundles the runtime-derived
  // value into the client. (Static .env-loaded NEXT_PUBLIC_* vars are
  // bundled automatically; vars set in code are not, hence the explicit map.)
  env: {
    NEXT_PUBLIC_RENDERER_URL: process.env.NEXT_PUBLIC_RENDERER_URL,
  },
  experimental: {
    serverActions: {
      allowedOrigins: [
        "localhost:3000",
        process.env.APP_DOMAIN ?? "",
      ].filter(Boolean),
    },
  },
};

export default withNextIntl(nextConfig);
