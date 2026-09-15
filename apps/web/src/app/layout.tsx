import type { Metadata, Viewport } from "next";
import Script from "next/script";
import type { ReactNode } from "react";
import "./globals.css";
import { AppShell } from "@/components/shell/app-shell";
import { SettingsProvider } from "@/components/settings/settings-provider";
import { en } from "@/i18n/en";

export const metadata: Metadata = {
  title: { default: en.site.name, template: `%s · ${en.site.name}` },
  description: en.site.tagline,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#2C2F45" },
    { media: "(prefers-color-scheme: light)", color: "#E8E7EF" },
  ],
};

/**
 * Applies the saved theme and palette before first paint, so a chosen theme doesn't flash. It reads a
 * mirror in localStorage (the real settings are in IndexedDB, which can't be read synchronously). A
 * fixed string, never user input; the build's CSP step allows it by hash (scripts/csp.mjs).
 */
const APPEARANCE_BOOT =
  'try{var a=JSON.parse(localStorage.getItem("bld.appearance")||"{}"),r=document.documentElement;if(a.theme==="dark"||a.theme==="light")r.dataset.theme=a.theme;if(a.palette==="high-contrast"||a.palette==="deuteranopia")r.dataset.palette=a.palette}catch(e){}';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-GB" suppressHydrationWarning>
      <body>
        <Script id="appearance-boot" strategy="beforeInteractive">
          {APPEARANCE_BOOT}
        </Script>
        <SettingsProvider>
          <AppShell>{children}</AppShell>
        </SettingsProvider>
      </body>
    </html>
  );
}
