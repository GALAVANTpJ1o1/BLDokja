import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { AppShell } from "@/components/shell/app-shell";
import { SettingsProvider } from "@/components/settings/settings-provider";
import { Starfield } from "@/components/starfield/starfield";
import { PageTransitions } from "@/components/transitions/transition-link";
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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-GB" suppressHydrationWarning>
      <head>
        {/*
          Applies the saved theme and palette before first paint (public/appearance-boot.js). A blocking,
          same-origin file: next/script's beforeInteractive injects its code inline after the runtime
          loads, which is both too late and blocked by the build's CSP.
        */}
        <script src="/appearance-boot.js" />
      </head>
      <body>
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
