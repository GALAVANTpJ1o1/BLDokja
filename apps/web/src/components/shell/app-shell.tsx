"use client";

import { usePathname } from "next/navigation";
import { BookOpenIcon, CubeIcon, SlidersHorizontalIcon, ChartLineIcon, TargetIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { TransitionLink as Link } from "@/components/transitions/transition-link";
import { en } from "@/i18n/en";
import { explore } from "@/i18n/explore";
import { SiteGuide } from "./site-guide";

const SECTIONS = [
  { href: "/learn/", label: en.nav.learn, match: "/learn", icon: BookOpenIcon },
  { href: "/practice/", label: en.nav.practice, match: "/practice", icon: TargetIcon },
  { href: "/progress/", label: en.nav.progress, match: "/progress", icon: ChartLineIcon },
] as const;

const SETTINGS = { href: "/settings/", label: en.nav.settings, match: "/settings", icon: SlidersHorizontalIcon } as const;

function isCurrent(pathname: string, match: string): boolean {
  return pathname === match || pathname.startsWith(`${match}/`);
}


/**
 * A compact top navigation on wide screens and a thumb-reachable bar on phones.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const links = [...SECTIONS, SETTINGS].map((s) => <Link key={s.href} href={s.href} aria-current={isCurrent(pathname, s.match) ? "page" : undefined}><s.icon size={20} weight="regular" aria-hidden /><span>{s.label}</span></Link>);
  return (
    <div className="min-h-dvh">
      <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-ground focus:p-3">
        {en.site.skipToContent}
      </a>

      <header className="shell-header">
        <Link href="/" className="shell-brand"><CubeIcon size={30} weight="light" aria-hidden />
          <span className="t-subheading casual">{en.site.name}</span>
        </Link>
        <div className="flex items-center gap-2"><nav className="shell-nav" aria-label={en.nav.label}>{links}</nav><SiteGuide /></div>
      </header>

      <main id="content" className="page-content shell-main">
        {pathname !== "/" ? <div className="mb-4"><Link className="btn" href={pathname.startsWith("/practice/") && pathname !== "/practice/" ? "/practice/" : pathname.startsWith("/learn/") && pathname !== "/learn/" ? "/learn/" : "/"}>{pathname.startsWith("/practice/") && pathname !== "/practice/" ? explore.backPractice : pathname.startsWith("/learn/") && pathname !== "/learn/" ? explore.backLearn : explore.backHome}</Link></div> : null}
        {children}
        <SiteGuide invitation />
      </main>

      <nav aria-label={en.nav.label} className="shell-bottom">
        {links}
      </nav>
    </div>
  );
}
