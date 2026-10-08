import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Receipt uploads (docs/features/receipts.md): files are at most 5 MB (MAX_RECEIPT_BYTES),
      // plus room for the form's own bytes. The default is 1 MB. Stays under the 10 MB that
      // proxy.ts buffers (proxyClientMaxBodySize).
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
