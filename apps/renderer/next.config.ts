import type { NextConfig } from "next";
import path from "path";

const WEB_URL = process.env.WEB_API_URL ?? "http://localhost:3000";

const nextConfig: NextConfig = {
  output: "standalone",
  // Promoted to stable in Next.js 15 — moved out of `experimental`.
  outputFileTracingRoot: path.join(__dirname, "../../"),
  // Same Prisma engine inclusion as web — see apps/web/next.config.ts.
  outputFileTracingIncludes: {
    "*": [
      "../../node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client/**",
      "../../node_modules/.pnpm/@prisma+client@*/node_modules/@prisma/client/**",
    ],
  },
  transpilePackages: ["@launchtic/types", "@launchtic/elements", "@launchtic/editor-core", "@launchtic/editor-utils", "@launchtic/database", "styled-components"],
  compiler: {
    styledComponents: true,
  },
  async rewrites() {
    return [
      {
        source: "/uploads/:path*",
        destination: `${WEB_URL}/uploads/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
