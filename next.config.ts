import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Receipt uploads (docs/features/receipts.md): files are at most 5 MB (MAX_RECEIPT_BYTES),
      // plus room for the form's own bytes. The default is 1 MB. Stays under the 10 MB that
      // proxy.ts buffers (proxyClientMaxBodySize).
      bodySizeLimit: "6mb",
    },
    // No connection (docs/features/offline.md): a save or a tap to another month waits and goes
    // through by itself once the connection is back, instead of failing; OfflineBanner says so.
    // Turning this off is the kill switch.
    useOffline: true,
  },
  async headers() {
    return [
      {
        // The service worker is never cached, so a fixed one reaches phones on their next visit
        // (docs/features/install-app.md).
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
