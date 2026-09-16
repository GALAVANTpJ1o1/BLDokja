import type { Metadata, Viewport } from "next";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import "./globals.css";
import { AppShell } from "@/components/shell/app-shell";
import { ServiceWorkerRegistration } from "@/components/pwa/service-worker";
import { SettingsProvider } from "@/components/settings/settings-provider";
import { Starfield } from "@/components/starfield/starfield";
import { PageTransitions } from "@/components/transitions/transition-link";
import { en } from "@/i18n/en";

/** The boot script's source, read at build time. It is static code, never anything a user typed. */
// Line endings are normalised: a browser hashes the script with LF newlines, whatever the file on disk has.
const APPEARANCE_BOOT = readFileSync(join(process.cwd(), "public", "appearance-boot.js"), "utf8").replace(/\r\n?/g, "\n");

export const metadata: Metadata = {
  title: { default: en.site.name, template: `%s · ${en.site.name}` },
  description: en.site.tagline,
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }], apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#2C2F45" },
    { media: "(prefers-color-scheme: light)", color: "#E8E7EF" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-GB" suppressHydrationWarning>
      <head>
        <link rel="preload" href="/fonts/recursive-5.3.0-latin-casl.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        {/*
          Applies the saved theme and palette before first paint (public/appearance-boot.js, tested as a file).
          Written inline, not loaded: a request here blocked the first paint on slow connections. The build's
          CSP step hashes every inline script as written, so this one is allowed by hash. next/script's
          beforeInteractive can't be used: it injects its code after the runtime loads, too late and unhashed.
        */}
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_BOOT }} />
      </head>
      <body>
        <ServiceWorkerRegistration />
        <Starfield />
        <SettingsProvider>
          <PageTransitions>
            <AppShell>{children}</AppShell>
          </PageTransitions>
        </SettingsProvider>
      </body>
    </html>
  );
}
