import type { NextConfig } from "next";
import path from "path";

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
  transpilePackages: ["@launchtic/ui", "@launchtic/types", "@launchtic/elements", "@launchtic/editor-core", "@launchtic/editor-utils", "@launchtic/email", "styled-components"],
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

export default nextConfig;
