import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { InstallPrompt } from "@/components/install-prompt";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// A worktree's local site labels its tab ("[reminders-fix] My House") so each address says which
// task it shows; set by scripts/dev.sh, never in production.
const siteName =
  process.env.NODE_ENV === "development" && process.env.DEV_WORKTREE
    ? `[${process.env.DEV_WORKTREE}] My House`
    : "My House";

export const metadata: Metadata = {
  title: { default: siteName, template: `%s · ${siteName}` },
  description: "Household bills and shared expenses, settled monthly.",
  // Private household app: keep every page out of search results (robots.txt also disallows all).
  robots: { index: false, follow: false },
  // Added to an iPhone's home screen, it opens full-screen as "My House" (docs/features/install-app.md).
  appleWebApp: { capable: true, title: "My House", statusBarStyle: "default" },
};

// The page background (zinc-50), matching app/manifest.ts.
export const viewport: Viewport = { themeColor: "#fafafa" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background font-sans text-foreground">
        {children}
        <InstallPrompt />
        <Toaster />
      </body>
    </html>
  );
}
