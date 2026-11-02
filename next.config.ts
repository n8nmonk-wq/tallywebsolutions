import type { NextConfig } from "next";

const config: NextConfig = {
  devIndicators: false,
  distDir: process.env.NEXT_DIST_DIR || '.next',
  poweredByHeader: false,
  serverExternalPackages: ['@electric-sql/pglite'],
  // Book files live outside /public so they are never statically served.
  // They still must be bundled into the serverless function that reads them.
  outputFileTracingIncludes: {
    "/api/download": ["./private/books/**"],
    // Admin "Put on sale" reads the file to record its checksum.
    "/api/admin/book": ["./private/books/**"],
    "/admin/books": ["./private/books/**"],
    // "Turn on offers" applies this migration from admin.
    "/api/admin/offers": ["./migrations/008-offers.sql"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        source: "/api/download",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default config;
