// Derives APP_URL / NEXTAUTH_URL / RENDERER_URL from APP_DOMAIN + PAGES_DOMAIN
// at server startup. Imported here so Next sees the values when boot-time code
// (next-intl plugin, etc.) reads process.env. No client bundling — RENDERER_URL
// is read by server components and passed to client components as a prop.
import "./lib/env-bootstrap";

import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import path from "path";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  // Promoted to stable in Next.js 15 — moved out of `experimental`.
  outputFileTracingRoot: path.join(__dirname, "../../"),
  // Force-include the Prisma query engine binary into the standalone bundle.
  // Next.js's static tracer can't follow Prisma's dynamic engine load, so the
  // .so.node file is missing at runtime without this hint. Glob covers the
  // pnpm-versioned path (e.g. @prisma+client@6.19.3_prisma@6.19.3_typescript@5.9.3).
  outputFileTracingIncludes: {
    "*": [
      "../../node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client/**",
      "../../node_modules/.pnpm/@prisma+client@*/node_modules/@prisma/client/**",
    ],
  },
  transpilePackages: ["@launchtic/ui", "@launchtic/types", "@launchtic/elements", "@launchtic/email", "styled-components"],
  compiler: {
    styledComponents: true,
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
