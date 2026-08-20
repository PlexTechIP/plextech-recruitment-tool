import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
      {
        source: "/apply/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors https://plextech.studentorg.berkeley.edu https://plextech.berkeley.edu http://localhost:3000 http://localhost:3001; object-src 'none'; base-uri 'self'",
          },
          {
            key: "X-Frame-Options",
            value: "ALLOW-FROM https://plextech.studentorg.berkeley.edu",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
