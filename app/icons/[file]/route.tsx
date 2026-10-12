// The install icons the manifest lists (app/manifest.ts, docs/features/install-app.md), drawn from
// app/icon.svg so the house has one source. Public on purpose: it's generic artwork, and proxy.ts
// lets every .png through without a login (browsers fetch install icons without cookies).
// Built once at build time; anything but the three names below is a 404.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

/** The amber of app/icon.svg's background. */
const AMBER = "#d97706";

const ICONS: Record<string, { size: number; maskable: boolean }> = {
  "icon-192.png": { size: 192, maskable: false },
  "icon-512.png": { size: 512, maskable: false },
  "maskable-512.png": { size: 512, maskable: true },
};

// Read from disk, never fetched: a network hiccup here would break the icons.
const svg = readFile(join(process.cwd(), "app/icon.svg"), "base64");

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(ICONS).map((file) => ({ file }));
}

export async function GET(_request: Request, { params }: RouteContext<"/icons/[file]">) {
  const icon = ICONS[(await params).file];
  if (!icon) return new Response("Not found", { status: 404 });

  // Maskable: Android crops it to a circle or squircle, so the house sits well inside the middle
  // 80% on a full-bleed square of the same amber (the icon's rounded corners blend into it).
  const inner = icon.maskable ? Math.round(icon.size * 0.7) : icon.size;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: icon.maskable ? AMBER : "transparent",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse draws plain <img> */}
        <img src={`data:image/svg+xml;base64,${await svg}`} width={inner} height={inner} alt="" />
      </div>
    ),
    { width: icon.size, height: icon.size },
  );
}
