import type { MetadataRoute } from "next";

// What makes My House installable as an app (docs/features/install-app.md). Served at
// /manifest.webmanifest; browsers fetch it without cookies, so proxy.ts must let it through.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "My House",
    short_name: "My House",
    description: "Household bills and shared expenses, settled monthly.",
    // The launch screen (app/open/page.tsx), which loads the month behind it. `id` stays "/", so
    // apps installed before it are still the same app.
    start_url: "/open",
    scope: "/",
    display: "standalone",
    // The page background (zinc-50), so the splash screen and title bar match the app.
    background_color: "#fafafa",
    theme_color: "#fafafa",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
