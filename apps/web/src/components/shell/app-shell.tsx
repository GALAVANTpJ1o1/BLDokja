"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { TransitionLink as Link } from "@/components/transitions/transition-link";
import { en } from "@/i18n/en";

const SECTIONS = [
  { href: "/learn/", label: en.nav.learn, match: "/learn" },
  { href: "/practice/", label: en.nav.practice, match: "/practice" },
  { href: "/progress/", label: en.nav.progress, match: "/progress" },
] as const;

const SETTINGS = { href: "/settings/", label: en.nav.settings, match: "/settings" } as const;

function isCurrent(pathname: string, match: string): boolean {
  return pathname === match || pathname.startsWith(`${match}/`);
}

function RailLink({ href, label, current }: { href: string; label: string; current: boolean }) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={`relative flex min-h-11 items-center rounded-[4px] px-3 no-underline t-ui hover:bg-stage ${current ? "font-[680]" : "text-quiet"}`}
    >
      {current ? <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] rounded-[2px] bg-text" /> : null}
      {label}
    </Link>
  );
}

function BarLink({ href, label, current }: { href: string; label: string; current: boolean }) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={`relative flex min-h-14 flex-1 items-center justify-center no-underline t-meta ${current ? "font-[700]" : "text-quiet"}`}
    >
      {current ? <span aria-hidden className="absolute inset-x-4 top-0 h-[3px] rounded-[2px] bg-text" /> : null}
      {label}
    </Link>
  );
}

/**
 * The shell every page shares (DESIGN.md, "The workbench"): a rail on wide screens, a bottom bar on
 * phones. Learn · Practice · Progress, with settings as its own control rather than a section.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[13rem_1fr]">
      <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-ground focus:p-3">
        {en.site.skipToContent}
      </a>

      <aside className="hidden border-r border-rule lg:flex lg:flex-col lg:gap-6 lg:px-3 lg:py-5 lg:sticky lg:top-0 lg:h-dvh">
        <Link href="/" className="px-3 no-underline">
          <span className="t-subheading casual">{en.site.name}</span>
        </Link>
        <nav aria-label={en.nav.label} className="flex flex-col gap-1">
          {SECTIONS.map((s) => (
            <RailLink key={s.href} href={s.href} label={s.label} current={isCurrent(pathname, s.match)} />
          ))}
        </nav>
        <div className="mt-auto">
          <RailLink href={SETTINGS.href} label={SETTINGS.label} current={isCurrent(pathname, SETTINGS.match)} />
        </div>
      </aside>

      <header className="flex items-center justify-between border-b border-rule px-4 py-3 lg:hidden">
        <Link href="/" className="no-underline">
          <span className="t-subheading casual">{en.site.name}</span>
        </Link>
      </header>

      <main id="content" className="page-content min-w-0 px-4 pb-24 pt-6 sm:px-6 lg:px-10 lg:pb-12 lg:pt-10">
        {children}
      </main>

      <nav aria-label={en.nav.label} className="fixed inset-x-0 bottom-0 z-40 flex border-t border-rule bg-ground pb-[env(safe-area-inset-bottom)] lg:hidden">
        {[...SECTIONS, SETTINGS].map((s) => (
          <BarLink key={s.href} href={s.href} label={s.label} current={isCurrent(pathname, s.match)} />
        ))}
      </nav>
    </div>
  );
}
