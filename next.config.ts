import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg"],
  // Dev only: lets a phone on the LAN (e.g. the Expo shell) load dev assets
  // from this machine's IP. Comma-separated hosts, e.g. "192.168.1.70".
  allowedDevOrigins: process.env.ALLOWED_DEV_ORIGINS?.split(",").map((h) => h.trim()).filter(Boolean),
  // Uploads go through server actions; this is the ceiling for one request.
  // Per-file limits are enforced separately in src/server/services/storage.ts.
  experimental: { serverActions: { bodySizeLimit: "26mb" } },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
